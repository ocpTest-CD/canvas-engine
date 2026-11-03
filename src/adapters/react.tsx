import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CanvasEngine } from "../engine.js";
/** React content, engine-owned positioning. Children keep the host React context. */
export function NodePanelPortal({
  engine,
  nodeId,
  children,
}: {
  engine: CanvasEngine;
  nodeId: string;
  children: ReactNode;
}) {
  const [element] = useState(() => document.createElement("div"));
  useLayoutEffect(
    () => engine.mountNodePanel(nodeId, element),
    [engine, nodeId, element],
  );
  return createPortal(children, element);
}
