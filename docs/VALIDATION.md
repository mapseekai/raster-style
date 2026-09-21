# 验证与安全边界

## 已实现的校验层

1. 原始 JSON：UTF-8/Unicode、重复键、有限 binary64 数值、字节/深度/节点预算。
2. Q2 词法：一次百分号解码、严格布尔/数字/颜色、禁止裸加号、未知键和重复单值键报错。
3. JSON Schema 2020-12：完整 draft.2 结构、枚举、union、数组长度及数值范围。
4. 静态跨字段语义：通道数量、拉伸数组广播、单调范围/曲线、颜色表边界、唯一值冲突、分类重采样、NoData 颜色、Alpha、镶嵌排序通道、JPEG 背景及编码选项。
5. 传输一致性：声明的颜色字段统一为小写八位 RGBA，局部 JSON 和数字按 RFC 8785 输出；所有已提供的合法字段都保留。

JSON Schema 在包内固定，编译后复用，不接受调用方替换 Schema 或远程 `$ref`。Go/Fiber 和 Rust 返回的 Style 封装不暴露可变内部状态。

## 明确不由编解码库保证

波段是否真实存在、物理单位是否匹配、指数输入是否为反射率、统计范围和快照、表达式 AST 的语义合法性、扩展是否注册、渲染引擎实际能力、租户权限和样式引用生命周期。

表达式和扩展配置只作为数据传输，绝不使用 eval，也不触发网络或文件访问。服务端执行前仍必须用渲染器自己的白名单解析器编译表达式并校验数据绑定。

## 错误码

| code                    | 含义                                          |
| ----------------------- | --------------------------------------------- |
| `E_QUERY_SYNTAX`        | 非法查询编码或值词法                          |
| `E_UNKNOWN_PARAMETER`   | 不在 Q2 注册表内的键                          |
| `E_DUPLICATE_PARAMETER` | 单值键重复                                    |
| `E_JSON`                | 非法 JSON / Unicode / 非有限数字 / 重复对象键 |
| `E_SCHEMA`              | 不满足 draft.2 结构                           |
| `E_SEMANTIC`            | 静态跨字段关系冲突                            |
| `E_LIMIT`               | 输入或输出超出资源预算                        |
| `E_CONFIG`              | SDK 配置或内嵌资源问题                        |

三语言承诺 code 一致；错误文案和具体 path 不作为跨语言稳定协议。错误不包含完整查询串或扩展配置。多个错误同时出现时，仅返回首先发现的问题，不承诺跨语言首先发现相同的多个独立语义错误。

## 测试

共享测试来自规范示例与独立的 draft.2 参考查询向量，而不是仅使用某一个新实现生成期望值。另有固定种子生成 200 个样式，三语言互相检查 Query 和规范 JSON 的字节一致性并反向解码。

Go 提供 race 测试、并发复用测试、BenchmarkDecodeRGB 和 FuzzDecodeQuery。Fiber 使用 app.Test 发出真实 HTTP 请求，覆盖数组顺序、中间件和错误状态；Rust 覆盖并行调用和 Serde 路径。完整运行报告写入 `.build/`，不把一次运行时间当作性能保证。

## 参考

- RFC 8785: https://www.rfc-editor.org/rfc/rfc8785.html
- Fiber v3 Ctx: https://docs.gofiber.io/api/ctx/
- Ajv JSON Schema: https://ajv.js.org/json-schema.html
- Go jsonschema: https://pkg.go.dev/github.com/santhosh-tekuri/jsonschema/v6
- Rust jsonschema: https://docs.rs/jsonschema/0.37.4/jsonschema/
- Rust JCS: https://docs.rs/serde_json_canonicalizer/0.3.2/serde_json_canonicalizer/
