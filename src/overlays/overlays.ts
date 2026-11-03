import type { Node, Camera } from "../core/types.js";
import type { NodeDefinition } from "../nodes/definition.js";
import type { AssetResolver } from "../resources/resources.js";
import { toScreen } from "../scene/geometry.js";
export class Overlays {
  private element?: HTMLDivElement;
  private disposeAsset?: () => void;
  private token = 0;
  private request?: AbortController;
  private commit?: () => void;
  private disposeEditor?: () => void;
  id?: string;
  constructor(
    private host: HTMLElement,
    private resolve: AssetResolver,
    private update: (id: string, text: string) => void,
    private closed: (id: string) => void,
    private failed: (error: unknown) => void = () => {},
  ) {}
  open(n: Node, def?: NodeDefinition) {
    this.close();
    const token = ++this.token;
    this.id = n.id;
    const panel = document.createElement("div");
    panel.className = "engine-overlay" + (n.assetId ? " media-overlay" : "");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", `编辑 ${n.title}`);
    this.element = panel;
    const close = document.createElement("button");
    close.textContent = "完成";
    close.className = "overlay-close";
    close.onclick = () => this.close();
    panel.append(close);
    if (n.type === "text" || def?.editor) {
      const commit = (text: string) => this.update(n.id, text);
      const result =
        def?.editor?.(n, commit) ?? document.createElement("textarea");
      const editor = result instanceof HTMLElement ? result : result.element;
      this.disposeEditor =
        result instanceof HTMLElement ? undefined : result.dispose;
      if (editor instanceof HTMLTextAreaElement) {
        editor.value = n.text ?? "";
        editor.setAttribute("aria-label", "节点文本");
        this.commit = () => {
          if (editor.value !== n.text) commit(editor.value);
        };
      }
      panel.append(editor);
      queueMicrotask(() => editor.focus());
    } else if (n.assetId) {
      const message = document.createElement("p");
      message.textContent = "正在读取素材…";
      panel.append(message);
      this.request = new AbortController();
      void this.resolve(n.assetId, {
        signal: this.request.signal,
        purpose: "original",
      })
        .then((asset) => {
          if (token !== this.token) {
            asset.release?.();
            return;
          }
          this.disposeAsset = asset.release;
          message.remove();
          if (!/^(image|audio|video)\//.test(asset.mime))
            throw Error("不支持的媒体类型");
          const el = document.createElement(
            asset.mime.startsWith("image/")
              ? "img"
              : asset.mime.startsWith("video/")
                ? "video"
                : "audio",
          );
          el.setAttribute("src", asset.url);
          el.onerror = () => {
            message.textContent = "无法解码此媒体，请使用浏览器支持的格式";
            panel.append(message);
          };
          if (el instanceof HTMLMediaElement) {
            el.controls = true;
            el.preload = "metadata";
            el.setAttribute("playsinline", "");
          } else el.alt = n.title;
          panel.append(el);
        })
        .catch(() => {
          if (token === this.token) {
            message.textContent = "素材不可用";
            panel.append(message);
          }
        });
    }
    this.host.append(panel);
    panel.tabIndex = -1;
    panel.focus({ preventScroll: true });
    panel.addEventListener("pointerdown", (e) => e.stopPropagation());
    panel.addEventListener("wheel", (e) => e.stopPropagation());
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !e.isComposing) {
        e.stopPropagation();
        this.close();
      }
    });
  }
  position(n: Node, c: Camera) {
    if (!this.element) return;
    const p = toScreen(n, c);
    Object.assign(this.element.style, {
      left: `${p.x}px`,
      top: `${p.y}px`,
      width: `${n.width * c.zoom}px`,
      height: `${n.height * c.zoom}px`,
    });
  }
  close(save = true) {
    this.token++;
    this.request?.abort();
    this.request = undefined;
    const commit = this.commit;
    this.commit = undefined;
    const attempt = (fn?: () => void) => {
      try {
        fn?.();
      } catch (error) {
        this.failed(error);
      }
    };
    if (save) attempt(commit);
    this.element?.querySelectorAll("video,audio").forEach((el) => {
      const m = el as HTMLMediaElement;
      m.pause();
      m.removeAttribute("src");
      m.load();
    });
    if (this.element?.contains(document.activeElement))
      this.host.focus({ preventScroll: true });
    const disposeEditor = this.disposeEditor;
    this.disposeEditor = undefined;
    attempt(disposeEditor);
    this.element?.remove();
    this.element = undefined;
    const disposeAsset = this.disposeAsset;
    this.disposeAsset = undefined;
    attempt(disposeAsset);
    const was = this.id;
    this.id = undefined;
    if (was && save) attempt(() => this.closed(was));
  }
  destroy() {
    this.close(false);
  }
}
