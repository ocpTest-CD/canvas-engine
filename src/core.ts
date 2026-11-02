/** Pure/headless public entry: no PixiJS, React or DOM imports. */
export * from "./core/types";
export { Document } from "./document/model";
export { validate } from "./serialization/scene";
export { fitMedia, fitText } from "./layout/sizing";
export {
  SpatialIndex,
  toScreen,
  toWorld,
  zoomAt,
  pinchCamera,
  segmentDistance,
} from "./scene/geometry";

export type { DocumentChange, DocumentOptions } from "./document/model";
export { EdgeIndex } from "./scene/edges";

export { createSceneBridge } from "./core/bridge";
export type {
  SceneBridge,
  SceneBridgeHost,
  BridgeMethod,
  BridgeRequest,
  BridgeResponse,
} from "./core/bridge";
