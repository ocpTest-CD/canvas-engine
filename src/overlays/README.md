# overlays

入口：`floating.ts / overlays.ts`。

屏幕空间工具栏/下方面板，以及节点内按需编辑与播放；关闭时释放控件资源。

修改后运行对应单元或交互测试，以及 `npm run check:boundaries`。总体依赖见 [架构](../../docs/architecture.md)。

自定义 editor 可返回 HTMLElement 或 `{element, dispose}`；关闭/切换/销毁须恰好一次清理。媒体预览使用取消信号和 token 拒绝迟到结果，不能释放仍由其他解析调用拥有的 URL。
