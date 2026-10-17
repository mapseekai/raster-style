# raster-style — Rust

Raster Style 3.0 与 Q3 的严格 JSON / Query 编解码、离线 Schema 注册、静态语义校验和规范化。仓库 SDK 版本为 0.4.0；实际发布状态以包仓库和 Git tag 为准。

```rust
use raster_style::{Style, validate_json, encode_query};
validate_json(style_json)?;
let style = Style::from_json(style_json)?;
let query = encode_query(&style)?;
```

核心字段保留渲染、重采样、校准、统计、拉伸、颜色效果和透明度语义。Mosaic 和 Tile 通过版本化 Schema URL 声明，配置为顶层 raster:mosaic 与 raster:tile。核心样式可独立使用。

SchemaRegistry 内置两个官方扩展及核心 Schema，并支持注册第三方完整样式 Schema。字段位置和结构由 Schema 定义，不从 URL 推导。第三方可定义多个字段，Query 通用传输无需增加专用绑定。

解析保留未取得 Schema 的扩展，完整校验接口拒绝未验证状态。执行端须另行检查精确版本支持；Schema 通过不等于已实现扩展业务。默认解析与校验离线进行，仅显式 resolve 回调会调用应用提供的解析器。

接口、预算、错误码和示例见[SDK 文档](../../docs/SDK.md)、[核心规范](../../spec/v3/Raster-Style-Spec-v3.md)与[Q3 绑定](../../spec/v3/Raster-Style-Query.md)。
