import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("pixi.js", () => ({ Texture: { from: () => ({ destroy: vi.fn() }) } }));
vi.mock("../src/resources/media", () => ({
  mediaPreview: async () => ({
    canvas: { width: 20, height: 10 },
    metadata: { width: 200, height: 100, mime: "image/png" },
  }),
}));
import { Resources } from "../src/resources/resources";
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
afterEach(() => vi.useRealTimers());
describe("bounded cancellable resources", () => {
  it("releases late results exactly once after invalidation", async () => {
    let deliver!: (a: any) => void;
    const release = vi.fn();
    const resolve = vi.fn(() => new Promise<any>((r) => (deliver = r)));
    const r = new Resources(resolve, () => {});
    r.request("a");
    await settle();
    r.invalidate("a");
    deliver({ url: "blob:a", mime: "image/png", release });
    await settle();
    expect(release).toHaveBeenCalledTimes(1);
    expect(r.bytes).toBe(0);
    r.destroy();
    expect(release).toHaveBeenCalledTimes(1);
  });
  it("cancel frees a queue slot even if the resolver ignores AbortSignal", async () => {
    const ids: string[] = [];
    const r = new Resources(
      async (id) => {
        ids.push(id);
        if (id === "stuck") return new Promise(() => {});
        return { url: "blob:b", mime: "image/png" };
      },
      () => {},
      96000,
      () => {},
      { concurrency: 1 },
    );
    r.request("stuck");
    r.request("next");
    await settle();
    expect(ids).toEqual(["stuck"]);
    r.invalidate("stuck");
    await settle();
    expect(ids).toEqual(["stuck", "next"]);
    r.destroy();
  });
  it("times out a hung resolver and runs the next request", async () => {
    vi.useFakeTimers();
    const ids: string[] = [];
    const r = new Resources(
      async (id) => {
        ids.push(id);
        return new Promise(() => {});
      },
      () => {},
      96000,
      () => {},
      { concurrency: 1, timeoutMs: 50 },
    );
    r.request("a");
    r.request("b");
    await settle();
    await vi.advanceTimersByTimeAsync(55);
    expect(ids).toEqual(["a", "b"]);
    expect(r.get("a")?.error).toContain("超时");
    r.destroy();
    await settle();
  });
  it("maintains byte accounting, respects visible pins and permits retry", async () => {
    const release = vi.fn();
    const r = new Resources(
      async () => ({ url: "blob:a", mime: "image/png", release }),
      () => {},
      800,
      () => {},
      { maxEntries: 1 },
    );
    r.request("a");
    r.request("b");
    await settle();
    expect(r.bytes).toBe(1600);
    r.trim(new Set(["b"]));
    expect(r.bytes).toBe(800);
    expect(r.entries.has("a")).toBe(false);
    r.invalidate("b");
    expect(r.bytes).toBe(0);
    r.request("b");
    await settle();
    expect(r.bytes).toBe(800);
    r.destroy();
    await settle();
    expect(release).toHaveBeenCalledTimes(3);
  });
  it("rejects invalid concurrency and budgets", () => {
    expect(
      () =>
        new Resources(
          async () => ({ url: "", mime: "" }),
          () => {},
          -1,
        ),
    ).toThrow();
    expect(
      () =>
        new Resources(
          async () => ({ url: "", mime: "" }),
          () => {},
          1,
          () => {},
          { concurrency: 0.5 },
        ),
    ).toThrow();
  });
});

it("continues destruction when a host release callback throws", async () => {
  const release = vi.fn(() => {
    throw Error("host cleanup");
  });
  const r = new Resources(
    async () => ({ url: "blob:a", mime: "image/png", release }),
    () => {},
  );
  r.request("a");
  r.request("b");
  await settle();
  expect(() => r.destroy()).not.toThrow();
  expect(release).toHaveBeenCalledTimes(2);
  expect(r.entries.size).toBe(0);
  expect(r.bytes).toBe(0);
});
