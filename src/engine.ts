import "./style.css";
import { selectionSnapshot, executionPreview } from "./core/selection.js";
import type { SelectionSnapshot, ExecutionPreview } from "./core/types.js";
import {
  Document,
  validate,
  uid,
  type Node,
  type Camera,
  type Change,
  type ApplyOptions,
  type RuntimeState,
  type Snapshot,
  type Point,
  type EngineEvents,
  type EngineMetrics,
} from "./document/model.js";
import { EdgeIndex } from "./scene/edges.js";
import { SpatialIndex, toScreen, zoomAt } from "./scene/geometry.js";
import { Renderer } from "./rendering/renderer.js";
import {
  builtinNodes,
  type NodeDefinition,
  type NodeAction,
} from "./nodes/definition.js";
import {
  Resources,
  validateResourceOptions,
  type AssetResolver,
  type ResourceOptions,
} from "./resources/resources.js";
import { Overlays } from "./overlays/overlays.js";
import { Interaction } from "./interaction/interaction.js";
import { NodeCommands } from "./document/commands.js";
import { NodeTitles } from "./overlays/titles.js";
import { ExecutionControls } from "./overlays/execution.js";
import { Floating } from "./overlays/floating.js";
import { fitMedia, fitText } from "./layout/sizing.js";
export interface Options {
  readOnly?: boolean;
  resolveAsset?: AssetResolver;
  resources?: ResourceOptions;
  /** Persistent viewport-only primary action supplied by the host. */
  nodePrimaryAction?: (node: Node) => NodeAction | undefined;
  nodeActions?: (node: Node) => NodeAction[];
  nodePanel?: (node: Node, container: HTMLElement) => (() => void) | void;
  canConnect?: (a: Node, b: Node) => boolean;
}
export class CanvasEngine {
  document: Document;
  index = new SpatialIndex();
  private edgeIndex = new EdgeIndex();
  camera: Camera = { x: -100, y: -100, zoom: 1 };
  selected = new Set<string>();
  selectedEdge?: string;
  private selectionSignature = "";
  private executionOverlay: ExecutionPreview = executionPreview(new Map());
  getSelection(): SelectionSnapshot { return selectionSnapshot(this.document.nodes, this.selected); }
  setSelection(ids: Iterable<string>) {
    this.selected = new Set(selectionSnapshot(this.document.nodes, ids).nodeIds);
    this.selectedEdge = undefined;
    this.notify();
  }
  setExecutionPreview(value?: Partial<ExecutionPreview>) {
    this.executionOverlay = executionPreview(this.document.nodes, value);
    this.requestRender();
    this.emit("executionPreviewChange", this.executionOverlay);
  }
  getExecutionPreview(): ExecutionPreview { return this.executionOverlay; }

