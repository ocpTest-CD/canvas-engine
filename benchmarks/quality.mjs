import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
const hash = createHash("sha256");
async function fingerprint(dir) {
  for (const item of (await readdir(dir, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) await fingerprint(file);
    else if (/\.(ts|tsx|css)$/.test(file)) {
      hash.update(file);
      hash.update(await readFile(file));
    }
  }
}
await fingerprint("src");
const { Document } = await import("../dist/core.js");
const percentile = (values, p) =>
  values.slice().sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
function transactions(DocumentClass) {
  return [1000, 10000].map((count) => {
    const d = new DocumentClass();
    d.load({
      version: 1,
      nodes: Array.from({ length: count }, (_, i) => ({
        id: `n${i}`,
        type: "text",
        title: "node",
        x: i * 100,
        y: 0,
        width: 100,
        height: 100,
      })),
      edges: [],
    });
    const samples = [];
    for (let i = 0; i < 110; i++) {
      const start = performance.now();
      d.apply([{ kind: "put", node: { ...d.nodes.get("n0"), x: i } }]);
      if (i >= 10) samples.push(performance.now() - start);
    }
    return {
      count,
      samples: samples.length,
      p50: percentile(samples, 0.5),
      p95: percentile(samples, 0.95),
      p99: percentile(samples, 0.99),
    };
  });
}
const cpu = transactions(Document);
let baseline;
if (process.env.CANVAS_BASELINE_CORE) {
  const old = await import(
    pathToFileURL(path.resolve(process.env.CANVAS_BASELINE_CORE)).href
  );
  baseline = transactions(old.Document);
}
const browser = await chromium.launch({
  headless: process.env.CANVAS_HEADED !== "1",
  channel: process.env.CANVAS_CHANNEL || undefined,
  args:
    process.env.CANVAS_METAL === "1"
      ? ["--use-angle=metal", "--enable-gpu"]
      : [],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });
  await page.goto(process.env.CANVAS_URL ?? "http://127.0.0.1:4337");
  await page
    .getByRole("button", { name: "文字", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () => window.canvasEngine?.document.nodes.size > 0,
  );
  const gpu = await page.evaluate(() => {
    const renderer = window.canvasEngine.renderer.app.renderer;
    const gl = renderer.gl;
    const extension = gl?.getExtension("WEBGL_debug_renderer_info");
    return extension
      ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      : "unavailable";
  });
  const frameSample = async () =>
    page.evaluate(async () => {
      const e = window.canvasEngine;
      const intervals = [],
        draws = [];
      let previous;
      for (let i = 0; i < 150; i++) {
        await new Promise((resolve) =>
          requestAnimationFrame((t) => {
            if (previous !== undefined && i > 10) intervals.push(t - previous);
            previous = t;
            e.camera.x += 2;
            e.requestRender();
            draws.push(e.metrics.drawMs);
            resolve();
          }),
        );
      }
      const p = (a, n) =>
        a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) * n)];
      return {
        frameMs: {
          p50: p(intervals, 0.5),
          p95: p(intervals, 0.95),
          p99: p(intervals, 0.99),
        },
        drawMs: { p50: p(draws, 0.5), p95: p(draws, 0.95) },
        visible: e.metrics.visible,
        visibleEdges: e.metrics.visibleEdges,
        textureBytes: e.metrics.textureBytes,
      };
    });
  const scenes = [];
  for (const count of [100, 1000, 10000]) {
    await page.evaluate((count) => {
      const e = window.canvasEngine;
      const nodes = Array.from({ length: count }, (_, i) => ({
        id: `n${i}`,
        type: "text",
        title: `Node ${i}`,
        text: "quality benchmark",
        x: (i % 100) * 300,
        y: Math.floor(i / 100) * 240,
        width: 250,
        height: 190,
      }));
      const edges = Array.from({ length: count - 1 }, (_, i) => ({
        id: `e${i}`,
        from: `n${i}`,
        to: `n${i + 1}`,
      }));
      e.loadScene({
        version: 1,
        nodes,
        edges,
        camera: { x: 0, y: 0, zoom: 0.8 },
      });
    }, count);
    scenes.push({ count, edges: count - 1, ...(await frameSample()) });
  }
  // Import actual synthetic PNG/video bytes through the same file path used by consumers.
  await page.evaluate(() =>
    window.canvasEngine.loadScene({
      version: 1,
      nodes: [],
      edges: [],
      camera: { x: 0, y: 0, zoom: 1 },
    }),
  );
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 800;
    const g = c.getContext("2d");
    g.fillStyle = "#80bba5";
    g.fillRect(0, 0, c.width, c.height);
    return c.toDataURL("image/png").split(",")[1];
  });
  const video = await readFile(
    new URL("../tests/fixtures/sample.webm", import.meta.url),
  );
  await page.locator("input[type=file][multiple]").setInputFiles([
    ...Array.from({ length: 40 }, (_, i) => ({
      name: `image-${i}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      name: `video-${i}.webm`,
      mimeType: "video/webm",
      buffer: video,
    })),
  ]);
  await page.waitForFunction(
    () => window.canvasEngine.document.nodes.size === 50,
  );
  await page.evaluate(() => {
    const e = window.canvasEngine;
    const changes = [...e.document.nodes.values()].map((n, i) => ({
      kind: "put",
      node: {
        ...n,
        x: (i % 10) * 300,
        y: Math.floor(i / 10) * 250,
        width: 240,
        height: 180,
        sizeMode: "manual",
      },
    }));
    e.applyChanges(changes);
    e.camera = { x: 0, y: 0, zoom: 0.8 };
    e.notify();
  });
  await page.waitForFunction(() => window.canvasEngine.resources.bytes > 0);
  const mixed = {
    images: 40,
    videos: 10,
    playback: "poster frames; not concurrent playback",
    ...(await frameSample()),
  };
  const idle = await page.evaluate(async () => {
    const e = window.canvasEngine;
    await new Promise((r) => setTimeout(r, 500));
    const frames = e.metrics.frames;
    await new Promise((r) => setTimeout(r, 500));
    return e.metrics.frames - frames;
  });
  const report = {
    timestamp: new Date().toISOString(),
    version: JSON.parse(await readFile("package.json", "utf8")).version,
    sourceHash: hash.digest("hex"),
    scriptHash: createHash("sha256")
      .update(await readFile(new URL(import.meta.url)))
      .digest("hex"),
    baseCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty: !!execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).trim(),
    environment: {
      cpu: os.cpus()[0].model,
      memoryGiB: os.totalmem() / 1024 ** 3,
      os: os.release(),
      platform: os.platform(),
      arch: os.arch(),
      browser: browser.version(),
      gpu,
      viewport: { width: 1440, height: 960, dpr: 1 },
      headless: process.env.CANVAS_HEADED !== "1",
    },
    cpu,
    baseline,
    scenes,
    mixed,
    idleFrames: idle,
    gates: {
      tenThousandSingleEditP95Under5ms: cpu[1].p95 < 5,
      mixedFrameP95Under20ms: mixed.frameMs.p95 < 20,
      allDrawP95Under8ms: [...scenes, mixed].every((s) => s.drawMs.p95 < 8),
      idleZero: idle === 0,
    },
    limitations: [
      "Synthetic media, not a user production workload",
      "Frame intervals include scheduler; not physical input latency",
      "textureBytes is thumbnail accounting, not process/GPU memory",
      "No hour-scale soak or mobile native hardware acceptance",
    ],
  };
  await mkdir("benchmarks/results", { recursive: true });
  const file = `benchmarks/results/quality-${Date.now()}.json`;
  await writeFile(file, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ file, ...report }, null, 2));
} finally {
  await browser.close();
}
