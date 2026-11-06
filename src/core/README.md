# core

入口：`types.ts`。

纯场景类型与小型无副作用工具。不得导入DOM、React、PixiJS或宿主。

修改后运行对应单元或交互测试，以及 `npm run check:boundaries`。总体依赖见 [架构](../../docs/architecture.md)。

`bridge.ts` 定义传输无关的场景请求/响应协议、会话和有界重放缓存。这里只调用 SceneBridgeHost 的三个方法；不实现 transport、认证、文件或网络。协议接入见 docs/bridge.md。

0.4 同步相关行为见 [接入契约](../../docs/backend-integration.md)。修改需运行 tests/sync.test.ts 与跨语言 fixture；不把网络、账号或模型执行加入此模块。

`selection.ts` 提供不可变选区快照和临时执行高亮数据，不做依赖展开、网络提交、扣费或审核。

`RuntimeIssue` 是通用、非持久诊断数据，只携带显示文本与严重性；模型规则、脱敏、队列和详情 UI 属于 SDK/宿主。
