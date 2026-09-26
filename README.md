# raster-style

Raster Style Spec v2 的规范与多语言 Q2 编解码工具。当前协议为 `2.0`，SDK 版本为 `0.3.0`。

提供栅格像元渲染的样式规范，以及 TypeScript、Go、Rust 的 JSON ↔ Q2 查询参数转换、结构与语义校验、颜色规范化和 Fiber v3 适配层。

## 项目结构

```text
spec/v2/                    规范原文、JSON Schema、36 项 Query 绑定
examples/styles/            23 份完整配置示例
testdata/                   三种语言共用的正例、反例与 JCS 测试向量
packages/typescript/        浏览器 / Node.js 的严格 TypeScript 实现
packages/go/                Go 核心包
packages/go/fiber/          Fiber v3 便捷解析与中间件
crates/raster-style/        Rust 编解码核心库
scripts/                    资源同步、类型生成、跨语言校验
```

接口规范：[TiTiler 命名规范](spec/v2/Raster-Style-TiTiler-Profile.md)，包含统一字段、颜色公式和路由示例，Schema 与三语言 SDK 使用同一字段定义。

规范入口：[Raster Style Spec v2](spec/v2/Raster-Style-Spec-v2.md)。接口细节见 [SDK 使用说明](docs/SDK.md)，校验规则见 [验证与安全](docs/VALIDATION.md)。

像元规则见 [执行语义](spec/v2/Raster-Style-Execution.md)，表达式语法见 [raster-expr/1](spec/v2/Raster-Expression-v1.md)。渲染参考向量随工程检查运行；实际后端按 [TiTiler 适配档案](spec/v2/Raster-Style-TiTiler-Profile.md)独立验收。

## 开发

环境：Node.js 22+、pnpm 11.15.1、Go 1.25+、Rust 1.92.0（本项目验证工具链）、Python 3.10+。

```sh
pnpm install --frozen-lockfile
pnpm generate
pnpm build
pnpm test:all
```

`pnpm test:all` 检查生成资源、格式化、TypeScript 单元测试、Go vet/race、Rust fmt/clippy/test，并运行三语言交叉往返校验。首次构建会下载 Go/Rust 依赖。

格式化使用 Prettier、gofmt 和 rustfmt；规范文档和共享测试向量单独维护。

```sh
pnpm format
gofmt -w packages/go
cargo fmt --all
```

## TypeScript

```sh
npm install @mapseek/raster-style@0.3.0
```

```ts
import { encodeQuery, decodeQuery, jsonToQuery, queryToJson } from '@mapseek/raster-style';

const style = {
  version: '2.0',
  renderer: { type: 'rgb', bidx: [4, 3, 2] },
};

const query = encodeQuery(style);
const restored = decodeQuery(query);
const fromText = jsonToQuery(JSON.stringify(style));
const jsonText = queryToJson(fromText);
```

输出：

```text
bidx=4&bidx=3&bidx=2&type=rgb&version=2.0
```

支持浏览器和 Node.js，Schema 在构建时内嵌。TypeScript 类型从规范生成，运行时执行完整结构校验。

## Go

```sh
go get github.com/mapseekai/raster-style/packages/go@v0.3.0
```

```go
query, err := rasterstyle.JSONToQuery(styleJSON)
if err != nil {
    return err
}

jsonBytes, err := rasterstyle.QueryToJSON(query)
if err != nil {
    return err
}
```

导入路径：`github.com/mapseekai/raster-style/packages/go`。本地项目可通过 `go work use` 或 `replace` 引用。

## Fiber v3

```go
import (
    "github.com/gofiber/fiber/v3"
    rasterstyle "github.com/mapseekai/raster-style/packages/go"
    stylefiber "github.com/mapseekai/raster-style/packages/go/fiber"
)

decoder, err := stylefiber.NewDecoder(rasterstyle.Options{})
if err != nil {
    return err
}

app.Get("/raster-style", func(c fiber.Ctx) error {
    style, err := decoder.Parse(c)
    if err != nil {
        return err
    }
    return c.JSON(style)
})
```

原始 JSON 输出使用 `decoder.JSON(c)`。多个处理步骤可通过 `decoder.Middleware()` 和 `stylefiber.FromContext(c)` 共享解析结果。Decoder 直接读取原始查询串，保留重复波段参数及其顺序。

完整可运行示例：`packages/go/examples/fiber/main.go`。

## Rust

```rust
use raster_style::{json_to_query, query_to_json};

let query = json_to_query(style_json)?;
let restored_json = query_to_json(&query)?;
```

依赖配置：

```toml
[dependencies]
raster-style = "0.3.0"
```

## 分组样式

JSON 按 renderer、resampling、stretch、effects、image 分组。opacity 是 0–1 的全局透明度，nodata 指定统一无效值。

```json
{
  "version": "2.0",
  "renderer": { "type": "rgb", "bidx": [4, 3, 2] },
  "resampling": { "read": "bilinear", "reproject": "bilinear" },
  "stretch": { "method": "linear", "rescale": [[0, 3000]] },
  "nodata": -9999,
  "effects": {
    "color_formula": [{ "op": "gamma", "channels": "rgb", "value": 1.1 }],
    "post_color_formula": [{ "op": "brightness", "channels": "rgb", "value": 0.05 }]
  },
  "opacity": 1,
  "image": { "format": "png", "tilesize": 256 }
}
```

color_formula 在颜色映射前执行，post_color_formula 调整渲染后的颜色。两组数组均保留操作顺序及重复操作，Query 使用同名公式字符串。完整参数见 [规范](spec/v2/Raster-Style-Spec-v2.md)。

## 传输契约

JSON 分组路径对应简短 Query 名称：renderer.bidx → bidx、stretch.rescale → rescale、resampling.read → resampling。SDK 在对象数组与公式字符串之间转换，并校验参数范围和通道选择。

Query 按键排序，重复 bidx/rescale 保留数组顺序。空格编码为 %20，加号为 %2B。默认预算为 8192 字节、256 个参数，JSON 为 2 MiB、深度 64。

SDK 保留可选字段的省略状态，并在颜色操作中补全默认 channels：映射前单通道为 r，其他情况为 rgb。颜色规范化为小写八位 RGBA；数值使用 RFC 8785。expression 保留内部原文并去除各输出两端的 ASCII 空白。

渲染服务执行数据绑定、统计、表达式、颜色计算和图像输出，管理 url、授权、TMS、bbox 等请求上下文。

## 版本

SDK 版本为 `0.3.0`。npm 包为 `@mapseek/raster-style`，Rust crate 为 `raster-style`；Go 核心包与 Fiber 适配层通过同一个 Go 模块发布。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
