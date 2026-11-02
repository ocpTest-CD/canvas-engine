import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CanvasEngine, uid, validate, type Node, type Snapshot } from "../src";
import { toWorld } from "../src";
import { AssetStore, sampleImage } from "./assets";
import "./style.css";
const assets = new AssetStore();
declare global {
  interface Window {
    canvasEngine?: CanvasEngine;
  }
}
function App() {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<CanvasEngine | undefined>(undefined);
  const file = useRef<HTMLInputElement>(null),
    project = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false),
    [revision, bump] = useState(0),
    [dark, setDark] = useState(false),
    [status, setStatus] = useState("本地工作空间"),
    [stats, setStats] = useState({
      frames: 0,
      drawMs: 0,
      visible: 0,
      textures: 0,
      textureBytes: 0,
    }),
    [outline, setOutline] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const notify = (s: string) => {
    if (mounted.current) setStatus(s);
  };
  useEffect(() => {
    let disposed = false;
    mounted.current = true;
    let simulation: ReturnType<typeof setInterval> | undefined;
    let cleanups: Array<() => unknown> = [];
    void CanvasEngine.create(host.current!, {
      resolveAsset: assets.resolve,
      canConnect: (a, b) => a.type !== "audio" || b.type !== "image",
    })
      .then(async (e) => {
        if (disposed) {
          e.destroy();
          return;
        }
        engine.current = e;
        window.canvasEngine = e;
        e.registerNodeType("tool", {
          label: "模拟工具",
          color: 0xa69bcf,
          summary: (n) => n.text ?? "外部状态更新示例\n不调用真实模型",
          editor: (n, commit) => {
            const wrap = document.createElement("div"),
              input = document.createElement("textarea"),
              button = document.createElement("button");
            input.value = n.text ?? "";
            input.setAttribute("aria-label", "工具说明");
            button.textContent = "更新说明";
            button.onclick = () => commit(input.value);
            wrap.append(input, button);
            return wrap;
          },
        });
        cleanups = [
          e.on("change", () => bump((v) => v + 1)),
          e.on("message", (v) => notify(String(v))),
          e.on("metrics", (v) => setStats(v as typeof stats)),
          e.on("change", () => {
            notify("正在保存…");
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              void assets
                .save(e.exportScene())
                .then(() => notify("已保存到本机"))
                .catch(() => notify("自动保存失败，请导出项目"));
            }, 800);
          }),
        ];
        const saved = await assets.load().catch(() => undefined);
        if (disposed) return;
        if (saved) {
          validate(saved.scene);
          assets.blobs = new Map(saved.assets);
          e.loadScene(saved.scene);
          notify("已恢复本机项目");
        } else {
          const id = assets.add(await sampleImage());
          if (disposed) return;
          const nodes: Node[] = [
            {
              id: "welcome",
              type: "text",
              title: "从一个想法开始",
              text: "把文字、图像和声音放在一起。\n\n自由连接，让想法慢慢展开。",
              x: 100,
              y: 120,
              width: 270,
              height: 240,
            },
            {
              id: "landscape",
              type: "image",
              title: "山间来信",
              assetId: id,
              x: 450,
              y: 80,
              width: 360,
              height: 300,
            },
            {
              id: "tool",
              type: "tool",
              title: "下一步，试试看",
              text: "一个可扩展的工具节点。\n双击编辑，连接素材。",
              status: "模拟 · 等待开始",
              x: 900,
              y: 200,
              width: 270,
              height: 220,
            },
          ];
          e.loadScene({
            version: 1,
            nodes,
            edges: [{ id: "demo-edge", from: "welcome", to: "landscape" }],
          });
          e.fitToContent();
        }
        setReady(true);
      })
      .catch((err) => notify(`初始化失败：${String(err)}`));
    return () => {
      disposed = true;
      mounted.current = false;
      clearTimeout(timer.current);
      clearInterval(simulation);
      cleanups.forEach((fn) => fn());
      engine.current?.destroy();
      delete window.canvasEngine;
    };
  }, []);
  const e = engine.current;
  const selected = e
    ? [...e.selected].map((id) => e.document.nodes.get(id)!).filter(Boolean)
    : [];
  async function importMedia(
    files: FileList | null,
    point?: { x: number; y: number },
  ) {
    if (!files || !e) return;
    try {
      let i = 0;
      for (const f of files) {
        if (f.size > 100 * 1024 * 1024) {
          notify("单个素材上限为 100 MB");
          continue;
        }
        if (!/^(image\/(png|jpeg|webp|gif)|video\/|audio\/)/.test(f.type)) {
          notify("请选择 PNG、JPEG、WebP、GIF 或浏览器支持的音视频");
          continue;
        }
        const id = assets.add(f);
        const n = e.add(
          f.type.split("/")[0],
          point ? { x: point.x + i * 30, y: point.y + i * 30 } : undefined,
          id,
        );
        const node = e.document.nodes.get(n)!;
        e.applyChanges([{ kind: "put", node: { ...node, title: f.name } }]);
        i++;
      }
    } catch (err) {
      notify(String(err));
    }
  }
  function bench(count: number) {
    if (!e) return;
    if (!confirm("将替换当前画布。当前项目会先保存，建议先导出备份。")) return;
    void assets.save(e.exportScene()).then(() => {
      const nodes: Node[] = Array.from({ length: count }, (_, i) => ({
        id: `b${i}`,
        type: i % 3 ? "text" : "tool",
        title: `节点 ${i + 1}`,
        text: "自由画布 · 性能场景",
        x: (i % 100) * 310,
        y: Math.floor(i / 100) * 250,
        width: 260,
        height: 190,
      }));
      const edges = Array.from(
        { length: count === 1000 ? 2000 : Math.max(0, count - 1) },
        (_, i) => ({
          id: `e${i}`,
          from: `b${i % count}`,
          to: `b${((i % count) + (i < count ? 1 : 2)) % count}`,
        }),
      );
      e.loadScene({
        version: 1,
        nodes,
        edges,
        camera: { x: -50, y: -50, zoom: 0.8 },
      });
      notify(`${count.toLocaleString()} 节点测试场景`);
    });
  }
  function simulate() {
    if (!e) return;
    const id = selected.find((n) => n.type === "tool")?.id ?? e.add("tool");
    let step = 0;
    const interval = setInterval(() => {
      if (!mounted.current || !e.document.nodes.has(id)) {
        clearInterval(interval);
        return;
      }
      e.updateStatus(id, `模拟进度 ${(step += 10)}%`);
      if (step >= 100) clearInterval(interval);
    }, 200);
  }
  return (
    <div className={dark ? "app dark" : "app"}>
      <header>
        <div className="brand">
          <span className="brand-icon">✳</span>
          <strong>Canvas</strong>
          <span className="version">引擎实验场 · 0.1</span>
        </div>
        <div className="header-actions">
          <span className="status" role="status">
            {status}
          </span>
          <button disabled={!ready} onClick={() => project.current?.click()}>
            打开
          </button>
          <button
            disabled={!ready}
            onClick={() => {
              if (e)
                void assets.export(e.exportScene()).then((blob) => {
                  const url = URL.createObjectURL(blob),
                    a = document.createElement("a");
                  a.href = url;
                  a.download = "canvas-project.json";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  notify("项目已导出，包含媒体素材");
                });
            }}
          >
            导出项目 ↗
          </button>
          <button
            aria-label="切换主题"
            onClick={() => {
              setDark(!dark);
              if (e) {
                e.dark = !dark;
                e.requestRender();
              }
            }}
          >
            {dark ? "☀" : "☾"}
          </button>
        </div>
      </header>
      <main>
        <div
          className="canvas"
          ref={host}
          onDragOver={(ev) => ev.preventDefault()}
          onDrop={(ev) => {
            ev.preventDefault();
            if (e) {
              const r = host.current!.getBoundingClientRect();
              void importMedia(
                ev.dataTransfer.files,
                toWorld(
                  { x: ev.clientX - r.left, y: ev.clientY - r.top },
                  e.camera,
                ),
              );
            }
          }}
        />
        <nav className="toolbox" aria-label="画布工具">
          <button
            disabled={!ready}
            aria-label="文字"
            onClick={() => e?.add("text")}
          >
            <b>T</b>
            <span>文字</span>
          </button>
          <button
            disabled={!ready}
            aria-label="素材"
            onClick={() => file.current?.click()}
          >
            <b>▧</b>
            <span>素材</span>
          </button>
          <button
            disabled={!ready}
            aria-label="工具"
            onClick={() => e?.add("tool")}
          >
            <b>✧</b>
            <span>工具</span>
          </button>
          <div className="rule" />
          <button
            onClick={() => e?.document.undo()}
            disabled={!e?.document.canUndo}
            aria-label="撤销"
          >
            <b>↶</b>
          </button>
          <button
            onClick={() => e?.document.redo()}
            disabled={!e?.document.canRedo}
            aria-label="重做"
          >
            <b>↷</b>
          </button>
          <button aria-label="节点列表" onClick={() => setOutline(!outline)}>
            <b>☷</b>
          </button>
        </nav>
        {selected.length > 0 && (
          <aside className="inspector">
            <div className="eyebrow">当前选择</div>
            <h2>
              {selected.length === 1
                ? selected[0].title
                : `${selected.length} 个节点`}
            </h2>
            <div className="actions">
              <button
                onClick={() => selected.length === 1 && e?.edit(selected[0].id)}
              >
                编辑
              </button>
              <button onClick={() => e?.duplicate()}>复制</button>
              <button onClick={() => e?.removeSelected()}>删除</button>
              <button onClick={() => e?.group()}>分组</button>
              <button onClick={() => e?.ungroup()}>取消分组</button>
              <button onClick={() => e?.reorder(true)}>置顶</button>
              <button onClick={() => e?.reorder(false)}>置底</button>
            </div>
            {selected.some((n) => n.type === "tool") && (
              <button className="primary" onClick={simulate}>
                运行模拟工具
              </button>
            )}
          </aside>
        )}
        {outline && (
          <aside className="outline">
            <h3>画布内容</h3>
            {[...(e?.document.nodes.values() ?? [])].slice(0, 200).map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  e!.selected = new Set([n.id]);
                  e!.focusNode(n.id);
                }}
              >
                {n.title}
              </button>
            ))}
            {(e?.document.nodes.size ?? 0) > 200 && <p>显示前 200 个节点</p>}
          </aside>
        )}
        <div className="bottom-left">
          <span>空格拖动平移 · ⌘ / Ctrl + 滚轮缩放 · 双击编辑</span>
          <details>
            <summary>性能实验</summary>
            <div className="bench">
              <button onClick={() => bench(100)}>100 节点</button>
              <button onClick={() => bench(1000)}>1,000 节点</button>
              <button onClick={() => bench(10000)}>10,000 节点</button>
              <p>
                {stats.visible} 可见 · {stats.drawMs.toFixed(1)} ms 绘制 ·{" "}
                {(stats.textureBytes / 1024 / 1024).toFixed(1)} MB 纹理估算
              </p>
              <small>工具状态为模拟；绘制耗时不等于完整帧时间。</small>
            </div>
          </details>
        </div>
        <div className="zoom">
          <button onClick={() => e?.zoom(0.8)} aria-label="缩小">
            −
          </button>
          <span>{Math.round((e?.camera.zoom ?? 1) * 100)}%</span>
          <button onClick={() => e?.zoom(1.25)} aria-label="放大">
            ＋
          </button>
          <button onClick={() => e?.fitToContent()}>适应画布</button>
        </div>
        {!ready && <div className="loading">正在准备画布…</div>}
      </main>
      <input
        hidden
        ref={file}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,audio/*,video/*"
        onChange={(ev) => {
          void importMedia(ev.target.files);
          ev.target.value = "";
        }}
      />
      <input
        hidden
        ref={project}
        type="file"
        accept="application/json,.json"
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          if (f && e)
            void assets
              .parse(f)
              .then(({ scene, blobs }) => {
                validate(scene);
                for (const n of (scene as Snapshot).nodes)
                  if (n.assetId && !blobs.has(n.assetId))
                    throw Error("项目缺少媒体素材");
                assets.blobs = blobs;
                e.loadScene(scene);
                notify("项目已打开");
              })
              .catch((err) => notify(`打开失败：${err.message}`));
          ev.target.value = "";
        }}
      />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
