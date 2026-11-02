import type { Camera, Node, Point, Change } from "../core/types";
import type { Document } from "../document/model";
import type { SpatialIndex } from "../scene/geometry";
import type { NodeDefinition } from "../nodes/definition";
/** Narrow interaction port; no dependency on the engine composition root. */
export interface InteractionHost {
  host: HTMLElement;
  camera: Camera;
  document: Document;
  index: SpatialIndex;
  selected: Set<string>;
  selectedEdge?: string;
  preview: Map<string, Node>;
  box?: { a: Point; b: Point };
  connection?: { from: string; to: Point };
  definitions: Map<string, NodeDefinition>;
  options: { canConnect?: (a: Node, b: Node) => boolean };
  overlays: { close(save?: boolean): void };
  hitNode(p: Point): Node | undefined;
  hoverNode(id?: string): void;
  focusNodeControls(): void;
  activateContent(id: string, point: Point): boolean;
  showNodePanel(id?: string, reveal?: boolean): void;
  gestureActive: boolean;
  applyChanges(changes: Change[], history?: boolean): void;
  requestRender(): void;
  notify(): void;
  message(text: string): void;
  edit(id: string): void;
  focusNode(id: string): void;
  duplicate(): void;
  copy(): void;
  paste(): void;
  removeSelected(): void;
}
