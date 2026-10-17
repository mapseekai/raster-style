# raster-style

Raster Style v3 的规范、JSON Schema 与 TypeScript / Go / Rust SDK。当前核心协议为 **3.0**，Query 绑定为 **Q3**，仓库 SDK 版本为 **0.4.0**。

核心定义波段与表达式、指数、重采样、校准、统计、拉伸、颜色映射、地形、颜色效果和透明度。扩展采用声明与配置分离的设计：版本化 Schema URL 写入 extensions，业务字段直接位于样式对象，由对应 Schema 定义。

## 样式示例

```json
{
  "version": "3.0",
  "extensions": [
    "https://mapseekai.github.io/raster-style/extensions/raster/mosaic/v1.0.0/schema.json",
    "https://mapseekai.github.io/raster-style/extensions/raster/tile/v1.0.0/schema.json"
  ],
  "renderer": { "type": "rgb", "bidx": [4, 3, 2] },
  "resampling": { "read": "bilinear", "reproject": "bilinear" },
  "stretch": { "method": "linear", "rescale": [[0, 3000]] },
  "opacity": 1,
  "raster:mosaic": { "pixel_selection": "first", "stage": "before_channels" },
  "raster:tile": { "format": "webp", "tilesize": 256, "quality": 85 }
}
```

Mosaic 承载多源像元选择、元组有效性、Alpha 与通道前后执行语义。Tile 的尺寸参与前置网格规划，格式、质量、无损和背景参数决定最终输出。核心样式可独立使用：

```json
{ "version": "3.0", "renderer": { "type": "gray", "bidx": [1] } }
```

## 规范与工程结构

| 入口                                                      | 内容                                              |
| --------------------------------------------------------- | ------------------------------------------------- |
| [核心规范](spec/v3/Raster-Style-Spec-v3.md)               | 核心渲染语义、扩展声明、组合校验与执行契约        |
| [Mosaic 1.0.0](extensions/raster/mosaic/v1.0.0/README.md) | 多源像元选择及完整样式 Schema                     |
| [Tile 1.0.0](extensions/raster/tile/v1.0.0/README.md)     | 前置网格、透明度、颜色空间和编码                  |
| [Q3 绑定](spec/v3/Raster-Style-Query.md)                  | 核心短参数、通用扩展 JSON、确定性排序与百分号编码 |
| [SDK](docs/SDK.md)                                        | 三语言接口、本地注册、完整性报告与执行能力检查    |
| [执行语义](spec/v3/Raster-Style-Execution.md)             | 数值计算、统计、Alpha、地形与参考向量             |
| [表达式档案](spec/v3/Raster-Expression-v1.md)             | raster-expr/1 语法与求值约定                      |
| [适配档案](spec/v3/Raster-Style-TiTiler-Profile.md)       | 后端映射、精确版本和渲染验收                      |
| [验证与安全](docs/VALIDATION.md)                          | 校验层次、错误码、预算和测试边界                  |
| [Schema 发布](docs/PUBLISHING.md)                         | 静态产物、版本地址与部署验证                      |

spec/v3 和 extensions/raster 是规范来源；packages/typescript、packages/go、crates/raster-style 提供 SDK；[examples](examples/README.md) 和 testdata 保存示例、本地示例 Schema 及共享测试。scripts 负责生成、数值参考计算、跨语言检查和静态发布构建。

## SDK 使用

### TypeScript

```ts
import {
  parseStyle,
  validateStyle,
  inspectStyle,
  encodeQuery,
  decodeQuery,
} from '@mapseek/raster-style';

const style = parseStyle('{"version":"3.0","renderer":{"type":"gray","bidx":[1]}}');
validateStyle(style);
const report = inspectStyle(style);
const query = encodeQuery(style);
const restored = decodeQuery(query);
```

### Go

```go
import rasterstyle "github.com/mapseekai/raster-style/packages/go"

if err := rasterstyle.ValidateJSON(styleJSON); err != nil {
    return err
}
query, err := rasterstyle.JSONToQuery(styleJSON)
if err != nil {
    return err
}
restored, err := rasterstyle.QueryToJSON(query)
```

Fiber v3 提供可复用 Decoder 和中间件，可运行示例位于 packages/go/examples/fiber/main.go。

### Rust

```rust
use raster_style::{validate_json, json_to_query, query_to_json};

validate_json(style_json)?;
let query = json_to_query(style_json)?;
let restored = query_to_json(&query)?;
```

上述核心示例对应 `bidx=1&type=gray&version=3.0`。

官方 Schema 内嵌并离线使用；第三方通过 SchemaRegistry 注册，可定义任意名称及多个业务字段。Query 使用 extensions 数组与 extension_fields 对象传输，无需为新增扩展修改绑定表。

编解码保留未知扩展的 JSON 语义，并提供未解析 Schema 报告。完整校验要求取得全部 Schema；执行前另行检查真实执行端支持的精确扩展 URL。详细调用见 SDK 文档。

## 开发与验证

工具链：Node.js 22+、pnpm 11.15.1、Go 1.25+、Rust 1.92.0、Python 3.10+。

```sh
pnpm install --frozen-lockfile
pnpm generate
pnpm build
pnpm test:all
```

全量检查包含资源一致性、格式化、TypeScript 类型及单元测试、Go vet/race、Rust fmt/clippy/test、数值参考向量、三语言 Query/JCS 往返和静态 Schema 发布产物。完整日志与报告输出到 .build。

```sh
pnpm format
gofmt -w packages/go
cargo fmt --all
pnpm build:site
```

协议版本、Query 绑定版本、SDK 版本和扩展版本分别管理。发布目录与校验资源使用显式版本；实际 npm、crates.io、Go tag 与 Pages 上线状态以发布记录为准，仓库版本号不代表已发布。

## 许可证

[MIT](LICENSE)。
