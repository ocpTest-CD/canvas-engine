import { Texture } from "pixi.js";
import type { MediaMetadata } from "../core/types";
import { mediaPreview } from "./media";
export interface Asset {
  url: string;
  mime: string;
  release?: () => void;
}
export type AssetResolver = (id: string) => Promise<Asset>;
interface Entry {
  texture?: Texture;
  metadata?: MediaMetadata;
  controller: AbortController;
  asset?: Asset;
  error?: string;
  used: number;
  bytes: number;
  pending: boolean;
}
export class Resources {
  entries = new Map<string, Entry>();
  private alive = true;
  private generation = 0;
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(
    private resolve: AssetResolver,
    private changed: () => void,
    public budget = 96 * 1024 * 1024,
    private measured: (id: string, metadata: MediaMetadata) => void = () => {},
  ) {}
  get(id: string) {
    const e = this.entries.get(id);
    if (e) e.used = performance.now();
    return e;
  }
  request(id: string) {
    if (this.entries.has(id)) return;
    const e: Entry = {
      used: performance.now(),
      bytes: 0,
      pending: true,
      controller: new AbortController(),
    };
    this.entries.set(id, e);
    const generation = this.generation;
    this.queue.push(() => {
      this.active++;
      void this.resolve(id)
        .then(async (asset) => {
          if (!this.alive || generation !== this.generation) {
            asset.release?.();
            return;
          }
          e.asset = asset;
          const preview = await mediaPreview(
            asset.url,
            asset.mime,
            e.controller.signal,
          );
          if (
            !this.alive ||
            generation !== this.generation ||
            e.controller.signal.aborted
          )
            return;
          if (preview) {
            e.metadata = preview.metadata;
            e.texture = Texture.from(preview.canvas);
            e.bytes = preview.canvas.width * preview.canvas.height * 4;
            this.measured(id, preview.metadata);
          }
        })
        .catch((err) => {
          e.error = String(err instanceof Error ? err.message : err);
        })
        .finally(() => {
          e.pending = false;
          this.active--;
          if (this.alive && generation === this.generation) this.changed();
          this.pump();
        });
    });
    this.pump();
  }
  private pump() {
    while (this.alive && this.active < 3 && this.queue.length)
      this.queue.shift()!();
  }
  trim(keep: Set<string>) {
    let bytes = this.bytes;
    for (const [id, e] of [...this.entries].sort(
      (a, b) => a[1].used - b[1].used,
    )) {
      if (e.pending || keep.has(id)) continue;
      if (bytes <= this.budget && this.entries.size <= 128) break;
      bytes -= e.bytes;
      this.drop(id);
    }
  }
  private drop(id: string) {
    const e = this.entries.get(id);
    e?.controller.abort();
    e?.texture?.destroy(true);
    e?.asset?.release?.();
    this.entries.delete(id);
  }
  clear() {
    this.generation++;
    this.queue = [];
    for (const id of this.entries.keys()) this.drop(id);
  }
  destroy() {
    this.alive = false;
    this.clear();
  }
  get bytes() {
    return [...this.entries.values()].reduce((n, e) => n + e.bytes, 0);
  }
}
