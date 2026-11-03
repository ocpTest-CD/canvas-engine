import type { MediaMetadata } from "../core/types.js";
export interface MediaPreview {
  canvas: HTMLCanvasElement;
  metadata: MediaMetadata;
}
function thumbnail(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, 768 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}
/** Decode only within the resource scheduler; video never starts playing. */
export async function mediaPreview(
  url: string,
  mime: string,
  signal: AbortSignal,
): Promise<MediaPreview | undefined> {
  if (mime.startsWith("image/")) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw Error("素材读取失败");
    const source = await createImageBitmap(await response.blob());
    try {
      signal.throwIfAborted();
      return {
        canvas: thumbnail(source, source.width, source.height),
        metadata: { width: source.width, height: source.height, mime },
      };
    } finally {
      source.close();
    }
  }
  if (!mime.startsWith("video/")) return;
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      video.onloadeddata = null;
      video.onerror = null;
      if (error) reject(error);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
    const abort = () => finish(new Error("媒体读取已取消"));
    const timeout = setTimeout(
      () => finish(new Error("视频封面读取超时")),
      15000,
    );
    video.onerror = () => finish(new Error("无法解码视频"));
    video.onloadeddata = () => {
      try {
        signal.throwIfAborted();
        if (!video.videoWidth || !video.videoHeight)
          throw Error("视频缺少尺寸信息");
        const metadata = {
          width: video.videoWidth,
          height: video.videoHeight,
          mime,
          ...(Number.isFinite(video.duration)
            ? { duration: video.duration }
            : {}),
        };
        resolve({
          canvas: thumbnail(video, metadata.width, metadata.height),
          metadata,
        });
        finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    video.src = url;
  });
}
