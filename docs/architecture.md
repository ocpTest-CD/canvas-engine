# 模块架构

`src/index.ts` 为公开入口；`engine.ts` 组装服务、调度帧与提供宿主 API。内部模块不反向依赖组装入口。React 是可选适配层，Electron/模型/密钥/文件持久化不进入引擎。

| 模块 | 入口 | 责任 | 禁止承担 |
| --- | --- | --- | --- |
| core | types.ts | Node、Edge、Camera、MediaMetadata、Change | DOM、网络、模型 |
| document | model.ts | 文档事务、撤销/重做、稳定节点标识 | 绘制、控件 |
| serialization | scene.ts | version 1 校验、可选字段兼容 | 读取磁盘、Key |
| scene | geometry.ts | 世界/屏幕坐标、RBush、连线命中 | React state |
| interaction | host.ts / interaction.ts | 输入状态机、5px 点击/拖动阈值、键盘 | 依赖完整 CanvasEngine |
| layout | sizing.ts | 原始媒体比例和文本高度计算 | DOM 测量、模型参数 |
| rendering | renderer.ts | Pixi 绘制、内容表面、LOD、连线 | 改写文档、业务执行 |
| nodes | definition.ts | 节点定义、内置类型、操作契约 | 保存 API Key |
| overlays | floating.ts / overlays.ts | 屏幕坐标浮层、焦点、编辑/播放生命周期 | 参数的业务含义 |
| resources | resources.ts / media.ts | 并发解码、封面、缩略图、缓存释放 | 假设素材来自磁盘 |
| adapters | react.tsx | 通过 Portal 挂载宿主表单 | 拥有第二份场景数据 |

## 依赖规则

core 不依赖其他模块；serialization/layout 只依赖 core；document 依赖 core/serialization；scene 依赖 core。渲染和交互依赖明确契约。`InteractionHost` 列出交互所需的最小宿主能力，无 CanvasEngine 类型循环依赖。

`npm run check:boundaries` 检查层间导入、纯模块的 DOM 依赖、React 越界和 Electron/Node 宿主依赖。模块 README 与该脚本共同定义边界。

## 更新路径

用户输入 → InteractionHost 操作 → 文档事务 → 空间索引更新 → 请求一帧绘制。媒体读取完成 → 校验当前 assetId / 生命周期 → 更新自动尺寸节点 → 同一文档更新路径。旧节点未指定 sizeMode 时只缓存封面，不改写几何和项目。

浮层展开不修改节点宽高和连线。浮层随相机移动更新 CSS 位置，表单不跟随缩放。首次打开空间不足时最小平移相机；后续滚动不会持续抢占视角。

## 已知限制

文档事务仍需对候选快照整体校验；绘制仍扫描连线和场景顺序。0.2 已避免 Hover 命中每次反向扫描全场景，但没有宣称所有大项目路径均为增量复杂度。超过数千节点需依据 benchmark 和实际媒体负载进一步测量。
