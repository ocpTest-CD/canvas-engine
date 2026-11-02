# 场景桥接（0.3.0）

`createSceneBridge` 是可在 Node、Worker 或浏览器使用的同步 JSON 消息处理器。它连接纯核心或 CanvasEngine，不负责网络、原生文件、密钥、WebView 实例或源地址认证。场景数据继续为 version 1；桥接协议自身也为 version 1，两者分别演进。

## 前置条件

- 引擎创建成功后才开放桥接。Web 页面容器、GPU、媒体要求见 [平台文档](platforms.md)。纯核心只需要现代 JS、structuredClone、TextEncoder。
- 宿主只向可信页面提供 transport；iframe 校验 event.origin 与 event.source，原生端限制导航和脚本可访问范围。sessionId 是防迟到结果的会话标记，不是认证令牌。
- 每次页面/项目会话建立新的 sessionId，并 dispose 旧桥接；消息发送方使用唯一 requestId，同一次重试保持相同 ID 和完整内容。
- 仅传 JSON 数据，不传函数、DOM、Map/Set、资源字节和用户凭据。素材用 assetId 关联独立资源传输。

## 页面端接线

```ts
import { CanvasEngine, createSceneBridge } from '@canvas-app/engine/web';
import '@canvas-app/engine/style.css';

const engine = await CanvasEngine.create(host, { resolveAsset });
const sessionId = crypto.randomUUID();
const bridge = createSceneBridge(engine, sessionId);

// receiveTrustedJson/sendJson 由宿主适配；这是接口示意，不是包内函数。
const unsubscribe = receiveTrustedJson((json: string) => {
  let request: unknown;
  try { request = JSON.parse(json); }
  catch { sendJson(JSON.stringify({ type: 'transportError', message: 'Invalid JSON' })); return; }
  sendJson(JSON.stringify(bridge.handle(request)));
});
sendJson(JSON.stringify({ type: 'ready', sessionId, version: 1 }));

function dispose() {
  unsubscribe();
  bridge.dispose();
  engine.destroy();
}
```

`ready` 和 `transportError` 是此宿主示例的信封，不是 bridge.handle 支持的方法。WKWebView 用受限 script-message handler 连接此接收/发送函数；Android 用可信页面消息接口；Electron/Tauri 用限制范围的桥接。异步响应超时、断连重试、原生 API 类型定义由宿主实现。

## 请求与响应

```json
{
  "version": 1,
  "sessionId": "current-session",
  "requestId": "request-001",
  "method": "loadScene",
  "payload": { "version": 1, "nodes": [], "edges": [] }
}
```

| method | payload | 成功 data |
| --- | --- | --- |
| loadScene | 未信任的场景对象，交给引擎验证 | null |
| exportScene | 无 | 场景快照；CanvasEngine 包含相机，纯 Document 包装器不含相机 |
| applyChanges | Change[] | null |

成功响应包含 `version/sessionId/requestId/ok:true/data`。失败为 `ok:false/error:{code,message}`，错误码为 INVALID_REQUEST、STALE_SESSION、REQUEST_REUSED、OPERATION_FAILED、RESPONSE_TOO_LARGE、DISPOSED。

loadScene/applyChanges 由真实引擎事务校验；无效请求不会切走有效场景。不要把桥接当成业务权限系统，工作流权限与执行规则由宿主掌控。

## 限制与重试

- `maxBytes` 默认 8 MiB，约束序列化请求及响应；exportScene 超限返回 RESPONSE_TOO_LARGE，宿主应提供独立的大文件传输方式。
- `replayEntries` 默认 128；缓存还受 `2 * maxBytes` 的序列化 JSON 字节总预算约束。该值不是 JS 堆内存硬上限，字符串、对象及克隆会有额外占用。
- 在缓存窗口内，同一 requestId、完全相同序列化内容返回原响应，不重复提交；不同内容返回 REQUEST_REUSED。JSON 属性顺序也属于此内容比较。
- 缓存按最早请求淘汰；已淘汰 ID 可能再次执行，不能当永久 exactly-once 保证。跨重启的业务去重在宿主持久化层实现。
- `dispose()` 清空缓存并拒绝后续消息，不自动 destroy 宿主，须分别清理。

## 纯核心宿主

```ts
import { Document, createSceneBridge } from '@canvas-app/engine/core';
const doc = new Document();
const bridge = createSceneBridge({
  loadScene: scene => { doc.load(scene); },
  exportScene: () => doc.snapshot(),
  applyChanges: changes => doc.apply(changes),
}, 'headless-session');
```

已验证消息往返、重复请求、旧会话、错误操作、超限、缓存淘汰和销毁；浏览器内与真实 CanvasEngine 联动通过三引擎回归。尚未在 Swift/Kotlin 宿主或移动真机完成 transport 验收。
