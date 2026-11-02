export interface Point {
  x: number;
  y: number;
}
export interface Camera extends Point {
  zoom: number;
}
export interface MediaMetadata {
  width: number;
  height: number;
  mime: string;
  duration?: number;
}
export interface Node extends Point {
  id: string;
  type: string;
  title: string;
  width: number;
  height: number;
  text?: string;
  assetId?: string;
  group?: string;
  status?: string;
  /** Missing in legacy projects: preserve their geometry until explicitly adapted. */
  sizeMode?: "auto" | "manual";
  preferredAspectRatio?: number;
  media?: MediaMetadata;
}
export interface Edge {
  id: string;
  from: string;
  to: string;
}
export interface Snapshot {
  version: 1;
  nodes: Node[];
  edges: Edge[];
  camera?: Camera;
}
export type Change =
  | { kind: "put"; node: Node }
  | { kind: "remove"; id: string }
  | { kind: "connect"; edge: Edge }
  | { kind: "disconnect"; id: string };
export const emptyScene = (): Snapshot => ({
  version: 1,
  nodes: [],
  edges: [],
});
export const uid = () => crypto.randomUUID();
