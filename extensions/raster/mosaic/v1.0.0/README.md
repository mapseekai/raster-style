# Mosaic 扩展 1.0.0

适用核心协议：Raster Style 3.0。完整样式 Schema：[schema.json](schema.json)。不可变版本标识：

```text
https://mapseekai.github.io/raster-style/extensions/raster/mosaic/v1.0.0/schema.json
```

本扩展在完整样式顶层定义 `raster:mosaic`。字段位置、拼写、参数结构和声明关系由本目录 Schema 定义；URL 只标识版本，不能用来推导字段名。声明本扩展时，`extensions` 必须包含上述精确 URL，并提供 `raster:mosaic`。

```json
{
  "version": "3.0",
  "extensions": [
    "https://mapseekai.github.io/raster-style/extensions/raster/mosaic/v1.0.0/schema.json"
  ],
  "renderer": { "type": "rgb", "bidx": [4, 3, 2] },
  "raster:mosaic": { "pixel_selection": "first", "stage": "before_channels" }
}
```

## 参数与像元选择

`pixel_selection` 与 `stage` 必填。`rank_channel` 是 1–64 的整数，默认 1，仅用于 highest/lowest；默认值由执行计划解析，SDK 不写入省略的参数。

| pixel_selection  | 行为                                                     |
| ---------------- | -------------------------------------------------------- |
| first            | 按稳定源顺序选择首个有效像元元组                         |
| highest / lowest | 以 rank_channel 排序，选择完整元组；并列按源顺序         |
| mean / median    | 对同一组有效元组按通道等权聚合；偶数中位数取中间两值均值 |

stage=before_channels 在已校准输入波段上镶嵌后计算表达式/指数；after_channels 先逐源计算，再镶嵌。rank_channel 是从 1 开始的位置，不是源波段号：before_channels 对应全部输入依赖波段去重后按原始波段号升序排列的列表，after_channels 对应 renderer 输出通道顺序。例：bidx=[4,3,2] 的输入依赖表为 [2,3,4]，before_channels 的 rank_channel=1 指波段 2。重复 bidx 只在输出阶段重复。

SDK 检查 bidx/index 的已知依赖范围和输出通道范围；服务在表达式 AST 编译后检查其依赖范围。分类输出只接受 first/highest/lowest，拒绝会生成新类别值的 mean/median。

`stage` 仅为 Mosaic 自己的业务参数，不是扩展机制的公共属性或公共执行阶段。其他扩展不要求它。单源可省略 Mosaic；多源执行必须显式声明并配置本扩展。核心样式独立解析、完整校验和单源渲染均不要求 Mosaic。

## 元组有效性、源顺序与 Alpha

before_channels 元组由整个输入依赖表组成，after_channels 元组由所有输出通道组成。仅所有分量有效且 Alpha > 0 的元组参与；不同源的有效通道不能拼成一个元组。元组 Alpha 取分量 Alpha 的最小值。源顺序固定在执行计划中。

first 取第一个有效元组，包括其 Alpha。highest/lowest 按 rank_channel 的数值选择整个元组，包括其 Alpha；并列取源顺序最前者。

mean/median 对同一组有效元组逐通道进行等权算术聚合，不以 Alpha 改变数值权重。偶数 median 取中间两值的均值。两者的输出 Alpha 都取贡献元组 Alpha 的算术平均。均值与中位数计算须避免有限输入不必要的中间溢出。没有有效元组时输出透明。

源调色板模式要求所有源的规范化数值键与 RGBA 表完全一致，不能按获胜源切换色表。原始 NoData、mask、重采样、校准与源覆盖继续遵守核心有效性规则。

## 执行计划与统计

| 步骤                     | before_channels   | after_channels    |
| ------------------------ | ----------------- | ----------------- |
| 读取、重投影、校准       | 每源执行，共 S 次 | 每源执行，共 S 次 |
| 输入依赖波段镶嵌         | 一次              | 不执行            |
| 波段选择、表达式、指数   | 合并后一次        | 每源执行，共 S 次 |
| 输出通道镶嵌             | 不执行            | 一次              |
| 统计、拉伸、颜色和透明度 | 合并结果上一次    | 合并结果上一次    |

所有源先落到确定的工作网格。地形计算在本扩展完成后保存物理高程分支。单源显式声明时按所选策略处理该源。

核心字段 `statistics.scope=mosaic` 使用固定源集合的联合足迹，消费相同上游处理后的数值。统计快照及缓存依赖包括源修订、源顺序、依赖表、Mosaic 的精确 Schema URL 与配置、统计网格和其他实际参与数值计算的扩展。扩展顺序由执行端按各扩展定义编译；`extensions` 数组顺序不充当处理顺序。

Schema 校验像元选择、阶段、排序参数适用条件和分类聚合约束；SDK 另校验可静态确定的 rank_channel 范围。表达式依赖、源顺序、元组有效性、真实 Alpha 和源调色板一致性由执行端绑定并验收。

## 版本与验收

发布后的 `v1.0.0/schema.json` 内容保持稳定。业务字段、校验或语义变更使用新的版本地址，不覆盖原地址，也不以 latest 标识版本。SDK 内置 Schema 只表示可离线校验；执行前仍须核对渲染端是否支持此精确扩展版本。

[核心规范](../../../../spec/v3/Raster-Style-Spec-v3.md)、[执行语义](../../../../spec/v3/Raster-Style-Execution.md)和[参考向量](../../../../testdata/rendering-vectors.json)共同定义验收契约。
