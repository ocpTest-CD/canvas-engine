# 独立引擎交付边界

仓库：https://github.com/ocpTest-CD/canvas-engine。包版本 0.3.0，场景 version 1。源码已从 Canvas App 工作区提取，拥有独立构建配置、锁文件、示例、测试和 CI，不依赖父工作区。

## 公开范围

- 引擎 src、公开类型、CSS、模块说明及依赖边界检查。
- 最小 TypeScript、React、自定义节点和媒体示例，以及诊断实验场。
- 自包含逻辑/交互测试；fixtures 是代码/FFmpeg 合成素材，不含个人 TVC。
- 可复测 benchmark 脚本及明确标注环境的历史原始记录。
- API、平台、架构、兼容、性能、贡献指南和 CHANGELOG。

实验场的 IndexedDB/便携 JSON 辅助代码复制到 playground/assets.ts，只作为宿主示例，不属于引擎核心。根目录 package.json、锁文件、Vite/TypeScript/Playwright 配置独立维护。0.3.0 已升级增量文档、连线索引、资源生命周期、触摸和桥接接口，详见 CHANGELOG。

## 排除范围

不包含 Canvas App 业务 UI、Electron 产品宿主、模型服务适配/Key、个人项目、聊天记录、系统密钥库、签名证书/私钥、测试账号、打包应用、历史备份或个人绝对路径。node_modules、dist、site-dist、测试截图和输出不进入 Git。

## 版本与许可

项目所有者已于 2026-11-02 确认采用 [MIT 许可证](../LICENSE)，源码按 MIT 开源。package.json 保持 private，仅避免误发布 npm；第三方依赖仍适用各自许可证。现阶段不创建虚构的早期 tag，也不把源码上传当作正式稳定 release。

引擎源码和 npm 构建不需要 Apple 签名。使用者若发行桌面 App，自行配置其发布证书，不需要本项目作者的个人 Key。

## 接入与维护

参见 [接入指南](integration.md)、[API](api.md)、[平台矩阵](platforms.md)和[性能说明](performance.md)。支持状态与原代码保持一致，没有因上传而新增 Tauri、移动或纯原生 SDK。

Canvas App 下游改为安装此独立包属于后续集成任务，当前未更改用户桌面 App。提取后的接口通过独立构建、逻辑/交互测试和包清单验证；提取时验证见 [独立仓库验证](standalone-validation.md)，当前升级验证见 [0.3.0 质量评审](quality-0.3.md)。

npm 包 files 清单只包含 dist、README、CONTRIBUTING、CHANGELOG、docs、LICENSE。tests/examples/benchmarks 源码保留在 GitHub 仓库；包中文档指向这些目录的相对链接请在仓库中阅读。
