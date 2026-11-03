import type { MediaMetadata } from "../core/types.js";
/** Canvas units, independent of zoom or thumbnail resolution. */
export function fitMedia(media: Pick<MediaMetadata, "width" | "height">) {
  const { width, height } = media;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw Error("无效媒体尺寸");
  const scale = Math.min(400 / width, 400 / height);
  // Ultra-long images remain proportional; bounded by the document's 10k limit.
  const minimum = Math.max(8 / width, 8 / height);
  const factor = Math.min(
    Math.max(scale, minimum),
    10000 / Math.max(width, height),
  );
  return {
    width: Math.max(8, width * factor),
    height: Math.max(8, height * factor),
  };
}
export function fitText(text: string, width = 320) {
  const columns = Math.max(1, Math.floor((width - 32) / 14));
  const lines = text
    .split("\n")
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil([...line].length / columns)),
      0,
    );
  return { width, height: Math.max(120, Math.min(420, 32 + lines * 23)) };
}
