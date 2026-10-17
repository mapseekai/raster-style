# Raster Style v3 SDK

TypeScript、Go、Rust 共用核心 3.0 Schema、官方 Mosaic/Tile Schema 和 Q3 绑定。配置保留、完整校验、执行能力是三个独立步骤。原始 JSON 使用严格解析接口，以检测重复键、非法 Unicode 和非有限数值。

## TypeScript

```ts
import {
  parseStyle,
  inspectStyle,
  validateStyle,
  requireExtensionSupport,
  SchemaRegistry,
  TILE_SCHEMA_URL,
  encodeQuery,
  decodeQuery,
} from '@mapseek/raster-style';

const style = parseStyle(
  JSON.stringify({
    version: '3.0',
    extensions: [TILE_SCHEMA_URL],
    renderer: { type: 'gray', bidx: [1] },
    'raster:tile': { format: 'webp', tilesize: 256, quality: 85 },
  }),
);

validateStyle(style); // 核心、所有扩展 Schema 和静态语义均须通过。
const report = inspectStyle(style); // { complete: true, unresolvedSchemas: [] }
const query = encodeQuery(style);
const restored = decodeQuery(query);

// 列表来自真实执行端的能力声明，不是从 extensions 自动复制。
requireExtensionSupport(restored, [TILE_SCHEMA_URL]);
```

| 接口                                                | 契约                                                       |
| --------------------------------------------------- | ---------------------------------------------------------- |
| parseStyle(json, schemas?)                          | 严格解析、校验可用 Schema、静态语义和规范化；未知声明保留  |
| normalizeStyle(value, schemas?)                     | 不修改调用方对象，返回规范化副本                           |
| inspectStyle(value, schemas?)                       | 返回 complete 与 unresolvedSchemas，发现已知错误仍抛出异常 |
| validateStyle(value, schemas?)                      | 完整校验；缺失声明或引用资源为 E_SCHEMA_UNRESOLVED         |
| requireExtensionSupport(value, supported, schemas?) | 完整校验后逐项检查精确 URL，缺少执行支持报错               |
| encodeQuery / decodeQuery                           | 对象与规范 Q3 查询串转换                                   |
| jsonToQuery / queryToJson                           | 原始 JSON 与 Query 转换，输出 JCS 文本                     |
| new QueryCodec(options)                             | 复用 maxQueryBytes、maxParameters 配置，两者须为正整数     |

SchemaRegistry 默认含官方资源。register(schema) 注册完整 JSON Schema 对象，返回注册表以便链式调用；已注册的 `$id` 不可覆盖。TypeScript 核心与官方字段的类型由 Schema 生成，第三方顶层字段可直接携带，不要求修改核心类型。

## Go

导入 `github.com/mapseekai/raster-style/packages/go`。完整校验使用包级 `ValidateJSON` 或注册表方法，查询转换保留未知扩展。

```go
registry, err := rasterstyle.NewSchemaRegistry()
if err != nil {
    return err
}
// 第三方本地 Schema 可通过 registry.Register(schemaJSON) 注册。
if err := registry.ValidateJSON(styleJSON); err != nil {
    return err
}
style, err := registry.ParseJSON(styleJSON)
if err != nil {
    return err
}
if err := style.RequireExtensionSupport(supportedSchemaURLs); err != nil {
    return err
}
query, err := rasterstyle.EncodeQuery(style)
if err != nil {
    return err
}
```

包级编解码接口：ParseJSON、EncodeQuery、DecodeQuery、JSONToQuery、QueryToJSON。自定义 Query 预算使用 NewCodec(Options)，零字段取默认值，负数报配置错误。

SchemaRegistry 提供 Register([]byte)、Resolve、ParseJSON、InspectJSON 和 ValidateJSON，支持并发使用。注册后用该注册表重新解析或校验既有配置，获得新的完整性结果；旧 Style 的报告是构造时快照，不会被后台改写。

Style 的文档、JCS 缓存与报告受封装保护。JSON() 返回独立字节切片，Document() 返回深拷贝，Validation() 返回含独立未解析列表的报告。json.Unmarshal 成功后替换内容，失败时保留旧值；修改后的 map 需重新解析。

Fiber v3 的 Decoder 直接读取原始 URI 查询串，保留重复 bidx/rescale 顺序；支持 Parse、JSON、Middleware 和 FromContext。其职责是请求解码，不表示具备执行扩展的能力。渲染路由还须完成完整校验和 RequireExtensionSupport 检查。可运行的解码示例见 packages/go/examples/fiber/main.go。

## Rust

```rust
use raster_style::{SchemaRegistry, encode_query};

let mut registry = SchemaRegistry::new()?;
// registry.register(schema_value)?;
registry.validate_json(style_json)?;
let style = registry.parse_json(style_json)?;
style.require_extension_support(&supported_schema_urls)?;
let query = encode_query(&style)?;
```

核心接口：Style::from_json、Style::from_value、encode_query、decode_query、json_to_query、query_to_json。自定义预算使用 Codec::new(Options)，Options::default() 提供默认值，零预算是配置错误。

