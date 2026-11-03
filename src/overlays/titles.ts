import type { Camera, Node } from "../core/types.js";
import { toScreen } from "../scene/geometry.js";

/** Viewport-only hit targets over rendered titles; one transient editor, no scene DOM. */
export class NodeTitles {
  private layer = document.createElement("div");
  private targets = new Map<string, HTMLButtonElement>();
  private editing?: { id: string; original: string; input: HTMLInputElement };
  constructor(
    private host: HTMLElement,
    private commit: (id: string, title: string, original: string) => void,
  ) {
    this.layer.className = "engine-node-titles";
    for (const name of ["pointerdown", "dblclick", "wheel", "keydown"])
      this.layer.addEventListener(name, (event) => event.stopPropagation());
    host.append(this.layer);
  }
  open(id: string, title: string) {
    const target = this.targets.get(id);
    if (!target) return;
    this.close(true);
    const input = document.createElement("input");
    input.className = "engine-title-input";
    input.value = title;
    input.maxLength = 200;
    input.setAttribute("aria-label", "节点名称");
    input.style.cssText = target.style.cssText;
    input.style.width = `${Math.max(120, parseFloat(target.style.width))}px`;
    input.style.fontSize = `${Math.max(12, parseFloat(target.style.fontSize))}px`;
    input.style.height = `${Math.max(26, parseFloat(target.style.height))}px`;
    this.editing = { id, original: title, input };
    input.addEventListener("blur", () => this.close(true));
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        this.close(event.key === "Enter");
        this.host.focus({ preventScroll: true });
      }
    });
    this.layer.append(input);
    input.focus({ preventScroll: true });
    input.select();
  }
  close(save: boolean) {
    const edit = this.editing;
    if (!edit) return;
    this.editing = undefined;
    edit.input.remove();
    const title = edit.input.value.trim();
    if (save && title && title !== edit.original)
      this.commit(edit.id, title, edit.original);
  }
  lock(id: string) {
    if (this.editing?.id === id) this.close(false);
    this.targets.get(id)?.remove();
    this.targets.delete(id);
  }
  update(nodes: Node[], camera: Camera, hidden: boolean) {
    const keep = new Set<string>();
    if (!hidden && camera.zoom > 0.32)
      for (const node of nodes) {
        keep.add(node.id);
        let button = this.targets.get(node.id);
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.className = "engine-title-target";
          button.dataset.nodeId = node.id;
          this.targets.set(node.id, button);
          this.layer.append(button);
        }
        const p = toScreen(node, camera);
        Object.assign(button.style, {
          left: `${p.x}px`,
          top: `${p.y - 24 * camera.zoom}px`,
          width: `${Math.max(24, node.width * camera.zoom - 42)}px`,
          height: `${Math.max(16, 20 * camera.zoom)}px`,
          fontSize: `${12 * camera.zoom}px`,
        });
        button.setAttribute("aria-label", `重命名：${node.title}`);
        button.title = "点击修改节点名称";
        button.onclick = () => this.open(node.id, node.title);
        if (this.editing?.id === node.id) {
          if (this.editing.original !== node.title) this.close(false);
          else
            Object.assign(this.editing.input.style, {
              left: button.style.left,
              top: button.style.top,
              width: `${Math.max(120, parseFloat(button.style.width))}px`,
            });
        }
      }
    if (this.editing && !keep.has(this.editing.id)) this.close(false);
    for (const [id, target] of this.targets)
      if (!keep.has(id)) {
        target.remove();
        this.targets.delete(id);
      }
  }
  destroy() {
    this.close(false);
    this.targets.clear();
    this.layer.remove();
  }
}
