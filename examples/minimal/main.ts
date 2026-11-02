import { createExample, textNode } from "../common";
const { engine, ready } = await createExample("最小画布 · 无框架 / 无模型 Key");
engine.loadScene({
  version: 1,
  nodes: [
    textNode(
      "灵感",
      160,
      150,
      "点击节点，在下方编辑。\n悬停查看操作，拖动自由组织。",
    ),
    textNode("下一步", 620, 150, "从右侧端口拖动到另一个节点建立连接。"),
  ],
  edges: [],
  camera: { x: 0, y: 0, zoom: 1 },
});

ready();
