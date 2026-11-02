# 性能测量

当前参数、复杂度和原始结果解读见[性能说明](../docs/performance.md)。latest.json 记录的是 2026-11-02 Chromium 141 / SwiftShader 软件渲染，不是早期报告中的 Metal 数据，也不是 0.2.4 的新一轮测量。运行脚本会覆盖该文件，复测前应保存独立历史记录。

启动实验场后执行 `npm run benchmark`。可设置 CANVAS_URL 指向稳定的生产预览，避免 HMR 干扰；CANVAS_BROWSER 指定 Chromium 可执行文件；CANVAS_HEADED=1 启用有窗口模式；在 Mac 上 CANVAS_METAL=1 请求 ANGLE Metal。报告会记录实际 GPU，不能只凭启动参数声称硬件渲染。

`run.mjs` 写入 `latest.json`，记录环境和 100/1000/10000 合成场景。`software-renderer.json` 为早期软件渲染对照，不能用作最终硬件性能证据。`preview.mjs` 生成浅深主题截图。

[开发验收报告](../docs/performance.md)
