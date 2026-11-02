# core

入口：`types.ts`。

纯场景类型与小型无副作用工具。不得导入DOM、React、PixiJS或宿主。

修改后运行对应单元或交互测试，以及 `npm run check:boundaries`。总体依赖见 [架构](../../docs/architecture.md)。

`bridge.ts` 定义传输无关的场景请求/响应协议、会话和有界重放缓存。这里只调用 SceneBridgeHost 的三个方法；不实现 transport、认证、文件或网络。协议接入见 docs/bridge.md。
