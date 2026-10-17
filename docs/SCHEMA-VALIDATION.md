# Schema 校验实现

三个 SDK 使用 JSON Schema 2020-12，并共享 testdata/schema-cases.json 的正反例。扩展声明、字段位置与业务约束继续由原始 Schema 定义；校验器内部的数据结构与缓存不进入样式 JSON。

## 数值关键字

样式和 Schema 数值先按核心协议解释为有限 binary64。multipleOf 将该数值的最短往返十进制表示拆成整数系数和十进制指数，通过整数余数判定整除。TypeScript 使用 BigInt，Rust 使用 num-bigint，Go 校验库使用十进制有理数计算。

例如，0.3 是 0.1 的整数倍，4.02 是 0.01 的整数倍。相邻的可表示浮点数仍保持不同的十进制值，不能通过误差容限扩大可接受范围。共享测试覆盖负数、零、指数写法、极小值、极大值、相邻值，以及 anyOf、not、contains 等组合中的 multipleOf。

该判定只处理 Schema 数值约束。像元计算、拉伸、类别匹配、颜色量化及参考向量中的精度规则维持各自规范。

## 正则表达式

TypeScript 使用 ECMAScript Unicode 正则。Go 通过 regexp2 的 ECMAScript 与 Unicode 模式提供 Schema pattern 和 patternProperties 的匹配。Rust 的 jsonschema 0.58.6 使用配套 ECMA-262 正则转换实现。

共享案例覆盖前瞻、后顾、反向引用、ASCII 数字与单词字符、Unicode 字符，以及 ECMAScript 定义的全部空白字符。新增正则能力或更换校验器版本时，同步运行三语言正反例。

Rust 的 pattern 适配器保留底层匹配的执行错误，通过当前线程的同步校验边界返回 E_LIMIT，防止 not、anyOf、if 或 contains 把资源耗尽解释为成功。错误状态在每次校验结束时恢复，不会污染下一次请求或其他线程。已支持表达式继续使用原有转换；命名反向引用的转换缺口通过不增加捕获组的空前瞻交给现有匹配引擎处理。回归同时覆盖命名与数字反向引用，以及包含转义文本的原有表达式。

Go 的单次正则匹配设置一秒超时，并沿用 regexp2 的回溯资源限制。由于校验库的正则接口只返回布尔值，适配层通过私有异常信号将引擎执行错误传回统一校验边界，转换为 E_LIMIT。资源耗尽不作为普通不匹配处理，避免在 not 等组合中被解释为成功。测试同时验证正向与否定条件的错误传播。

Schema 作为应用注册的受控资源使用。应用可在注册阶段管理来源、复杂度与资源策略；各 SDK 的完整校验和执行能力检查仍是独立步骤。

## 特殊字段与组合属性评价

TypeScript 在校验器内部为属性评价记录使用带固定前缀的键，实际 Schema 字段名、样式字段名和 JSON Pointer 均保持原值。这样可把 **proto**、constructor、toString 等字段当作普通 JSON 成员处理，并继续使用组合 Schema 的 unevaluatedProperties 规则。

共享测试覆盖声明字段的有效值、无效值、必填关系，以及未声明字段的拒绝；同时覆盖嵌套对象、additionalProperties、patternProperties、$ref、条件分支、anyOf 和 dependentSchemas。编解码往返保留原始字段名称与 JSON 语义。

## 校验器缓存

编译缓存的身份由已解析扩展 URL 集合的稳定排序与校验完整性组成。排序只发生在内部副本中，样式 extensions 数组的顺序及其规范 JSON 输出保持原样。同一集合的不同排列复用已编译校验器。

三个 SDK 的组合缓存容量为 64 项，按最近使用顺序逐项淘汰。注册新 Schema 时清理旧的组合缓存，以反映资源可用性的变化。测试对五个扩展的全部 120 种排列验证复用，并通过超过缓存容量的访问验证热点保留和冷项淘汰。

Go 在锁内读取资源快照和缓存状态，锁外编译 Schema，并通过同键等待机制合并并发编译。资源注册代数防止旧快照的编译结果回填新一代缓存。Rust 使用短时缓存锁和每键 OnceLock，编译期间释放全局缓存锁。

Rust 编译器通过只读资源快照按需查找引用，只解析本次组合使用的核心、扩展及其依赖。未使用资源中尚未注册的引用不会阻断核心样式；实际使用的缺失引用仍返回 E_SCHEMA_UNRESOLVED。TypeScript 将资源装载和组合编译放在同一错误边界，配置异常返回 E_CONFIG 并保留原始 cause。

## 测试组织与 API 文档

TypeScript 注册、解析回调和缓存的单元测试统一位于 src/schema.test.ts，使用 Node 的测试替身自动恢复调用跟踪。tsconfig.test.json 继承生产代码的严格类型选项，编译单元测试及类型测试；跨模块的 Schema、规范化和 Q3 往返用例保留在 test/schema-conformance.test.mjs。生产构建排除单元测试，构建与测试前清理旧产物。

公共 API 的声明处说明配置保留、完整校验、报告快照和执行能力的区别。Go 的 Example 带预期输出，由 go test 执行；Rust 的文档示例由工作区和独立发布包的 cargo test --doc 执行。

## 打包与发布资源

共享测试向量由 pnpm generate 同步到 crates/raster-style/tests/data；pnpm check:generated 对比每份副本与来源。Rust crate 的单元测试和集成测试从包内路径读取这些资源。

scripts/check_package.py 构建 .crate，提取到工作区之外的临时目录，逐项核对测试资源，并以离线模式运行该发布产物的全部测试。测试成功后生成 .build/package-validation-report.json。

静态 Schema 发布核查使用流式响应读取：可以提前检查未压缩 Content-Length，读取时再以实际解码字节数逐块执行 2 MiB 预算，首次超限立即取消读取。测试覆盖无长度、错误长度、压缩响应、单块超限、边界大小和流错误。

完整检查入口为 pnpm test:all。Schema 一致性见 testdata/schema-cases.json，SDK 接口见 [SDK 文档](SDK.md)，静态产物流程见 [发布说明](PUBLISHING.md)。
