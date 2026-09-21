# Raster Style Spec v2 — 变更记录

## 2.0.0-draft.3 · 2026-09-21

- 删除 input 包装层：selector 改名为 channels，calibration / nodata 提升为顶层字段。
- output 改名为 image，tile_size 改名为 size。
- mosaic stage 改为 before_channels / after_channels。
- Q2 保留 selector 作为 channels.kind 的紧凑传输键，尺寸查询键改为 size。
- draft.2 旧 JSON/Q2 名称不做隐式兼容，严格校验直接拒绝。

## 2.0.0-draft.2 · 2026-09-21

定位收敛为栅格样式渲染格式，而非专题图制作、图例或版面规范。本次只更新交付文档与参考工具，未修改用户本地 MapSeek 仓库。

### 移除的字段与职责

| draft.1 | draft.2 处理 |
|---|---|
| `legend` | 从 Schema、示例与核心语义中移除，作为非法字段拒绝；上层应用可独立实现图例。 |
| 顶层 `metadata` | 资源标题、描述与标签归外层服务，不写入 RasterStyle。 |
| `renderer.classification` | 自动生成分级方案归外部工具；核心只接收最终 `color_map` 区间/颜色。 |
| Query `classification` | 从 Q2 白名单移除，46 项绑定替代原 47 项。 |
| 编码前过滤 `legend/metadata` | 删除，遇到未绑定顶层字段直接报错；Query 往返覆盖完整合法样式。 |
| 示例 `09-quantile-authoring` | 改成 `09-explicit-intervals`，断点为演示常量，不声称由实际数据计算。 |
| 示例 `06-percentile-authoring` | 重命名为 `06-percentile-stretch`，保留百分位拉伸能力。 |

### 保留的渲染语义

连续渐变、离散区间、精确值查表、波段与指数、拉伸、Gamma、拉伸统计、NoData、Alpha、效果、地形、重采样、镶嵌、输出参数均保留。地形的物理单位与 `calibration.mode=metadata` 仍合法，不能与被移除的纯展示元数据混淆。

### 草案迁移

两个版本均为未发布草案，JSON 内 `version` 暂保持 `2.0`，不代表 draft.1 的全部对象可直接通过 draft.2 校验。调用方应显式拆走展示信息；自动分类方案必须由外部工具先计算为最终颜色区间，不能靠删除字段假装迁移完成。资源管理封装的具体格式不由本规范定义。

### 验证边界

重新执行 11 份示例的结构/部分语义校验、完整 JSON/Query 往返、严格传输拒绝用例，并新增范围边界测试。实际计数见 `validation-report.json`。没有运行真实引擎或数据统计计算，没有完成跨后端像元等价性验证。
