# 平台支持与接入前置条件（0.7.0）

核对日期：2026-11-03。本引擎当前提供纯 JavaScript 数据核心和 DOM + PixiJS Web 渲染实现。跨端目标不等于所有平台已经交付 SDK；本页把可行接入路线与实际验收分开。

## 支持矩阵

| 目标 | 接入入口 | 前置条件 | 当前证据 / 状态 |
| --- | --- | --- | --- |
| Chromium 桌面浏览器 | 包根入口 + CSS | ESM、DOM、WebGL、Pointer Events、ResizeObserver 等 | macOS Chromium 141 自动回归通过；Chrome 156/Metal 性能实测，非所有版本认证 |
| Safari / Firefox 桌面 | 同上 | 逐项探测 Web API、GPU、编码能力 | macOS Playwright Firefox/WebKit 回归通过；WebKit 测试不是已安装 Safari/WKWebView 真机认证 |
| React Web | 根入口 + `/react` | React/react-dom 19、客户端生命周期 | 有可运行示例和自动交互回归 |
| Vue / Svelte Web | 根入口 + CSS | mounted 后创建，卸载时清理 | DOM 接口可接入；没有专用适配包或框架回归 |
| Next.js / Nuxt SSR | 服务端 `/core`，客户端根入口 | 服务端不导入 Web UI；客户端动态挂载 | 集成方式说明，未完成这些框架的专项验收 |
| Electron macOS | 渲染进程根入口 | Chromium 能力、受限 preload 桥接 | 当前 Canvas App 0.2.4 在 macOS arm64 有实际接入验证 |
| Electron Windows / Linux | 同上 | 对应平台 Electron、GPU/视频编码和本地桥接 | 尚未完成系统级验收；macOS 包不覆盖它们 |
| Tauri 桌面 | WebView 内根入口 | Rust/Tauri 工具链、平台 WebView、受限命令桥接 | 尚无仓库内完整接入样例或专项验收 |
| iOS / iPadOS / macOS WKWebView | WebView 内根入口 | Xcode 宿主、WKWebView、可访问资源、JS 桥接 | 路线说明；触摸、输入法、媒体和生命周期待验证 |
| Android WebView | WebView 内根入口 | Android SDK、可用 System WebView、启用受控 JS | 路线说明；没有完成真机验证 |
| React Native / Flutter | 优先 WebView 嵌入 | 适用 WebView 插件和宿主消息桥接 | 没有直接使用原生视图的引擎 SDK |
| 小程序等受限容器 | 需单独适配 | DOM/WebGL/媒体 API 与标准浏览器可能不同 | 当前不支持直接接入保证；不是换个包名即可运行 |
| Node.js / 服务端 | `/core` | Node.js 22 基线、structuredClone、所需依赖 | 已有历史无 DOM 导入验证；可处理数据，不提供服务端截图 |
| Worker | 仅考虑 `/core` | 相同 JS 能力，数据通过消息传递 | 没有完整 Worker 渲染入口；主入口依赖 DOM |
| 纯原生 SwiftUI / Compose / Flutter 绘制 | 尚无公开入口 | 新渲染/输入适配，或 JS 运行时桥接 | 未实现；不能直接调用当前 HTMLElement 接口 |

浏览器版本记录来自开发验收，不是长期支持政策。运行环境是否能创建 WebGL 上下文、解码具体媒体比操作系统名称更直接；最低 OS/浏览器版本必须在实际平台验收后公布。

## Web / WebView 通用要求

### 运行能力

- 已挂载且尺寸非零的 HTMLElement；加载引擎 CSS；ESM 构建和 ES2022 目标代码支持。
- DOM、ResizeObserver、Pointer Events、pointer capture、requestAnimationFrame、performance.now、AbortController、structuredClone、crypto.randomUUID。
- WebGL 渲染能力；当前明确选择 PixiJS WebGL，不提供保证可用的无 GPU 降级方案。
- 图片：fetch、Blob、URL.createObjectURL、createImageBitmap、Canvas 2D；视频/音频：HTMLMediaElement 和对应实际编码的解码器。
- HTTPS/localhost 或经验证的可信应用资源协议。不要假设任意 file:// 页面具备完整模块加载、fetch 和安全上下文能力。
- 外部资源需满足访问控制与跨域条件；宿主负责认证、文件权限和素材读取。

