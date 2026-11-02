# 独立仓库验证

2026-11-02，从 Canvas App 提取为独立 Canvas Engine 仓库，版本保持 0.2.4。

- 独立执行 npm ci；使用本仓库锁文件，未链接父工作区 node_modules。
- npm run check:boundaries、npm run build 通过；纯引擎与四个示例/实验场均构建成功。
- npm test：2 个文件、17 项引擎逻辑测试通过。这不是原 App 工作区的 35 项混合计数。
- /core 构建产物在 Node 无 DOM 环境导入通过。
- npm pack --dry-run：仅包含 dist、docs、README、CONTRIBUTING、CHANGELOG、LICENSE 和包清单。
- src 文件逐个与提取前源码核对完全一致；调整仅涉及独立配置、示例辅助模块、测试路径和文档。
- 拟上传内容经过凭据特征、个人路径及私有服务地址检查；未包含个人素材、应用 bundle 或签名材料。
- 原始性能 JSON 保留其历史时间和软件渲染环境，本轮未重新测量性能。

功能 E2E：10 项全部通过（35.8 秒），覆盖编辑/输入法守卫、拖动撤销、媒体保存播放、100 混合节点、生命周期、浮层、原生 TypeScript/React 示例和延迟资源删除。首次发现媒体示例初始 loadScene 覆盖过早添加节点，已通过就绪前禁用操作按钮修复并全量重跑通过。远端 CI 状态见 GitHub Actions。所有平台支持范围不因仓库上传而扩大；首次上传时许可证待选；随后项目所有者于 2026-11-02 确认采用 MIT，见 LICENSE。
