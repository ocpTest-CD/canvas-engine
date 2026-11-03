# Engine 0.5：选区与执行状态接入

引擎只管理选择、几何、高亮和临时运行状态；Go 服务负责依赖图、执行、取消、费用与审核。此版本无新增渲染框架依赖，scene v1 保持兼容。

## 公共接口

```ts
const off = engine.on('selectionChange', selection => {
  // readonly nodeIds；bounds 为世界坐标，空选区没有 bounds。
  updateSelectionToolbar(selection);
});
engine.setSelection(['text-1', 'image-1']);
const snapshot = engine.getSelection();
engine.setExecutionPreview({execute:['image-1'], blocked:[], cancel:[]});
engine.setRuntimeState('image-1', {runId:'run-id', status:'正在取消'});
engine.setExecutionPreview(); // 清除预览
```

- snapshot/nodeIds/bounds 均冻结；去重并滤掉已删除节点。外部不能通过修改快照改变引擎选择。
- 框选、点击、多选、程序选择及选区几何变化产生 selectionChange；普通重复 notify 不重复发同一快照。相机变化不改变世界坐标快照，屏幕定位应同时订阅 change。
- getSelection 不筛生成节点，不展开上游，普通素材/文字也可被选中。宿主将 IDs 发送后端计划接口，由后端返回真实执行范围。
- execute / blocked / cancel 为薄荷、琥珀、红色临时轮廓，在低 LOD 也可见。高亮只遍历当前可见节点，不修改节点内容。
- 高亮/运行状态不进入项目、撤销历史或同步事务；loadScene 清除高亮，删除节点清除对应高亮。
- `getExecutionPreview()` 返回不可变当前预览。`executionPreviewChange` 供宿主同步说明和可访问文字，颜色不能是产品内唯一提示。
- 旧 `selected: Set` 为兼容保留；宿主应改用 get/setSelection。直接修改旧 Set 后仍需 notify。

## Headless 与原生桥接

`@canvas-app/engine/core` 导出纯函数 `selectionSnapshot(nodes, ids)` 和 `executionPreview(nodes, value)`，无 DOM/网络/服务端依赖。无界面的服务端工具可以使用；不代表已提供原生绘图实现。

createSceneBridge 新增可选命令 getSelection、setSelection、getExecutionPreview、setExecutionPreview。宿主实现对应可选方法后即可调用；旧宿主收到不支持命令返回 OPERATION_FAILED，不静默成功。setSelection.payload 为 string[]，setExecutionPreview.payload 为可选 execute/blocked/cancel string[]。

Web/React/Electron/Tauri 使用公开引擎 API；Swift/Kotlin/Flutter 的 WebView 通过会话隔离 JSON 桥传递 IDs/高亮，原生层管理 HTTP/SSE/认证。宿主需保证 WebView 就绪、消息大小限制、来源认证及页面重载后更换 sessionId。桥不包含运行、扣费、鉴黄、凭据或任意代码执行命令。

0.5 本地验证：50 单元测试、18 Chromium 浏览器交互测试；桌面使用真实鼠标框选并与本机 Go/PostgreSQL/River 联调。未重跑大型性能基准，既有 0.3 性能记录仍仅为旧版本、固定设备的证据；不新增任何节点数/帧率保证。
