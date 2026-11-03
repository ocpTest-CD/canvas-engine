# 0.6.3 源码交付验收

日期：2026-11-03。范围为独立引擎仓库从 0.3.0 至 0.6.3 的累计改动；不包含桌面应用、模型调用服务、账号密钥或用户资产。版本号与桌面 App 分开。

## 已运行检查

| 检查 | 结果 |
| --- | --- |
| 模块边界 `npm run check:boundaries` | 通过：纯核心、宿主隔离、可选 React 适配 |
| 单元测试 `npm test` | 52/52 通过 |
| 构建 `npm run build` | TypeScript、引擎 JS/CSS/声明、示例站点均通过 |
| 包消费 `npm run check:package` | 实际 0.6.3 tarball 的公开入口、无 DOM 消费者、bridge 和包清单通过 |
| Chromium `npm run test:e2e` | 21/21 通过，包含同步、执行锁、标题编辑、媒体和销毁 |
| 提交内容检查 | 仅源码、文档、测试、合成 fixture、包清单和锁文件；敏感内容扫描未发现密钥、私人路径或服务 IP |

## 主要兼容变化

- 保持场景 version 1，新增 patch/reorder、事务来源及独立 runtime。执行状态不再由 updateStatus 持久写入节点。
- 选区和执行范围预览不进入场景或撤销历史。
- 原位标题支持 IME、Enter/blur 保存、Escape 取消及撤销。
- active 节点锁住本地/历史变更；可信 system/remote 更新继续生效。宿主自有表单应同样检查锁。
- 运行进度和停止控件由宿主驱动；引擎不承担模型执行、取消权限、计费、内容审核或网络请求。

详细示例见 [迁移](compatibility.md)、[后端接入](backend-integration.md)、[执行选区](execution-selection.md)和[节点执行控件](execution-controls.md)。

## 验证边界

本轮未重复性能基准、Firefox/WebKit、移动硬件或服务器联调；历史结果保留在各版本验收文档，不作为本次重新验证的结果。本次为 Git 源码和版本标记交付，不发布 npm，也不宣称生产 SLA、分布式锁或原生渲染 SDK。
