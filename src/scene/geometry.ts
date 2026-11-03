import RBush from "rbush";
import type { Camera, Node, Point } from "../core/types.js";
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}
export const bounds = (n: Node): Box => ({
  minX: n.x,
  minY: n.y,
  maxX: n.x + n.width,
  maxY: n.y + n.height,
  id: n.id,
});
export const toScreen = (p: Point, c: Camera): Point => ({
  x: (p.x - c.x) * c.zoom,
  y: (p.y - c.y) * c.zoom,
});
export const toWorld = (p: Point, c: Camera): Point => ({
  x: p.x / c.zoom + c.x,
  y: p.y / c.zoom + c.y,
});
export function zoomAt(c: Camera, p: Point, factor: number): Camera {
  const w = toWorld(p, c),
    zoom = Math.max(0.02, Math.min(4, c.zoom * factor));
  return { x: w.x - p.x / zoom, y: w.y - p.y / zoom, zoom };
}
export class SpatialIndex {
  tree = new RBush<Box>();
  entries = new Map<string, Box>();
  rebuild(nodes: Iterable<Node>) {
    this.tree.clear();
    this.entries.clear();
    const boxes = [...nodes].map(bounds);
    for (const b of boxes) this.entries.set(b.id, b);
    this.tree.load(boxes);
  }
  update(id: string, n?: Node) {
    const old = this.entries.get(id);
    if (old) this.tree.remove(old);
    this.entries.delete(id);
    if (n) {
      const b = bounds(n);
      this.entries.set(id, b);
      this.tree.insert(b);
    }
  }
  query(x: number, y: number, w: number, h: number) {
    return this.tree.search({ minX: x, minY: y, maxX: x + w, maxY: y + h });
  }
}
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    l = dx * dx + dy * dy;
  const t = l
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l))
    : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Pure two-pointer camera transform. Coordinates are host-local CSS pixels. */
export function pinchCamera(
  start: Camera,
  initial: [Point, Point],
  current: [Point, Point],
): Camera {
  const center = (pair: [Point, Point]) => ({
    x: (pair[0].x + pair[1].x) / 2,
    y: (pair[0].y + pair[1].y) / 2,
  });
  const distance = (pair: [Point, Point]) =>
    Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
  const anchor = toWorld(center(initial), start),
    p = center(current);
  const zoom = Math.max(
    0.02,
    Math.min(
      4,
      (start.zoom * distance(current)) / Math.max(1, distance(initial)),
    ),
  );
  return { x: anchor.x - p.x / zoom, y: anchor.y - p.y / zoom, zoom };
}
