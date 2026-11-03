# Engine 0.4 后端接入边界

本文记录 0.4 基础能力，当前包 0.5.0，scene protocol 仍为 version 1。引擎不会发 HTTP、持有账号/API Key、定义模型参数或执行 DAG。Canvas Client SDK 0.1 通过这些新增接口接入 Go Backend 0.1。

## 提交事件与字段补丁

```ts
engine.on('transaction', ({transactionId, origin, revision, operations}) => {
  // 接入 SDK 时不要再手动发送，SDK 已监听并入持久队列。
  if (origin !== 'remote') enqueueForYourBackend({transactionId, operations});
});
engine.applyChanges([{kind:'patch',id:'node-id',set:{text:'new text'},unset:['assetId','media']}]);
engine.applyChanges(remoteOperations, {origin:'remote', history:false, transactionId:remoteId});
```

`Change` 新增 patch 与 reorder。patch.set 是字段级更新；unset 删除可选字段，不允许修改 id，最终节点仍校验几何和字段类型。操作按事务暂存/验证，失败不提交。结构性变更/undo/redo/层级排序也输出可重放操作。事件内容与文档隔离，监听器不能通过事件对象改动内部媒体数据。

`CommittedTransaction` 字段：transactionId:string、origin:local|remote|system|history、revision:number、operations:Change[]。这里 revision 是**本地文档计数**，不是后端 revision；SDK 独立维护服务端版本。loadScene 是整体替换并清空历史，不产生待同步本地事务。事件失败不回滚已提交状态。

`ApplyOptions`：history?、origin?、transactionId?；旧的第二参数 boolean 仍支持。remote/system 默认不进撤销栈。远端变更删除与受影响节点/边重叠的历史，保留无关编辑；远端结构改变会剥离旧的全局排序历史，避免恢复已删除节点。此策略**不是 CRDT 协同撤销**，同节点不同字段也保守视为冲突。

远端操作按精确几何应用，不重新猜测自动尺寸；SDK 不需要重复生成或重新布局。patch 按字段精确写入，宿主需要适配媒体/文本时可使用 adaptNode；本地 put 保留原有自动尺寸逻辑。

## 运行状态

```ts
engine.setRuntimeState(id,{runId,status:'running',progress:0.4});
engine.setRuntimeState(id,undefined);
engine.on('runtimeChange',({id,state})=>updateAccessibleStatus(id,state));
```

状态位于 `document.runtime`，不会改变场景 revision、进入撤销或被 exportScene 导出。renderer 将 runtime.status 用于显示，progress/error 留给宿主扩展展示。`updateStatus` 现在委托运行状态；从 0.3 升级后改用 runtime.get(id)，不要读取 node.status 检查最新状态。旧场景已有的 status 字段仍可读取/导出，不会破坏 scene v1 兼容。

## 资源

AssetContext 新增 purpose?:thumbnail|preview|original、version?:string。引擎纹理读取传 thumbnail，预览播放器传 original。版本字段是供宿主解析器扩展的可选契约，当前引擎仍以 assetId 缓存；素材版本应使用新 ID 或 invalidateAsset，**不是已实现的多版本缓存**。

缩略图的尺寸必须代表素材宽高比；真实素材 metadata 优先来自后端。签名 URL 由宿主/SDK 刷新，不保存在场景。失效后 invalidateAsset(id) 会释放并允许重试。

## 只读模式

Options.readOnly / setReadOnly(bool) 统一阻止本地 Document apply/reorder/undo/redo 和编辑型快捷键/手势/工具栏。仍可平移、缩放、选择、预览已有媒体，并通过 remote 来源应用服务器更新。宿主可自行改 Options；它不是安全授权边界，服务端必须独立验证权限。自定义宿主控件也需遵守只读状态，不允许直接修改公开 Maps。

## 尚未加入

命名多端口、协同 presence/CRDT、嵌套容器、通用 schema 迁移注册表、原生 Swift/Kotlin renderer 不属于本轮 P0 接入能力。未知节点延续已有默认展示，尚无业务配置迁移系统。后端不会把任意视觉连线当成执行依赖，宿主在独立 configs.inputs 建立运行关系。

## 验证

新增纯核心同步测试与共享 scene-operations.json；NodeNext 类型导入路径修复；既有浏览器交互回归保留。性能数据仍引用 0.3 基线，不能把未复测结果标为 0.4 保证。独立包仍不包含后端与 SDK，三者可各自版本化。

0.5 的范围执行接入增量见 [选区与执行状态](execution-selection.md)，与 SDK 0.2 / Backend 0.2 配套。
