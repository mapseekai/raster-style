# raster-style

Raster Style Spec v2 的规范与多语言 Q2 编解码工具。当前协议为 `2.0`，采用 `2.0.0-draft.3`，SDK 版本为 `0.1.0`。

提供栅格像元渲染的样式规范，以及 TypeScript、Go、Rust 的 JSON ↔ Q2 查询参数转换、结构与语义校验、颜色规范化和 Fiber v3 适配层。

## 项目结构

```text
spec/v2/                    规范原文、JSON Schema、46 项 Query 绑定
examples/styles/            18 份完整配置示例
testdata/                   三种语言共用的正例、反例与 JCS 测试向量
packages/typescript/        浏览器 / Node.js 的严格 TypeScript 实现
packages/go/                Go 核心包
packages/go/fiber/          Fiber v3 便捷解析与中间件
crates/raster-style/        Rust 编解码核心库
scripts/                    资源同步、类型生成、跨语言校验
```

规范入口：[Raster Style Spec v2](spec/v2/Raster-Style-Spec-v2.md)。接口细节见 [SDK 使用说明](docs/SDK.md)，校验规则见 [验证与安全](docs/VALIDATION.md)。

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
npm install @mapseek/raster-style@0.1.0
```

```ts
import { encodeQuery, decodeQuery, jsonToQuery, queryToJson } from '@mapseek/raster-style';

const style = {
  version: '2.0',
  channels: { kind: 'bands', bands: [4, 3, 2] },
  renderer: { type: 'rgb' },
};

const query = encodeQuery(style);
const restored = decodeQuery(query);
const fromText = jsonToQuery(JSON.stringify(style));
const jsonText = queryToJson(fromText);
```

输出：

```text
bidx=4&bidx=3&bidx=2&renderer=rgb&rsv=2.0&selector=bands
```

支持浏览器和 Node.js，Schema 在构建时内嵌。TypeScript 类型从规范生成，运行时执行完整结构校验。

## Go

```sh
go get github.com/mapseekai/raster-style/packages/go@v0.1.0
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
raster-style = "0.1.0"
```

## 传输契约

编码器输出查询参数串，解码器兼容一个开头的 `?`。键按字典序输出，重复键保留数组顺序。空格编码为 `%20`，加号编码为 `%2B`；裸 `+` 会触发编码错误。

默认限额：查询串 8192 字节、256 个参数，JSON 2 MiB、嵌套深度 64。Query 预算可调整，每次转换均执行结构和语义校验。超长配置通过外层服务的样式引用传输。

颜色字段规范化为小写 `#rrggbbaa`，数值使用 binary64 / RFC 8785 语义。转换保留可选字段的省略状态和扩展配置的原值。

服务集成时，由渲染后端完成数据绑定、统计计算、表达式执行和瓦片渲染，并检查配置支持情况。`url`、鉴权、TMS、bbox 等上下文参数通过独立的业务白名单入口处理。

## 版本

SDK 版本为 `0.1.0`。npm 包为 `@mapseek/raster-style`，Rust crate 为 `raster-style`；Go 核心包与 Fiber 适配层通过同一个 Go 模块发布。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
