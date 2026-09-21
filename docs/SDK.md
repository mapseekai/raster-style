# SDK 接口与工程约定

## TypeScript

| 接口                           | 行为                                          |
| ------------------------------ | --------------------------------------------- |
| `encodeQuery(style, options?)` | JSON 对象 → 规范 Q2 查询串                    |
| `decodeQuery(query, options?)` | 原始查询串 → 已校验且规范化的 `RasterStyle`   |
| `jsonToQuery(json, options?)`  | 原始 JSON 文本 → 查询串；拒绝重复 JSON 键     |
| `queryToJson(query, options?)` | 原始查询串 → JCS JSON 文本                    |
| `parseStyle(json)`             | 严格解析 JSON、结构与静态语义校验、颜色规范化 |
| `normalizeStyle(value)`        | 返回校验后的副本，保留字段省略状态            |
| `validateStyle(value)`         | 校验失败时抛出 `RasterStyleError`             |
| `new QueryCodec(options)`      | 复用不可变预算配置                            |

`options` 包含 `maxQueryBytes` 和 `maxParameters`，显式指定时必须为正整数。解析外部 JSON 文本时使用 `parseStyle` 或 `jsonToQuery`，以保留重复键检测。

## Go

核心包接口：`ParseJSON([]byte)`、`EncodeQuery(*Style)`、`DecodeQuery(string)`、`JSONToQuery([]byte)`、`QueryToJSON(string)`。自定义预算通过 `NewCodec(Options)`，零字段表示使用默认预算，负数报配置错误。

`Style` 封装已校验的文档和 JCS 缓存。`Style.JSON()` 返回独立字节切片，`Style.Document()` 返回深拷贝。`json.Unmarshal` 校验成功后替换内容，失败时保留旧值。修改后的 map 需序列化为 JSON，再交给 `ParseJSON`。

文档封装保留可选字段的省略状态和可辨识联合类型（discriminated union）的结构。

Fiber v3 的 `Decoder` 复用核心 Codec，直接读取原始 `URI().QueryString()`，解析结果独立于请求生命周期。支持直接解析、JSON 字节输出和中间件。输入错误返回 HTTP 400，超限返回 414，内部配置失败返回 500。

## Rust

核心接口：`Style::from_json`、`Style::from_value`、`encode_query`、`decode_query`、`json_to_query`、`query_to_json`。自定义预算用 `Codec::new(Options)`。零预算为错误；`Options::default()` 提供默认值。

`Style` 支持 `Clone`、`Serialize`、`Deserialize`；通过 `as_value()` 只读访问，或通过 `into_value()` 取得内部值的所有权。原始文本使用 `Style::from_json` 检测重复键；`Style::from_value` 校验已解析的值。

签名或字节一致性比较使用 `Style::to_json()` 返回的 JCS 文本；普通 JSON 序列化可使用 `serde_json::to_string(&style)`。

## 生成与版本

`spec/v2/` 是唯一规范来源。`pnpm generate` 将 Schema 与绑定表同步为包内资源，并生成 TypeScript 类型。Go 使用 embed、Rust 使用 include_str、TypeScript 使用构建时导入，运行时直接读取内嵌资源。

`pnpm check:generated` 检查副本和类型与规范的一致性。规范版本、Query 绑定版本和 SDK 版本分开维护。新增字段时先修改 Schema 与绑定表，再同步三种语言的实现和测试。

命名和格式遵循语言习惯：TypeScript camelCase，Go PascalCase/camelCase，Rust snake_case；JSON 和 Q2 字段继续使用规范名称。
