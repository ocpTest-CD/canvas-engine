# scene

入口：`geometry.ts`。

坐标转换、RBush和连线几何。只依赖core。

修改后运行对应单元或交互测试，以及 `npm run check:boundaries`。总体依赖见 [架构](../../docs/architecture.md)。

0.3 增加 `edges.ts`：连线包围盒 RBush，含端点都在视口外但穿过视口的边。几何变更通过邻接表更新受影响边；包围盒仅筛候选，精确命中仍使用线段距离。`pinchCamera` 计算双指中点/距离对应的新相机。
