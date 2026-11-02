import "pixi.js/unsafe-eval";
import { CanvasEngine, type Node } from "../src";
import "./example.css";
export async function createExample(title: string) {
  document.querySelector("header strong")!.textContent = title;
  const blobs = new Map<string, Blob>();
  const engine = await CanvasEngine.create(document.querySelector("#canvas")!, {
    resolveAsset: async (id) => {
      const blob = blobs.get(id);
      if (!blob) throw Error("素材不存在");
      const url = URL.createObjectURL(blob);
      return { url, mime: blob.type, release: () => URL.revokeObjectURL(url) };
    },
    nodePanel: (node, element) => {
      const input = document.createElement("input");
      input.setAttribute("aria-label", "节点标题");
      input.value = node.title;
      const text = document.createElement("textarea");
      text.setAttribute("aria-label", "节点内容");
      text.value = node.text ?? "";
      const commit = () => {
        const current = engine.document.nodes.get(node.id);
        if (current)
          engine.applyChanges([
            {
              kind: "put",
              node: { ...current, title: input.value, text: text.value },
            },
          ]);
      };
      input.oninput = commit;
      text.oninput = commit;
      element.append(input, text);
    },
  });
  document
    .querySelector("[data-action=add]")
    ?.addEventListener("click", () => engine.add("text"));
  document
    .querySelector("[data-action=fit]")
    ?.addEventListener("click", () => engine.fitToContent());
  document
    .querySelector("[data-action=undo]")
    ?.addEventListener("click", () => engine.document.undo());
  window.addEventListener("pagehide", () => engine.destroy(), { once: true });
  const ready = () => {
    document.querySelectorAll<HTMLButtonElement>("button[data-action]")
      .forEach((button) => { button.disabled = false; });
  };
  return { engine, blobs, ready };
}
export const textNode = (
  id: string,
  x: number,
  y: number,
  text: string,
): Node => ({
  id,
  type: "text",
  title: id,
  x,
  y,
  width: 320,
  height: 180,
  text,
  sizeMode: "auto",
});
