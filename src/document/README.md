# document

入口：`model.ts`。

事务、历史、节点与连线一致性；依赖core和serialization。

修改后运行对应单元或交互测试，以及 `npm run check:boundaries`。总体依赖见 [架构](../../docs/architecture.md)。

`commands.ts`负责复制、粘贴、分组、取消分组和层级操作，通过窄CommandHost接口与组装层协作。
