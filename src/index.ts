/** Public entry point. Hosts and examples must not import implementation files. */
export { CanvasEngine } from "./engine";
export type { Options } from "./engine";
export { Document } from "./document/model";
export * from "./core/types";
export { validate } from "./serialization/scene";
export {
  toScreen,
  toWorld,
  zoomAt,
  pinchCamera,
  SpatialIndex,
  segmentDistance,
} from "./scene/geometry";
export type {
  NodeDefinition,
  NodeAction,
  NodeEditor,
} from "./nodes/definition";
export type {
  Asset,
  AssetResolver,
  AssetContext,
  ResourceOptions,
} from "./resources/resources";
export { fitMedia, fitText } from "./layout/sizing";

export type { DocumentChange, DocumentOptions } from "./document/model";

export { createSceneBridge } from "./core/bridge";
export type {
  SceneBridge,
  SceneBridgeHost,
  BridgeMethod,
  BridgeRequest,
  BridgeResponse,
} from "./core/bridge";
