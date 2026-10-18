# raster-style

Raster Style 用结构化 JSON 描述栅格样式，并通过 Q3 查询参数传递配置。项目包含样式规范、JSON Schema，以及 TypeScript、Go、Rust SDK，为样式编辑、配置存储和服务请求提供统一的校验与编解码接口。

当前核心协议为 **3.0**，查询绑定为 **Q3**，仓库 SDK 源码版本为 **0.4.0**。官方 Mosaic 与 Tile 扩展均采用 **1.0.0** 版本的独立 Schema。

## 主要能力

| 领域           | 能力                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| 输入与渲染配置 | 波段选择、`raster-expr/1` 表达式和指数绑定；RGB、灰度、伪彩色、分类、单色、山体阴影和晕渲样式                    |
| 数值处理语义   | 读取与重投影重采样、像元校准、NoData、统计范围与快照，以及线性、最小最大值、百分位、标准差、直方图均衡和曲线拉伸 |
| 颜色与透明度   | 连续色带、离散分级、精确值色表、命名色表；有序颜色操作、RGBA 颜色规范化和全局透明度                              |
| 扩展配置       | 通过版本化 Schema 声明扩展，由扩展 Schema 定义顶层业务字段；官方扩展描述多源镶嵌和瓦片输出参数                   |
| 样式校验       | 严格 JSON 解析、JSON Schema 2020-12 组合校验、静态语义检查、校验完整性报告和精确扩展版本的执行能力检查           |
| 配置传输       | JSON 与 Q3 双向转换、JCS 规范化序列化、确定性参数排序，以及重复参数顺序和扩展 JSON 语义保留                      |
| 多语言集成     | TypeScript、Go、Rust 共用 Schema、Q3 绑定与测试向量；Go 另提供 Fiber v3 请求解码器和中间件                       |

样式规范定义参数及其处理语义，SDK 提供解析、校验、规范化和传输接口。渲染服务可依据[执行语义](spec/v3/Raster-Style-Execution.md)和[适配档案](spec/v3/Raster-Style-TiTiler-Profile.md)完成数据绑定与像元处理集成。

## 工具链

TypeScript 快速开始使用 Node.js 和 pnpm；工作区全量验证同时使用 Go、Rust 和 Python。

