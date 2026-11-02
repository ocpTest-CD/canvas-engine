# 引擎测试

根目录 `npm test` 执行 Vitest，`npm run test:e2e` 执行 Playwright。运行前安装 Chromium，或通过 CANVAS_BROWSER 指定本机浏览器；CANVAS_URL 可切换到稳定生产预览。

fixtures 中 sample.webm、sample.mp4 和 sample.wav 为 FFmpeg 生成的纯色动画与正弦音测试素材，不包含第三方内容。

[测试结果与边界](../docs/performance.md)
