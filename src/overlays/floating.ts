import type { Camera, Node } from "../core/types";
import type { NodeAction } from "../nodes/definition";
import { toScreen } from "../scene/geometry";
/** Screen-space chrome. Never contributes to document bounds or spatial queries. */
export class Floating {
  readonly layer = document.createElement("div");
  private toolbar = document.createElement("div");
  private signature = "";
  private toolbarNode?: Node;
  private panel?: {
    id: string;
    element: HTMLElement;
    observer: ResizeObserver;
  };
  private reveal = false;
  private abort = new AbortController();
  constructor(
    private host: HTMLElement,
    private changed: () => void,
    private dismiss: () => void,
    private report: (error: unknown) => void,
  ) {
    this.layer.className = "engine-floating";
    this.toolbar.className = "node-toolbar";
    this.toolbar.setAttribute("role", "toolbar");
    this.toolbar.setAttribute("aria-label", "节点操作");
    this.toolbar.hidden = true;
    this.layer.append(this.toolbar);
    host.append(this.layer);
    const signal = this.abort.signal;
    for (const name of ["pointerdown", "dblclick", "wheel"])
      this.layer.addEventListener(name, (event) => event.stopPropagation(), {
        signal,
      });
    this.layer.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && !event.isComposing) {
          event.stopPropagation();
          this.dismiss();
          this.host.focus();
        } else if (
          !(event.metaKey || event.ctrlKey) ||
          event.key.toLowerCase() !== "s"
        )
          event.stopPropagation();
      },
      { signal },
    );
  }
  get interacting() {
    return (
      this.layer.matches(":hover") ||
      this.layer.contains(document.activeElement)
    );
  }
  mountPanel(id: string, element: HTMLElement) {
    this.unmountPanel();
    element.classList.add("node-panel");
    element.hidden = true;
    element.dataset.nodeId = id;
    element.setAttribute("role", "region");
    element.setAttribute("aria-label", "节点参数");
    this.layer.append(element);
    const observer = new ResizeObserver(this.changed);
    observer.observe(element);
    this.panel = { id, element, observer };
    this.reveal = true;
    this.changed();
    return () => {
      if (this.panel?.element === element) this.unmountPanel();
    };
  }
  private unmountPanel() {
    this.panel?.observer.disconnect();
    this.panel?.element.remove();
    this.panel = undefined;
  }
  focusControls() {
    const root = this.panel?.element ?? this.toolbar;
    root
      .querySelector<HTMLElement>("input, textarea, select, button")
      ?.focus({ preventScroll: true });
  }
  requestReveal() {
    this.reveal = true;
    this.changed();
  }
  update(
    node: Node | undefined,
    actions: NodeAction[],
    camera: Camera,
    panelNode?: Node,
    hidden = false,
  ) {
    this.toolbarNode = node;
    this.toolbar.hidden = !node || hidden;
    if (node && !hidden) {
      const signature = JSON.stringify([
        node.id,
        actions.map((a) => [a.id, a.label, a.disabled]),
      ]);
      if (signature !== this.signature) {
        this.signature = signature;
        this.toolbar.replaceChildren();
        this.toolbar.dataset.nodeId = node.id;
        const more = document.createElement("details");
        more.className = "node-toolbar-more";
        const summary = document.createElement("summary");
        summary.textContent = "更多";
        more.append(summary);
        const menu = document.createElement("div");
        more.append(menu);
        for (const action of actions) {
          const button = document.createElement("button");
          button.textContent = action.label;
          button.disabled = !!action.disabled;
          button.onclick = () => {
            more.open = false;
            try {
              Promise.resolve(action.run(this.toolbarNode!)).catch(this.report);
            } catch (error) {
              this.report(error);
            }
          };
          if (["fit", "copy", "delete"].includes(action.id))
            menu.append(button);
          else this.toolbar.append(button);
        }
        if (menu.children.length) this.toolbar.append(more);
      }
      const p = toScreen(node, camera);
      this.toolbar.style.left = `${Math.max(8, Math.min(this.host.clientWidth - this.toolbar.offsetWidth - 8, p.x + (node.width * camera.zoom) / 2 - this.toolbar.offsetWidth / 2))}px`;
      this.toolbar.style.top = `${Math.max(8, p.y - 66)}px`;
      if (
        p.y + node.height * camera.zoom < 0 ||
        p.y > this.host.clientHeight ||
        p.x + node.width * camera.zoom < 0 ||
        p.x > this.host.clientWidth
      )
        this.toolbar.hidden = true;
    }
    if (this.panel) {
      const { element, id } = this.panel;
      element.hidden = hidden || !panelNode || panelNode.id !== id;
      if (panelNode && panelNode.id === id && !hidden) {
        const width = Math.min(440, this.host.clientWidth - 24);
        element.style.width = `${width}px`;
        element.style.maxHeight = `${Math.min(520, this.host.clientHeight * 0.64)}px`;
        let p = toScreen(panelNode, camera);
        let bottom = p.y + panelNode.height * camera.zoom + 12;
        if (this.reveal && element.offsetHeight) {
          this.reveal = false;
          const overflow =
            bottom + Math.min(520, this.host.clientHeight * 0.64) + 16 - this.host.clientHeight;
          if (overflow > 0) {
            camera.y += overflow / camera.zoom;
            this.changed();
            p = toScreen(panelNode, camera);
            bottom -= overflow;
          }
        }
        // After initial reveal, growth uses the remaining space without moving the canvas.
        element.style.maxHeight = `${Math.max(0, Math.min(520, this.host.clientHeight * 0.64, this.host.clientHeight - bottom - 16))}px`;
        element.style.left = `${Math.max(12, Math.min(this.host.clientWidth - width - 12, p.x + (panelNode.width * camera.zoom) / 2 - width / 2))}px`;
        element.style.top = `${bottom}px`;
        if (
          bottom < 0 ||
          bottom > this.host.clientHeight ||
          p.x + panelNode.width * camera.zoom < 0 ||
          p.x > this.host.clientWidth
        )
          element.hidden = true;
      }
    }
  }
  destroy() {
    this.abort.abort();
    this.unmountPanel();
    this.layer.remove();
  }
}
