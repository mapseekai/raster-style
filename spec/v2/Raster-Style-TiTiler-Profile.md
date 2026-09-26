# TiTiler 适配档案

[Raster Style Spec v2](Raster-Style-Spec-v2.md) 定义分组 JSON、结构化颜色公式和单值透明度。JSON 用于编辑与存储，Q2 使用 TiTiler 风格名称传输。

## 1. 能力映射

Q2 先由 SDK 解析为样式，再由适配器编译请求和处理步骤。下表的“直接映射”仍要求核对部署版本的参数枚举和有效性规则。

| 样式能力 | 适配方式 | 必须验证的行为 |
|---|---|---|
| bidx、read/reproject 重采样 | 映射为部署端点的对应参数 | 重复波段顺序、掩膜、Alpha、overview |
| linear rescale | 范围可映射；输出数值域由适配器控制 | 三通道广播、透明范围策略和索引舍入 |
| colormap / colormap_name | 固定实际表后传递或本地查表 | 数据域与 0–255 索引域、原生区间上界排除 |
| color_formula | gamma/sigmoidal/saturation 可编译到 rio-color 或自定义浮点步骤 | raster-color/1、极值稳定性、Lch 转换常量、阶段顺序 |
| expression / index / calibration | 从 raster-expr/1 AST 或绑定编译 | where 分支有效性、反射率单位；不得直接当作宿主表达式透传 |
| continuous / discrete / source | 按规范本地映射或转换成等价处理 | 插值空间、预乘 Alpha、分级边界、源色表一致性 |
| statistics / minmax / percentile / stddev / CDF / curve | 解析固定快照并执行规范算法 | 统计网格、raster-statistics/1、空集与常量值 |
| hillshade / shaded_relief | 独立高程分支与规范地形处理 | 实际米制网格、Horn、邻域、光向量和颜色分支隔离 |
| mosaic / extensions | 编译确定的分阶段计划 | 元组有效性、排序通道、源顺序、扩展调用次数 |
| post_color_formula / opacity | 适配器的渲染后步骤 | 浮点有序操作，Alpha 只乘一次 |
| image | 映射编码器并补足规范合成步骤 | JPEG 线性背景合成、8 位量化、WebP 模式 |

TiTiler 的默认拉伸可依赖输入数据类型；适配器必须显式落实 Raster Style 的 none=[0,255] 显示范围或直接数据路径，不能依赖该默认行为。原生颜色公式可能在管线中引入整数转换；无法保持规范浮点阶段或达到参考结果时，使用自定义步骤或明确拒绝该组合。

## 2. 部署清单与失败行为

每个部署提供不可变的适配档案，至少记录：档案 ID/修订、TiTiler/rio-tiler/rio-color/Rasterio/GDAL 和编码器的精确版本或提交、raster-color/1 与 raster-statistics/1 实现、重采样核/overview 策略、注册色表和扩展内容摘要，以及支持的 renderer/参数组合。版本不得用 latest 或范围表达。平台可在服务上下文中选择该档案，样式 JSON 无需新增部署字段。

绑定样式时先校验能力，再生成执行计划。未知色表、缺失源波段／单位、统计快照失配、源调色板不一致或不支持的语义均返回明确的服务错误，带字段路径；不得忽略参数、回退到另一种算法或生成近似成功结果。SDK 的结构／语义错误码与这些服务绑定错误分别管理。

三语言 SDK 使用同一份 Schema 与绑定表。SDK 通过不代表部署渲染通过；声明某项能力前，须独立运行[执行语义 §7](Raster-Style-Execution.md#7-验收)的相关向量与真实栅格用例，保存输入依赖、档案修订和结果。没有后端验收记录的组合不进入已支持能力清单。

## 3. 参考

- [TiTiler 渲染与默认拉伸](https://developmentseed.org/titiler/user_guide/rendering/)
- [rio-tiler 数据域与索引色表](https://cogeotiff.github.io/rio-tiler/latest/colormap/)
- [rio-color 操作实现](https://github.com/mapbox/rio-color/blob/master/rio_color/operations.py)

以上链接用于实现参考；实际部署锁定的版本及规范参考向量决定验收结果。
