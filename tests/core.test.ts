import { describe, it, expect } from "vitest";
import { Document, validate, type Node } from "../src/document/model";
import {
  SpatialIndex,
  toScreen,
  toWorld,
  zoomAt,
  segmentDistance,
} from "../src/scene/geometry";
const node = (id: string, x = 0): Node => ({
  id,
  type: "text",
  title: id,
  x,
  y: 0,
  width: 200,
  height: 150,
});
describe("document transactions", () => {
  it("rejects malformed changes atomically", () => {
    const d = new Document();
    d.load({ version: 1, nodes: [node("a")], edges: [] });
    expect(() =>
      d.apply([
        { kind: "put", node: node("b") },
        { kind: "connect", edge: { id: "e", from: "a", to: "missing" } },
      ]),
    ).toThrow();
    expect(d.nodes.size).toBe(1);
    expect(d.canUndo).toBe(false);
  });
  it("restores deleted nodes and incident edges as one action", () => {
    const d = new Document();
    d.load({
      version: 1,
      nodes: [node("a"), node("b")],
      edges: [{ id: "e", from: "a", to: "b" }],
    });
    d.apply([{ kind: "remove", id: "a" }]);
    expect(d.edges.size).toBe(0);
    d.undo();
    expect(d.edges.size).toBe(1);
    expect(d.nodes.size).toBe(2);
    d.redo();
    expect(d.nodes.size).toBe(1);
  });
  it("undoes geometry without rewinding external status", () => {
    const d = new Document();
    d.load({ version: 1, nodes: [node("a")], edges: [] });
    d.apply([{ kind: "put", node: node("a", 100) }]);
    d.updateStatus("a", "done");
    d.undo();
    expect(d.nodes.get("a")).toMatchObject({ x: 0, status: "done" });
    d.redo();
    expect(d.nodes.get("a")).toMatchObject({ x: 100, status: "done" });
  });
  it("supports reversible stacking order", () => {
    const d = new Document();
    d.load({ version: 1, nodes: [node("a"), node("b")], edges: [] });
    d.reorder(["b", "a"]);
    expect([...d.nodes.keys()]).toEqual(["b", "a"]);
    d.undo();
    expect([...d.nodes.keys()]).toEqual(["a", "b"]);
  });
  it("round trips snapshots without retaining references", () => {
    const d = new Document();
    d.load({ version: 1, nodes: [node("a")], edges: [] });
    const s = d.snapshot();
    s.nodes[0].title = "changed";
    expect(d.nodes.get("a")?.title).toBe("a");
    expect(validate(d.snapshot())).toEqual(d.snapshot());
  });
  it("rejects unsupported versions and non-finite coordinates", () => {
    expect(() => validate({ version: 2, nodes: [], edges: [] })).toThrow();
    expect(() =>
      validate({ version: 1, nodes: [node("a", Infinity)], edges: [] }),
    ).toThrow();
  });
});
describe("camera and spatial queries", () => {
  it("keeps zoom anchor fixed even at distant coordinates", () => {
    const c = { x: 1e8, y: -1e8, zoom: 0.2 },
      anchor = { x: 500, y: 200 };
    const before = toWorld(anchor, c);
    expect(toScreen(before, zoomAt(c, anchor, 3)).x).toBeCloseTo(anchor.x, 5);
    expect(toWorld(toScreen(before, c), c)).toEqual(before);
  });
  it("removes stale spatial entries after moving/deleting", () => {
    const index = new SpatialIndex();
    index.rebuild([node("a")]);
    expect(index.query(10, 10, 10, 10)).toHaveLength(1);
    index.update("a", node("a", 1000));
    expect(index.query(10, 10, 10, 10)).toHaveLength(0);
    index.update("a");
    expect(index.query(1000, 0, 200, 200)).toHaveLength(0);
  });
  it("hits an edge crossing viewport with both endpoints outside", () => {
    expect(
      segmentDistance({ x: 0, y: 0 }, { x: -1000, y: 0 }, { x: 1000, y: 0 }),
    ).toBe(0);
  });
});