SchemaRegistry 提供 new、register(Value)、resolve、parse_json、inspect_json 和 validate_json；包级 validate_json 使用内置注册表。Style::validation() 返回只读报告，require_extension_support 检查精确执行版本。注册需要可变借用，解析与校验可并发只读调用。

Style 支持 Clone、Serialize、Deserialize。as_value() 只读访问，into_value() 转移文档所有权。签名或字节比较使用 to_json() 的 JCS 文本；普通序列化使用 serde_json。Style::from_json 保留原始重复键检测；from_value 检查已解析值。

## 第三方扩展：字段由 Schema 定义

下列 Schema 的 URL 路径与业务字段完全不同，同时定义两个字段，其中一个没有命名空间前缀。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.test/not-a-field-name/v1.0.0/schema.json",
  "type": "object",
  "required": ["extensions", "unrelated_gain", "vendor:annotation"],
  "properties": {
    "extensions": {
      "type": "array",
      "contains": { "const": "https://example.test/not-a-field-name/v1.0.0/schema.json" }
    },
    "unrelated_gain": { "type": "number", "minimum": 0 },
    "vendor:annotation": { "type": "string" }
  }
}
```

对应样式：

```json
{
  "version": "3.0",
  "extensions": ["https://example.test/not-a-field-name/v1.0.0/schema.json"],
  "renderer": { "type": "gray", "bidx": [1] },
  "unrelated_gain": 2,
  "vendor:annotation": "示例"
}
```

TypeScript 使用 new SchemaRegistry().register(schema)，Go 使用 registry.Register(schemaJSON)，Rust 使用 registry.register(schemaValue)。完整校验组合核心和声明的 Schema，最后关闭未被评价的顶层属性。条件字段、allOf 和本地引用按 JSON Schema 2020-12 求值；引用资源也须注册。扩展根应只评价实际定义的字段，不用 additionalProperties=true 吞掉全部未知字段。

本例只是配置契约，不意味着 SDK 执行 gain 或 annotation。真实执行端另行实现并声明对该 URL 的支持。

## 离线、显式解析与完整性

官方核心、Mosaic 和 Tile Schema 随三个 SDK 内置，无需联网。未注册的声明可由核心编解码保留，但完整校验和执行支持检查都会拒绝未验证状态。已注册 Schema 若引用缺失资源，返回 E_SCHEMA_UNRESOLVED，不联网补取，也不宣称通过。

TypeScript 的 await registry.resolve(url, resolver)、Go 的 registry.Resolve(url, resolver)、Rust 的 registry.resolve(url, resolver) 才会调用应用显式提供的解析函数。返回 Schema 的 `$id` 必须与请求完全一致。解析函数负责允许域名、重定向策略、鉴权、超时、响应大小与缓存；SDK 不附带隐式远程下载器。

URL 是版本标识，不是动态查找字段的规则。注册资源不可覆盖，发布后的版本内容应保持稳定。新增版本使用新 URL，并重新校验配置和执行支持。

## Q3 与规范化

核心分组继续使用专用短参数，扩展声明写入 extensions，所有非核心顶层字段写入 extension_fields 的单个 JCS 对象。新增扩展无需改核心绑定表；任意字段名均按完整名称往返。未知扩展中的颜色字符串、数组、标量和嵌套结构不会被猜测性转换。

Query 按键排序，重复 bidx/rescale 保留顺序；空格为 %20，加号为 %2B。默认预算为 8192 字节、256 个参数，JSON 为 2 MiB、深度 64。详细词法见 [Q3 绑定](../spec/v3/Raster-Style-Query.md)。

核心颜色及已声明官方 Tile.background 规范化为小写八位 RGBA。颜色操作补全 channels：映射前单输出默认 r、三输出默认 rgb，映射后默认 rgb；其他可选字段保留省略状态。expression 去除各输出两端的 ASCII 空白，内部内容保留。规范化后再次检查组合 Schema，避免规范化破坏扩展对核心字段施加的约束。

Schema 的 default 是语义注释，不自动填入样式。执行端解析渲染默认值，与传输字节规范化分开。

## 资源生成与执行边界

spec/v3 与 extensions/raster 下的版本目录是规范来源。pnpm generate 同步所有 Schema、Q3 绑定并生成 TypeScript 类型；pnpm check:generated 检查副本一致性。Go 用 embed，Rust 用 include_str，TypeScript 构建时导入。构建前清理 TypeScript dist，避免已删除资源残留在发布包。

核心数值算法见[执行语义](../spec/v3/Raster-Style-Execution.md)、[表达式档案](../spec/v3/Raster-Expression-v1.md)和[适配档案](../spec/v3/Raster-Style-TiTiler-Profile.md)。SDK 执行配置与静态语义校验，渲染服务负责数据绑定、表达式求值、统计、像元计算、扩展业务与编码输出。

## Schema 校验实现与回归

数值关键字、ECMAScript 正则、特殊字段的组合评价、声明集合缓存和包内测试资源见 [Schema 校验实现](SCHEMA-VALIDATION.md)。缓存排序只用于内部身份，JSON 与 Query 保留样式声明顺序。
