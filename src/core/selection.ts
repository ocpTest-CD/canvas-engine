import type { Node, SelectionSnapshot, ExecutionPreview } from "./types.js";
export function selectionSnapshot(
  nodes: ReadonlyMap<string, Node>,
  ids: Iterable<string>,
): SelectionSnapshot {
  const nodeIds = [...new Set(ids)].filter((id) => nodes.has(id));
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const id of nodeIds) {
    const n = nodes.get(id)!;
    x = Math.min(x, n.x);
    y = Math.min(y, n.y);
    right = Math.max(right, n.x + n.width);
    bottom = Math.max(bottom, n.y + n.height);
  }
  return Object.freeze({
    nodeIds: Object.freeze(nodeIds),
    ...(nodeIds.length
      ? {
          bounds: Object.freeze({ x, y, width: right - x, height: bottom - y }),
        }
      : {}),
  });
}
export function executionPreview(
  nodes: ReadonlyMap<string, Node>,
  value: Partial<ExecutionPreview> = {},
): ExecutionPreview {
  const copy = (ids: readonly string[] = []) =>
    Object.freeze([...new Set(ids)].filter((id) => nodes.has(id)));
  return Object.freeze({
    execute: copy(value.execute),
    blocked: copy(value.blocked),
    cancel: copy(value.cancel),
  });
}
