# 验证与安全

## 校验能力

1. 原始 JSON：UTF-8/Unicode、重复键、有限 binary64 数值、字节/深度/节点预算。
2. Q3 词法：一次百分号解码、严格布尔/数字/颜色、加号使用 `%2B`、未知键和重复单值键报错。
3. JSON Schema 2020-12：分组样式结构、枚举、union、数组长度及数值范围。
4. 静态跨字段语义：通道数量、拉伸数组广播、单调范围/曲线、颜色表边界、唯一值冲突、分类重采样、单值透明度、Mosaic 排序通道；Tile Schema 校验背景与编码选项。
5. 颜色公式：操作名、参数数量、通道引用、有限数值和取值范围；色表区间有序且互不重叠。
6. 传输一致性：声明的颜色字段统一为小写八位 RGBA，局部 JSON 和数字按 RFC 8785 输出；颜色操作补全默认通道，其他可选字段保留省略状态。

核心和官方扩展 JSON Schema 随包内嵌，按声明组合后编译并复用。无声明时严格拒绝所有非核心字段；有已解析声明时，在组合层关闭未被评价的顶层属性，合法扩展字段由对应 Schema 评价。Go/Fiber 和 Rust 的 Style 通过只读访问或副本提供数据。

未知扩展可按原始 JSON 语义保留，完整性报告为 complete=false，列出 unresolvedSchemas。该状态不是完整通过；所有已知核心与扩展错误仍会被拒绝。注册本地资源后重新校验即可取得新结果。

注册表不隐式访问网络或本地文件。显式 resolver 回调由应用控制 URL 白名单、重定向、鉴权、超时、响应大小和缓存。第三方 Schema 属于受信任配置：复杂正则、深度引用或昂贵条件仍需要应用层审查和资源控制。注册 `$id` 不可覆盖；发布版本内容保持稳定。

## 服务端集成

渲染服务先调用完整校验接口，拒绝未解析的 Schema 声明或引用，再核对执行端是否支持每个精确扩展 URL。Schema 通过只表示配置合法，不代表扩展业务已实现。渲染服务还负责校验数据绑定（波段、单位和反射率）、统计范围与快照、表达式语义、扩展注册和引擎能力，并管理租户权限及样式引用生命周期。

编解码库将表达式和扩展配置作为数据传输。执行前，服务端须通过渲染器的白名单解析器编译表达式并校验数据绑定。

## 错误码

| code                      | 含义                                          |
| ------------------------- | --------------------------------------------- |
| `E_QUERY_SYNTAX`          | 非法查询编码或值词法                          |
| `E_UNKNOWN_PARAMETER`     | Q3 注册表外的键                               |
| `E_DUPLICATE_PARAMETER`   | 单值键重复                                    |
| `E_JSON`                  | 非法 JSON / Unicode / 非有限数字 / 重复对象键 |
| `E_SCHEMA`                | 结构校验失败                                  |
| `E_SCHEMA_UNRESOLVED`     | 完整校验缺少扩展 Schema 或其引用资源          |
| `E_UNSUPPORTED_EXTENSION` | 执行端未支持此精确扩展版本                    |
| `E_SEMANTIC`              | 静态跨字段关系冲突                            |
| `E_LIMIT`                 | 输入或输出超出资源预算                        |
| `E_CONFIG`                | SDK 配置或内嵌资源问题                        |

三种语言使用一致的 `code`，错误文案、具体 `path` 和检查顺序可有所差异。每次返回首先发现的问题。错误可能包含 Schema 资源 URL 与编译细节，面向外部用户时应按服务策略处理，不直接输出内部诊断。

## 测试

testdata/schema-cases.json 定义三语言共用的完整校验、离线引用、条件属性、多字段扩展、URL/字段名无关性、错误与能力检查案例。每种语言还有显式 resolver、不可覆盖注册和未知 JSON 往返单元测试。

共享测试使用规范示例和独立参考查询向量。另有固定种子生成 200 个渲染样式与 80 个不透明扩展样式，三语言互相检查 Query 和规范 JSON 的字节一致性并反向解码。全部 26 份完整示例另行通过本地 Schema 注册和完整校验；已注册第三方扩展的 Query 往返后再次完整校验。

`testdata/rendering-vectors.json` 提供默认端点、数值域、预乘 Alpha、统计退化、地形分支和阶段顺序等输入及预期 RGBA。`scripts/rendering_reference.py` 检查这些参考计算；全部向量输入同时参加三语言往返和完整离线 Schema 校验。结构升级保留原有数值预期及误差阈值。表达式只在服务编译，`testdata/expression-vectors.json` 列出服务 AST 接受／拒绝及求值预期，参考检查器对其进行受限解析和求值。

`scripts/rendering_reference_test.py` 验证参考检查器的重采样方式与阶段约束；全量检查同时运行这些回归测试。独立的均值极值向量检查有限输入的聚合结果，避免中间求和溢出。

参考检查器覆盖有限的规范案例，不读取真实栅格、不执行后端重投影或图像编码。部署后端须独立运行相关向量并验证真实栅格，才能声明支持该能力；精度与验收边界见[执行语义 §7](../spec/v3/Raster-Style-Execution.md#7-验收)。

Go 提供 race 测试、并发复用测试、BenchmarkDecodeRGB 和 FuzzDecodeQuery。Fiber 使用 app.Test 发出真实 HTTP 请求，覆盖数组顺序、中间件和错误状态；Rust 覆盖并行调用和 Serde 路径。完整运行报告写入 `.build/`，其中耗时供本地性能分析参考。

## 参考

- RFC 8785: https://www.rfc-editor.org/rfc/rfc8785.html
- Fiber v3 Ctx: https://docs.gofiber.io/api/ctx/
- Ajv JSON Schema: https://ajv.js.org/json-schema.html
- Go jsonschema: https://pkg.go.dev/github.com/santhosh-tekuri/jsonschema/v6
- Rust jsonschema: https://docs.rs/jsonschema/0.58.6/jsonschema/
- Rust JCS: https://docs.rs/serde_json_canonicalizer/0.3.2/serde_json_canonicalizer/

## 边界回归

共享 Schema 用例覆盖小数倍数的精确判定及邻近值、ECMAScript 空白和前后查找、特殊字段的声明与拒绝。缓存验证包含扩展集合的全部排列、热点保留与并发同键复用；静态发布测试按响应块核对读取预算。Rust 发布包在工作区之外运行全部测试，结果写入 .build/package-validation-report.json。实现细节见 [Schema 校验实现](SCHEMA-VALIDATION.md)。
