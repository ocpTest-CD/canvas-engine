# 节点执行控件（0.6）

引擎只呈现执行状态。排队、依赖、模型、取消权限、密钥和后端连接均由宿主负责，headless core 不依赖 DOM 或服务。

```ts
const engine = await CanvasEngine.create(element, {
  nodePrimaryAction(node) {
    if (!hostCanExecute(node.id)) return undefined;
    const active = engine.document.runtime.get(node.id)?.active;
    return {
      id: active ? 'cancel' : 'run',
      label: active ? '停止执行' : '执行节点',
      run: () => active ? hostCancel(node.id) : hostRun(node.id),
    };
  },
});
engine.setRuntimeState('node-id', {
  runId: 'run-id', attemptId: 'run-id:node-id', sequence: 3,
  active: true, status: '生成中', phase: '生成中',
  progress: .42, startedAt: Date.now(),
});
// 无真实百分比时省略 progress；终态明确 active:false。
engine.setRuntimeState('node-id', {runId:'run-id', active:false, status:'已完成', progress:1});
```

nodePrimaryAction 是可选的、与 nodeActions hover 工具栏独立的单个动作。返回 undefined 不创建按钮；disabled 适合提交中。原生 button 提供 aria-label、Tab 与键盘激活，点击不会拖动节点。id=cancel 使用停止图标，其他动作使用执行图标。host 变更动作可调用 requestRender。

RuntimeState 新增可选 active、phase、attemptId、sequence、startedAt；progress 为 0..1 的阶段进度，undefined 表示未知。引擎只裁剪有效显示区间，不猜测真实进度、不替宿主丢弃跨运行事件；SDK reducer 提供序号/终态过滤。runtime 不进入场景 JSON、撤销、复制或持久事务。

屏幕空间 DOM 控件由 `src/overlays/execution.ts` 管理；只为视口范围节点创建；空闲按钮在 zoom<=0.32 隐藏，活动遮罩仍覆盖节点，使用紧凑标签。原有媒体不被替换。进度条 CSS 动画不要求持续 WebGL 帧；每个引擎只有一个秒级耗时标签时钟，活动节点离屏、宿主隐藏、document hidden 或 destroy 时停用。减少动态效果时停止进度动画，数据更新继续。

Web/React 可直接使用 Options，Electron/WebView 可由宿主进程转发 runtime；原生原画引擎仍需自行渲染，不能把此 DOM 控件当作 SwiftUI/Compose 原生组件。场景格式继续 version 1，既有宿主无需改动。

验证：Chromium 交互测试覆盖无 hover 按钮、真实42%/未知状态、离屏卸载、idle WebGL 帧数和 destroy。没有新增全平台或万级活动节点性能保证。

## 0.6.2 活动节点锁定契约

`document.isNodeLocked(id)` 在 `runtime.active === true` 时返回 true。宿主应从排队开始设为 active，成功/失败/取消确认后设为 false。`local` 和 `history` 对锁定节点的文本、标题、素材、位置、尺寸、分组、层级和关联边修改被原子拒绝；相关 undo/redo 保留历史但暂不可执行。无关节点仍可编辑。编辑器、参数面板及原位标题入口在锁定时关闭。

结果回写须明确标记可信宿主操作：

```ts
engine.applyChanges([{kind:'patch', id, set:{text:result}}], {origin:'system', history:true});
engine.setRuntimeState(id, {active:false, status:'已完成'});
```

system/remote 不受本地锁限制，用于结果、素材元信息和同步；不是权限边界，不能把不可信用户操作伪装为 system。宿主自有模型/提示词表单也必须检查 `document.isNodeLocked`，因为它们不属于场景事务。当前锁只在本客户端 runtime 内，不宣称服务端、多端互斥能力。

上次版本允许生成中编辑的宿主需适配此行为；App 0.6.5 采用新契约，并保留结果冲突保护作为可信同步引发修改时的后备策略。
