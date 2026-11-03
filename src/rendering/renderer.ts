import { Application, Container, Graphics, Text, Sprite } from "pixi.js";
import type { Camera, Node, Edge, Point, ExecutionPreview } from "../core/types.js";
import { toScreen } from "../scene/geometry.js";
import { Resources } from "../resources/resources.js";
import type { NodeDefinition } from "../nodes/definition.js";
export interface RenderState {
  camera: Camera;
  nodes: Node[];
  all: Map<string, Node>;
  edges: Iterable<Edge>;
  selected: Set<string>;
  selectedEdge?: string;
  execution?: ExecutionPreview;
  preview: Map<string, Node>;
  box?: { a: Point; b: Point };
  connection?: { from: string; to: Point };
  dark: boolean;
}
export class Renderer {
  app = new Application();
  private cards = new Map<string, { root: Container; signature: string }>();
  private edges = new Graphics();
  private guides = new Graphics();
  private overview = new Graphics();
  private alive = true;
  constructor(
    private host: HTMLElement,
    private defs: Map<string, NodeDefinition>,
    private resources: Resources,
  ) {}
  async init() {
    await this.app.init({
      preference: "webgl",
      antialias: true,
      autoStart: false,
      resolution: Math.min(devicePixelRatio, 2),
      autoDensity: true,
      width: this.host.clientWidth,
      height: this.host.clientHeight,
      backgroundAlpha: 0,
    });
    if (!this.alive) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.app.canvas.setAttribute("aria-hidden", "true");
    this.app.canvas.style.pointerEvents = "none";
    this.host.prepend(this.app.canvas);
    this.app.stage.sortableChildren = true;
    this.edges.zIndex = -1;
    this.guides.zIndex = 1_000_000;
    this.overview.zIndex = 0;
    this.app.stage.addChild(this.edges, this.overview, this.guides);
  }
  resize() {
    this.app.renderer.resize(this.host.clientWidth, this.host.clientHeight);
  }
  draw(s: RenderState) {
    const zoom = s.camera.zoom,
      visible = new Set(s.nodes.map((n) => n.id));
    for (const [id, c] of this.cards)
      if (!visible.has(id) || zoom < 0.2) {
        c.root.destroy({ children: true });
        this.cards.delete(id);
      }
    this.edges.clear();
    const node = (id: string) => s.preview.get(id) || s.all.get(id);
    for (const e of s.edges) {
      const a = node(e.from),
        b = node(e.to);
      if (!a || !b) continue;
      const p = toScreen({ x: a.x + a.width, y: a.y + a.height / 2 }, s.camera),
        q = toScreen({ x: b.x, y: b.y + b.height / 2 }, s.camera);
      if (
        Math.max(p.x, q.x) < -20 ||
        Math.min(p.x, q.x) > this.host.clientWidth + 20 ||
        Math.max(p.y, q.y) < -20 ||
        Math.min(p.y, q.y) > this.host.clientHeight + 20
      )
        continue;
      this.edges
        .moveTo(p.x, p.y)
        .lineTo(q.x, q.y)
        .stroke({
          color:
            e.id === s.selectedEdge ? (s.dark ? 0xffcc66 : 0xd6882c) : s.dark ? 0x72727c : 0xb9b6ab,
          width: e.id === s.selectedEdge ? 3 : 1.6,
        });
    }
    this.overview.clear();
    if (zoom < 0.2) {
      const batches = new Map<number, Node[]>();
      for (const n of s.nodes) {
        const color = this.defs.get(n.type)?.color ?? 0xbbb7b1;
        if (!batches.has(color)) batches.set(color, []);
        batches.get(color)!.push(n);
      }
      for (const [color, nodes] of batches) {
        for (const n of nodes) {
          const p = toScreen(n, s.camera);
          this.overview.rect(p.x, p.y, n.width * zoom, n.height * zoom);
        }
        this.overview.fill({ color, alpha: 0.8 });
      }
      for (const n of s.nodes)
        if (s.selected.has(n.id)) {
          const p = toScreen(n, s.camera);
          this.overview
            .rect(p.x, p.y, n.width * zoom, n.height * zoom)
            .stroke({ color: (s.dark ? 0xffcc66 : 0xd68a32), width: 2 });
        }
    }
    for (const [order, n] of (zoom < 0.2 ? [] : s.nodes).entries()) {
      let card = this.cards.get(n.id);
      const def = this.defs.get(n.type);
      const asset = n.assetId ? this.resources.get(n.assetId) : undefined;
      const detail = zoom > 0.32;
      const selected = s.selected.has(n.id);
      const signature = JSON.stringify([
        n.type,
        n.width,
        n.height,
        n.title,
        n.text,
        n.status,
        n.group,
        n.assetId,
        selected,
        detail,
        s.dark,
        !!asset?.texture,
        asset?.error,
        asset?.metadata?.mime,
        def?.label,
        def?.color,
        def?.ports,
      ]);
      if (!card) {
        card = { root: new Container(), signature: "" };
        this.cards.set(n.id, card);
        this.app.stage.addChild(card.root);
      }
      if (card.signature !== signature) {
        for (const child of card.root.removeChildren())
          child.destroy({ children: true });
        card.signature = signature;
        const color = def?.color ?? 0xbbb7b1;
        const g = new Graphics()
          .roundRect(0, 0, n.width, n.height, 14)
          .fill(s.dark ? 0x222225 : 0xfffdf8)
          .stroke({
            color: selected ? (s.dark ? 0xffcc66 : 0xd68a32) : s.dark ? 0x39393f : 0xdad6ca,
            width: selected ? 2.5 : 1,
          });
        card.root.addChild(g);
        if (asset?.texture && detail) {
          const sp = new Sprite(asset.texture);
          const ratio = Math.min(
            n.width / sp.texture.width,
            n.height / sp.texture.height,
          );
          sp.width = sp.texture.width * ratio;
          sp.height = sp.texture.height * ratio;
          sp.position.set((n.width - sp.width) / 2, (n.height - sp.height) / 2);
          const clip = new Graphics()
            .roundRect(0, 0, n.width, n.height, 14)
            .fill(0xffffff);
          card.root.addChild(clip, sp);
          sp.mask = clip;
          if (asset.metadata?.mime.startsWith("video/")) {
            const play = new Graphics()
              .circle(n.width / 2, n.height / 2, 23)
              .fill({ color: 0x141416, alpha: 0.65 });
            play
              .moveTo(n.width / 2 - 5, n.height / 2 - 9)
              .lineTo(n.width / 2 + 10, n.height / 2)
              .lineTo(n.width / 2 - 5, n.height / 2 + 9)
              .closePath()
              .fill(0xfffdf8);
            card.root.addChild(play);
            if (asset.metadata.duration !== undefined) {
              const duration = new Text({
                text: `${Math.floor(asset.metadata.duration / 60)}:${String(Math.floor(asset.metadata.duration % 60)).padStart(2, "0")}`,
                style: {
                  fontFamily: "system-ui",
                  fontSize: 12,
                  fill: 0xffffff,
                },
              });
              duration.position.set(10, n.height - 25);
              card.root.addChild(duration);
            }
          }
        } else if (detail) {
          const text = asset?.error
            ? "素材暂不可用 · 点击查看"
            : n.assetId
              ? n.type === "audio"
                ? "♫  点击播放音频"
                : "正在读取内容…"
              : (def?.summary?.(n) ?? n.text ?? "点击设置内容");
          const body = new Text({
            text: text.slice(0, 1800),
            style: {
              fontFamily: "system-ui, sans-serif",
              fontSize: 14,
              lineHeight: 23,
              fill: s.dark ? 0xf4f4f5 : 0x41473c,
              wordWrap: true,
              wordWrapWidth: Math.max(1, n.width - 32),
              breakWords: true,
            },
          });
          body.position.set(16, 16);
          const clip = new Graphics()
            .rect(12, 12, Math.max(1, n.width - 24), Math.max(1, n.height - 24))
            .fill(0xffffff);
          card.root.addChild(clip, body);
          body.mask = clip;
        }
        if (detail) {
          const title = new Text({
            text: n.title.length > 32 ? n.title.slice(0, 31) + "…" : n.title,
            style: {
              fontFamily: "system-ui, sans-serif",
              fontSize: 12,
              fontWeight: "500",
              fill: s.dark ? 0xb3b3bc : 0x656c5d,
            },
          });
          title.position.set(0, -24);
          card.root.addChild(title);
          const ports = new Graphics();
          if (def?.ports?.input !== false)
            ports.circle(0, n.height / 2, 5 / Math.max(0.6, zoom)).fill(color);
          if (def?.ports?.output !== false)
            ports
              .circle(n.width, n.height / 2, 5 / Math.max(0.6, zoom))
              .fill(color);
          if (selected)
            ports
              .roundRect(n.width - 10, n.height - 10, 7, 7, 2)
              .fill((s.dark ? 0xffcc66 : 0xd68a32));
          card.root.addChild(ports);
          if (n.status && n.status !== "已完成") {
            const badge = new Text({
              text: n.status,
              style: {
                fontFamily: "system-ui",
                fontSize: 12,
                fill: s.dark ? 0xffcc66 : 0x865215,
              },
            });
            const bg = new Graphics()
              .roundRect(0, n.height + 8, Math.min(n.width, badge.width + 20), 26, 8)
              .fill(s.dark ? 0x222225 : 0xfff8e9);
            badge.position.set(10, n.height + 14);
            card.root.addChild(bg, badge);
          }
        }
        if (selected)
          card.root.addChild(
            new Graphics()
              .roundRect(0, 0, n.width, n.height, 14)
              .stroke({ color: (s.dark ? 0xffcc66 : 0xd68a32), width: 2 }),
          );
      }
      const point = toScreen(n, s.camera);
      card.root.position.set(point.x, point.y);
      card.root.scale.set(zoom);
      // Update stacking without quadratic remove/reinsert work on every frame.
      card.root.zIndex = order;
    }
    this.guides.clear();
    // Screen-space outlines remain visible at every LOD without changing node contents.
    const visibleNodes = new Map(s.nodes.map(n => [n.id, n]));
    for (const [kind, color] of [["execute",0x58bca4],["blocked",0xe7a94f],["cancel",0xef8585]] as const) {
      for (const id of s.execution?.[kind] ?? []) {
        const n=visibleNodes.get(id);if(!n)continue;
        const p=toScreen(n,s.camera);
        this.guides.roundRect(p.x-5,p.y-5,n.width*zoom+10,n.height*zoom+10,12).stroke({color,width:2,alpha:0.9});
      }
    }

    if (s.box) {
      const a = toScreen(s.box.a, s.camera),
        b = toScreen(s.box.b, s.camera);
      this.guides
        .rect(
          Math.min(a.x, b.x),
          Math.min(a.y, b.y),
          Math.abs(a.x - b.x),
          Math.abs(a.y - b.y),
        )
        .fill({ color: (s.dark ? 0xffcc66 : 0xd69b48), alpha: 0.1 })
        .stroke({ color: (s.dark ? 0xffcc66 : 0xd69b48), width: 1 });
    }
    if (s.connection) {
      const n = node(s.connection.from);
      if (n) {
        const a = toScreen(
            { x: n.x + n.width, y: n.y + n.height / 2 },
            s.camera,
          ),
          b = toScreen(s.connection.to, s.camera);
        this.guides
          .moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke({ color: (s.dark ? 0xffcc66 : 0xd69b48), width: 2 });
      }
    }
    this.app.render();
  }
  get cardCount() {
    return this.cards.size;
  }
  destroy() {
    this.alive = false;
    if (this.app.renderer) this.app.destroy(true, { children: true });
    this.cards.clear();
  }
}
