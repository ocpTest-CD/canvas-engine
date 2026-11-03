import { test, expect } from "@playwright/test";
test("read-only UI blocks mutation, allows remote patch and runtime survives undo without serialization", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "文字", exact: true }),
  ).toBeEnabled();
  const result = await page.evaluate(() => {
    const e = window.canvasEngine!;
    e.loadScene({
      version: 1,
      nodes: [
        {
          id: "readonly",
          type: "text",
          title: "read only",
          text: "before",
          x: 0,
          y: 0,
          width: 300,
          height: 180,
        },
      ],
      edges: [],
    });
    e.setReadOnly(true);
    e.applyChanges(
      [{ kind: "patch", id: "readonly", set: { text: "remote" } }],
      { origin: "remote" },
    );
    e.setRuntimeState("readonly", { status: "running", progress: 0.5 });
    e.selected = new Set(["readonly"]);
    e.fitToContent();
    e.notify();
    return e.exportScene();
  });
  expect(result.nodes[0].text).toBe("remote");
  expect(result.nodes[0].status).toBeUndefined();
  await page.locator(".engine-host").focus();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Meta+d");
  const state = await page.evaluate(() => {
    const e = window.canvasEngine!;
    return {
      scene: e.exportScene(),
      runtime: e.document.runtime.get("readonly"),
    };
  });
  expect(state.scene.nodes).toHaveLength(1);
  expect(state.scene.nodes[0].x).toBe(0);
  expect(state.runtime?.progress).toBe(0.5);
  await page.evaluate(() => {
    const e = window.canvasEngine!;
    e.setReadOnly(false);
    e.applyChanges([{ kind: "patch", id: "readonly", set: { text: "local" } }]);
    e.updateStatus("readonly", "done");
    e.document.undo();
  });
  expect(
    await page.evaluate(
      () => window.canvasEngine!.document.nodes.get("readonly")?.text,
    ),
  ).toBe("remote");
  expect(
    await page.evaluate(
      () => window.canvasEngine!.document.runtime.get("readonly")?.status,
    ),
  ).toBe("done");
});
test("read-only media remains previewable without mounting an editor", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "文字", exact: true }),
  ).toBeEnabled();
  const before = await page.evaluate(() => {
    const e = window.canvasEngine!;
    const image = [...e.document.nodes.values()].find(
      (n) => n.type === "image",
    )!;
    e.setReadOnly(true);
    const scene = e.exportScene();
    e.edit(image.id);
    return scene.nodes;
  });
  await expect(page.locator(".engine-overlay img")).toBeVisible();
  await expect(page.locator(".engine-overlay textarea")).toHaveCount(0);
  expect(
    await page.evaluate(() => window.canvasEngine!.exportScene().nodes),
  ).toEqual(before);
});
test("selection snapshots follow deletion; duplicate notifications are suppressed and overlays stay transient", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "文字", exact: true }),
  ).toBeEnabled();
  const state = await page.evaluate(() => {
    const e = window.canvasEngine!;
    const n = {
      type: "text",
      title: "node",
      x: 10,
      y: 10,
      width: 100,
      height: 100,
    };
    e.loadScene({
      version: 1,
      nodes: [
        { ...n, id: "a" },
        { ...n, id: "b", x: 200 },
      ],
      edges: [],
    });
    let events = 0;
    const off = e.on("selectionChange", () => events++);
    e.setSelection(["a", "b", "unknown"]);
    const before = e.exportScene();
    const snap = e.getSelection();
    e.notify();
    e.notify();
    const stable = events;
    e.setExecutionPreview({ execute: ["a"], cancel: ["b"] });
    e.setRuntimeState("a", { runId: "r", status: "cancelling" });
    const untouched =
      JSON.stringify(before) === JSON.stringify(e.exportScene());
    e.applyChanges([{ kind: "remove", id: "b" }]);
    const result = {
      stable,
      events,
      selected: e.getSelection(),
      old: snap,
      preview: e.getExecutionPreview(),
      untouched,
    };
    off();
    return result;
  });
  expect(state.stable).toBe(1);
  expect(state.events).toBe(2);
  expect(state.selected.nodeIds).toEqual(["a"]);
  expect(state.old.nodeIds).toEqual(["a", "b"]);
  expect(state.preview.cancel).toEqual([]);
  expect(state.untouched).toBe(true);
});
