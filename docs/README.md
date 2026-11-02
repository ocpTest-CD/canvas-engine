# Canvas Engine 文档

核对日期：2026-11-02。当前包 `@canvas-app/engine` **0.2.4**；场景协议 **version 1**；状态为 MIT 开源开发版本，尚未发布 npm；`private: true` 防止意外 npm 发布。版本来自 `package.json`，不是 npm 或 GitHub Release 记录。

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

当前正式导出为包根入口、`/core`、`/react`、`/style.css`。此前讨论的 `/web`、通用原生渲染适配器和原生 SDK 都是后续方向，尚不存在；示例不能使用尚未实现的接口。

本引擎管理画布文档、交互和展示。模型参数 UI、API Key、工作流执行、文件系统、账号和系统签名属于宿主。每个业务节点应承载一种明确能力，复杂工作通过节点组合表达。
