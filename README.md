# raster-style

Raster Style Spec v2 的规范与多语言 Q2 编解码工具。当前协议为 `2.0`，采用 `2.0.0-draft.3`，SDK 版本为 `0.1.0`。

本项目只描述栅格像元的样式渲染，不定义图例、专题图分级向导或版面。提供 TypeScript、Go、Rust 的 JSON ↔ Q2 查询参数转换，以及独立的 Fiber v3 适配层。

## 项目结构

```text
spec/v2/                    规范原文、JSON Schema、46 项 Query 绑定
examples/styles/            18 份完整配置示例
testdata/                   三种语言共用的正例、反例与 JCS 测试向量
packages/typescript/        浏览器 / Node.js 的严格 TypeScript 实现
packages/go/                Go 核心包
packages/go/fiber/          Fiber v3 便捷解析与中间件
crates/raster-style/        不依赖 Web 框架的 Rust crate
scripts/                    资源同步、类型生成、跨语言校验
```

规范入口：[Raster Style Spec v2](spec/v2/Raster-Style-Spec-v2.md)。接口细节见 [SDK 使用说明](docs/SDK.md)，验证边界见 [验证与安全](docs/VALIDATION.md)。

## 开发

环境：Node.js 22+、pnpm 11.15.1、Go 1.25+、Rust 1.92.0（本项目验证工具链）、Python 3.10+。

```sh
pnpm install --frozen-lockfile
pnpm generate
pnpm build
pnpm test:all
```

`pnpm test:all` 检查生成资源、格式化、TypeScript 单元测试、Go vet/race、Rust fmt/clippy/test，并运行三语言交叉往返校验。首次构建会下载 Go/Rust 依赖。

格式化使用 Prettier、gofmt 和 rustfmt；规范原文和共享测试向量不自动改写。

```sh
pnpm format
gofmt -w packages/go
cargo fmt --all
```

## TypeScript

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

浏览器入口没有 `node:fs`、`Buffer` 或服务器依赖，Schema 在构建时内嵌。TypeScript 类型从规范生成，运行时仍做完整结构校验。

## Go

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

导入路径：`github.com/mapseekai/raster-style/packages/go`。当前尚未推送或发布该模块，其他本地项目通过 `go work use` 或 `replace` 引用。

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

更直接的原始 JSON 输出用 `decoder.JSON(c)`。多个处理步骤共享样式时使用 `decoder.Middleware()` 和 `stylefiber.FromContext(c)`，无需重复解析。不要先调用 `c.Queries()` 再交给本库，否则重复波段参数可能丢失。

完整可运行示例：`packages/go/examples/fiber/main.go`。

## Rust

```rust
use raster_style::{json_to_query, query_to_json};

let query = json_to_query(style_json)?;
let restored_json = query_to_json(&query)?;
```

本地依赖：

```toml
[dependencies]
raster-style = { path = "../raster-style/crates/raster-style" }
```

## 传输契约

查询串不包含完整 URL 和开头的 `?`；解码时兼容一个开头的 `?`。键按字典序输出，重复键保留数组顺序。空格编码成 `%20`，加号编码成 `%2B`；裸 `+` 被拒绝，不按表单规则转换为空格。

默认限额：查询串 8192 字节、256 个参数，JSON 2 MiB、嵌套深度 64。可调整 Query 预算，不能关闭结构或语义校验。超长配置应走外层样式引用，而不是在这个库里偷偷截断。

颜色规范化为小写 `#rrggbbaa`，数值使用二进制 64 位 / RFC 8785 语义。省略的可选字段仍然省略，不补全引擎默认值；扩展配置不参与颜色改写。

**Q2 不是 TiTiler 原生参数适配器。** 本库不解析数据源、不计算统计、不执行表达式、不渲染瓦片，也不承诺下游引擎支持所有合法配置。`url`、鉴权、TMS、bbox 等外层参数应在调用前按业务白名单单独处理，不能与 Q2 混入同一解析入口。

## 发布状态

当前为本地开发项目，没有创建远程仓库、提交 Git 记录或发布 npm/Go/crates.io 包。依赖固定在锁文件中；未指定项目对外开源许可证。
