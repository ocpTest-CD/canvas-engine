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
  SpatialIndex,
  segmentDistance,
} from "./scene/geometry";
export type { NodeDefinition, NodeAction } from "./nodes/definition";
export type { Asset, AssetResolver } from "./resources/resources";
export { fitMedia, fitText } from "./layout/sizing";