以下仅是启动前的能力筛查，不能代替 CanvasEngine.create 的异常处理或真实媒体测试：

```ts
export function checkCanvasHost() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return ['Web 引擎需要 DOM，请在服务端使用 /core'];
  }
  const missing: string[] = [];
  for (const name of ['ResizeObserver', 'PointerEvent', 'requestAnimationFrame',
    'AbortController', 'structuredClone', 'createImageBitmap', 'fetch']) {
    if (!(name in globalThis)) missing.push(name);
  }
  if (typeof globalThis.crypto?.randomUUID !== 'function') missing.push('crypto.randomUUID');
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) missing.push('WebGL2（需进一步确认 Pixi 实际初始化能力）');
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return missing;
}
```

### 宿主需提供的接口

| 能力 | 引擎已有入口 | 宿主职责 |
| --- | --- | --- |
| 场景读入 | `loadScene(raw)` | 读文件/数据库/网络，解析 JSON，处理用户切换与未保存状态 |
| 场景读出 | `exportScene()` | 写入持久存储，保存资源映射和业务状态，报告落盘成功 |
| 素材 | `resolveAsset(id)` | 返回 WebView 可读 URL/Blob URL，管理认证、访问范围和 release |
| 参数界面 | `nodePanel` / React Portal | 构建表单、提交字段、清理监听；原生表单需自行桥接 |
| 节点操作 | `nodeActions` / `onActivate` | 执行工具、导出、调用模型，处理取消、错误和结果归属 |
| 连线约束 | `canConnect` + 宿主校验 | 数据类型、业务规则、DAG/执行权限，不依赖交互回调作为唯一校验 |
| 生命周期 | `create` / `destroy` | 页面加载、宿主卸载、后台恢复、WebView 重建 |
| 反馈 | `message` / `change` / `documentChange` | 状态 UI、保存策略、错误提示与桥接通知 |

引擎没有强制云服务或文件系统接口，也不会替宿主申请系统权限。

## Electron

