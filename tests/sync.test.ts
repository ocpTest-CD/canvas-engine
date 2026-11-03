import { expect, it } from "vitest";
import { Document, type CommittedTransaction } from "../src/core";
const scene = {
  version: 1,
  nodes: [
    { id: "a", type: "text", title: "a", x: 0, y: 0, width: 100, height: 100 },
    {
      id: "b",
      type: "text",
      title: "b",
      x: 200,
      y: 0,
      width: 100,
      height: 100,
    },
  ],
  edges: [],
};
it("emits replayable patches, deletion and order for local history transactions", () => {
  const a = new Document(),
    b = new Document();
  a.load(scene);
  b.load(scene);
  const events: CommittedTransaction[] = [];
  a.onTransaction = (t) => {
    events.push(t);
    b.apply(t.operations, { origin: "remote", transactionId: t.transactionId });
  };
  a.apply([{ kind: "patch", id: "a", set: { text: "hello", x: 12 } }]);
  a.reorder(["b", "a"]);
  a.apply([{ kind: "remove", id: "a" }]);
  a.undo();
  a.undo();
  a.redo();
  expect(b.snapshot()).toEqual(a.snapshot());
  expect(events.at(-1)?.origin).toBe("history");
  expect(events[0].operations[0]).toMatchObject({
    kind: "patch",
    set: { text: "hello", x: 12 },
  });
});
it("preserves unrelated undo while remote geometry does not echo or become undoable", () => {
  const d = new Document();
  d.load(scene);
  d.apply([{ kind: "patch", id: "a", set: { text: "mine" } }]);
  d.apply([{ kind: "patch", id: "b", set: { x: 999 } }], { origin: "remote" });
  d.undo();
  expect(d.nodes.get("a")?.text).toBeUndefined();
  expect(d.nodes.get("b")?.x).toBe(999);
  expect(d.canUndo).toBe(false);
});
it("drops overlapping history instead of resurrecting a remotely removed node", () => {
  const d = new Document();
  d.load(scene);
  d.apply([{ kind: "patch", id: "a", set: { text: "mine" } }]);
  d.apply([{ kind: "remove", id: "a" }], { origin: "remote" });
  d.undo();
  expect(d.nodes.has("a")).toBe(false);
});
it("runtime never persists, advances revision or emits document operations", () => {
  const d = new Document();
  d.load(scene);
  let count = 0;
  d.onTransaction = () => count++;
  const rev = d.revision;
  d.updateStatus("a", "running");
  expect(d.revision).toBe(rev);
  expect(d.snapshot().nodes[0].status).toBeUndefined();
  expect(count).toBe(0);
  d.setRuntimeState("a", { progress: 0.5 });
  expect(d.runtime.get("a")?.progress).toBe(0.5);
  d.load(scene);
  expect(d.runtime.size).toBe(0);
});
it("read-only rejects all local/history mutation but accepts remote updates", () => {
  const d = new Document({ canEdit: () => false });
  d.load(scene);
  expect(() => d.apply([{ kind: "remove", id: "a" }])).toThrow();
  expect(() => d.undo()).toThrow();
  expect(() => d.reorder(["b", "a"])).toThrow();
  d.apply([{ kind: "patch", id: "a", set: { text: "remote" } }], {
    origin: "remote",
  });
  expect(d.nodes.get("a")?.text).toBe("remote");
});
it("rejects invalid patches atomically", () => {
  const d = new Document();
  d.load(scene);
  const before = d.snapshot();
  expect(() =>
    d.apply([
      { kind: "patch", id: "a", set: { title: "changed" } },
      { kind: "patch", id: "b", unset: ["width"] },
    ]),
  ).toThrow();
  expect(d.snapshot()).toEqual(before);
});
it("transaction listeners cannot mutate nested live node fields", () => {
  const d = new Document();
  d.load(scene);
  d.onTransaction = (t) => {
    const op = t.operations[0];
    if (op.kind === "patch" && op.set?.media) op.set.media.width = 1;
  };
  d.apply([
    {
      kind: "patch",
      id: "a",
      set: { media: { width: 1920, height: 1080, mime: "image/png" } },
    },
  ]);
  expect(d.nodes.get("a")?.media?.width).toBe(1920);
});
import fixture from "./fixtures/scene-operations.json";
it("matches the Go scene contract fixture", () => {
  const d = new Document();
  d.load(fixture.initial);
  d.apply(fixture.operations as import("../src/core").Change[], {
    origin: "remote",
  });
  expect(d.snapshot()).toEqual(fixture.expected);
});
