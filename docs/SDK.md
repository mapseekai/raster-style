# SDK 接口与工程约定

三种语言共用分组 JSON 与 Q2 绑定。renderer、stretch、effects、image 等分组对应简短 Query 参数。完整字段见 [规范](../spec/v2/Raster-Style-Spec-v2.md)。

## TypeScript

| 接口                           | 行为                                          |
| ------------------------------ | --------------------------------------------- |
| `encodeQuery(style, options?)` | JSON 对象 → 规范 Q2 查询串                    |
| `decodeQuery(query, options?)` | 原始查询串 → 已校验且规范化的 `RasterStyle`   |
| `jsonToQuery(json, options?)`  | 原始 JSON 文本 → 查询串；拒绝重复 JSON 键     |
| `queryToJson(query, options?)` | 原始查询串 → JCS JSON 文本                    |
| `parseStyle(json)`             | 严格解析 JSON、结构与静态语义校验、颜色规范化 |
| `normalizeStyle(value)`        | 返回校验后的副本并补全颜色操作通道            |
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

## 颜色操作的双向转换

JSON 中 effects.color_formula 与 effects.post_color_formula 均为 1–64 项对象数组。编码时转换为同名 Query 公式；解码时还原操作对象，保留顺序及重复操作。

```json
{
  "effects": {
    "color_formula": [{ "op": "gamma", "channels": "rb", "value": 1.1 }],
    "post_color_formula": [{ "op": "brightness", "channels": "rgb", "value": 0.05 }]
  }
}
```

对应可读查询：

```text
color_formula=gamma rb 1.1
post_color_formula=brightness rgb 0.05
```

归一化会补全支持通道选择的操作：映射前单输出默认 r、三输出默认 rgb；映射后默认 rgb。其他可选字段保留省略状态。规范化后的样式满足 JSON → Query → JSON 往返一致。

Schema 的 default 仅描述渲染语义，SDK 不把它们写入样式。渲染服务按[默认值表](../spec/v2/Raster-Style-Spec-v2.md#2-配置分组)解析执行计划；样式的字节规范化与执行默认值解析是两个独立步骤。

## 配置要点

- renderer 在 bidx、expression、index 中选择一种输入，type 决定渲染方式。
- stretch.rescale 一组范围广播到所有通道，RGB 可配置三组。
- nodata 是有限数值或 nan，opacity 是 0–1 数值。
- calibration 支持 none、metadata、linear；统计拉伸可配置 statistics，多源样式可配置 mosaic。
- renderer 的 colormap、colormap_name、color_mapping 选择一种颜色来源。
- expression 通过分号分隔输出，SDK 检查长度、非空与数量，服务负责 AST 编译。
- source 调色板仅接受 bidx，calibration 省略或 none，扩展仅允许 after_color；服务验证多源调色板一致。
- statistics 的 ref 与 scope/accuracy 一起提供，作为不可变快照的匹配断言；exact 不接受 sample_size。
- before_channels 的 rank_channel 按输入依赖波段去重、升序后的列表编号；SDK 检查 bidx/index，服务编译表达式后检查其依赖表。
- 数据路径不接受 range_policy；原生 colormap 在 none 且无 color_formula 时为直接数据路径，其余按显示路径计算字节索引。

像元计算、后端适配与部署能力由渲染服务执行。SDK 通过 Schema、静态语义及三语言一致性检查保证配置传输。

算法与像元规则见[执行语义](../spec/v2/Raster-Style-Execution.md)、[raster-expr/1](../spec/v2/Raster-Expression-v1.md)与[TiTiler 适配档案](../spec/v2/Raster-Style-TiTiler-Profile.md)。
