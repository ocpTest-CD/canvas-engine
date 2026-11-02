# 贡献指南

先读 README.md、docs/README.md、docs/architecture.md 和待修改模块的 README。保持引擎不依赖 App、Electron、模型服务或个人环境。本项目采用 [MIT 许可证](LICENSE)；第三方依赖保留各自许可。

在本仓库根目录运行：

```sh
npm ci
npm run check:boundaries
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run check:package
```

Playwright 独占 localhost:4327，不复用其他项目的开发服务器。Chromium 功能回归默认 SwiftShader 软件渲染，不能作为硬件性能结论。fixtures 使用代码/FFmpeg 合成；测试不需要模型 Key、个人 TVC 或 Electron。

性能复测见 [性能说明](docs/performance.md)。benchmark 默认访问 localhost:4317，可用 CANVAS_URL 更改；运行前保留历史 JSON，结果注明硬件、后端、版本和场景。

公开 API、场景结构和资源生命周期改变时更新 docs 与 CHANGELOG；提交说明包含行为、迁移和验证。npm 包和源码仓库内容分别审核，禁止上传账号、私钥、个人素材或打包桌面应用。

依赖安装使用仓库 .npmrc 的 legacy-peer-deps 设置，避开 npm 10 对测试工具可选 peer 的解析异常；运行依赖版本通过 package-lock.json 固定，CI 使用相同设置。

新增跨浏览器行为时执行：

```sh
npx playwright install chromium firefox webkit
npm run test:cross-browser
```

新增 quality benchmark 使用生产预览 4337、不可覆盖的时间戳结果，并记录源码 SHA256；详见性能文档。避免同时运行浏览器回归与性能测试。CI 定义覆盖三种桌面 OS 构建/Chromium，以及 macOS 三浏览器；实际运行状态以对应 commit 的 CI 为准。
