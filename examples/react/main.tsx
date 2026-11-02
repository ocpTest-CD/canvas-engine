import "pixi.js/unsafe-eval";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CanvasEngine } from "../../src";
import { NodePanelPortal } from "../../src/react";
import "../example.css";
function Example() {
  const host = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<CanvasEngine>();
  const [, render] = useState(0);
  useEffect(() => {
    let disposed = false,
      e: CanvasEngine | undefined;
    void CanvasEngine.create(host.current!).then((instance) => {
      if (disposed) {
        instance.destroy();
        return;
      }
      e = instance;
      e.on("change", () => render((n) => n + 1));
      setEngine(e);
      e.add("text", { x: 200, y: 150 });
    });
    return () => {
      disposed = true;
      e?.destroy();
    };
  }, []);
  const node = engine?.panelId
    ? engine.document.nodes.get(engine.panelId)
    : undefined;
  return (
    <>
      <header>
        <strong>React 适配 · 节点下方挂载表单</strong>
        <button onClick={() => engine?.add("text")}>添加文字</button>
        <button onClick={() => engine?.fitToContent()}>总览</button>
      </header>
      <div id="canvas" ref={host} />
      {engine && node && (
        <NodePanelPortal engine={engine} nodeId={node.id}>
          <label>
            内容
            <textarea
              aria-label="React 节点内容"
              value={node.text ?? ""}
              onChange={(event) =>
                engine.applyChanges([
                  { kind: "put", node: { ...node, text: event.target.value } },
                ])
              }
            />
          </label>
        </NodePanelPortal>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Example />);
