import { expect, it } from "vitest";
import { selectionSnapshot, executionPreview, type Node } from "../src/core";
const a: Node = {
    id: "a",
    type: "text",
    title: "a",
    x: -10,
    y: 20,
    width: 100,
    height: 50,
  },
  b: Node = { ...a, id: "b", x: 200, y: -10 };
it("returns detached immutable selection bounds, deduplicates and removes stale IDs", () => {
  const nodes = new Map([
      [a.id, a],
      [b.id, b],
    ]),
    ids = new Set(["a", "b", "missing"]);
  const s = selectionSnapshot(nodes, ids);
  expect(s.nodeIds).toEqual(["a", "b"]);
  expect(s.bounds).toEqual({ x: -10, y: -10, width: 310, height: 80 });
  ids.clear();
  expect(s.nodeIds).toHaveLength(2);
  expect(Object.isFrozen(s.nodeIds)).toBe(true);
  expect(Object.isFrozen(s.bounds)).toBe(true);
  nodes.delete("a");
  expect(selectionSnapshot(nodes, ["a"]).bounds).toBeUndefined();
});
it("execution overlays never carry business configuration or stale nodes", () => {
  const value = { execute: ["a", "a", "missing"], blocked: ["b"] };
  const preview = executionPreview(
    new Map([
      ["a", a],
      ["b", b],
    ]),
    value,
  );
  value.execute.length = 0;
  expect(preview).toEqual({ execute: ["a"], blocked: ["b"], cancel: [] });
  expect(Object.isFrozen(preview)).toBe(true);
});
