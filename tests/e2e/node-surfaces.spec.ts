import { test, expect } from "@playwright/test";
async function fixture(page: any) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "文字", exact: true }),
  ).toBeEnabled();
  await page.waitForFunction(() => !!window.canvasEngine);
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    e.options.nodePanel = (node, element) => {
      const label = document.createElement("label");
      label.textContent = "本地参数";
      const input = document.createElement("textarea");
      input.setAttribute("aria-label", "浮层参数");
      input.value = node.text ?? "";
      input.oninput = () => {
        const current = e.document.nodes.get(node.id);
        if (current)
          e.applyChanges([
            { kind: "put", node: { ...current, text: input.value } },
          ]);
      };
      label.append(input);
      element.append(label);
    };
    e.loadScene({
      version: 1,
      nodes: [
        {
          id: "a",
          type: "text",
          title: "A",
          text: "中文提示词",
          x: 220,
          y: 140,
          width: 320,
          height: 180,
        },
        {
          id: "b",
          type: "text",
          title: "B",
          text: "另一个节点",
          x: 720,
          y: 140,
          width: 320,
          height: 180,
        },
      ],
      edges: [{ id: "edge", from: "a", to: "b" }],
      camera: { x: 0, y: 0, zoom: 1 },
    });
  });
}
async function point(page: any, id = "a") {
  return page.evaluate((id: string) => {
    const e = window.canvasEngine!,
      n = e.document.nodes.get(id)!,
      r = e.host.getBoundingClientRect();
    return {
      x: r.left + (n.x - e.camera.x) * e.camera.zoom,
      y: r.top + (n.y - e.camera.y) * e.camera.zoom,
      w: n.width * e.camera.zoom,
      h: n.height * e.camera.zoom,
    };
  }, id);
}
test("hover toolbar, bottom panel, focus and pointer isolation", async ({
  page,
}) => {
  await fixture(page);
  const p = await point(page);
  await page.mouse.move(p.x + 100, p.y + 80);
  const toolbar = page.getByRole("toolbar", { name: "节点操作" });
  await expect(toolbar).toBeVisible();
  expect((await toolbar.boundingBox())!.y).toBeLessThan(p.y);
  await toolbar.getByRole("button", { name: "参数", exact: true }).hover();
  await expect(toolbar).toBeVisible();
  await page.mouse.click(p.x + 100, p.y + 80);
  const panel = page.getByRole("region", { name: "节点参数" });
  await expect(panel).toBeVisible();
  const rect = (await panel.boundingBox())!;
  expect(rect.y).toBeGreaterThanOrEqual(p.y + p.h);
  expect(rect.width).toBeGreaterThan(300);
  const before = await page.evaluate(() => window.canvasEngine!.exportScene());
  await page.getByLabel("浮层参数").fill("保留中文 空格");
  await page
    .getByLabel("浮层参数")
    .dispatchEvent("keydown", { key: "Backspace", isComposing: true });
  await page.getByLabel("浮层参数").press("Space");
  await panel.hover();
  await page.mouse.wheel(0, 120);
  const after = await page.evaluate(() => window.canvasEngine!.exportScene());
  expect(after.camera).toEqual(before.camera);
  expect(after.nodes.map((n) => [n.x, n.y, n.width, n.height])).toEqual(
    before.nodes.map((n) => [n.x, n.y, n.width, n.height]),
  );
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await page.keyboard.press("F2");
  await expect(page.getByLabel("浮层参数")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await page.mouse.move(p.x + 100, p.y + 80);
  await page.mouse.down();
  await page.mouse.move(p.x + 180, p.y + 110, { steps: 6 });
  await page.mouse.up();
  await expect(panel).toHaveCount(0);
  expect(
    await page.evaluate(() => window.canvasEngine!.document.nodes.get("a")!.x),
  ).toBe(300);
});
test("screen-sized parameter panel follows zoom, preserves scene, cleans up", async ({
  page,
}) => {
  await fixture(page);
  let p = await point(page);
  await page.mouse.click(p.x + 100, p.y + 80);
  const panel = page.getByRole("region", { name: "节点参数" });
  await expect(panel).toBeVisible();
  const width = (await panel.boundingBox())!.width;
  await page.evaluate(() => window.canvasEngine!.zoom(0.6));
  await expect
    .poll(async () => Math.round((await panel.boundingBox())!.width))
    .toBe(Math.round(width));
  await expect
    .poll(async () => {
      const p = await point(page);
      return Math.abs((await panel.boundingBox())!.y - (p.y + p.h + 12));
    })
    .toBeLessThan(1);
  await page.evaluate(() => window.canvasEngine!.removeSelected());
  await expect(panel).toHaveCount(0);
  await page.evaluate(() => window.canvasEngine!.destroy());
  await expect(page.locator(".engine-floating")).toHaveCount(0);
});
test("framework-free and React examples use public extension points", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const name of ["minimal", "custom-node", "media"]) {
    await page.goto(`/examples/${name}/index.html`);
    await expect(page.locator("#canvas canvas")).toBeVisible();
    await page.getByRole("button", { name: "添加文字" }).click();
    await expect(page.getByRole("region", { name: "节点参数" })).toBeVisible();
  }
  await page.goto("/examples/react/index.html");
  await expect(page.getByLabel("React 节点内容")).toBeVisible();
  await page
    .getByLabel("React 节点内容")
    .fill("React 通过公开适配入口编辑内容");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "节点参数" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("portrait media adapts, manual resize survives reload, delayed delete stays deleted", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(async () => {
    const e = window.canvasEngine!;
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1600;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#a2c6ad";
    context.fillRect(0, 0, 900, 1600);
    const data = canvas.toDataURL();
    // Public creation and asset resolver; delayed resolution models an asynchronous asset store.
    const modulePath = "/src/index.ts";
    const { CanvasEngine } = await import(modulePath);
    const host = e.host;
    e.destroy();
    const next = await CanvasEngine.create(host, {
      resolveAsset: async () => {
        await new Promise((r) => setTimeout(r, 100));
        return { url: data, mime: "image/png" };
      },
    });
    window.canvasEngine = next;
    next.loadScene({
      version: 1,
      nodes: [
        {
          id: "portrait",
          type: "image",
          title: "9:16",
          assetId: "portrait",
          x: 200,
          y: 140,
          width: 320,
          height: 220,
          sizeMode: "auto",
        },
      ],
      edges: [],
      camera: { x: 0, y: 0, zoom: 1 },
    });
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => window.canvasEngine!.document.nodes.get("portrait")!.height,
      ),
    )
    .toBe(400);
  expect(
    await page.evaluate(
      () => window.canvasEngine!.document.nodes.get("portrait")!.width,
    ),
  ).toBe(225);
  const p = await point(page, "portrait");
  await page.mouse.click(p.x + 80, p.y + 80);
  await page.mouse.move(p.x + p.w - 3, p.y + p.h - 3);
  await page.mouse.down();
  await page.mouse.move(p.x + p.w + 50, p.y + p.h + 50, { steps: 5 });
  await page.mouse.up();
  const saved = await page.evaluate(() => window.canvasEngine!.exportScene());
  expect(saved.nodes[0].sizeMode).toBe("manual");
  expect(saved.nodes[0].width / saved.nodes[0].height).toBeCloseTo(9 / 16);
  await page.evaluate((s) => window.canvasEngine!.loadScene(s), saved);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.canvasEngine!.resources.get("portrait")?.pending,
      ),
    )
    .toBe(false);
  expect(
    await page.evaluate(
      () => window.canvasEngine!.document.nodes.get("portrait")!.width,
    ),
  ).toBe(saved.nodes[0].width);
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    e.loadScene({
      ...e.exportScene(),
      nodes: [
        {
          ...e.document.nodes.get("portrait")!,
          id: "late",
          assetId: "late",
          sizeMode: "auto",
        },
      ],
    });
  });
  await page.evaluate(() =>
    window.canvasEngine!.applyChanges([{ kind: "remove", id: "late" }]),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => window.canvasEngine!.resources.get("late")?.pending ?? false,
      ),
    )
    .toBe(false);
  expect(
    await page.evaluate(() => window.canvasEngine!.document.nodes.size),
  ).toBe(0);
});
