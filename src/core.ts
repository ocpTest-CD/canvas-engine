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
  segmentDistance,
} from "./scene/geometry";
