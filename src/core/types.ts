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
  | {
      kind: "patch";
      id: string;
      set?: Partial<Omit<Node, "id">>;
      unset?: Array<keyof Omit<Node, "id">>;
    }
  | { kind: "reorder"; ids: string[] }
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

export interface EngineMetrics {
  frames: number;
  drawMs: number;
  visible: number;
  visibleEdges: number;
  textures: number;
  textureBytes: number;
}
export interface EngineEvents {
  change: undefined;
  documentChange: Set<string>;
  transaction: CommittedTransaction;
  runtimeChange: { id: string; state?: RuntimeState };
  selectionChange: SelectionSnapshot;
  executionPreviewChange: ExecutionPreview;
  nodesCloned: Map<string, string>;
  message: string;
  metrics: EngineMetrics;
}

export type TransactionOrigin = "local" | "remote" | "system" | "history";
export interface ApplyOptions {
  history?: boolean;
  origin?: TransactionOrigin;
  transactionId?: string;
}
export interface CommittedTransaction {
  transactionId: string;
  origin: TransactionOrigin;
  revision: number;
  operations: Change[];
}
export interface RuntimeIssue {
  id: string; summary: string; detail?: string; severity?: "error" | "blocked" | "attention";
}
export interface RuntimeState {
  issue?: RuntimeIssue;
  status?: string;
  /** Actual stage progress, normalized to 0..1. Omit when unknown. */
  progress?: number;
  phase?: string;
  /** Active attempts lock local/history edits to this node and its incident edges. */
  active?: boolean;
  attemptId?: string;
  sequence?: number;
  startedAt?: number;
  runId?: string;
  error?: string;
}

/** Immutable world-space selection, including ordinary content nodes. Hosts decide which nodes execute. */
export interface SelectionSnapshot {
  readonly nodeIds: readonly string[];
  readonly bounds?: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}
/** Transient, service-agnostic overlays; never part of a document or undo history. */
export interface ExecutionPreview {
  readonly execute: readonly string[];
  readonly blocked: readonly string[];
  readonly cancel: readonly string[];
}
