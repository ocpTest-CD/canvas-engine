import { describe, it, expect, vi } from "vitest";
import { Document, type Node, type Change } from "../src/core";
import { EdgeIndex } from "../src/scene/edges";
const node = (id: string, x = 0): Node => ({
  id,
  type: "text",
  title: id,
  x,
  y: 0,
  width: 100,
  height: 100,
});
const scene = () => ({
  version: 1,
  nodes: [node("a"), node("b", 300), node("c", 600)],
  edges: [
    { id: "ab", from: "a", to: "b" },
    { id: "bc", from: "b", to: "c" },
  ],
});
describe("incremental document transactions", () => {
  it("does not mutate the document, adjacency or history on failed staged changes", () => {
    const d = new Document();
    d.load(scene());
    const before = d.snapshot(),
      rev = d.revision;
    expect(() =>
      d.apply([
        { kind: "remove", id: "b" },
        { kind: "connect", edge: { id: "bad", from: "a", to: "b" } },
      ]),
    ).toThrow();
    expect(d.snapshot()).toEqual(before);
    expect(d.revision).toBe(rev);
    expect(d.canUndo).toBe(false);
    expect([...d.incidentEdges("b")].sort()).toEqual(["ab", "bc"]);
  });
  it("handles edge replacement followed by removal without dropping unrelated edges", () => {
    const d = new Document();
    d.load(scene());
    d.apply([
      { kind: "connect", edge: { id: "ab", from: "a", to: "c" } },
      { kind: "remove", id: "b" },
    ]);
    expect([...d.edges.keys()]).toEqual(["ab"]);
    expect([...d.incidentEdges("b")]).toEqual([]);
    d.undo();
    expect(d.snapshot()).toEqual(scene());
    d.redo();
    expect(d.edges.get("ab")?.to).toBe("c");
  });
  it("preserves delete/reinsert order through undo/redo", () => {
    const d = new Document();
    d.load(scene());
    d.apply([
      { kind: "remove", id: "a" },
      { kind: "put", node: node("a") },
    ]);
    expect([...d.nodes.keys()]).toEqual(["b", "c", "a"]);
    d.undo();
    expect([...d.nodes.keys()]).toEqual(["a", "b", "c"]);
    d.redo();
    expect([...d.nodes.keys()]).toEqual(["b", "c", "a"]);
  });
  it("separates content, geometry, topology and order notifications", () => {
    const d = new Document();
    d.load(scene());
    const onChange = vi.fn();
    d.onChange = onChange;
    d.updateStatus("a", "done");
    expect(onChange.mock.lastCall?.[1].geometry.size).toBe(0);
    d.apply([{ kind: "put", node: { ...d.nodes.get("a")!, text: "new" } }]);
    expect(onChange.mock.lastCall?.[1].orderChanged).toBe(false);
    expect(onChange.mock.lastCall?.[1].geometry.size).toBe(0);
    d.apply([{ kind: "put", node: { ...d.nodes.get("a")!, x: 7 } }]);
    expect([...onChange.mock.lastCall?.[1].geometry]).toEqual(["a"]);
  });
  it("returns an isolated loaded snapshot and copies reorder input", () => {
    const d = new Document();
    const loaded = d.load(scene());
    loaded.nodes[0].title = "changed";
    expect(d.nodes.get("a")?.title).toBe("a");
    const order = ["c", "a", "b"];
    d.reorder(order);
    order.reverse();
    d.undo();
    d.redo();
    expect([...d.nodes.keys()]).toEqual(["c", "a", "b"]);
  });
  it("isolates caller-owned mutations and incident sets", () => {
    const d = new Document();
    d.load(scene());
    const n = node("a");
    d.apply([{ kind: "put", node: n }]);
    n.title = "oops";
    expect(d.nodes.get("a")?.title).toBe("a");
    const set = d.incidentEdges("a") as Set<string>;
    set.clear();
    expect(d.incidentEdges("a").size).toBe(1);
  });
  it("validates every changed field atomically and accepts forward node references", () => {
    const d = new Document();
    d.load(scene());
    expect(() =>
      d.apply([{ kind: "put", node: { ...node("a"), width: NaN } }]),
    ).toThrow();
    d.apply([
      { kind: "connect", edge: { id: "cd", from: "c", to: "d" } },
      { kind: "put", node: node("d") },
    ]);
    expect(d.edges.has("cd")).toBe(true);
  });
  it("invalidates history when nonhistorical topology replaces its references", () => {
    const d = new Document();
    d.load(scene());
    d.apply([{ kind: "put", node: { ...node("a"), x: 10 } }]);
    d.undo();
    d.apply([{ kind: "remove", id: "b" }], false);
    expect(d.canRedo).toBe(false);
    expect(d.canUndo).toBe(false);
  });
  it("maintains adjacency and reversibility across 250 deterministic mixed transactions", () => {
    const d = new Document();
    d.load(scene());
    let seed = 19;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };
    for (let i = 0; i < 250; i++) {
      const ids = [...d.nodes.keys()],
        id = ids[rnd() % ids.length];
      let changes: Change[];
      if (i % 4 === 0) changes = [{ kind: "put", node: node(`new-${i}`, i) }];
      else if (i % 4 === 1 && ids.length > 2)
        changes = [{ kind: "remove", id }];
      else if (i % 4 === 2) {
        const to = ids[(ids.indexOf(id) + 1) % ids.length];
        changes = [
          { kind: "connect", edge: { id: `edge-${i}`, from: id, to } },
        ];
      } else changes = [{ kind: "put", node: { ...d.nodes.get(id)!, x: i } }];
      const before = d.snapshot();
      d.apply(changes);
      const after = d.snapshot();
      d.undo();
      expect(d.snapshot()).toEqual(before);
      d.redo();
      expect(d.snapshot()).toEqual(after);
      for (const n of d.nodes.keys())
        expect([...d.incidentEdges(n)].sort()).toEqual(
          [...d.edges.values()]
            .filter((e) => e.from === n || e.to === n)
            .map((e) => e.id)
            .sort(),
        );
    }
  });
});
describe("edge spatial index", () => {
  it("finds crossing edges, tracks geometry and removes stale edges", () => {
    const idx = new EdgeIndex(),
      nodes = new Map([
        ["a", node("a", -1000)],
        ["b", node("b", 1000)],
      ]),
      edge = { id: "e", from: "a", to: "b" };
    idx.update("e", edge, nodes);
    expect(idx.query(0, 40, 20, 20).map((b) => b.id)).toEqual(["e"]);
    nodes.set("b", { ...nodes.get("b")!, y: 1000 });
    idx.update("e", edge, nodes);
    idx.update("e", undefined, nodes);
    expect(idx.query(-2000, -2000, 4000, 4000)).toEqual([]);
  });
});

it("enforces host connection policy on load, connect and affected node edits", () => {
  const d = new Document({
    canConnect: (_edge, from, to) => from.type === to.type,
  });
  d.load(scene());
  const before = d.snapshot();
  expect(() =>
    d.apply([{ kind: "put", node: { ...node("b"), type: "image" } }]),
  ).toThrow();
  expect(d.snapshot()).toEqual(before);
  expect(() =>
    d.load({
      ...scene(),
      nodes: [node("a"), { ...node("b"), type: "image" }, node("c")],
    }),
  ).toThrow();
  expect(d.snapshot()).toEqual(before);
});
