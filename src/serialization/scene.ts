import type { Snapshot, Node, Edge } from "../core/types.js";
const finite = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e9;
export function validate(raw: unknown): Snapshot {
  if (!raw || typeof raw !== "object") throw Error("场景必须是对象");
  const s = raw as Snapshot;
  if (
    s.version !== 1 ||
    !Array.isArray(s.nodes) ||
    !Array.isArray(s.edges) ||
    s.nodes.length > 50000 ||
    s.edges.length > 100000
  )
    throw Error("不支持的场景格式或规模");
  const ids = new Set<string>();
  for (const n of s.nodes) {
    validateNode(n);
    if (ids.has(n.id)) throw Error("重复的节点");
    ids.add(n.id);
  }
  const edges = new Set<string>();
  for (const e of s.edges) {
    validateEdge(e, (id) => ids.has(id));
    if (
      !e ||
      typeof e.id !== "string" ||
      edges.has(e.id) ||
      !ids.has(e.from) ||
      !ids.has(e.to) ||
      e.from === e.to
    )
      throw Error("无效连线");
    edges.add(e.id);
  }
  if (
    s.camera &&
    (!finite(s.camera.x) ||
      !finite(s.camera.y) ||
      !Number.isFinite(s.camera.zoom) ||
      s.camera.zoom < 0.02 ||
      s.camera.zoom > 4)
  )
    throw Error("无效视图");
  return structuredClone({
    version: 1,
    nodes: s.nodes,
    edges: s.edges,
    ...(s.camera ? { camera: s.camera } : {}),
  });
}

export function validateNode(n: Node): void {
  if (
    !n ||
    typeof n.id !== "string" ||
    !n.id ||
    typeof n.type !== "string" ||
    typeof n.title !== "string" ||
    ![n.x, n.y, n.width, n.height].every(finite) ||
    n.width < 8 ||
    n.height < 8 ||
    n.width > 10000 ||
    n.height > 10000
  )
    throw Error("无效或重复的节点");
  for (const k of ["text", "assetId", "group", "status"] as const)
    if (n[k] !== undefined && typeof n[k] !== "string")
      throw Error("无效节点字段");
  if (n.sizeMode !== undefined && !["auto", "manual"].includes(n.sizeMode))
    throw Error("无效尺寸策略");
  if (n.media !== undefined && (!n.media || typeof n.media !== "object"))
    throw Error("无效媒体尺寸");
  if (
    n.media &&
    (!finite(n.media.width) ||
      !finite(n.media.height) ||
      n.media.width <= 0 ||
      n.media.height <= 0 ||
      typeof n.media.mime !== "string" ||
      (n.media.duration !== undefined &&
        (!Number.isFinite(n.media.duration) || n.media.duration < 0)))
  )
    throw Error("无效媒体尺寸");
  if (
    n.preferredAspectRatio !== undefined &&
    (!finite(n.preferredAspectRatio) || n.preferredAspectRatio <= 0)
  )
    throw Error("无效预设画幅");
}

export function validateEdge(e: Edge, hasNode: (id: string) => boolean): void {
  if (
    !e ||
    typeof e.id !== "string" ||
    !e.id ||
    typeof e.from !== "string" ||
    typeof e.to !== "string" ||
    !hasNode(e.from) ||
    !hasNode(e.to) ||
    e.from === e.to
  )
    throw Error("无效连线");
}
