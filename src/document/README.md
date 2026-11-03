# document

入口：`model.ts`。

事务、历史、节点与连线一致性；依赖core和serialization。

修改后运行对应单元或交互测试，以及 `npm run check:boundaries`。总体依赖见 [架构](../../docs/architecture.md)。

`commands.ts`负责复制、粘贴、分组、取消分组和层级操作，通过窄CommandHost接口与组装层协作。

0.3 增量事务先暂存并校验变更，再一次提交；邻接表支持关联边查询。普通更新只携带补丁；结构变更才保存顺序快照。通知分离几何、顺序和边，避免状态更新重建所有索引。直接修改 nodes/edges 会绕过一致性维护，禁止这样接入。

0.4 同步相关行为见 [接入契约](../../docs/backend-integration.md)。修改需运行 tests/sync.test.ts 与跨语言 fixture；不把网络、账号或模型执行加入此模块。
