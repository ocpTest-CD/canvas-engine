# Canvas Engine 文档

核对日期：2026-11-03。当前包 `@canvas-app/engine` **0.6.3**；场景协议 **version 1**；状态为 MIT 开源开发版本，尚未发布 npm；`private: true` 防止意外 npm 发布。版本来自 `package.json`，不是 npm 或 GitHub Release 记录。

| 阅读目标 | 文档 |
| --- | --- |
| 安装、最小接入、资源、保存、卸载 | [接入指南](integration.md) |
| 各端前置条件、桥接接口和验证要求 | [平台支持与接入](platforms.md) |
| 当前实际可用的导出、方法、事件与数据契约 | [API 参考](api.md) |
| 版本变化与迁移 | [CHANGELOG](../CHANGELOG.md)、[兼容政策](compatibility.md) |
| 理论边界、算法复杂度、实测及复测方法 | [性能说明](performance.md) |
| 模块依赖与维护入口 | [架构](architecture.md)、[核心概念](concepts.md) |
| 自定义节点、工具栏和面板 | [扩展指南](extending.md) |
| 独立仓库提取及发布范围 | [开源交付边界](distribution.md) |

当前正式导出为包根入口、`/web`（根入口别名）、`/core`、`/react`、`/style.css`。纯核心新增传输无关的 `createSceneBridge`；通用原生渲染适配器和 Swift/Kotlin SDK 仍未实现。

本次验证、评分和未覆盖范围见 [0.3.0 质量验收](quality-0.3.md)。

本引擎管理画布文档、交互和展示。模型参数 UI、API Key、工作流执行、文件系统、账号和系统签名属于宿主。每个业务节点应承载一种明确能力，复杂工作通过节点组合表达。

0.4 后端/SDK 接入能力与升级行为见 [接入说明](backend-integration.md)。

0.5 选区快照、执行预览和跨端桥接见 [执行接入](execution-selection.md)。

- [0.6 节点执行控件](execution-controls.md)：常驻动作、runtime、性能/平台边界。

[0.6.3 交付验收与迁移范围](quality-0.6.3.md)。
