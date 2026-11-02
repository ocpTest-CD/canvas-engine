# 接入指南（0.2.4）

适用对象：有 DOM 的 Web/WebView 产品，以及只使用文档核心的 JavaScript 宿主。先阅读[平台前置条件](platforms.md)。纯原生 Swift/Kotlin/Flutter 不能直接实例化当前 `CanvasEngine`。

## 1. 获取和构建

当前源码已提取成独立引擎仓库，尚未发布 npm。以下命令在本仓库根目录执行：

```sh
npm ci
npm run check:boundaries
npm run build:engine
npm pack
```

构建基线为 Node.js 22；锁文件固定开发依赖。生成的包名预计为 `canvas-app-engine-0.2.4.tgz`，以 `npm pack` 实际输出为准。仓库地址为 https://github.com/ocpTest-CD/canvas-engine；代码采用 [MIT 许可证](../LICENSE)，第三方依赖保留各自许可证。

在有 ESM/CSS 支持的接入方工程中，安装本地包：

```sh
npm install /absolute/path/to/canvas-app-engine-0.2.4.tgz pixi.js@8.22.0 rbush@4.0.1
# 仅 React 使用方需要：
npm install react@19 react-dom@19
```

本项目的使用、修改和再分发遵循 [MIT 许可证](../LICENSE)。引擎不需要 Electron、Apple 签名证书、API Key 或模型服务才能运行。当前没有 UMD/CDN 全局变量发行包，推荐使用 Vite 等支持 ESM 和 CSS 的构建器。

## 2. 最小 Web 接入

页面先提供一个已挂载、宽高非零的容器。不要在 `display:none` 的容器内初始化；宿主显示后再创建。

```html
<div id="canvas" style="width:100%;height:600px"></div>
```

```ts
import 'pixi.js/unsafe-eval';
import { CanvasEngine } from '@canvas-app/engine';
import '@canvas-app/engine/style.css';

const host = document.querySelector<HTMLElement>('#canvas');
if (!host) throw new Error('缺少画布容器');

const engine = await CanvasEngine.create(host);
const offMessage = engine.on('message', (message) => {
  console.info(String(message)); // 实际产品替换成可见的错误/状态提示
});
engine.add('text', { x: 80, y: 80 });

// 路由或组件卸载时调用；不要只移除 DOM。
function disposeCanvas() {
  offMessage();
  engine.destroy();
}
```

本项目使用 `pixi.js/unsafe-eval` 提供 Pixi 的静态替代实现，名称不表示应放宽 CSP 允许脚本 eval。它不提供 DOM 或 GPU 兼容层。创建失败时需由宿主 catch 并显示失败状态；不要继续使用未创建成功的实例。

宿主需要支持 ESM、WebGL、DOM、ResizeObserver、Pointer Events、requestAnimationFrame、structuredClone、crypto.randomUUID；图片还需要 fetch/createImageBitmap/Canvas 2D，视频与音频需要 HTMLMediaElement。应通过 HTTPS 或 localhost 提供页面，并验证实际浏览器能力。

## 3. 资源接入与所有权

`assetId` 是宿主稳定的资源 ID。场景只保存该 ID，不打包图片或视频字节。引擎调用 `resolveAsset(id)` 获取浏览器可读 URL、MIME 和可选清理函数。

```ts
import { CanvasEngine } from '@canvas-app/engine';

const blobs = new Map<string, Blob>(); // 产品中可替换为 IndexedDB、服务端或本地桥接
const engine = await CanvasEngine.create(host, {
  resolveAsset: async (id) => {
    const blob = blobs.get(id);
    if (!blob) throw new Error(`素材不存在: ${id}`);
    const url = URL.createObjectURL(blob);
    return { url, mime: blob.type, release: () => URL.revokeObjectURL(url) };
  },
});

// file 来自宿主文件选择器，并已通过宿主的文件大小/类型校验。
function addImage(file: File) {
  const id = crypto.randomUUID();
  blobs.set(id, file);
  engine.add('image', { x: 80, y: 80 }, id);
}
```

注意：

- 每次解析都应返回拥有独立生命周期的引用，或由宿主正确引用计数。缩略图和完整预览会分别解析同一资源；不能在一处关闭时撤销另一处仍在使用的 URL。
- 不要把临时 ObjectURL 当作持久 `assetId`；重新打开后必须重新解析。相同 ID 的字节变化建议分配新 ID，当前没有公开 `invalidateAsset` API。
- 图片通过 fetch 解码，跨域资源需要服务端允许 CORS。视频封面使用 video → Canvas，跨源视频需要额外验证；当前代码没有完整的跨源视频配置接口，优先由宿主获取 Blob 后返回 ObjectURL。
- `AssetResolver` 目前没有 AbortSignal 参数。引擎会取消其内部解码，并处理失效结果；宿主自行发起的网络请求需要自行管理取消和超时。
- 删除节点不等于立即删除磁盘素材或清空所有缓存。缓存可保留到淘汰/清空/销毁；素材库的引用统计与物理删除属于宿主。
- 普通视频节点显示封面，按需打开播放器；这不是多轨时间线或多视频同步播放引擎。