  preview = new Map<string, Node>();
  box?: { a: Point; b: Point };
  connection?: { from: string; to: Point };
  dark = false;
  definitions = new Map<string, NodeDefinition>(builtinNodes);
  panelId?: string;
  hoveredId?: string;
  gestureActive = false;
  private hoverTimer?: ReturnType<typeof setTimeout>;
  private ranks = new Map<string, number>();
  private panelCleanup?: () => void;
  readonly floating: Floating;
  private executionControls: ExecutionControls;
  private interactionLocks = new Set<string>();
  private titles: NodeTitles;
  resources: Resources;
  renderer: Renderer;
  overlays: Overlays;
  private interaction?: Interaction;
  private resize?: ResizeObserver;
  private frame = 0;
  private ready = false;
  private destroyed = false;
  private lifecycle = new AbortController();
  private listeners = new Map<string, Set<(value?: unknown) => void>>();
  private commands: NodeCommands;
  private live: HTMLDivElement;
  metrics: EngineMetrics = {
    frames: 0,
    drawMs: 0,
    visible: 0,
    visibleEdges: 0,
    textures: 0,
    textureBytes: 0,
  };
  private constructor(
    public host: HTMLElement,
    public options: Options,
  ) {
    this.document = new Document({
      canEdit: () => !this.options.readOnly,
      canConnect: (_edge, from, to) => this.connectionAllowed(from, to),
    });
    this.document.onTransaction = (tx) => this.emit("transaction", tx);
    this.document.onRuntimeChange = (id, state) => {
      if (state?.active && !this.interactionLocks.has(id)) {
        this.interactionLocks.add(id);
        this.interaction?.cancel();
        if (this.overlays?.id === id) this.overlays.close(false);
        if (this.panelId === id) this.showNodePanel();
        this.titles?.lock(id);
      }
      if (!state?.active) this.interactionLocks.delete(id);
      this.requestRender();
      this.emit("runtimeChange", { id, state });
    };
    this.commands = new NodeCommands(this, (mapping) =>
      this.emit("nodesCloned", mapping),
    );
    host.classList.add("engine-host");
    host.tabIndex = 0;
    host.setAttribute("role", "application");
    host.setAttribute(
      "aria-label",
      "自由画布。Tab 切换节点，回车编辑，方向键移动，空格拖动平移，F2 编辑参数。",
    );
    this.live = document.createElement("div");
    this.live.className = "engine-live";
    this.live.setAttribute("aria-live", "polite");
    host.append(this.live);
    const resolve =
      options.resolveAsset ??
      (async () => {
        throw Error("未提供素材解析器");
      });
    this.titles = new NodeTitles(host, (id, title, original) => {
      const current = this.document.nodes.get(id);
      if (!this.options.readOnly && !this.document.isNodeLocked(id) && current?.title === original)
        this.applyChanges([{ kind: "patch", id, set: { title } }]);
    });
    this.executionControls = new ExecutionControls(host, error => this.message(String(error)));
    this.floating = new Floating(
      host,
      () => this.requestRender(),
      () => this.showNodePanel(),
      (error) => this.message(String(error)),
    );
    this.resources = new Resources(
      resolve,
      () => this.requestRender(),
      96 * 1024 * 1024,
      (id, media) => {
        const changes: Change[] = [];
        for (const node of this.document.nodes.values()) {
          if (node.assetId !== id || node.sizeMode === undefined) continue;
          const size = node.sizeMode === "auto" ? fitMedia(media) : {};
          const next = { ...node, ...size, media };
          if (JSON.stringify(next) !== JSON.stringify(node))
            changes.push({ kind: "put", node: next });
        }
        if (!this.options.readOnly)
          this.applyChanges(changes, { origin: "system", history: false });
      },
      options.resources,
    );
    this.renderer = new Renderer(host, this.definitions, this.resources);
    this.overlays = new Overlays(
      host,
      resolve,
      (id, text) => {
        const n = this.document.nodes.get(id);
        if (n) this.applyChanges([{ kind: "put", node: { ...n, text } }]);
      },
      (id) => {
        this.showNodePanel(id);
        this.requestRender();
      },
      (error) => this.message(`编辑器清理失败: ${String(error)}`),
    );
    this.document.onChange = (ids, detail) => {
      if (detail.orderChanged)
        this.ranks = new Map(
          [...this.document.nodes.keys()].map((id, order) => [id, order]),
        );
      if (this.panelId && !this.document.nodes.has(this.panelId))
        this.showNodePanel();
      if (detail.reset) {
        this.index.rebuild(this.document.nodes.values());
        this.edgeIndex.clear();
      } else
        for (const id of detail.geometry)
          this.index.update(id, this.document.nodes.get(id));
      const edgeIds = new Set(detail.edges);
      for (const id of detail.geometry) {
        if (!this.document.nodes.has(id)) this.selected.delete(id);
        for (const edge of this.document.incidentEdges(id)) edgeIds.add(edge);
      }
      for (const id of edgeIds)
        this.edgeIndex.update(
          id,
          this.document.edges.get(id),
          this.document.nodes,
        );
      if (this.selectedEdge && !this.document.edges.has(this.selectedEdge))
        this.selectedEdge = undefined;
      const overlayIds=[...this.executionOverlay.execute,...this.executionOverlay.blocked,...this.executionOverlay.cancel];
      if(overlayIds.some(id=>!this.document.nodes.has(id))) this.setExecutionPreview(this.executionOverlay);
      this.notify();
      this.emit("documentChange", ids);
    };
  }
  static async create(host: HTMLElement, options: Options = {}) {
    validateResourceOptions(options.resources);
    if (!host.isConnected || host.clientWidth <= 0 || host.clientHeight <= 0)
      throw Error("画布容器必须已挂载且尺寸非零");
    const e = new CanvasEngine(host, options);
    try {
      await e.renderer.init();
      e.ready = true;
      e.renderer.app.canvas.addEventListener(
        "webglcontextlost",
        () => e.message("图形上下文已丢失，请导出项目后刷新恢复。"),
        { signal: e.lifecycle.signal },
      );
      e.renderer.app.canvas.addEventListener(
        "webglcontextrestored",
        () => e.requestRender(),
        { signal: e.lifecycle.signal },
      );
      e.interaction = new Interaction(e);
      e.resize = new ResizeObserver(() => {
        e.renderer.resize();
        e.requestRender();
      });
      e.resize.observe(host);
      e.requestRender();
      return e;
    } catch (err) {
      e.destroy();
      throw err;
    }
  }
  registerNodeType(type: string, definition: NodeDefinition) {
    this.definitions.set(type, definition);
    this.requestRender();
  }
  private connectionAllowed(from: Node, to: Node) {
    return (
      this.definitions.get(from.type)?.ports?.output !== false &&
      this.definitions.get(to.type)?.ports?.input !== false &&
      (this.options.canConnect?.(from, to) ?? true)
    );
  }
  loadScene(raw: unknown) {
    const proposed = validate(raw);
    const lookup = new Map(proposed.nodes.map((node) => [node.id, node]));
    for (const edge of proposed.edges)
      if (!this.connectionAllowed(lookup.get(edge.from)!, lookup.get(edge.to)!))
        throw Error("连线不符合宿主规则");
    this.overlays.close(false);
    // Remove old screen-space targets synchronously before the next render.
    this.titles.update([], this.camera, true);
    this.executionControls.update([], this.camera, this.document.runtime, undefined, true);
    this.floating.update(undefined, [], this.camera, undefined, true);
    this.showNodePanel();
    this.hoveredId = undefined;
    this.interaction?.cancel();
    const s = this.document.load(raw);
    this.interactionLocks.clear();
    this.selected.clear();
    this.selectedEdge = undefined;
    this.resources.clear();
    this.setExecutionPreview();
    this.camera = s.camera ?? { x: -100, y: -100, zoom: 1 };
    this.notify();
  }
  exportScene(): Snapshot {
    return { ...this.document.snapshot(), camera: { ...this.camera } };
  }
  applyChanges(changes: Change[], history: boolean | ApplyOptions = true) {
    try {
      const prepared = changes.map((change): Change => {
        if (typeof history === "object" && history.origin === "remote")
          return change;
        if (change.kind !== "put") return change;
        let node = change.node;
        const previous = this.document.nodes.get(node.id);
        const cached = node.assetId
          ? this.resources.get(node.assetId)?.metadata
          : undefined;
        if (previous && previous.assetId !== node.assetId)
          node = { ...node, media: cached };
        else if (cached) node = { ...node, media: cached };
        if (node.sizeMode === "auto") {
          if (node.media) node = { ...node, ...fitMedia(node.media) };
          else if (!node.assetId && node.preferredAspectRatio)
            node = {
              ...node,
              ...fitMedia({ width: node.preferredAspectRatio, height: 1 }),
            };
          else if (!node.assetId && node.text !== undefined)
            node = { ...node, ...fitText(node.text, node.width) };
        }
        return { ...change, node };
      });
      this.document.apply(prepared, history);
    } catch (err) {
      this.message(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }
  setReadOnly(value: boolean) {
    this.options.readOnly = value;
    this.interaction?.cancel();
    this.overlays.close(false);
    // Remove old screen-space targets synchronously before the next render.
    this.titles.update([], this.camera, true);
    this.executionControls.update([], this.camera, this.document.runtime, undefined, true);
    this.floating.update(undefined, [], this.camera, undefined, true);
    this.showNodePanel();
    this.notify();
  }
  setRuntimeState(id: string, state?: RuntimeState) {
    this.document.setRuntimeState(id, state);
  }
  invalidateAsset(id: string) {
    this.resources.invalidate(id);
  }
  updateStatus(id: string, status: string) {
    this.document.updateStatus(id, status);
  }
  add(type: string, point?: Point, assetId?: string) {
    const id = uid();
    this.applyChanges([
      {
        kind: "put",
        node: {
          id,
          type,
          title: this.definitions.get(type)?.label ?? type,
          x: point?.x ?? this.camera.x + 180 / this.camera.zoom,
          y: point?.y ?? this.camera.y + 140 / this.camera.zoom,
          sizeMode: "auto",
          width: 320,
          height: type === "text" ? 190 : 220,
          ...(type === "text" ? { text: "写下你的想法…" } : {}),
          ...(assetId ? { assetId } : {}),
        },
      },
    ]);
    this.selected = new Set([id]);
    this.showNodePanel(id, true);
    this.notify();
    return id;
  }
  removeSelected() {
    this.overlays.close();
    this.showNodePanel();
    this.applyChanges(
      [...this.selected]
        .map((id) => ({ kind: "remove" as const, id }))
        .concat([]),
    );
    if (this.selectedEdge)
      this.applyChanges([{ kind: "disconnect", id: this.selectedEdge }]);
    this.selected.clear();
    this.selectedEdge = undefined;
    this.notify();
  }
  copy() {
    this.commands.copy();
  }
  paste() {
    this.commands.paste();
  }
  duplicate() {
    this.commands.duplicate();
  }
  group() {
    this.commands.group();
  }
  ungroup() {
    this.commands.ungroup();
  }
  reorder(front: boolean) {
    this.commands.reorder(front);
  }
  edit(id: string) {
    if (this.document.isNodeLocked(id)) return;
    if (this.options.readOnly) {
      const n = this.document.nodes.get(id);
      if (n?.assetId && n.type !== "text") {
        this.overlays.open(n);
        this.requestRender();
      }
      return;
    }
    this.showNodePanel();
    const n = this.document.nodes.get(id);
    if (!n) return;
    if (this.definitions.get(n.type)?.onActivate?.(n)) return;
    this.selected = new Set([id]);
    if (!this.interactionLocks.size) this.reorder(true);
    this.overlays.open(n, this.definitions.get(n.type));
    this.notify();
  }
  queryEdges(x: number, y: number, width: number, height: number) {
    const ids = new Set(
      this.edgeIndex.query(x, y, width, height).map((box) => box.id),
    );
    for (const id of this.preview.keys())
      for (const edge of this.document.incidentEdges(id)) ids.add(edge);
    return [...ids]
      .map((id) => this.document.edges.get(id))
      .filter((edge): edge is NonNullable<typeof edge> => !!edge);
  }
  hitNode(point: Point) {
    let best: Node | undefined,
      rank = -1;
    for (const box of this.index.query(point.x, point.y, 0, 0)) {
      const order = this.ranks.get(box.id) ?? 0;
      if (order >= rank) {
        best = this.document.nodes.get(box.id);
        rank = order;
      }
    }
    return best;
  }
  focusNodeControls() {
    requestAnimationFrame(() => {
      if (!this.destroyed) this.floating.focusControls();
    });
  }
  activateContent(id: string, point: Point) {
    const node = this.document.nodes.get(id);
    if (!node) return false;
    const media =
      node.media ??
      (node.assetId ? this.resources.get(node.assetId)?.metadata : undefined);
    if (
      (media?.mime.startsWith("video/") || node.type === "audio") &&
      Math.hypot(
        point.x - node.x - node.width / 2,
        point.y - node.y - node.height / 2,
      ) < 26
    ) {
      this.edit(id);
      return true;
    }
    return false;
  }
  hoverNode(id?: string) {
    clearTimeout(this.hoverTimer);
    if (this.floating.interacting) return;
    if (!id) {
      this.hoverTimer = setTimeout(() => {
        if (!this.floating.interacting) {
          this.hoveredId = undefined;
          this.requestRender();
        }
      }, 180);
    } else if (this.hoveredId !== id) {
      this.hoveredId = id;
      this.requestRender();
    }
  }
  showNodePanel(id?: string, reveal = false) {
    if (id && this.document.isNodeLocked(id)) return;
    if (id && this.options.readOnly) return;
    if (id && !this.document.nodes.has(id)) return;
    if (this.panelId !== id) {
      this.panelCleanup?.();
      this.panelCleanup = undefined;
      this.panelId = id;
      if (id && this.options.nodePanel) {
        const element = document.createElement("div");
        const dispose = this.options.nodePanel(
          this.document.nodes.get(id)!,
          element,
        );
        const unmount = this.mountNodePanel(id, element);
        this.panelCleanup = () => {
          dispose?.();
          unmount();
        };
      }
      this.emit("change");
    }
    if (reveal) this.floating.requestReveal();
    this.requestRender();
  }
  mountNodePanel(id: string, element: HTMLElement) {
    return this.floating.mountPanel(id, element);
  }
  adaptNode(id: string) {
    const node = this.document.nodes.get(id);
    if (!node) return;
    const media =
      node.media ??
      (node.assetId ? this.resources.get(node.assetId)?.metadata : undefined);
    const size = media
      ? fitMedia(media)
      : node.assetId
        ? {}
        : fitText(node.text ?? "", node.width);
    this.applyChanges([
      { kind: "put", node: { ...node, ...size, sizeMode: "auto" } },
    ]);
    if (node.assetId) this.resources.request(node.assetId);
  }
  private actions(node: Node): NodeAction[] {
    if (this.document.isNodeLocked(node.id)) return [];
    if (this.options.readOnly)
      return node.assetId && node.type !== "text"
        ? [{ id: "preview", label: "预览", run: () => this.edit(node.id) }]
        : [];
    const media =
      node.media ??
      (node.assetId ? this.resources.get(node.assetId)?.metadata : undefined);
    const select = () => {
      this.selected = new Set([node.id]);
      this.notify();
    };
    return [
      {
        id: "preview",
        label:
          media?.mime.startsWith("video/") || node.type === "video"
            ? "播放 / 预览"
            : "编辑 / 预览",
        run: () => this.edit(node.id),
      },
      {
        id: "parameters",
        label: "参数",
        run: () => {
          select();
          this.showNodePanel(node.id, true);
        },
      },
      ...(this.options.nodeActions?.(node) ?? []),
      { id: "fit", label: "适配内容", run: () => this.adaptNode(node.id) },
      {
        id: "copy",
        label: "复制",
        run: () => {
          select();
          this.duplicate();
        },
      },
      {
        id: "delete",
        label: "删除",
        run: () => {
          select();
          this.removeSelected();
        },
      },
    ];
  }
  focusNode(id: string) {
    const n = this.document.nodes.get(id);
    if (n) {
      this.camera.x =
        n.x + n.width / 2 - this.host.clientWidth / 2 / this.camera.zoom;
      this.camera.y =
        n.y + n.height / 2 - this.host.clientHeight / 2 / this.camera.zoom;
      this.notify();
    }
  }
  fitToContent() {
    const ns = [...this.document.nodes.values()];
    if (!ns.length) return;
    const minX = Math.min(...ns.map((n) => n.x)),
      minY = Math.min(...ns.map((n) => n.y)),
      maxX = Math.max(...ns.map((n) => n.x + n.width)),
      maxY = Math.max(...ns.map((n) => n.y + n.height));
    const zoom = Math.max(
      0.02,
      Math.min(
        1.4,
        (this.host.clientWidth - 240) / (maxX - minX),
        (this.host.clientHeight - 180) / (maxY - minY),
      ),
    );
    this.camera = {
      x: (minX + maxX) / 2 - this.host.clientWidth / 2 / zoom,
      y: (minY + maxY) / 2 - this.host.clientHeight / 2 / zoom,
      zoom,
    };
    this.notify();
  }
  zoom(factor: number) {
    this.camera = zoomAt(
      this.camera,
      { x: this.host.clientWidth / 2, y: this.host.clientHeight / 2 },
      factor,
    );
    this.notify();
  }
  on<K extends keyof EngineEvents>(
    event: K,
    handler: (value: EngineEvents[K]) => void,
  ) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    const listener = handler as (value?: unknown) => void;
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }
  private emit<K extends keyof EngineEvents>(
    event: K,
    value?: EngineEvents[K],
  ) {
    for (const fn of [...(this.listeners.get(event) ?? [])]) {
      try {
        fn(value);
      } catch (error) {
        // Consumer callbacks must not interrupt an already committed transaction.
        if (event !== "message") this.message(`事件监听失败: ${String(error)}`);
      }
    }
  }
  message(text: string) {
    this.live.textContent = text;
    this.emit("message", text);
  }
  notify() {
    const selection = this.getSelection();
    const signature = JSON.stringify(selection);
    if (signature !== this.selectionSignature) {
      this.selectionSignature = signature;
      this.emit("selectionChange", selection);
    }
    this.requestRender();
    this.emit("change");
    this.live.textContent = this.selected.size
      ? `已选择 ${this.selected.size} 个节点 ${[...this.selected]
          .slice(0, 3)
          .map((id) => this.document.nodes.get(id)?.title ?? "")
          .join("，")}`
      : "画布";
  }
  requestRender() {
    if (!this.ready || this.destroyed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }
  private render() {
    const start = performance.now(),
      c = this.camera;
    const ids = new Set(
      this.index
        .query(
          c.x - 80 / c.zoom,
          c.y - 80 / c.zoom,
          (this.host.clientWidth + 160) / c.zoom,
          (this.host.clientHeight + 160) / c.zoom,
        )
        .map((b) => b.id),
    );
    for (const id of this.preview.keys()) ids.add(id);
    const nodes = [...ids]
      .sort((a, b) => (this.ranks.get(a) ?? 0) - (this.ranks.get(b) ?? 0))
      .map((id) => this.preview.get(id) ?? this.document.nodes.get(id))
      .filter((node): node is Node => !!node)
      .map((node) =>
        this.document.runtime.has(node.id)
          ? { ...node, status: this.document.runtime.get(node.id)?.active ? undefined : this.document.runtime.get(node.id)?.status }
          : node,
      );
    const edges = this.queryEdges(
      c.x - 20 / c.zoom,
      c.y - 20 / c.zoom,
      (this.host.clientWidth + 40) / c.zoom,
      (this.host.clientHeight + 40) / c.zoom,
    );
    const assets = new Set<string>();
    for (const n of nodes)
      if (n.assetId && c.zoom > 0.32) {
        assets.add(n.assetId);
        this.resources.request(n.assetId);
      }
    this.resources.trim(assets);
    this.renderer.draw({
      camera: c,
      nodes,
      all: this.document.nodes,
      edges,
      selected: this.selected,
      execution: this.executionOverlay,
      selectedEdge: this.selectedEdge,
      preview: this.preview,
      box: this.box,
      connection: this.connection,
      dark: this.dark,
    });
    if (this.overlays.id) {
      const n =
        this.preview.get(this.overlays.id) ??
        this.document.nodes.get(this.overlays.id);
      if (n) this.overlays.position(n, c);
      else this.overlays.close(false);
    }
    const panelNode = this.panelId
      ? this.document.nodes.get(this.panelId)
      : undefined;
    const toolId = this.panelId ?? this.hoveredId;
    const toolNode = toolId ? this.document.nodes.get(toolId) : undefined;
    this.floating.update(
      toolNode,
      toolNode ? this.actions(toolNode) : [],
      c,
      panelNode,
      this.gestureActive || !!this.overlays.id,
    );
    this.host.dataset.theme = this.dark ? "dark" : "light";
    this.titles.update(nodes.filter(n => !this.document.isNodeLocked(n.id)), c, !!this.options.readOnly || !!this.overlays.id || this.gestureActive);
    this.executionControls.update(nodes, c, this.document.runtime, this.options.readOnly ? undefined : this.options.nodePrimaryAction, !this.host.clientWidth || !this.host.clientHeight);
    this.metrics = {
      frames: this.metrics.frames + 1,
      drawMs: performance.now() - start,
      visible: nodes.length,
      visibleEdges: edges.length,
      textures: this.resources.entries.size,
      textureBytes: this.resources.bytes,
    };
    this.emit("metrics", this.metrics);
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.lifecycle.abort();
    this.resize?.disconnect();
    this.interaction?.destroy();
    cancelAnimationFrame(this.frame);
    clearTimeout(this.hoverTimer);
    this.panelCleanup?.();
    this.floating.destroy();
    this.executionControls.destroy();
    this.titles.destroy();
    this.overlays.destroy();
    this.resources.destroy();
    this.renderer.destroy();
    this.listeners.clear();
    this.live.remove();
    this.document.onChange = () => {};
    this.document.onTransaction = () => {};
    this.document.onRuntimeChange = () => {};
  }
}
