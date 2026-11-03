# API 参考（0.6.3）

本页以当前源码为准，不包含规划接口。导出的完整 TypeScript 声明随构建产物提供。0.x 尚无跨小版本稳定保证；不要导入内部 src 路径。

## 包入口

| 入口 | 导出 / 用途 | 运行前置条件 |
| --- | --- | --- |
| `@canvas-app/engine` | CanvasEngine、Options、Document、节点和资源契约、几何与布局工具 | DOM/WebGL；使用时导入 CSS |
| `@canvas-app/engine/web` | 与默认入口完全相同 | DOM/WebGL |
| `@canvas-app/engine/core` | Document、validate、Point/Camera/Node/Edge/Snapshot/Change、MediaMetadata、uid/emptyScene、SpatialIndex/EdgeIndex、toScreen/toWorld/zoomAt/pinchCamera/segmentDistance、fitMedia/fitText、createSceneBridge | ES2022 目标的现代 JS、structuredClone；uid 需要 crypto.randomUUID；空间索引需要 rbush |
| `@canvas-app/engine/react` | NodePanelPortal | DOM + 已创建的引擎 + React/react-dom 19 |
| `@canvas-app/engine/style.css` | Web 画布、编辑层和浮层样式 | 宿主 CSS 加载支持 |

`/core` 不加载 DOM、PixiJS 或 React，但包级 peerDependencies 仍声明 pixi.js/rbush；运行依赖和包安装声明不是一回事。`/web` 是默认入口别名，不是第二套 renderer。当前没有 Vue SDK、原生 SDK 或可替换 renderer 的公开工厂。

## 创建与宿主回调

```ts
import type { Node } from '@canvas-app/engine';

interface Options {
  resolveAsset?: (id: string, context?: { signal: AbortSignal }) => Promise<{
    url: string;
    mime: string;
    release?: () => void;
  }>;
  resources?: { budgetBytes?: number; maxEntries?: number; concurrency?: number; timeoutMs?: number };
  nodeActions?: (node: Node) => Array<{
    id: string;
    label: string;
    disabled?: boolean;
    run: (node: Node) => void | Promise<void>;
  }>;
  nodePanel?: (node: Node, container: HTMLElement) => (() => void) | void;
  canConnect?: (a: Node, b: Node) => boolean;
}
```

- `CanvasEngine.create(host, options?)`：异步返回实例。host 必须挂载且有尺寸。初始化失败会清理实例并抛错。
- `resolveAsset`：缺省时仍可用文本节点，加载媒体会报告无解析器。资源契约见[接入指南](integration.md)。
- `nodeActions`：可在渲染时调用，应保持纯计算且轻量；不要在其中发网络请求。`run` 抛错/reject 由工具栏转为 message。
- `nodePanel`：面板切换/卸载调用返回的清理函数；同一节点内容变化不会保证重新挂载。
- `canConnect`：同时约束用户连线、`loadScene/applyChanges` 及事务内被修改节点的已有连线；节点定义的端口开关也会检查。规则应是纯函数，动态更改规则不会自动审查已存在数据，undo/redo 恢复已验证历史，不重新执行外部策略。当前 Edge 没有命名端口和强类型端口协议。

## 核心数据

| 类型 | 字段 |
| --- | --- |
| Point | `x, y`：世界坐标 |
| Camera | `x, y, zoom`；相机左上角世界坐标和缩放倍率 |
| Node 必填 | `id, type, title, x, y, width, height` |
| Node 可选 | `text, assetId, group, status, sizeMode, preferredAspectRatio, media` |
| MediaMetadata | `width, height, mime, duration?`：源素材尺寸及秒数 |
| Edge | `id, from, to`：连接节点 ID |
| Snapshot | `version: 1, nodes: Node[], edges: Edge[], camera?` |
| Change | `put {node}` / `remove {id}` / `connect {edge}` / `disconnect {id}`，判别字段为 `kind` |

坐标变换：`screen = (world - camera) × zoom`。传给 toScreen/toWorld 的屏幕坐标相对 host，不是页面绝对坐标。

`validate(raw)` 校验并返回深拷贝；节点 ID 非空且唯一，边 ID 唯一、端点存在、禁止自环。允许不同 ID 的重复端点连线，也不检测有向环。工作流 DAG、端口语义、执行权限必须由宿主验证。大小和数量限制见[性能边界](performance.md)。

`sizeMode: auto` 会根据已知媒体尺寸、预设画幅或文本调整几何；`manual` 保留用户尺寸；缺省为兼容旧节点，不主动改尺寸。不要依赖向 Node 塞入任意业务字段的隐式保留行为；宿主状态应单独版本化。

## 常用 CanvasEngine 方法

