import { Texture } from "pixi.js";
import type { MediaMetadata } from "../core/types.js";
import { mediaPreview } from "./media.js";
export interface Asset {
  url: string;
  mime: string;
  release?: () => void;
}
export interface AssetContext {
  signal: AbortSignal;
  purpose?: "thumbnail" | "preview" | "original";
  version?: string;
}
export type AssetResolver = (
  id: string,
  context?: AssetContext,
) => Promise<Asset>;
export interface ResourceOptions {
  budgetBytes?: number;
  maxEntries?: number;
  concurrency?: number;
  timeoutMs?: number;
}
export function validateResourceOptions(
  options: ResourceOptions = {},
  budget = 96 * 1024 * 1024,
) {
  for (const value of [
    options.budgetBytes ?? budget,
    options.maxEntries ?? 128,
    options.concurrency ?? 3,
    options.timeoutMs ?? 30000,
  ])
    if (!Number.isFinite(value) || value <= 0)
      throw Error("资源预算必须为正数");
  if (
    !Number.isInteger(options.concurrency ?? 3) ||
    !Number.isInteger(options.maxEntries ?? 128)
  )
    throw Error("资源并发与数量必须为整数");
}
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
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("素材读取已取消"));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
export class Resources {
  entries = new Map<string, Entry>();
  private alive = true;
  private active = 0;
  private queue: Array<() => void> = [];
  private cachedBytes = 0;
  private config: Required<Omit<ResourceOptions, "budgetBytes">>;
  constructor(
    private resolve: AssetResolver,
    private changed: () => void,
    public budget = 96 * 1024 * 1024,
    private measured: (id: string, metadata: MediaMetadata) => void = () => {},
    options: ResourceOptions = {},
  ) {
    this.budget = options.budgetBytes ?? budget;
    this.config = {
      maxEntries: options.maxEntries ?? 128,
      concurrency: options.concurrency ?? 3,
      timeoutMs: options.timeoutMs ?? 30000,
    };
    validateResourceOptions(options, budget);
  }
  get(id: string) {
    const e = this.entries.get(id);
    if (e) e.used = performance.now();
    return e;
  }
  request(id: string) {
    if (!this.alive || this.entries.has(id)) return;
    const e: Entry = {
      used: performance.now(),
      bytes: 0,
      pending: true,
      controller: new AbortController(),
    };
    this.entries.set(id, e);
    this.queue.push(() => {
      if (e.controller.signal.aborted || this.entries.get(id) !== e) return;
      this.active++;
      const signal = e.controller.signal;
      const timer = setTimeout(
        () => e.controller.abort(new Error("素材读取超时")),
        this.config.timeoutMs,
      );
      const work = Promise.resolve()
        .then(() => this.resolve(id, { signal, purpose: "thumbnail" }))
        .then(async (asset) => {
          if (!this.alive || signal.aborted || this.entries.get(id) !== e) {
            asset.release?.();
            return;
          }
          e.asset = asset;
          const preview = await mediaPreview(asset.url, asset.mime, signal);
          if (!this.alive || signal.aborted || this.entries.get(id) !== e)
            return;
          if (preview) {
            e.metadata = preview.metadata;
            e.texture = Texture.from(preview.canvas);
            e.bytes = preview.canvas.width * preview.canvas.height * 4;
            this.cachedBytes += e.bytes;
            this.measured(id, preview.metadata);
          }
        });
      void abortable(work, signal)
        .catch((error) => {
          e.error = String(error instanceof Error ? error.message : error);
          this.release(e);
        })
        .finally(() => {
          clearTimeout(timer);
          e.pending = false;
          this.active--;
          if (this.alive && this.entries.get(id) === e) this.changed();
          this.pump();
        });
    });
    this.pump();
  }
  private pump() {
    while (
      this.alive &&
      this.active < this.config.concurrency &&
      this.queue.length
    )
      this.queue.shift()!();
  }
  trim(keep: Set<string>) {
    if (
      this.cachedBytes <= this.budget &&
      this.entries.size <= this.config.maxEntries
    )
      return;
    for (const [id, e] of [...this.entries].sort(
      (a, b) => a[1].used - b[1].used,
    )) {
      if (e.pending || keep.has(id)) continue;
      if (
        this.cachedBytes <= this.budget &&
        this.entries.size <= this.config.maxEntries
      )
        break;
      this.drop(id);
    }
  }
  invalidate(id: string) {
    this.drop(id);
    if (this.alive) this.changed();
  }
  private drop(id: string) {
    const e = this.entries.get(id);
    if (!e) return;
    this.entries.delete(id);
    e.controller.abort();
    this.cachedBytes -= e.bytes;
    e.bytes = 0;
    e.texture?.destroy(true);
    e.texture = undefined;
    this.release(e);
  }
  private release(e: Entry) {
    const asset = e.asset;
    e.asset = undefined;
    try {
      asset?.release?.();
    } catch (error) {
      e.error = `素材释放失败: ${String(error)}`;
    }
  }
  clear() {
    this.queue = [];
    for (const id of this.entries.keys()) this.drop(id);
  }
  destroy() {
    this.alive = false;
    this.clear();
  }
  get bytes() {
    return this.cachedBytes;
  }
}
