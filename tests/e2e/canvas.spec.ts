import { test, expect } from "@playwright/test";
async function ready(page: any) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "文字", exact: true }),
  ).toBeEnabled();
}
test("real canvas edit, IME guard, drag, undo, zoom, save/reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    e.loadScene({
      version: 1,
      nodes: [
        {
          id: "a",
          type: "text",
          title: "编辑测试",
          text: "初始",
          x: 200,
          y: 200,
          width: 260,
          height: 220,
        },
      ],
      edges: [],
      camera: { x: 0, y: 0, zoom: 1 },
    });
  });
  await page.mouse.dblclick(300, 350);
  const text = page.getByRole("textbox", { name: "节点文本" });
  await expect(text).toBeVisible();
  await text.fill("中文输入，保留文本");
  await text.dispatchEvent("keydown", { key: "Backspace", isComposing: true });
  await expect(text).toHaveValue("中文输入，保留文本");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  expect(
    await page.evaluate(
      () => window.canvasEngine!.document.nodes.get("a")?.text,
    ),
  ).toBe("中文输入，保留文本");
  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(400, 350, { steps: 8 });
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.canvasEngine!.document.nodes.get("a")!.x),
  ).toBe(300);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect(
    await page.evaluate(() => window.canvasEngine!.document.nodes.get("a")!.x),
  ).toBe(200);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  expect(await page.evaluate(() => window.canvasEngine!.camera.zoom)).toBe(
    1.25,
  );
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "文字", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => window.canvasEngine!.document.nodes.get("a")!.text,
    ),
  ).toBe("中文输入，保留文本");
  await page.screenshot({ path: "benchmarks/light.png" });
  await page.getByRole("button", { name: "切换主题" }).click();
  await page.screenshot({ path: "benchmarks/dark.png" });
  expect(errors).toEqual([]);
});
test("connections, groups, copy/paste, idle and destroy", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    e.loadScene({
      version: 1,
      nodes: [
        {
          id: "a",
          type: "text",
          title: "a",
          x: 200,
          y: 180,
          width: 200,
          height: 160,
        },
        {
          id: "b",
          type: "tool",
          title: "b",
          x: 600,
          y: 180,
          width: 200,
          height: 160,
        },
      ],
      edges: [],
      camera: { x: 0, y: 0, zoom: 1 },
    });
  });
  await page.mouse.move(400, 332);
  await page.mouse.down();
  await page.mouse.move(610, 332, { steps: 6 });
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.canvasEngine!.document.edges.size),
  ).toBe(1);
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    e.selected = new Set(["a", "b"]);
    e.group();
    e.duplicate();
  });
  expect(
    await page.evaluate(() => window.canvasEngine!.document.nodes.size),
  ).toBe(4);
  expect(
    await page.evaluate(() => window.canvasEngine!.document.edges.size),
  ).toBe(2);
  await page.waitForTimeout(500);
  const frames = await page.evaluate(() => window.canvasEngine!.metrics.frames);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.canvasEngine!.metrics.frames)).toBe(
    frames,
  );
  await page.evaluate(() => window.canvasEngine!.destroy());
  await expect(page.locator(".canvas canvas")).toHaveCount(0);
});
test("portable project with image survives import and page reload", async ({
  page,
}) => {
  await ready(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出项目 ↗" }).click(),
  ]);
  const path = await download.path();
  await page
    .locator('input[type=file][accept="application/json,.json"]')
    .setInputFiles(path!);
  await expect(page.getByRole("status")).toContainText("项目已打开");
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "文字", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => window.canvasEngine!.resources.bytes))
    .toBeGreaterThan(0);
});
test("audio/video assets load, play, and persist through project export", async ({
  page,
}) => {
  await ready(page);
  await page
    .locator("input[type=file][multiple]")
    .setInputFiles([
      "tests/fixtures/sample.webm",
      "tests/fixtures/sample.wav",
    ]);
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    const video = [...e.document.nodes.values()].find(
      (n) => n.type === "video",
    )!;
    e.focusNode(video.id);
    e.edit(video.id);
  });
  const video = page.locator(".engine-overlay video");
  await expect(video).toBeVisible();
  await video.evaluate(async (el) => {
    await (el as HTMLVideoElement).play();
  });
  await expect
    .poll(() => video.evaluate((el) => (el as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    e.edit([...e.document.nodes.values()].find((n) => n.type === "audio")!.id);
  });
  await expect(page.locator(".engine-overlay audio")).toBeVisible();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "文字", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    const n = [...e.document.nodes.values()].find((n) => n.type === "video")!;
    e.focusNode(n.id);
    e.edit(n.id);
  });
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((el) => (el as HTMLVideoElement).readyState),
    )
    .toBeGreaterThan(0);
});