## 4. 节点和业务 UI

用 `registerNodeType` 注册节点，再使用 `add` 或 `applyChanges` 创建内容。模型、工具任务和参数存放在宿主状态中，通过稳定节点 ID 关联；不要放入 Key。

```ts
engine.registerNodeType('caption', {
  label: '字幕',
  color: 0x80bba5,
  ports: { input: true, output: true },
  summary: node => node.text ?? '填写字幕',
});
const id = engine.add('caption');
const current = engine.document.nodes.get(id)!;
engine.applyChanges([{ kind: 'put', node: { ...current, text: '第一幕' } }]);
```

`nodePanel(node, container)` 是创建引擎时注入的 DOM 挂载回调，可返回清理函数。它不是每次节点变化都会重新调用的响应式渲染函数；宿主需要自行订阅更新或使用 React Portal。更新前重新读取当前节点，避免旧闭包覆盖最新内容。

工具栏通过 `nodeActions` 注入，连接业务限制通过 `canConnect` 注入。后者只约束用户拖拽连线，不能代替加载场景、程序写入和业务运行前的校验。完整签名见 [API](api.md)。

## 5. 保存、加载和撤销

```ts
const snapshot = engine.exportScene(); // 包含 camera，不包含素材字节或宿主业务配置
const json = JSON.stringify(snapshot);

// 从存储中取得字符串后：
engine.loadScene(JSON.parse(json)); // 校验失败抛错；有效加载清理编辑状态和历史
engine.document.undo();
engine.document.redo();
```

实际项目文件建议由宿主包装成 `{ scene, assets, appState }`，但这不是引擎自带项目协议；宿主应独立定义版本和迁移。保存必须等待编辑草稿提交、素材和业务状态持久化完成，才能向用户显示“已保存”。`exportScene()` 只导出已提交数据，不会自动提交仍在文本编辑器中的草稿。

`documentChange` 用于文档变化通知；`change` 还包括相机、选择和面板变化。保存视口时不能只监听前者。大型文档应合并/防抖序列化，不能每次 `metrics` 事件都导出完整 JSON。

单次 `applyChanges([...])` 作为一个历史事务；`history=false` 和 `updateStatus` 可避免任务状态进入用户撤销栈。删除节点同时移除关联连线。`loadScene` 会清空历史；历史上限为 100 个事务。

## 6. React、Vue 和 SSR

React 19 使用普通 effect 创建实例，在 cleanup 中取消订阅并 destroy；异步创建期间如果组件卸载，Promise 返回后仍要销毁实例。不要把每帧相机变化复制到全局 React state。下方面板可使用 `/react` 的 `NodePanelPortal`，参考[可运行示例](../examples/react/main.tsx)。该组件不能在 SSR 阶段渲染，因为内部会创建 DOM。

Vue 等框架在 mounted 后创建，unmount 时销毁；Vue 组件如挂载到 nodePanel，应在返回的清理函数中卸载其子应用。目前没有官方 Vue/Svelte 适配包，使用的是同一套 DOM 接入接口。

Next.js/Nuxt 等 SSR 产品将 Web 引擎导入和实例化放在客户端生命周期中。服务端只导入 `/core`，不能通过 shim window 的方式运行 Web 入口。

## 7. 常见接入问题

| 现象 | 先检查 |
| --- | --- |
| 空白画布 | 容器尺寸、CSS 是否加载、create 是否 reject、WebGL 上下文 |
| 图片/视频不显示 | assetId 是否存在、URL 生命周期、CORS、MIME、实际编码支持 |
| 重开后素材丢失 | 是否只保存了 scene，却没有保存资源及 ID 映射 |
| 自定义节点变成默认样式 | 是否在加载/使用场景前注册同名 NodeDefinition |
| 菜单被裁剪 | 宿主 Portal 挂载位置和层级；不要修改文档几何来给菜单留位置 |
| 关闭页面后仍占资源 | 是否调用 destroy、取消宿主监听、释放自有播放器/网络任务 |
| 触屏无法按桌面手势缩放 | 当前没有完整双指手势实现，不能以 Pointer Events 支持推断移动端已验收 |
| 图形上下文丢失 | 监听 message，保留可导出的文档并提供重新创建入口；不承诺自动完整恢复 |

## 8. 接入验收

至少完成：创建/卸载、文本及中文输入、增删改和撤销、连线限制、保存重开、图片横竖比例、实际视频编码播放、资源缺失、快速切换场景、窗口变化、键盘焦点和错误恢复。随后按目标硬件测性能。原生端还必须完成[平台验收](platforms.md)，不能只用浏览器桌面测试替代。
