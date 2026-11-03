import type { Node } from "../core/types.js";
export interface NodeEditor {
  element: HTMLElement;
  dispose?: () => void;
}
export interface NodeDefinition {
  ports?: { input?: boolean; output?: boolean };
  onActivate?: (node: Node) => boolean;
  label: string;
  color: number;
  summary?: (node: Node) => string;
  editor?: (
    node: Node,
    commit: (text: string) => void,
  ) => HTMLElement | NodeEditor;
}

export interface NodeAction {
  id: string;
  label: string;
  disabled?: boolean;
  run: (node: Node) => void | Promise<void>;
}
export const builtinNodes: Array<[string, NodeDefinition]> = [
  ["text", { label: "文本", color: 0xe5b75d }],
  ["image", { label: "图片", color: 0x80bba5 }],
  ["video", { label: "视频", color: 0xaaa0db }],
  ["audio", { label: "音频", color: 0xe4a68e }],
];