| 方法 | 行为与注意事项 |
| --- | --- |
| `registerNodeType(type, definition)` | 注册/覆盖展示定义并请求渲染；不是注册工作流执行器 |
| `loadScene(raw)` | 先验证再切换，关闭旧浮层、清空历史和缓存、恢复相机；同步抛错 |
| `exportScene()` | 返回含相机的独立快照；不包含素材字节、未提交草稿、业务配置 |
| `applyChanges(changes, boolean | ApplyOptions = true)` | 原子文档事务；本地 put 补充自动尺寸，remote/patch 精确重放；失败发 message 且抛错 |
| `updateStatus(id, status)` | 委托 runtime 状态，不进入历史或场景；旧场景已保存的 status 兼容保留 |
| `add(type, point?, assetId?)` | 创建 auto 节点，返回 ID，并选择/打开其面板 |
| `removeSelected()` | 删除当前所选节点/边及关联边 |
| `copy() / paste() / duplicate()` | 引擎实例内节点剪贴板；不等于系统跨应用剪贴板 |
| `group() / ungroup()` | 单层分组关系，不是嵌套容器布局 |
| `reorder(front)` | 当前选择前置或后置；布尔值 true 为前置 |
| `edit(id)` | 打开内容编辑器/播放器；自定义 onActivate 返回 true 可接管 |
| `showNodePanel(id?, reveal = false)` | 显示指定节点面板，无 ID 关闭；reveal 可请求视口避让 |
| `mountNodePanel(id, element)` | 挂载 DOM 面板并返回卸载函数；一次仅一个，不与另一面板方案叠加使用 |
| `invalidateAsset(id)` | 释放该素材缓存并在下一次可见渲染重试；不会删除宿主素材 |
| `queryEdges(x,y,width,height)` | 世界坐标矩形内的候选边；包围盒可能多选，调用方做精确命中 |
| `adaptNode(id)` | 显式切换自动尺寸并适配，可撤销；媒体未加载时请求资源 |
| `focusNode(id) / fitToContent()` | 居中指定节点 / 总览；不会改节点坐标 |
| `zoom(factor)` | 围绕视口中心按倍率缩放，限制在 0.02～4 |
| `hitNode(point)` | 世界坐标命中最上层节点，可能返回 undefined |
| `focusNodeControls()` | 下一帧聚焦面板/工具栏可交互控件 |
| `notify()` | 请求渲染并发 change，适合宿主主动改变临时选择/相机后调用 |
| `requestRender()` | 合并到下一次 rAF；不提交文档、不发文档变更 |
| `message(text)` | 无障碍提示及 message 事件 |
| `destroy()` | 取消调度、事件、观察器、编辑层和资源；可重复调用，之后不可复用实例 |

`camera`、`selected`、`dark`、`panelId` 可读取以集成界面。若直接修改 camera/selected/dark，应显式 notify；数据节点必须走事务，不直接修改 Map。内部 renderer/resources/index 等即使出现在声明中，也不应作为稳定扩展 API。

## Document 与无界面使用

```ts
import { Document, validate } from '@canvas-app/engine/core';
const doc = new Document();
doc.load(validate({ version: 1, nodes: [], edges: [] }));
doc.apply([{ kind: 'put', node: {
  id: 'note-1', type: 'text', title: '笔记',
  x: 0, y: 0, width: 320, height: 180, text: 'hello',
} }]);
doc.undo();
doc.redo();
const scene = doc.snapshot();
```

`Document.load/apply/snapshot/undo/redo/updateStatus/reorder` 可独立使用。`snapshot()` 不含相机；`revision` 是变化计数，`canUndo/canRedo` 是历史状态。`onChange(ids, detail)` 是单一回调槽，独立 Document 可使用；不要覆盖已绑定 CanvasEngine 的 document.onChange，否则破坏索引和渲染通知。

## 节点扩展

```ts
import type { Node } from '@canvas-app/engine';

interface NodeDefinition {
  label: string;
  color: number;
  ports?: { input?: boolean; output?: boolean };
  summary?: (node: Node) => string;
  editor?: (node: Node, commit: (text: string) => void) =>
    HTMLElement | { element: HTMLElement; dispose?: () => void };
  onActivate?: (node: Node) => boolean;
}
```

内置类型为 text/image/video/audio。自定义 editor 属于 DOM 内容编辑层，并非任意自定义 GPU 节点正文渲染器。返回 `{ element, dispose }` 时关闭/替换/销毁编辑器会调用 dispose。兼容仅返回 HTMLElement；外部订阅、计时器和框架组件由 dispose 清理。清理异常转为 message，不应阻断引擎卸载。框架、原生控件及渲染后端的进一步替换属于后续接口设计。

## 事件

