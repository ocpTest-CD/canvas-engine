import type {
  Camera,
  Node,
  RuntimeState,
  RuntimeIssue,
} from "../core/types.js";
import { toScreen } from "../scene/geometry.js";
/** Viewport-only error surface. Details and execution policy belong to the host. */
export class NodeIssues {
  private layer = document.createElement("div");
  private entries = new Map<
    string,
    { root: HTMLDivElement; button: HTMLButtonElement }
  >();
  constructor(host: HTMLElement) {
    this.layer.className = "engine-node-issues";
    host.append(this.layer);
    for (const event of ["pointerdown", "dblclick", "keydown"])
      this.layer.addEventListener(event, (e) => e.stopPropagation());
  }
  update(
    nodes: Node[],
    camera: Camera,
    runtime: ReadonlyMap<string, RuntimeState>,
    open: ((node: Node, issue: RuntimeIssue) => void) | undefined,
    hidden: boolean,
  ) {
    const keep = new Set<string>();
    if (!hidden)
      for (const node of nodes) {
        const state = runtime.get(node.id);
        const issue =
          state?.issue ??
          (state?.error ? { id: node.id, summary: state.error } : undefined);
        if (!issue || state?.active) continue;
        keep.add(node.id);
        let entry = this.entries.get(node.id);
        if (!entry) {
          const root = document.createElement("div"),
            button = document.createElement("button");
          root.className = "engine-node-issue";
          root.dataset.nodeId = node.id;
          button.type = "button";
          button.className = "engine-node-issue-button";
          root.append(button);
          this.layer.append(root);
          entry = { root, button };
          this.entries.set(node.id, entry);
        }
        const { root, button } = entry,
          p = toScreen(node, camera);
        root.style.transform = `translate(${p.x}px,${p.y}px)`;
        root.style.width = `${node.width * camera.zoom}px`;
        root.style.height = `${node.height * camera.zoom}px`;
        root.style.borderRadius = `${14 * camera.zoom}px`;
        root.dataset.severity = issue.severity ?? "error";
        const compact = camera.zoom <= 0.32 || node.width * camera.zoom < 130;
        root.classList.toggle("is-compact", compact);
        button.textContent = compact ? "!" : `!  ${issue.summary}`;
        button.title = issue.summary;
        button.setAttribute(
          "aria-label",
          `查看执行问题：${node.title}：${issue.summary}`,
        );
        button.onclick = () => open?.(node, issue);
      }
    for (const [id, entry] of this.entries)
      if (!keep.has(id)) {
        entry.root.remove();
        this.entries.delete(id);
      }
  }
  clear() {
    for (const e of this.entries.values()) e.root.remove();
    this.entries.clear();
  }
  destroy() {
    this.clear();
    this.layer.remove();
  }
}
