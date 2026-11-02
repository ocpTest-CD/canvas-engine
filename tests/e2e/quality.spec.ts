import { test, expect } from "@playwright/test";
async function ready(page: any) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "文字", exact: true }),
  ).toBeEnabled();
}
test("spatial drawing excludes distant nodes/edges but retains crossing edges and drag previews", async ({
  page,
}) => {
  await ready(page);
  const value = await page.evaluate(async () => {
    const e = window.canvasEngine!;
    const nodes = Array.from({ length: 1000 }, (_, i) => ({
      id: `n${i}`,
      type: "text",
      title: "n",
      x: 10000 + i * 400,
      y: 10000,
      width: 100,
      height: 100,
    }));
    nodes[0] = { ...nodes[0], x: -1000, y: 100 };
    nodes[1] = { ...nodes[1], x: 2000, y: 100 };
    const edges = Array.from({ length: 999 }, (_, i) => ({
      id: `e${i}`,
      from: `n${i}`,
      to: `n${i + 1}`,
    }));
    e.loadScene({ version: 1, nodes, edges, camera: { x: 0, y: 0, zoom: 1 } });
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    const metrics = { ...e.metrics };
    const crossing = e.queryEdges(0, 140, 100, 20).map((x) => x.id);
    e.applyChanges([
      { kind: "put", node: { ...e.document.nodes.get("n0")!, y: 300 } },
    ]);
    e.document.undo();
    const restored = e.queryEdges(0, 140, 100, 20).map((x) => x.id);
    e.preview.set("n999", { ...e.document.nodes.get("n999")!, x: 200, y: 200 });
    e.requestRender();
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    const visible = e.metrics.visible;
    e.preview.clear();
    return { metrics, crossing, restored, visible };
  });
  expect(value.metrics.visible).toBe(0);
  expect(value.metrics.visibleEdges).toBe(1);
  expect(value.crossing).toContain("e0");
  expect(value.restored).toContain("e0");
  expect(value.visible).toBe(1);
});
test("listener exceptions do not interrupt commits and programmatic connections enforce policy", async ({
  page,
}) => {
  await ready(page);
  const result = await page.evaluate(() => {
    const e = window.canvasEngine!;
    let messages = 0;
    const stop = e.on("message", () => messages++),
      off = e.on("change", () => {
        throw Error("consumer");
      });
    const id = e.add("text");
    off();
    stop();
    const before = JSON.stringify(e.exportScene());
    e.options.canConnect = () => false;
    let rejected = false;
    try {
      e.applyChanges([
        { kind: "connect", edge: { id: "invalid", from: id, to: "welcome" } },
      ]);
    } catch {
      rejected = true;
    }
    return {
      exists: e.document.nodes.has(id),
      messages,
      rejected,
      unchanged: before === JSON.stringify(e.exportScene()),
    };
  });
  expect(result.exists).toBe(true);
  expect(result.messages).toBeGreaterThan(0);
  expect(result.rejected).toBe(true);
  expect(result.unchanged).toBe(true);
});
test("custom editor cleanup and bridge replay survive repeated use", async ({
  page,
}) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const modulePath = "/src/index.ts";
    const { createSceneBridge } = await import(modulePath);
    const e = window.canvasEngine!;
    let cleanup = 0;
    e.registerNodeType("owned", {
      label: "owned",
      color: 1,
      editor: () => ({
        element: document.createElement("textarea"),
        dispose: () => {
          cleanup++;
          throw Error("consumer cleanup");
        },
      }),
    });
    const id = e.add("owned");
    for (let i = 0; i < 20; i++) {
      e.edit(id);
      e.overlays.close();
    }
    const bridge = createSceneBridge(e, "test");
    const packet = {
      version: 1,
      sessionId: "test",
      requestId: "1",
      method: "applyChanges",
      payload: [
        { kind: "put", node: { ...e.document.nodes.get(id)!, text: "bridge" } },
      ],
    };
    const first = bridge.handle(packet);
    const rev = e.document.revision;
    bridge.handle(packet);
    const stable = rev === e.document.revision;
    bridge.dispose();
    return {
      cleanup,
      first: first.ok,
      stable,
      disposed: bridge.handle(packet).error?.code,
    };
  });
  expect(result).toEqual({
    cleanup: 20,
    first: true,
    stable: true,
    disposed: "DISPOSED",
  });
});
test("scene switching and destruction release host-owned media references", async ({
  page,
}) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const modulePath = "/src/index.ts";
    const { CanvasEngine } = await import(modulePath);
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:80px;width:600px;height:500px";
    document.body.append(host);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!)));
    let created = 0,
      released = 0;
    const e = await CanvasEngine.create(host, {
      resolveAsset: async () => {
        created++;
        const url = URL.createObjectURL(blob);
        return {
          url,
          mime: "image/png",
          release: () => {
            released++;
            URL.revokeObjectURL(url);
          },
        };
      },
    });
    for (let i = 0; i < 30; i++) {
      e.loadScene({
        version: 1,
        nodes: [
          {
            id: "image",
            type: "image",
            title: "image",
            x: 0,
            y: 0,
            width: 120,
            height: 120,
            assetId: `asset-${i}`,
          },
        ],
        edges: [],
        camera: { x: 0, y: 0, zoom: 1 },
      });
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
    }
    e.destroy();
    await new Promise((r) => setTimeout(r, 100));
    const remaining = host.children.length;
    host.remove();
    return { created, released, remaining };
  });
  expect(result.created).toBeGreaterThan(10);
  expect(result.released).toBe(result.created);
  expect(result.remaining).toBe(0);
});
test("two-finger touch zoom preserves document geometry", async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Native touch injection uses Chromium CDP; other browser paths have separate pointer coverage.",
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await ready(page);
  await page.evaluate(() =>
    window.canvasEngine!.loadScene({
      version: 1,
      nodes: [
        {
          id: "n",
          type: "text",
          title: "n",
          x: 800,
          y: 800,
          width: 100,
          height: 100,
        },
      ],
      edges: [],
      camera: { x: 0, y: 0, zoom: 1 },
    }),
  );
  const client = await context.newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 100, y: 450, id: 1 },
      { x: 220, y: 450, id: 2 },
    ],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: 50, y: 450, id: 1 },
      { x: 290, y: 450, id: 2 },
    ],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const value = await page.evaluate(() => ({
    zoom: window.canvasEngine!.camera.zoom,
    x: window.canvasEngine!.document.nodes.get("n")!.x,
    active: window.canvasEngine!.gestureActive,
  }));
  expect(value.zoom).toBeGreaterThan(1.5);
  expect(value.x).toBe(800);
  expect(value.active).toBe(false);
  await context.close();
});
