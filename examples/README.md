# Raster Style v3 示例

styles 中的所有完整样式均显式使用 version="3.0"。示例随三语言一致性测试进行 JSON/Q3 往返和完整离线校验。

## 核心与官方扩展

18-minimal.json 展示独立核心样式。24-mosaic-only.json 仅声明 Mosaic，25-official-extensions.json 同时声明 Mosaic 和 Tile；该组合使用通道前镶嵌、RGB 波段、线性拉伸和 WebP 输出。

其他示例覆盖颜色映射、指数与表达式、拉伸、地形、颜色效果、分类以及 Tile 的 JPEG、PNG 和 WebP 配置。Mosaic 和 Tile 的 Schema 已随 SDK 内置，无需联网或手动注册。

## 第三方扩展

26-third-party-fields.json 使用一个扩展定义两个不同名称的顶层字段：unrelated_gain 和 vendor:annotation。其版本 URL 为 https://example.test/not-a-field-name/v1.0.0/schema.json，与字段名称没有推导关系。

对应 Schema 在 schemas/third-party-fields.schema.json。16-unicode-extension.json 的本地 Schema 在 schemas/unicode-config.schema.json，展示 Unicode、特殊字符、嵌套对象、数值和颜色状字符串的语义保留。

这些 example.test 地址是示例身份，不是实际发布站点。完整离线校验前，将本地 JSON Schema 文件注册到 SchemaRegistry；不能把网络下载失败当作校验成功。

```ts
const registry = new SchemaRegistry();
registry.register(thirdPartySchema);
const style = parseStyle(styleJSON, registry);
validateStyle(style, registry);
const restored = parseStyle(queryToJson(encodeQuery(style)), registry);
validateStyle(restored, registry);
```

Go 使用 registry.Register(schemaJSON) 与 registry.ValidateJSON(styleJSON)；Rust 使用 registry.register(schemaValue) 与 registry.validate_json(styleJSON)。编码器无需新增任何第三方字段绑定。

未注册时，编解码仍可保留扩展配置，但完整性报告为 complete=false，完整校验返回 E_SCHEMA_UNRESOLVED。即使注册并通过校验，真实执行端仍须独立实现和声明该扩展版本；这些示例 Schema 不提供像元处理实现。

接口见[SDK 文档](../docs/SDK.md)，参数语义见[核心规范](../spec/v3/Raster-Style-Spec-v3.md)。
