import { test, expect } from "@playwright/test";
test("active nodes cover their full bounds, block edits and preserve independent editing", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "文字", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    e.loadScene({
      version: 1,
      nodes: [
        {
          id: "a",
          type: "text",
          title: "Locked",
          text: "before",
          x: 150,
          y: 120,
          width: 300,
          height: 220,
        },
        {
          id: "b",
          type: "text",
          title: "Free",
          text: "free",
          x: 600,
          y: 120,
          width: 200,
          height: 150,
        },
      ],
      edges: [],
      camera: { x: 0, y: 0, zoom: 1 },
    });
    e.options.nodePrimaryAction = (n) => ({
      id: "cancel",
      label: "停止",
      run: () => e.setRuntimeState(n.id, { active: false }),
    });
    e.selected = new Set(["a"]);
    e.setRuntimeState("a", { active: true, phase: "生成中", progress: 0.42 });
  });
  const mask = page.locator(
    '.engine-node-execution[data-node-id="a"] .engine-node-progress',
  );
  await expect(mask).toHaveAttribute("aria-valuenow", "42");
  const root = await page
      .locator('.engine-node-execution[data-node-id="a"]')
      .boundingBox(),
    bounds = await mask.boundingBox();
  expect(bounds).toEqual(root);
  await expect(
    page.getByRole("button", { name: "重命名：Locked" }),
  ).toHaveCount(0);
  await mask.dblclick();
  await expect(page.getByLabel("节点文本", { exact: true })).toHaveCount(0);
  await page.getByRole("application").focus();
  for (const key of ["Enter", "F2", "ArrowRight", "Delete", "Meta+z"])
    await page.keyboard.press(key);
  expect(
    await page.evaluate(
      () => window.canvasEngine!.document.nodes.get("a")?.text,
    ),
  ).toBe("before");
  expect(
    await page.evaluate(() => window.canvasEngine!.document.nodes.get("a")?.x),
  ).toBe(150);
  await page.evaluate(() => window.canvasEngine!.edit("b"));
  await expect(page.getByLabel("节点文本", { exact: true })).toBeVisible();
  await expect(mask).toBeVisible();
  await page.getByLabel("节点文本", { exact: true }).fill("free editing");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    e.camera.zoom = 0.25;
    e.notify();
  });
  await expect(mask).toBeVisible();
  await expect.poll(async () => (await mask.boundingBox())?.width).toBe(75);
  await page.getByRole("button", { name: "停止：Locked", exact: true }).click();
  await expect(mask).toBeHidden();
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    e.camera.zoom = 1;
    e.notify();
  });
  await expect(
    page.getByRole("button", { name: "重命名：Locked" }),
  ).toBeVisible();
});
