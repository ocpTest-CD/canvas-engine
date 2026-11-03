import type { InteractionHost } from "./host.js";
import { uid, type Point, type Node, type Camera } from "../core/types.js";
import {
  toWorld,
  zoomAt,
  segmentDistance,
  pinchCamera,
} from "../scene/geometry.js";
type Gesture = {
  mode: "pan" | "drag" | "resize" | "box" | "connect";
  start: Point;
  screen: Point;
  camera: Point;
  originals: Node[];
  from?: string;
  additive?: boolean;
  selection: Set<string>;
  moved?: boolean;
  clicked?: string;
};
export class Interaction {
  private abort = new AbortController();
  private gesture?: Gesture;
  private space = false;
  private touches = new Map<number, Point>();
  private pinch?: { camera: Camera; points: [Point, Point] };
  constructor(private e: InteractionHost) {
    const h = e.host,
      signal = this.abort.signal;
    h.addEventListener("pointerdown", this.down, { signal });
    h.addEventListener("pointermove", this.move, { signal });
    h.addEventListener("pointerleave", () => e.hoverNode(), { signal });
    h.addEventListener("pointerup", ev => { try { this.up(ev); } catch (error) { this.cancel(); e.message(error instanceof Error ? error.message : String(error)); } }, { signal });
    h.addEventListener("pointercancel", this.cancel, { signal });
    h.addEventListener("dblclick", this.double, { signal });
    h.addEventListener("wheel", this.wheel, { signal, passive: false });
    h.addEventListener("keydown", ev => { try { this.key(ev); } catch (error) { ev.preventDefault(); e.message(error instanceof Error ? error.message : String(error)); } }, { signal });
    h.addEventListener(
      "keyup",
      (ev) => {
        if (ev.code === "Space") this.space = false;
      },
      { signal },
    );
    window.addEventListener("blur", this.cancel, { signal });
  }
  point = (ev: MouseEvent) => {
    const r = this.e.host.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  private hit(p: Point) {
    return this.e.hitNode(p);
  }
  private down = (ev: PointerEvent) => {
    if (ev.button !== 0 && ev.button !== 1) return;
    if ((ev.target as HTMLElement).closest(".engine-overlay,.engine-floating"))
      return;
    const e = this.e;
    if (ev.pointerType === "touch") {
      this.touches.set(ev.pointerId, this.point(ev));
      if (this.touches.size >= 2) {
        this.cancelGesture();
        this.pinch = {
          camera: { ...e.camera },
          points: [...this.touches.values()].slice(0, 2) as [Point, Point],
        };
        e.gestureActive = true;
        e.showNodePanel();
        e.overlays.close();
        e.host.setPointerCapture(ev.pointerId);
        ev.preventDefault();
        return;
      }
    }
    e.overlays.close();
    e.host.focus({ preventScroll: true });
    const screen = this.point(ev),
      p = toWorld(screen, e.camera);
    const n = this.hit(p);
    let mode: Gesture["mode"] = "box",
      originals: Node[] = [];
    let from: string | undefined;
    if (this.space || ev.button === 1 || (ev.pointerType === "touch" && !n))
      mode = "pan";
    else if (n && (e.options.readOnly || e.document.isNodeLocked(n.id))) {
      e.selected = new Set([n.id]);
      mode = "pan";
    } else if (n) {
      const tolerance = 10 / e.camera.zoom;
      if (
        e.definitions.get(n.type)?.ports?.output !== false &&
        Math.abs(p.x - (n.x + n.width)) < tolerance &&
        Math.abs(p.y - (n.y + n.height / 2)) < tolerance
      ) {
        mode = "connect";
        from = n.id;
        e.connection = { from, to: p };
      } else {
        if (!e.selected.has(n.id)) {
          if (!ev.shiftKey) e.selected.clear();
          e.selected.add(n.id);
        } else if (ev.shiftKey) {
          e.selected.delete(n.id);
          e.notify();
          return;
        }
        if (n.group)
          for (const other of e.document.nodes.values())
            if (other.group === n.group) e.selected.add(other.id);
        if ([...e.selected].some(id => e.document.isNodeLocked(id))) {
          e.message("节点执行中，请先取消执行再修改");
          return;
        }
        mode =
          e.selected.size === 1 &&
          p.x > n.x + n.width - tolerance &&
          p.y > n.y + n.height - tolerance
            ? "resize"
            : "drag";
        originals = [...e.selected]
          .map((id) => e.document.nodes.get(id)!)
          .filter(Boolean)
          .map((n) => ({ ...n }));
        e.selectedEdge = undefined;
      }
    } else {
      let edgeId: string | undefined;
      const tolerance = 7 / e.camera.zoom;
      for (const edge of e.queryEdges(
        p.x - tolerance,
        p.y - tolerance,
        tolerance * 2,
        tolerance * 2,
      )) {
        const a = e.document.nodes.get(edge.from)!,
          b = e.document.nodes.get(edge.to)!;
        if (
          segmentDistance(
            p,
            { x: a.x + a.width, y: a.y + a.height / 2 },
            { x: b.x, y: b.y + b.height / 2 },
          ) <
          7 / e.camera.zoom
        )
          edgeId = edge.id;
      }
      if (edgeId) {
        e.selected.clear();
        e.selectedEdge = edgeId;
        e.notify();
        return;
      }
      if (!ev.shiftKey) e.selected.clear();
      e.selectedEdge = undefined;
      e.box = { a: p, b: p };
    }
    e.gestureActive = true;
    e.showNodePanel();
    this.gesture = {
      mode,
      clicked: n?.id,
      start: p,
      screen,
      camera: { ...e.camera },
      originals,
      from,
      additive: ev.shiftKey,
      selection: new Set(e.selected),
    };
    e.host.setPointerCapture(ev.pointerId);
    e.notify();
    ev.preventDefault();
  };
  private move = (ev: PointerEvent) => {
    if (ev.pointerType === "touch" && this.touches.has(ev.pointerId)) {
      this.touches.set(ev.pointerId, this.point(ev));
      if (this.pinch && this.touches.size >= 2) {
        this.e.camera = pinchCamera(
          this.pinch.camera,
          this.pinch.points,
          [...this.touches.values()].slice(0, 2) as [Point, Point],
        );
        this.e.requestRender();
        ev.preventDefault();
        return;
      }
    }
    const g = this.gesture;
    if (!g) {
      this.e.hoverNode(this.hit(toWorld(this.point(ev), this.e.camera))?.id);
      return;
    }
    const e = this.e,
      screen = this.point(ev),
      p = toWorld(screen, e.camera);
    if (
      !g.moved &&
      Math.hypot(screen.x - g.screen.x, screen.y - g.screen.y) < 5
    )
      return;
    g.moved = true;
    if (g.mode === "pan") {
      e.camera.x = g.camera.x - (screen.x - g.screen.x) / e.camera.zoom;
      e.camera.y = g.camera.y - (screen.y - g.screen.y) / e.camera.zoom;
    } else if (g.mode === "drag" || g.mode === "resize") {
      for (const n of g.originals)
        e.preview.set(
          n.id,
          g.mode === "drag"
            ? { ...n, x: n.x + p.x - g.start.x, y: n.y + p.y - g.start.y }
            : {
                ...n,
                sizeMode: "manual",
                width: Math.min(
                  10000,
                  Math.max(n.media ? 16 : 100, n.width + p.x - g.start.x),
                ),
                height: Math.min(
                  10000,
                  n.media
                    ? (Math.max(16, n.width + p.x - g.start.x) *
                        n.media.height) /
                        n.media.width
                    : Math.max(70, n.height + p.y - g.start.y),
                ),
              },
        );
    } else if (g.mode === "box") {
      e.box = { a: g.start, b: p };
      const x = Math.min(g.start.x, p.x),
        y = Math.min(g.start.y, p.y);
      e.selected = new Set(g.additive ? g.selection : []);
      for (const b of e.index.query(
        x,
        y,
        Math.abs(p.x - g.start.x),
        Math.abs(p.y - g.start.y),
      ))
        e.selected.add(b.id);
    } else if (g.from) e.connection = { from: g.from, to: p };
    e.requestRender();
  };
  private up = (ev: PointerEvent) => {
    this.touches.delete(ev.pointerId);
    if (this.pinch) {
      if (this.touches.size < 2) {
        this.pinch = undefined;
        this.e.gestureActive = false;
      }
      if (this.e.host.hasPointerCapture(ev.pointerId))
        this.e.host.releasePointerCapture(ev.pointerId);
      this.e.notify();
      return;
    }
    const g = this.gesture;
    if (!g) return;
    const e = this.e;
    this.gesture = undefined;
    e.gestureActive = false;
    if (g.mode === "drag" || g.mode === "resize") {
      const changes = [...e.preview.values()]
        .filter((n) => {
          const old = e.document.nodes.get(n.id)!;
          return (
            n.x !== old.x ||
            n.y !== old.y ||
            n.width !== old.width ||
            n.height !== old.height
          );
        })
        .map((node) => ({ kind: "put" as const, node }));
      e.preview.clear();
      e.applyChanges(changes);
    }
    if (g.mode === "connect" && g.from) {
      const p = toWorld(this.point(ev), e.camera),
        to = this.hit(p);
      if (
        to &&
        to.id !== g.from &&
        e.definitions.get(to.type)?.ports?.input !== false
      ) {
        const source = e.document.nodes.get(g.from)!;
        if (!e.options.canConnect || e.options.canConnect(source, to))
          e.applyChanges([
            { kind: "connect", edge: { id: uid(), from: g.from, to: to.id } },
          ]);
        else e.message("这两个节点不能连接");
      }
    }
    if (!g.moved && g.mode === "drag" && g.clicked && e.selected.size === 1)
      if (!e.activateContent(g.clicked, toWorld(this.point(ev), e.camera)))
        e.showNodePanel(g.clicked, true);
    e.box = undefined;
    e.connection = undefined;
    if (e.host.hasPointerCapture(ev.pointerId))
      e.host.releasePointerCapture(ev.pointerId);
    e.notify();
  };
  cancel = () => {
    this.cancelGesture();
    this.touches.clear();
    this.pinch = undefined;
  };
  private cancelGesture = () => {
    const e = this.e;
    if (this.gesture?.mode === "pan") {
      e.camera.x = this.gesture.camera.x;
      e.camera.y = this.gesture.camera.y;
    }
    this.gesture = undefined;
    this.space = false;
    e.gestureActive = false;
    e.preview.clear();
    e.box = undefined;
    e.connection = undefined;
    e.requestRender();
  };
  private double = (ev: MouseEvent) => {
    if ((ev.target as HTMLElement).closest(".engine-overlay,.engine-floating"))
      return;
    const n = this.hit(toWorld(this.point(ev), this.e.camera));
    if (n) this.e.edit(n.id);
  };
  private wheel = (ev: WheelEvent) => {
    ev.preventDefault();
    if (this.gesture) return;
    const e = this.e;
    if (ev.ctrlKey || ev.metaKey)
      e.camera = zoomAt(e.camera, this.point(ev), Math.exp(-ev.deltaY * 0.008));
    else {
      e.camera.x += ev.deltaX / e.camera.zoom;
      e.camera.y += ev.deltaY / e.camera.zoom;
    }
    e.notify();
  };
  private key = (ev: KeyboardEvent) => {
    if (
      ev.isComposing ||
      (ev.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable=true],.engine-overlay,.engine-floating",
      )
    )
      return;
    const e = this.e,
      mod = ev.metaKey || ev.ctrlKey;
    if (
      e.options.readOnly &&
      ((mod && ["d", "v", "z"].includes(ev.key.toLowerCase())) ||
        ["Delete", "Backspace", "Enter", "F2"].includes(ev.key) ||
        ev.key.startsWith("Arrow"))
    ) {
      ev.preventDefault();
      return;
    }
    let handled = true;
    if (ev.code === "Space") {
      this.space = true;
    } else if (ev.key === "Escape") {
      this.cancel();
      e.overlays.close();
      e.showNodePanel();
      e.hoverNode();
      e.selected.clear();
      e.selectedEdge = undefined;
    } else if (ev.key === "F2" && e.selected.size === 1) {
      e.showNodePanel([...e.selected][0], true);
      e.focusNodeControls();
    } else if (mod && ev.key.toLowerCase() === "z") {
      this.cancel();
      if (!e.options.readOnly)
        ev.shiftKey ? e.document.redo() : e.document.undo();
    } else if (mod && ev.key.toLowerCase() === "a") {
      e.selected = new Set(e.document.nodes.keys());
    } else if (mod && ev.key.toLowerCase() === "d") {
      e.duplicate();
    } else if (mod && ev.key.toLowerCase() === "c") {
      e.copy();
    } else if (mod && ev.key.toLowerCase() === "v") {
      e.paste();
    } else if (ev.key === "Delete" || ev.key === "Backspace") {
      e.removeSelected();
    } else if (ev.key === "Enter" && e.selected.size === 1)
      e.edit([...e.selected][0]);
    else if (ev.key === "Tab") {
      const ids = [...e.document.nodes.keys()];
      const current = ids.indexOf([...e.selected][0]);
      const next =
        ids[(current + (ev.shiftKey ? -1 : 1) + ids.length) % ids.length];
      if (next) {
        e.selected = new Set([next]);
        e.focusNode(next);
        e.showNodePanel(next, true);
      }
    } else if (ev.key.startsWith("Arrow")) {
      const step = ev.shiftKey ? 10 : 1,
        dx =
          ev.key === "ArrowRight" ? step : ev.key === "ArrowLeft" ? -step : 0,
        dy = ev.key === "ArrowDown" ? step : ev.key === "ArrowUp" ? -step : 0;
      e.applyChanges(
        [...e.selected].map((id) => {
          const n = e.document.nodes.get(id)!;
          return { kind: "put", node: { ...n, x: n.x + dx, y: n.y + dy } };
        }),
      );
    } else handled = false;
    if (handled) {
      ev.preventDefault();
      e.notify();
    }
  };
  destroy() {
    this.abort.abort();
    this.cancel();
  }
}
