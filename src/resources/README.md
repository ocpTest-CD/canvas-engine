# resources

入口：`resources.ts / media.ts`。

限制并发的缩略图/视频封面解码、缓存、取消和释放。metadata使用原始尺寸。

修改后运行对应单元或交互测试，以及 `npm run check:boundaries`。总体依赖见 [架构](../../docs/architecture.md)。

0.3 的资源配置涵盖软预算、条目数、并发和超时。解析器可接收 AbortSignal；超时或取消释放调度槽，忽略取消的迟到结果仍需释放 URL。bytes 为增量账面值，只有超预算才排序淘汰。新增行为需覆盖超时、取消、迟到、释放异常与重试。
