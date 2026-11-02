# 兼容政策

0.2 引擎采用场景 version=1 的向后兼容扩展：Node 增加可选 sizeMode 和 media。旧项目不自动重排、不批量调整尺寸；显式“适配内容”可撤销。

App 便携项目 envelope、assets 和 appState 继续由宿主管理。引擎不接管含模型配置的项目格式。

公开入口限定 index/web/core/react/style.css；src 内部目录不保证稳定。当前0.x尚无跨小版本稳定性承诺，升级需运行保存/重开/撤销及媒体回归。

当前极端长宽比受8～10000世界单位校验约束；超过这一可表达范围时会限制最短边，普通横竖图保持原比例。完整媒体仍可在预览中查看。文本高度为估算，不等同排版引擎；编辑区可滚动查看全部内容。

项目采用 [MIT 许可证](../LICENSE)，已公开到组织仓库。包保持 private 以防意外发布 npm；尚未发布 npm 或正式稳定发行版。第三方依赖保留各自许可证。

## 升级到 0.3.0

- 场景 version 1 不变；保存重开不需要批量迁移几何。
- canConnect 与端口规则现在约束 loadScene/applyChanges，旧有不合法连线会拒绝。先清理或迁移业务数据，避免放宽成始终 true 来掩盖错误。
- `engine.on` 现在只接受 EngineEvents 定义的事件名；任意自定义字符串应移到宿主事件总线。
- 非历史的结构变更清空撤销/重做；请使用 history=true 提交需要撤销的增删/连线操作。
- 资源默认 30 秒超时；慢速宿主可显式配置，并接入 AbortSignal。原解析器一参数签名兼容。
- 自定义 editor 可返回 `{ element, dispose }`；原 HTMLElement 返回值兼容。
- `/web` 为根入口别名；bridge 是 JSON 消息处理器，不是 Swift/Kotlin 或可替换原生 renderer。