test("resize, cancellation, disconnect and invalid import preserve scene", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() =>
    window.canvasEngine!.loadScene({
      version: 1,
      nodes: [
        {
          id: "a",
          type: "text",
          title: "a",
          x: 200,
          y: 180,
          width: 200,
          height: 160,
        },
        {
          id: "b",
          type: "text",
          title: "b",
          x: 600,
          y: 180,
          width: 200,
          height: 160,
        },
      ],
      edges: [{ id: "e", from: "a", to: "b" }],
      camera: { x: 0, y: 0, zoom: 1 },
    }),
  );
  await page.mouse.click(280, 300);
  await page.mouse.move(395, 407);
  await page.mouse.down();
  await page.mouse.move(450, 450, { steps: 5 });
  await page.mouse.up();
  expect(
    await page.evaluate(
      () => window.canvasEngine!.document.nodes.get("a")!.width,
    ),
  ).toBe(255);
  await page.mouse.move(280, 300);
  await page.mouse.down();
  await page.mouse.move(350, 330);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.canvasEngine!.document.nodes.get("a")!.x),
  ).toBe(200);
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    e.selected.clear();
    e.selectedEdge = "e";
    e.removeSelected();
  });
  expect(
    await page.evaluate(() => window.canvasEngine!.document.edges.size),
  ).toBe(0);
  await page.evaluate(() => window.canvasEngine!.document.undo());
  expect(
    await page.evaluate(() => window.canvasEngine!.document.edges.size),
  ).toBe(1);
  expect(
    await page.evaluate(() => {
      try {
        window.canvasEngine!.loadScene({ version: 99 });
        return false;
      } catch {
        return window.canvasEngine!.document.nodes.size === 2;
      }
    }),
  ).toBe(true);
});

test("100 mixed nodes, plugin activation and repeated independent engine disposal", async ({
  page,
}) => {
  await ready(page);
  await page
    .locator("input[type=file][multiple]")
    .setInputFiles([
      "tests/fixtures/sample.webm",
      "tests/fixtures/sample.wav",
    ]);
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    const originals = [...e.document.nodes.values()];
    const nodes = Array.from({ length: 100 }, (_, i) => ({
      ...originals[i % originals.length],
      id: `mix${i}`,
      x: (i % 10) * 300,
      y: Math.floor(i / 10) * 250,
    }));
    e.loadScene({
      version: 1,
      nodes,
      edges: [],
      camera: { x: 0, y: 0, zoom: 0.8 },
    });
    e.registerNodeType("custom", {
      label: "自定义",
      color: 0xffcc55,
      ports: { input: false, output: false },
      onActivate: (n) => {
        e.updateStatus(n.id, "activated");
        return true;
      },
    });
    const id = e.add("custom");
    e.edit(id);
  });
  expect(
    await page.evaluate(
      () =>
        [...window.canvasEngine!.document.nodes.values()].find(
          (n) => n.type === "custom",
        )!.status,
    ),
  ).toBe("activated");
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    const n = [...e.document.nodes.values()].find((n) => n.type === "video")!;
    e.focusNode(n.id);
    e.edit(n.id);
  });
  await expect(page.locator("video")).toBeVisible();
  await page.locator("video").evaluate(async (el) => {
    await (el as HTMLVideoElement).play();
  });
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    for (let i = 0; i < 20; i++) e.updateStatus("mix0", String(i));
    e.zoom(0.8);
  });
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((el) => (el as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThan(0);
  const result = await page.evaluate(async () => {
    const Engine = window.canvasEngine!.constructor as any;
    for (let i = 0; i < 5; i++) {
      const host = document.createElement("div");
      Object.assign(host.style, {
        position: "absolute",
        width: "400px",
        height: "300px",
      });
      document.body.append(host);
      const e = await Engine.create(host);
      e.add("text");
      await new Promise(requestAnimationFrame);
      e.destroy();
      if (host.querySelector("canvas") || e.resources.entries.size)
        throw Error("资源未释放");
      host.remove();
    }
    return true;
  });
  expect(result).toBe(true);
});