在 renderer 中按 Web 方式创建画布；主进程负责文件、系统密钥库和需要特权的操作。用 preload/contextBridge 暴露范围明确的函数，如 loadProject/saveProject/readAsset，而不是把整个 ipcRenderer 或文件系统交给页面。保持 contextIsolation，评估 sandbox，校验消息来源和参数。[Electron contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge)、[安全指南](https://www.electronjs.org/docs/latest/tutorial/security)

引擎构建和本地 Web 示例不需要 Apple Key。宿主若要对外分发 macOS App，其签名、公证由宿主发布流程负责，不能把个人证书、私钥或模型凭据放进引擎仓库。

验收：多窗口独立实例、文件读写失败、资源路径转换、关闭恢复、缩放/DPR、系统输入法、实际编码播放。其他桌面系统还需补测快捷键、系统对话框和显卡差异。

## Tauri

前端仍使用当前 Web 入口；Rust 命令或受限资源协议承担文件和其他原生能力。Tauri 需要 Rust 和对应系统工具链；Windows 使用 WebView2，macOS 使用 WKWebView，Linux 使用 WebKitGTK，安装条件按目标平台官方文档准备。系统 WebView 的版本影响能力，不能直接沿用 Electron Chromium 的验收结论。[Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)、[WebView 版本](https://v2.tauri.app/reference/webview-versions/)

资源桥接应避免把整个大型视频编码为 JSON/Base64 频繁传输；优先授权的资源 URL 或按需读取。初次接入先验收文字与场景读写，再验收图片、视频、中文输入和 GPU 恢复。当前没有现成的 Tauri SDK，文档中的桥接职责由接入方实现。

## Apple WKWebView

需要 Xcode 构建的宿主、有效 WKWebView 配置、可加载的前端资源和满足前述能力的系统 WebKit。用 WKScriptMessageHandler 接收页面消息，通过受控 JavaScript 调用传入场景/返回结果；创建完成前排队消息，不直接拼接未转义的用户内容到脚本。桥接消息中不传送签名私钥或模型 Key。[WKScriptMessageHandler](https://developer.apple.com/documentation/webkit/wkscriptmessagehandler)、[evaluateJavaScript](https://developer.apple.com/documentation/webkit/wkwebview/evaluatejavascript(_:completionhandler:))

前端加载后先创建引擎，再通知宿主 ready；场景 load 成功后再回执。场景存储和资源访问由宿主桥接；WebView 消失/重建时处理旧任务失效和资源释放。WKWebView 页面接入并不等于纯 SwiftUI 渲染引擎。

必须补测：iPhone/iPad 真实触摸、软键盘遮挡、中文候选栏、横竖屏、安全区域、前后台切换、内存压力、视频首帧和播放手势。0.3 已实现双指平移/缩放与空白处单指平移，并通过 Chromium 触摸模拟；手写笔压感和移动端专用菜单未实现，模拟结果不替代真机。最低 iOS 版本未验收，不在文档中凭空指定。

## Android WebView

需要 Android 宿主、目标设备可用且足够新的 WebView provider、启用 JavaScript 和正确的本地资源加载方式。网络资源需要相应权限；选择用户文件应由宿主文件选择流程授权。桥接只开放给可信应用页面，限制导航和可调用方法，不能把任意远程网页接到有文件权限的桥接上。[Android WebView 文档](https://developer.android.com/develop/ui/views/layout/webapps/webview)

接入顺序仍是 ready → loadScene → 修改 → exportScene → 宿主持久化。销毁 Activity/View 时清理 WebView 和引擎；仅从布局移除不等于释放所有资源。当前未完成最低 API level、厂商 WebView、低内存设备或媒体编码矩阵验收。

## 原生桥接接口

0.3 内置传输无关的 `createSceneBridge`：`version/requestId/sessionId/method/payload` 请求、对应成功/错误回执、旧会话拒绝、大小限制和有界重放去重。支持 loadScene/exportScene/applyChanges，完整示例见 [桥接指南](bridge.md)。

宿主仍需实现可信 transport、ready 握手、响应超时、资源读取及生命周期通知；没有 Swift/Kotlin 类型包。原生回调先 JSON 解析，再交给 handle；不要把 DOM、函数或 Map/Set 跨桥传输。卸载时同时 bridge.dispose() 和 engine.destroy()。

## 无界面核心与纯原生实现

Node.js 可导入 `/core` 校验场景、编辑数据、计算坐标和媒体尺寸，不需要 DOM/GPU。它不提供截图、视频转码、图片解码或完整工作流执行。

纯原生展示若不使用 WebView，需要另行提供绘制、文字编辑、输入事件、资源和生命周期实现。目前核心是 TypeScript/JavaScript，原生使用需 JS 运行时桥接或遵循场景协议的原生实现；不能直接把 npm 包链接成 Swift/Kotlin 二进制。通用 RendererAdapter/InputAdapter 等还未成为公开接口。

## 平台发布验收清单

每个平台报告必须记录 OS、宿主/WebView、GPU 后端、DPR、输入设备和媒体编码；验证创建/卸载、场景往返、无效数据、撤销、输入法、焦点、资源失效和前后台切换。性能按[性能文档](performance.md)单独验收。未完成者保留“接入路线/待验证”标签，不能因一台 macOS 通过就宣称全平台支持。

0.3 新增 Windows/Linux/macOS 构建及 Chromium CI 矩阵、macOS 三浏览器回归定义；本地改动阶段尚未在远端执行，不能将配置文件当作各系统通过证据。

## 0.4 接入增量

事务、运行状态、资源与只读模式以及 updateStatus 迁移见 [后端接入](backend-integration.md)。旧版示例中的 Node.status 只表示历史持久字段，最新运行状态读取 document.runtime。

0.5 选区快照、执行预览和跨端桥接见 [执行接入](execution-selection.md)。

0.6 的常驻执行控件是 Web DOM 层，可用于浏览器、React、Electron 和支持 DOM 的 WebView；原生宿主通过运行时状态自行实现原生 UI。控件不提供后台执行、供应商取消或持久队列。详见 [执行呈现](execution-controls.md)。

0.7 的错误摘要按钮依赖 Web DOM 层；纯 core 消费者通过 RuntimeState.issue 自行绘制。WebView 原生壳用既有 bridge.setRuntimeState 透传，并由宿主处理 onNodeIssue；不增加模型服务或网络前置条件。
