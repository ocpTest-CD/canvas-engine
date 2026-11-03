import { expect, it } from "vitest";
import { Document } from "../src/core";
const create = () => {
  const d = new Document();
  d.load({
    version: 1,
    nodes: ["a", "b", "c"].map((id, i) => ({
      id,
      type: "text",
      title: id,
      text: "before",
      x: i * 200,
      y: 0,
      width: 150,
      height: 100,
    })),
    edges: [{ id: "ab", from: "a", to: "b" }],
  });
  return d;
};
it("locks active node content, geometry and incident edges atomically, including mixed selection", () => {
  const d = create();
  d.setRuntimeState("a", { active: true });
  const before = d.snapshot();
  for (const changes of [
    [{ kind: "patch", id: "a", set: { text: "changed" } }],
    [{ kind: "put", node: { ...d.nodes.get("a")!, title: "renamed", x: 42 } }],
    [{ kind: "remove", id: "a" }],
    [{ kind: "remove", id: "b" }],
    [{ kind: "disconnect", id: "ab" }],
    [{ kind: "connect", edge: { id: "ac", from: "a", to: "c" } }],
    [
      { kind: "patch", id: "c", set: { text: "batch" } },
      { kind: "patch", id: "a", set: { text: "batch" } },
    ],
  ] as Parameters<Document["apply"]>[0][]) {
    expect(() => d.apply(changes)).toThrow("节点执行中");
    expect(d.snapshot()).toEqual(before);
  }
  d.apply([{ kind: "patch", id: "c", set: { text: "unrelated" } }]);
  expect(d.nodes.get("c")?.text).toBe("unrelated");
  d.apply([{ kind: "patch", id: "a", set: { text: "result" } }], {
    origin: "system",
  });
  expect(d.nodes.get("a")?.text).toBe("result");
  d.apply([{ kind: "patch", id: "a", set: { text: "remote" } }], {
    origin: "remote",
  });
  expect(d.nodes.get("a")?.text).toBe("remote");
  d.setRuntimeState("a", { active: false });
  d.apply([{ kind: "patch", id: "a", set: { title: "editable" } }]);
  expect(d.nodes.get("a")?.title).toBe("editable");
});
it("locked undo/redo preserve history and unlock without resurrecting execution state", () => {
  const d = create();
  d.apply([{ kind: "patch", id: "a", set: { text: "after" } }]);
  d.setRuntimeState("a", { active: true });
  expect(d.canUndo).toBe(false);
  d.undo();
  expect(d.nodes.get("a")?.text).toBe("after");
  d.setRuntimeState("a", { active: false });
  expect(d.canUndo).toBe(true);
  d.undo();
  expect(d.nodes.get("a")?.text).toBe("before");
  d.setRuntimeState("a", { active: true });
  expect(d.canRedo).toBe(false);
  d.redo();
  expect(d.nodes.get("a")?.text).toBe("before");
  d.setRuntimeState("a", { active: false });
  d.redo();
  expect(d.nodes.get("a")?.text).toBe("after");
  expect(d.runtime.get("a")?.active).toBe(false);
});
