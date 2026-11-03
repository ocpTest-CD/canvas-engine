/** Public entry point. Hosts and examples must not import implementation files. */
export { CanvasEngine } from "./engine.js";
export type { Options } from "./engine.js";
export { Document } from "./document/model.js";
export * from "./core/types.js";
export { validate } from "./serialization/scene.js";
export {
  toScreen,
  toWorld,
  zoomAt,
  pinchCamera,
  SpatialIndex,
  segmentDistance,
} from "./scene/geometry.js";
export type {
  NodeDefinition,
  NodeAction,
  NodeEditor,
} from "./nodes/definition.js";
export type {
  Asset,
  AssetResolver,
  AssetContext,
  ResourceOptions,
} from "./resources/resources.js";
export { fitMedia, fitText } from "./layout/sizing.js";

export type { DocumentChange, DocumentOptions } from "./document/model.js";

export { createSceneBridge } from "./core/bridge.js";
export type {
  SceneBridge,
  SceneBridgeHost,
  BridgeMethod,
  BridgeRequest,
  BridgeResponse,
} from "./core/bridge.js";

export { selectionSnapshot, executionPreview } from "./core/selection.js";