| 工具                               | 开发要求 | CI 固定版本 | 用途                                     |
| ---------------------------------- | -------- | ----------- | ---------------------------------------- |
| [Node.js](https://nodejs.org/)     | 22+      | 22.23.3     | TypeScript SDK、资源生成与站点构建       |
| [pnpm](https://pnpm.io/)           | 11.15.1  | 11.15.1     | 工作区依赖安装、构建与验证命令           |
| [Go](https://go.dev/)              | 1.25+    | 1.25.0      | Go SDK、Fiber 集成与并发测试             |
| [Rust](https://www.rust-lang.org/) | 1.92.0   | 1.92.0      | Rust SDK、Clippy 与发布包验证            |
| [Python](https://www.python.org/)  | 3.10+    | 3.12.3      | 全量检查、数值参考计算与跨语言一致性验证 |

CI 与 Pages 共用 `.node-version`；CI 的 Python 版本来自 `.python-version`，pnpm、Go 和 Rust 分别读取 `package.json`、`packages/go/go.mod` 和 `rust-toolchain.toml`。Node.js 随附 npm 10.9.9，Rust 工具链包含 `rustfmt` 和 `clippy`。

工作流记录并核对实际工具链版本，Go 使用 `GOTOOLCHAIN=local`。Actions 使用完整提交 SHA，依赖安装使用锁文件，版本升级通过仓库变更显式管理。

## 快速开始

获取仓库并构建 TypeScript SDK：

```sh
git clone https://github.com/mapseekai/raster-style.git
cd raster-style
pnpm install --frozen-lockfile
pnpm build
```

在仓库根目录运行 JSON 与 Q3 转换示例：

```sh
node --input-type=module <<'JS'
import { jsonToQuery, queryToJson } from './packages/typescript/dist/index.js';

const json = '{"version":"3.0","renderer":{"type":"gray","bidx":[1]}}';
const query = jsonToQuery(json);
console.log(query);
console.log(queryToJson(query));
JS
```

输出：

```text
bidx=1&type=gray&version=3.0
{"renderer":{"bidx":[1],"type":"gray"},"version":"3.0"}
```

## 样式配置

下例描述第 4、3、2 波段组成的 RGB 样式，使用双线性重采样和固定范围拉伸，并声明多源镶嵌与 WebP 瓦片输出配置：

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

`extensions` 保存扩展 Schema 的版本 URL；`raster:mosaic` 和 `raster:tile` 是相应 Schema 定义的业务字段。

| 官方扩展                                                  | 配置内容                                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Mosaic 1.0.0](extensions/raster/mosaic/v1.0.0/README.md) | `first`、`highest`、`lowest`、`mean`、`median` 像元选择策略，通道计算前后镶嵌，以及元组有效性和 Alpha 语义 |
| [Tile 1.0.0](extensions/raster/tile/v1.0.0/README.md)     | 瓦片尺寸，PNG、WebP、JPEG 输出格式，质量、无损 WebP 和 JPEG 背景合成参数                                   |

核心与官方扩展 Schema 内嵌于三个 SDK，支持本地离线校验。`SchemaRegistry` 提供第三方 Schema 注册和应用自定义解析函数，按 JSON Schema 2020-12 组合核心、扩展及引用资源。一个扩展 Schema 可定义多个顶层业务字段。

更多配置见[示例目录](examples/README.md)，包含指数、表达式、颜色映射、地形、拉伸、颜色操作和第三方扩展样式。

## SDK 接口

三个 SDK 提供对应的样式解析、完整校验、查询编解码和 Schema 注册接口：

| 接口用途       | TypeScript                    | Go                            | Rust                            |
| -------------- | ----------------------------- | ----------------------------- | ------------------------------- |
| 样式解析       | `parseStyle`                  | `ParseJSON`                   | `Style::from_json`              |
| 完整校验       | `validateStyle`               | `ValidateJSON`                | `validate_json`                 |
| JSON 转 Q3     | `jsonToQuery`                 | `JSONToQuery`                 | `json_to_query`                 |
| Q3 转 JSON     | `queryToJson`                 | `QueryToJSON`                 | `query_to_json`                 |
| 对象与 Q3 转换 | `encodeQuery` / `decodeQuery` | `EncodeQuery` / `DecodeQuery` | `encode_query` / `decode_query` |
| Schema 注册    | `SchemaRegistry.register`     | `SchemaRegistry.Register`     | `SchemaRegistry::register`      |

校验报告提供完整性状态与待解析 Schema 列表。执行能力检查使用渲染端声明的精确扩展 URL 集合，为配置校验与执行端版本匹配提供接口。

Go 的 Fiber v3 集成支持原始查询串解析、JSON 输入、请求中间件和上下文取值。可运行示例见 [Fiber 示例](packages/go/examples/fiber/main.go)。

完整调用示例和接口说明见 [SDK 文档](docs/SDK.md)，各语言入口为 [TypeScript](packages/typescript/README.md)、[Go](packages/go/README.md) 和 [Rust](crates/raster-style/README.md)。

## 文档与代码结构

| 入口                                                           | 内容                                          |
| -------------------------------------------------------------- | --------------------------------------------- |
| [核心规范](spec/v3/Raster-Style-Spec-v3.md)                    | 配置分组、字段、默认语义和组合校验契约        |
| [Q3 绑定](spec/v3/Raster-Style-Query.md)                       | 查询参数、扩展字段传输、排序与百分号编码      |
| [执行语义](spec/v3/Raster-Style-Execution.md)                  | 有效性、重采样、统计、颜色、地形和数值计算    |
| [表达式档案](spec/v3/Raster-Expression-v1.md)                  | `raster-expr/1` 语法、函数与求值约定          |
| [适配档案](spec/v3/Raster-Style-TiTiler-Profile.md)            | 渲染服务映射和验收契约                        |
| [校验说明](docs/VALIDATION.md)                                 | 校验流程、错误码和输入预算                    |
| [Schema 校验实现](docs/SCHEMA-VALIDATION.md)                   | 组合校验、数值与正则处理、缓存和回归用例      |
| [Schema 发布](docs/PUBLISHING.md)                              | 站点构建、版本化资源和发布验证                |
| `spec/v3/`、`extensions/raster/`                               | 核心规范、Q3 绑定和官方扩展的来源文件         |
| `packages/typescript/`、`packages/go/`、`crates/raster-style/` | 三个语言 SDK 的源码与测试                     |
| `examples/`、`testdata/`                                       | 样式示例、示例 Schema 和共享测试向量          |
| `scripts/`、`.github/workflows/`                               | 资源生成、验证、参考计算及 CI 与 Pages 工作流 |

## 开发与验证

生成资源并运行全量验证：

```sh
pnpm generate
pnpm check:generated
pnpm build
pnpm test:all
```

全量验证覆盖生成资源一致性、格式检查、TypeScript 类型与单元测试、Go vet 和 race 测试、Rust fmt、Clippy、单元及文档测试、数值参考向量、三语言 JSON/Q3 与 JCS 一致性、独立 Rust 发布包测试和静态站点构建。验证报告写入 `.build/`。

Schema 站点构建与线上内容核对：

```sh
pnpm build:site
pnpm check:published
```

[Schema 站点](https://mapseekai.github.io/raster-style/)发布核心与官方扩展的版本化资源，[资源索引](https://mapseekai.github.io/raster-style/schemas.json)记录各资源 URL 和 SHA-256。`main` 分支推送通过 CI 后，Pages 工作流构建并部署对应提交的站点内容。

## 参与贡献

开发与测试约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。协议或 Schema 调整时，同步更新规范来源、共享测试、生成资源和相关文档，并运行全量验证。

项目反馈和功能建议可提交至 [GitHub Issues](https://github.com/mapseekai/raster-style/issues)。

## 许可证

项目采用 [MIT 许可证](LICENSE)。
