# Canvas Engine

本地多模态画布引擎，TypeScript + PixiJS；节点内容直接展示，悬停操作位于上方，参数面板锚定下方。模型调用、密钥、文件存储和工作流执行由宿主提供。

当前包版本 **0.2.4**，场景协议 **version 1**。这是可构建、打包与集成的开发版本，已提取为独立源码仓库，尚未发布 npm。许可证待项目所有者确定；当前 `private: true` / `UNLICENSED`，不能将代码已模块化等同于已正式开源。

## 接入与版本文档

- [文档总入口](docs/README.md)
- [详细接入指南](docs/integration.md)：安装、初始化、资源、保存与卸载。
- [各端前置条件与接口](docs/platforms.md)：Web、Electron、Tauri、Apple/Android WebView、React Native/Flutter、服务端和纯原生边界。
- [API 参考](docs/api.md)：当前实际入口、方法、事件和数据契约。
- [CHANGELOG](CHANGELOG.md)：区分引擎变化与历史宿主版本。
- [性能参数与证据](docs/performance.md)：50,000 节点/100,000 连线是格式校验上限，不是流畅规模承诺；96 MiB 是缩略图估算软预算。
- [独立仓库交付边界](docs/distribution.md)：仅发布引擎及必要示例/测试，不包含个人 Key 或产品签名材料。

当前 Web 入口仍依赖 DOM；React 可选。macOS Electron 已有宿主接入证据，其他平台状态详见平台矩阵，不能据此宣称全端原生 SDK 已交付。

## 从仓库启动

Node.js 22。获取源码后在仓库根目录执行：

```sh
git clone https://github.com/ocpTest-CD/canvas-engine.git
cd canvas-engine
npm ci
npm run dev -- --port 4317
```

打开 Vite 输出地址后访问：

- `/examples/minimal/`：纯 TypeScript，无 React、无模型 Key。
- `/examples/react/`：React 参数表单与 Portal。
- `/examples/custom-node/`：自定义节点和编辑器。
- `/examples/media/`：横图、竖图、方图和视频封面。

`playground/` 保留诊断面板和历史回归场景；正式节点交互示例位于 `examples/`。

## 构建及本地集成

```sh
npm run build:engine
npm pack
```

将生成的 tarball 安装到使用方项目，按 peerDependencies 提供 PixiJS、rbush；只有使用 React 入口才需要 React 和 react-dom。

```ts
import { CanvasEngine } from '@canvas-app/engine';
import '@canvas-app/engine/style.css';

const engine = await CanvasEngine.create(host, {
  resolveAsset: async (id) => {
    const blob = await yourAssetStore.read(id);
    const url = URL.createObjectURL(blob);
    return { url, mime: blob.type, release: () => URL.revokeObjectURL(url) };
  },
  nodePanel: (node, element) => {
    const input = document.createElement('input');
    input.value = node.title;
    input.onchange = () => {
      const current = engine.document.nodes.get(node.id);
      if (current) engine.applyChanges([{kind:'put',node:{...current,title:input.value}}]);
    };
    element.append(input);
    return () => { input.onchange = null; };
  },
});
engine.add('text');
// 宿主卸载时必须调用。
engine.destroy();
```

严格 CSP 宿主可以像本仓库桌面应用一样，在宿主入口显式加载 `pixi.js/unsafe-eval` 提供的静态替代实现；无需放开脚本 eval。具体行为以所用 PixiJS 版本测试为准。

## 公共入口

| 入口 | 用途 |
| --- | --- |
| `@canvas-app/engine` | CanvasEngine、文档类型、节点扩展、场景工具 |
| `@canvas-app/engine/core` | 无 DOM / PixiJS / React 的文档、布局、序列化和几何操作 |
| `@canvas-app/engine/react` | NodePanelPortal，仅 React 使用方加载 |
| `@canvas-app/engine/style.css` | 引擎、编辑器和浮层基础样式 |

不要导入 `src/document/...` 等内部路径。0.x API 仍在演进，当前场景格式继续支持 version 1。

## 维护导航

- [模块架构与依赖](docs/architecture.md)
- [坐标、尺寸和交互概念](docs/concepts.md)
- [扩展节点、工具栏、参数表单](docs/extending.md)
- [兼容及迁移](docs/compatibility.md)
- [贡献与验证](CONTRIBUTING.md)
- [本次架构决策](docs/decisions/0002-node-surfaces.md)
