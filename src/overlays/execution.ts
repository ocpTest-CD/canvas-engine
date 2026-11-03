import type { Camera, Node, RuntimeState } from "../core/types.js";
import type { NodeAction } from "../nodes/definition.js";
import { toScreen } from "../scene/geometry.js";

/** Viewport-only controls. Execution belongs to the host; this layer only presents it. */
export class ExecutionControls {
  private layer = document.createElement("div");
  private entries = new Map<
    string,
    {
      root: HTMLDivElement;
      button: HTMLButtonElement;
      progress: HTMLDivElement;
      fill: HTMLDivElement;
      label: HTMLSpanElement;
    }
  >();
  private clock?: ReturnType<typeof setInterval>;
  private labels = new Map<string, { text: string; startedAt?: number }>();
  private visibility = () => {
    this.layer.classList.toggle("is-paused", document.hidden);
    this.syncClock();
  };
  private syncClock() {
    const active =
      [...this.labels.values()].some((v) => v.startedAt !== undefined) &&
      !document.hidden;
    if (!active && this.clock) {
      clearInterval(this.clock);
      this.clock = undefined;
    }
    if (active && !this.clock)
      this.clock = setInterval(() => this.updateLabels(), 1000);
  }
  private updateLabels() {
    for (const [id, value] of this.labels) {
      const label = this.entries.get(id)?.label;
      if (label)
        label.textContent =
          value.text +
          (value.startedAt
            ? ` · ${Math.max(0, Math.floor((Date.now() - value.startedAt) / 1000))}s`
            : "");
    }
  }
  constructor(
    host: HTMLElement,
    private report: (error: unknown) => void,
  ) {
    this.layer.className = "engine-execution-controls";
    for (const event of ["pointerdown", "dblclick", "keydown"])
      this.layer.addEventListener(event, (e) => e.stopPropagation());
    host.append(this.layer);
    document.addEventListener("visibilitychange", this.visibility);
  }
  update(
    nodes: Node[],
    camera: Camera,
    runtime: ReadonlyMap<string, RuntimeState>,
    action: ((node: Node) => NodeAction | undefined) | undefined,
    hidden: boolean,
  ) {
    const keep = new Set<string>();
    this.labels.clear();
    if (!hidden)
      for (const node of nodes) {
        const command = action?.(node),
          state = runtime.get(node.id);
        if (camera.zoom <= 0.32 && !state?.active) continue;
        if (!command && !state?.active) continue;
        keep.add(node.id);
        let entry = this.entries.get(node.id);
        if (!entry) {
          const root = document.createElement("div"),
            button = document.createElement("button"),
            progress = document.createElement("div"),
            fill = document.createElement("div"),
            label = document.createElement("span");
          root.className = "engine-node-execution";
          root.dataset.nodeId = node.id;
          button.className = "engine-node-run";
          button.type = "button";
          progress.className = "engine-node-progress";
          fill.className = "engine-node-progress-fill";
          label.className = "engine-node-progress-label";
          progress.append(fill, label);
          root.append(button, progress);
          this.layer.append(root);
          this.entries.set(
            node.id,
            (entry = { root, button, progress, fill, label }),
          );
        }
        const { root, button, progress, fill, label } = entry;
        const p = toScreen(node, camera);
        root.style.transform = `translate(${p.x}px,${p.y}px)`;
        root.style.width = `${node.width * camera.zoom}px`;
        root.style.height = `${node.height * camera.zoom}px`;
        button.hidden = !command;
        if (command) {
          button.disabled = !!command.disabled;
          button.title = command.label;
          button.setAttribute("aria-label", `${command.label}：${node.title}`);
          button.textContent = command.id === "cancel" ? "■" : "▶";
          button.onclick = () => {
            try {
              Promise.resolve(command.run(node)).catch(this.report);
            } catch (e) {
              this.report(e);
            }
          };
        }
        progress.hidden = !state?.active;
        root.classList.toggle("is-active", !!state?.active);
        root.classList.toggle("is-compact", camera.zoom <= 0.32);
        root.style.borderRadius = `${14 * camera.zoom}px`;
        const waiting = [
          "排队中",
          "等待依赖",
          "等待中",
          "queued",
          "pending",
        ].includes(state?.phase ?? state?.status ?? "");
        root.classList.toggle("is-running", !!state?.active && !waiting);
        progress.classList.toggle("is-waiting", waiting);
        const value =
          typeof state?.progress === "number" && Number.isFinite(state.progress)
            ? Math.max(0, Math.min(1, state.progress))
            : undefined;
        progress.classList.toggle("is-indeterminate", value === undefined);
        progress.setAttribute("role", "progressbar");
        progress.setAttribute("aria-label", state?.phase ?? "执行进度");
        progress.setAttribute("aria-valuemin", "0");
        progress.setAttribute("aria-valuemax", "100");
        if (value === undefined) progress.removeAttribute("aria-valuenow");
        else
          progress.setAttribute(
            "aria-valuenow",
            String(Math.round(value * 100)),
          );
        fill.style.width = value === undefined ? "30%" : `${value * 100}%`;
        const text = `${state?.phase ?? state?.status ?? "执行中"}${value === undefined ? "" : ` · ${Math.round(value * 100)}%`}`;
        if (state?.active)
          this.labels.set(node.id, { text, startedAt: state.startedAt });
        if (label.textContent !== text) label.textContent = text;
      }
    for (const [id, entry] of this.entries)
      if (!keep.has(id)) {
        entry.root.remove();
        this.entries.delete(id);
      }
    this.updateLabels();
    this.syncClock();
  }
  destroy() {
    clearInterval(this.clock);
    document.removeEventListener("visibilitychange", this.visibility);
    this.labels.clear();
    this.entries.clear();
    this.layer.remove();
  }
}
