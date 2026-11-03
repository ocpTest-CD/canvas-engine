# interaction

入口：`host.ts / interaction.ts`。

输入状态机；只访问InteractionHost能力，禁止反向引用CanvasEngine。

修改后运行对应单元或交互测试，以及 `npm run check:boundaries`。总体依赖见 [架构](../../docs/architecture.md)。

0.3 用 pointerId 跟踪触摸：空白单指平移、双指中点平移及比例缩放；进入双指状态取消未提交拖拽预览。Chromium CDP 可验证触摸路径，但不替代移动真机的系统输入和手势验收。

0.4 同步相关行为见 [接入契约](../../docs/backend-integration.md)。修改需运行 tests/sync.test.ts 与跨语言 fixture；不把网络、账号或模型执行加入此模块。