`engine.on(name, handler)` 返回取消订阅函数。签名使用 `EngineEvents` 强类型映射，payload 自动推断。监听器异常会转为 message 并隔离，message 监听器的异常不会递归派发。监听器仍应轻量，不在 change 回调中无条件再次 notify。

| 名称 | payload | 语义 |
| --- | --- | --- |
| `change` | 无 | 文档或临时 UI 状态变更；不是仅内容变化 |
| `transaction` | `CommittedTransaction` | 已提交的操作、ID、来源和本地 revision |
| `runtimeChange` | `{id,state?}` | 独立运行状态，非文档变更 |
| `documentChange` | `Set<string>` | 受影响节点 ID；纯连线事务可为空，仍是有效变化通知 |
| `nodesCloned` | `Map<string,string>` | 原节点到新节点 ID；宿主可复制关联业务配置 |
| `message` | string | 错误或状态消息；不保证包含所有宿主错误 |
| `metrics` | `{frames, drawMs, visible, visibleEdges, textures, textureBytes}` | 每次引擎绘制后的诊断值，具体口径见性能文档 |

## React Portal

`NodePanelPortal({engine, nodeId, children})` 将 children 挂载到引擎定位的 DOM 容器，保留 React Context；父组件监听 change 并用 engine.panelId 找到当前节点。不要在实例创建前渲染，不在 SSR 渲染；不要同时用 nodePanel 回调和 Portal 争用同一个面板。

## 0.3 增量通知和资源配置

`new Document({ canConnect: (edge, from, to) => boolean })` 为纯核心宿主提供连接约束。`incidentEdges(id)` 返回独立只读集合，不能据此修改内部索引。

`DocumentChange` 包含 `edges: Set<string>`、`geometry: Set<string>`、`orderChanged: boolean`、可选 `reset: boolean`。几何不变的文本/状态更新不重建空间索引和层级缓存。已有单参数 onChange 回调仍兼容；独立 Document 的回调由宿主负责异常处理。

`resources` 默认 `budgetBytes=96*1024*1024`、`maxEntries=128`、`concurrency=3`、`timeoutMs=30000`；均须正数，条目数和并发数须整数。预算为缩略图软预算，不能作为进程内存限制。超时从任务出队开始，包含 resolve 和解码；等待队列时间不计入。预览播放器另有生命周期，不受缩略图并发和超时配置控制。

解析器的 context 为可选参数，旧单参数函数可直接使用。关闭/失效后取消信号会触发，宿主 fetch 应传入 `context?.signal`。忽略取消的请求仍可能继续耗费宿主带宽，但不会永久占用引擎调度槽；迟到 URL 会释放。

## JSON 场景桥接

`createSceneBridge(host, sessionId, { maxBytes?, replayEntries? })` 从根入口和 `/core` 导出；host 提供 `loadScene`、`exportScene`、`applyChanges`。接口及接线示例见 [桥接指南](bridge.md)。`handle` 同步返回 BridgeResponse；`dispose` 仅使桥接失效，不销毁宿主引擎。

## 兼容注意

`history=false` 的节点增删或连线变更会清空撤销/重做，避免历史恢复悬空连线；普通非结构更新和 updateStatus 不清空历史。需要保留可撤销结构操作时使用默认 history=true。场景继续为 version 1。

## 0.4 接入增量

事务、运行状态、资源与只读模式以及 updateStatus 迁移见 [后端接入](backend-integration.md)。旧版示例中的 Node.status 只表示历史持久字段，最新运行状态读取 document.runtime。

## 0.5 选择与范围高亮

`getSelection()`、`setSelection(ids)`、`selectionChange`、`setExecutionPreview(value?)`、`getExecutionPreview()`、`executionPreviewChange` 的完整契约见 [范围接入](execution-selection.md)。

## 0.6 节点执行呈现

`Options.nodePrimaryAction(node): NodeAction | undefined` 为可执行节点提供常驻操作。`setRuntimeState` 接受可选 active、phase、attemptId、sequence、startedAt，progress 为 0..1，未知时省略。参见 [执行控件与宿主接入](execution-controls.md)。状态与服务隔离，不改变 scene version 1。

### 节点名称原位编辑（0.6.1）

内置标题编辑与 `applyChanges([{kind:"patch",id,patch:{title}}])` 使用相同事务路径，不改节点 ID 和连线。已有 `documentChange` / transaction 事件和撤销行为继续适用。无新增模型、服务端或文件系统 API；交互和平台条件见 [接入指南](integration.md#061-原位重命名)。

## 0.6.2 执行锁

活动 runtime 默认锁定本地节点编辑；宿主配置控件检查 `document.isNodeLocked(id)`，生成结果以 `origin: "system"` 写入。完整行为与接入迁移见 [节点执行控件](execution-controls.md#062-活动节点锁定契约)。
