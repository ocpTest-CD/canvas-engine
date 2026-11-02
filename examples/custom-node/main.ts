import { createExample } from "../common";
const { engine, ready } = await createExample("扩展节点 · 通过公共 API 注册");
engine.registerNodeType("checklist", {
  label: "检查清单",
  color: 0x8fbaa3,
  ports: { input: true, output: true },
  summary: (n) => n.text ?? "填写检查项",
  editor: (node, commit) => {
    const area = document.createElement("textarea");
    area.value = node.text ?? "";
    area.oninput = () => commit(area.value);
    return area;
  },
});
engine.loadScene({
  version: 1,
  nodes: [
    {
      id: "check",
      type: "checklist",
      title: "发布检查",
      x: 240,
      y: 160,
      width: 360,
      height: 210,
      text: "□ 检查输入\n□ 预览结果\n□ 保存项目",
      sizeMode: "auto",
    },
  ],
  edges: [],
  camera: { x: 0, y: 0, zoom: 1 },
});

ready();
