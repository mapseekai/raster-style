# 验证与安全

## 校验能力

1. 原始 JSON：UTF-8/Unicode、重复键、有限 binary64 数值、字节/深度/节点预算。
2. Q2 词法：一次百分号解码、严格布尔/数字/颜色、加号使用 `%2B`、未知键和重复单值键报错。
3. JSON Schema 2020-12：分组样式结构、枚举、union、数组长度及数值范围。
4. 静态跨字段语义：通道数量、拉伸数组广播、单调范围/曲线、颜色表边界、唯一值冲突、分类重采样、单值透明度、镶嵌排序通道、背景与编码选项。
5. 颜色公式：操作名、参数数量、通道引用、有限数值和取值范围；色表区间有序且互不重叠。
6. 传输一致性：声明的颜色字段统一为小写八位 RGBA，局部 JSON 和数字按 RFC 8785 输出；颜色操作补全默认通道，其他可选字段保留省略状态。

JSON Schema 随包内嵌，使用固定定义编译并复用。Go/Fiber 和 Rust 的 Style 通过只读访问或副本提供数据。

## 服务端集成

渲染服务负责校验数据绑定（波段、单位和反射率）、统计范围与快照、表达式语义、扩展注册和引擎能力，并管理租户权限及样式引用生命周期。

编解码库将表达式和扩展配置作为数据传输。执行前，服务端须通过渲染器的白名单解析器编译表达式并校验数据绑定。

## 错误码

| code                    | 含义                                          |
| ----------------------- | --------------------------------------------- |
| `E_QUERY_SYNTAX`        | 非法查询编码或值词法                          |
| `E_UNKNOWN_PARAMETER`   | Q2 注册表外的键                               |
| `E_DUPLICATE_PARAMETER` | 单值键重复                                    |
| `E_JSON`                | 非法 JSON / Unicode / 非有限数字 / 重复对象键 |
| `E_SCHEMA`              | 结构校验失败                                  |
| `E_SEMANTIC`            | 静态跨字段关系冲突                            |
| `E_LIMIT`               | 输入或输出超出资源预算                        |
| `E_CONFIG`              | SDK 配置或内嵌资源问题                        |

三种语言使用一致的 `code`，错误文案、具体 `path` 和检查顺序可有所差异。每次返回首先发现的问题，并省略完整查询串和扩展配置。

## 测试

共享测试使用规范示例和独立参考查询向量。另有固定种子生成 200 个样式，三语言互相检查 Query 和规范 JSON 的字节一致性并反向解码。

`testdata/rendering-vectors.json` 提供默认端点、数值域、预乘 Alpha、统计退化、地形分支和阶段顺序等输入及预期 RGBA。`scripts/rendering_reference.py` 检查这些参考计算；向量中的 style 同时参加三语言往返验证。表达式只在服务编译，`testdata/expression-vectors.json` 列出服务 AST 接受／拒绝及求值预期，参考检查器对其进行受限解析和求值。

`scripts/rendering_reference_test.py` 验证参考检查器的重采样方式与阶段约束；全量检查同时运行这些回归测试。独立的均值极值向量检查有限输入的聚合结果，避免中间求和溢出。

参考检查器覆盖有限的规范案例，不读取真实栅格、不执行后端重投影或图像编码。部署后端须独立运行相关向量并验证真实栅格，才能声明支持该能力；精度与验收边界见[执行语义 §7](../spec/v2/Raster-Style-Execution.md#7-验收)。

Go 提供 race 测试、并发复用测试、BenchmarkDecodeRGB 和 FuzzDecodeQuery。Fiber 使用 app.Test 发出真实 HTTP 请求，覆盖数组顺序、中间件和错误状态；Rust 覆盖并行调用和 Serde 路径。完整运行报告写入 `.build/`，其中耗时供本地性能分析参考。

## 参考

- RFC 8785: https://www.rfc-editor.org/rfc/rfc8785.html
- Fiber v3 Ctx: https://docs.gofiber.io/api/ctx/
- Ajv JSON Schema: https://ajv.js.org/json-schema.html
- Go jsonschema: https://pkg.go.dev/github.com/santhosh-tekuri/jsonschema/v6
- Rust jsonschema: https://docs.rs/jsonschema/0.37.4/jsonschema/
- Rust JCS: https://docs.rs/serde_json_canonicalizer/0.3.2/serde_json_canonicalizer/
