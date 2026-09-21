# SDK 接口与工程约定

## TypeScript

| 接口                           | 行为                                          |
| ------------------------------ | --------------------------------------------- |
| `encodeQuery(style, options?)` | JSON 对象 → 规范 Q2 查询串                    |
| `decodeQuery(query, options?)` | 原始查询串 → 已校验且规范化的 `RasterStyle`   |
| `jsonToQuery(json, options?)`  | 原始 JSON 文本 → 查询串；拒绝重复 JSON 键     |
| `queryToJson(query, options?)` | 原始查询串 → JCS JSON 文本                    |
| `parseStyle(json)`             | 严格解析 JSON、结构与静态语义校验、颜色规范化 |
| `normalizeStyle(value)`        | 克隆并校验，不修改原对象、不补默认值          |
| `validateStyle(value)`         | 不合法时抛出 `RasterStyleError`               |
| `new QueryCodec(options)`      | 复用不可变预算配置                            |

`options` 包含 `maxQueryBytes` 和 `maxParameters`，显式指定时必须为正整数。处理不受信任的 JSON 文本时，应使用 `parseStyle` 或 `jsonToQuery`；先调用原生 `JSON.parse` 会丢失重复键的证据。

## Go

核心包接口：`ParseJSON([]byte)`、`EncodeQuery(*Style)`、`DecodeQuery(string)`、`JSONToQuery([]byte)`、`QueryToJSON(string)`。自定义预算通过 `NewCodec(Options)`，零字段表示使用默认预算，负数报配置错误。

`Style` 使用私有文档和 JCS 缓存，不允许绕过验证直接修改。`Style.JSON()` 返回独立字节切片；`Style.Document()` 返回深拷贝。`json.Unmarshal` 会验证再替换，失败不损坏旧值。修改后的 map 应重新 JSON 序列化并交给 `ParseJSON`。

这种文档封装刻意保留“字段省略”和 discriminated union 的精确传输语义，不使用 `map[string]string`，也不让 Go 零值自动补齐未提供的选项。

Fiber 的 `Decoder` 持有核心 Codec，读取原始 `URI().QueryString()`，不持有 context 或请求缓冲区。错误对应 HTTP 400；超限对应 414；内部配置失败对应 500。提供直接解析、JSON 字节输出及中间件三种用法。当前支持 v3，不隐含承诺兼容 v2。

## Rust

核心接口：`Style::from_json`、`Style::from_value`、`encode_query`、`decode_query`、`json_to_query`、`query_to_json`。自定义预算用 `Codec::new(Options)`。零预算为错误；`Options::default()` 提供默认值。

`Style` 可 `Clone`、`Serialize`、`Deserialize`，只暴露只读 `as_value()` 或消费所有权的 `into_value()`。不提供可绕过验证的 `as_value_mut()`。原始文本入口保留重复 JSON 键检测，`Style::from_value` 无法恢复已被调用方丢弃的重复键。

`Style::to_json()` 返回 JCS 文本；普通 `serde_json::to_string(&style)` 是合法 JSON，但不应当用于依赖字节一致性的签名或比较。

## 生成与版本

`spec/v2/` 是唯一规范来源。`pnpm generate` 将 Schema 与绑定表同步为包内资源，并生成 TypeScript 类型。Go 使用 embed、Rust 使用 include_str、TypeScript 使用构建时导入；运行时不访问规范文件路径或网络。

`pnpm check:generated` 确保副本和类型没有漂移。规范版本、Query 绑定版本和 SDK 版本分开维护。新增字段时先修改 Schema 与绑定表，再补三语言测试；不能只修改某一个语言包。

命名和格式遵循语言习惯：TypeScript camelCase，Go PascalCase/camelCase，Rust snake_case；JSON 和 Q2 字段继续使用规范名称。
