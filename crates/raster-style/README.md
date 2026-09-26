# raster-style

Raster Style Spec v2 的 Rust JSON ↔ Q2 查询参数编解码工具，支持结构与静态语义校验、颜色规范化和 RFC 8785 JSON 输出。

## 安装

```toml
[dependencies]
raster-style = "0.3.0"
```

## 使用

```rust
use raster_style::{json_to_query, query_to_json};

fn main() -> Result<(), raster_style::Error> {
    let style = r#"{"version":"2.0","renderer":{"type":"rgb","bidx":[4,3,2]}}"#;
    let query = json_to_query(style)?;
    let json = query_to_json(&query)?;
    println!("{json}");
    Ok(())
}
```

完整接口见 [SDK 使用说明](https://github.com/mapseekai/raster-style/blob/v0.3.0/docs/SDK.md)。

## 许可证

[MIT](LICENSE)。
