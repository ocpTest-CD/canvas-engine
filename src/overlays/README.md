# overlays

入口：`floating.ts / overlays.ts`。

屏幕空间工具栏/下方面板，以及节点内按需编辑与播放；关闭时释放控件资源。

修改后运行对应单元或交互测试，以及 `npm run check:boundaries`。总体依赖见 [架构](../../docs/architecture.md)。

自定义 editor 可返回 HTMLElement 或 `{element, dispose}`；关闭/切换/销毁须恰好一次清理。媒体预览使用取消信号和 token 拒绝迟到结果，不能释放仍由其他解析调用拥有的 URL。

`execution.ts`：视口内常驻主操作及执行进度。仅呈现宿主状态；无 API、调度、密钥。CSS 动画不触发 WebGL 重绘，单个共享耗时时钟按可见活动节点启停，destroy 清理 listener/timer/DOM。

执行控件接入示例、LOD 与平台约束见 `docs/execution-controls.md`。

`titles.ts`：原位标题命中和瞬时输入框，管理 Enter/blur/Escape/IME 生命周期。只提交标题 patch；不修改节点类型、模型配置或媒体。loadScene/setReadOnly 同步清除旧命中区，避免渲染前的旧目标误接收点击。

- `issues.ts`：按视口定位错误边框、摘要与宿主回调；不负责校验规则、错误详情弹窗或执行。
