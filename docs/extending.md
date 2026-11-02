# 扩展指南

## 注册节点

使用公开 `registerNodeType(type, definition)`：label/color/ports/summary/editor/onActivate。自定义 editor 返回 HTMLElement，使用提供的 commit 回调提交文本。完整示例见 `examples/custom-node`。

## 上方工具栏

创建引擎时传入 `nodeActions(node)`，返回 `{ id, label, disabled?, run(node) }[]`。宿主可增加生成或导出，错误通过 message 事件反馈。操作回调收到当前节点，不应自行缓存旧 assetId。内置预览、参数以及“更多”中的适配、复制、删除由引擎提供。

## 下方参数

原生：Options.nodePanel(node, container) 挂载界面，可返回清理函数。面板切换时清理；输入修改调用 applyChanges 或宿主业务状态，不把密钥写入 Node。

React：从公开 `/react` 入口导入 NodePanelPortal，监听 change 获取 engine.panelId，以当前节点 ID 挂载。Portal 保留宿主 React Context。关闭时调用 showNodePanel()。见 `examples/react`；业务参数由宿主自行实现。

面板只负责屏幕定位、滚动隔离、Esc和焦点；模型字段由宿主渲染。异步操作须核对当前节点和任务身份，已删除或切换项目的结果不得回写。

## 资源

AssetResolver(id) 返回 URL、MIME 与可选 release。确保 URL 对当前宿主可读。资源调度器最多并行处理3个解析/预览任务；视频取首个可解码帧，不自动播放。缓存淘汰、清空和销毁会取消内部解码；删除节点不保证立即回收对应缓存，宿主自行发起的解析请求也没有自动取消契约。物理素材删除由宿主负责。大资源可由宿主提供更合适的代理或存储，勿把凭据拼进示例。详见[资源所有权](integration.md)。

## 生命周期

订阅 on 返回取消函数；React effect 必须清理；宿主卸载时 destroy。Options.nodePanel 清理函数释放自己注册的监听器。资源解析器必须释放自行创建的 ObjectURL。
