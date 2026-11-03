# 模块架构

`src/index.ts` 为公开入口；`engine.ts` 组装服务、调度帧与提供宿主 API。内部模块不反向依赖组装入口。React 是可选适配层，Electron/模型/密钥/文件持久化不进入引擎。

| 模块 | 入口 | 责任 | 禁止承担 |
| --- | --- | --- | --- |
| core | types.ts / bridge.ts | Node、Edge、Camera、MediaMetadata、Change、JSON 场景桥接 | DOM、网络、模型 |
| document | model.ts | 文档事务、撤销/重做、稳定节点标识 | 绘制、控件 |
| serialization | scene.ts | version 1 校验、可选字段兼容 | 读取磁盘、Key |
| scene | geometry.ts / edges.ts | 世界/屏幕坐标、双指相机、节点及连线 RBush | React state |
| interaction | host.ts / interaction.ts | 输入状态机、5px 点击/拖动阈值、键盘 | 依赖完整 CanvasEngine |
| layout | sizing.ts | 原始媒体比例和文本高度计算 | DOM 测量、模型参数 |
| rendering | renderer.ts | Pixi 绘制、内容表面、LOD、连线 | 改写文档、业务执行 |
| nodes | definition.ts | 节点定义、内置类型、操作契约 | 保存 API Key |
| overlays | floating.ts / overlays.ts / titles.ts / execution.ts | 屏幕坐标浮层、焦点、编辑/播放生命周期 | 参数的业务含义 |
| resources | resources.ts / media.ts | 并发解码、封面、缩略图、缓存释放 | 假设素材来自磁盘 |
| adapters | react.tsx | 通过 Portal 挂载宿主表单 | 拥有第二份场景数据 |

## 依赖规则

core 不依赖其他模块；serialization/layout 只依赖 core；document 依赖 core/serialization；scene 依赖 core。渲染和交互依赖明确契约。`InteractionHost` 列出交互所需的最小宿主能力，无 CanvasEngine 类型循环依赖。

`npm run check:boundaries` 检查层间导入、纯模块的 DOM 依赖、React 越界和 Electron/Node 宿主依赖。模块 README 与该脚本共同定义边界。

## 更新路径

用户输入 → InteractionHost 操作 → 文档事务 → 空间索引更新 → 请求一帧绘制。媒体读取完成 → 校验当前 assetId / 生命周期 → 更新自动尺寸节点 → 同一文档更新路径。旧节点未指定 sizeMode 时只缓存封面，不改写几何和项目。

浮层展开不修改节点宽高和连线。浮层随相机移动更新 CSS 位置，表单不跟随缩放。首次打开空间不足时最小平移相机；后续滚动不会持续抢占视角。

## 已知限制

0.3 普通事务仅克隆和校验变更对象，关联边通过邻接表定位。文档通知区分 geometry/order/edges；空间索引增量更新、层级仅随结构变化重建。渲染查询视口节点并按缓存层级排序，连线查询独立 RBush；跨视口但两端不可见的边仍能绘制。

结构增删/层级历史仍保存全量顺序；加载、导出与元数据测量后的素材关联节点查找仍可能遍历全场景。密集重叠会令空间索引退化。详细复杂度和实测见性能文档，不能宣称所有操作仅随可见节点增长。
