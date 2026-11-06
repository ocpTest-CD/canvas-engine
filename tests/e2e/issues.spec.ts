import { test, expect } from "@playwright/test";
test("node issues remain viewport-only, keyboard accessible and transient", async ({
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
      nodes: ["visible", "outside"].map((id, i) => ({
        id,
        type: "text",
        title: id,
        text: "retained",
        x: 150 + i * 10000,
        y: 150,
        width: 300,
        height: 180,
      })),
      edges: [],
      camera: { x: 0, y: 0, zoom: 1 },
    });
    e.options.onNodeIssue = (n, issue) => {
      e.host.dataset.opened = n.id + ":" + issue.id;
    };
    for (const id of ["visible", "outside"])
      e.setRuntimeState(id, {
        active: false,
        issue: {
          id: "error-1",
          summary: "参考图尺寸不符合要求，需要调整输入尺寸后再次执行".repeat(5),
          detail: "full details",
          severity: "error",
        },
      });
  });
  const root = page.locator(".engine-node-issue");
  await expect(root).toHaveCount(1);
  const button = root.locator("button");
  await expect(button).toBeVisible();
  expect(await button.evaluate((b) => b.scrollWidth > b.clientWidth)).toBe(
    true,
  );
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".engine-host")).toHaveAttribute(
    "data-opened",
    "visible:error-1",
  );
  expect(
    await page.evaluate(() =>
      JSON.stringify(window.canvasEngine!.exportScene()),
    ),
  ).not.toContain("error-1");
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    e.camera.zoom = 0.25;
    e.notify();
  });
  await expect(button).toHaveText("!");
  await page.evaluate(() =>
    window.canvasEngine!.setRuntimeState("visible", {
      active: true,
      issue: { id: "old", summary: "old" },
    }),
  );
  await expect(root).toHaveCount(0);
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    e.setRuntimeState("visible", { active: false, error: "legacy failure" });
    e.camera.zoom = 1;
    e.notify();
  });
  await expect(button).toContainText("legacy failure");
  await page.evaluate(() =>
    window.canvasEngine!.loadScene({ version: 1, nodes: [], edges: [] }),
  );
  await expect(root).toHaveCount(0);
  await page.evaluate(() => window.canvasEngine!.destroy());
  await expect(page.locator(".engine-node-issues")).toHaveCount(0);
});
