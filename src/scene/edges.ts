import RBush from "rbush";
import type { Edge, Node } from "../core/types";
import type { Box } from "./geometry";
/** Rectangles include crossing edges with both endpoints outside the viewport. */
export class EdgeIndex {
  private tree = new RBush<Box>();
  private boxes = new Map<string, Box>();
  clear() {
    this.tree.clear();
    this.boxes.clear();
  }
  update(id: string, edge: Edge | undefined, nodes: ReadonlyMap<string, Node>) {
    const old = this.boxes.get(id);
    if (old) this.tree.remove(old);
    this.boxes.delete(id);
    if (!edge) return;
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    if (!a || !b) return;
    const x = a.x + a.width,
      y = a.y + a.height / 2,
      xx = b.x,
      yy = b.y + b.height / 2;
    const box = {
      id,
      minX: Math.min(x, xx),
      minY: Math.min(y, yy),
      maxX: Math.max(x, xx),
      maxY: Math.max(y, yy),
    };
    this.boxes.set(id, box);
    this.tree.insert(box);
  }
  query(x: number, y: number, width: number, height: number) {
    return this.tree.search({
      minX: x,
      minY: y,
      maxX: x + width,
      maxY: y + height,
    });
  }
}
