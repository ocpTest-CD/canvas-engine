/** Pure/headless public entry: no PixiJS, React or DOM imports. */
export * from "./core/types.js";
export { Document } from "./document/model.js";
export { validate } from "./serialization/scene.js";
export { fitMedia, fitText } from "./layout/sizing.js";
export {
  SpatialIndex,
  toScreen,
  toWorld,
  zoomAt,
  pinchCamera,
  segmentDistance,
} from "./scene/geometry.js";

export type { DocumentChange, DocumentOptions } from "./document/model.js";
export { EdgeIndex } from "./scene/edges.js";

export { createSceneBridge } from "./core/bridge.js";
export type {
  SceneBridge,
  SceneBridgeHost,
  BridgeMethod,
  BridgeRequest,
  BridgeResponse,
} from "./core/bridge.js";

export { selectionSnapshot, executionPreview } from "./core/selection.js";
