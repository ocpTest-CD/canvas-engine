# interaction

入口：`host.ts / interaction.ts`。

输入状态机；只访问InteractionHost能力，禁止反向引用CanvasEngine。

修改后运行对应单元或交互测试，以及 `npm run check:boundaries`。总体依赖见 [架构](../../docs/architecture.md)。
