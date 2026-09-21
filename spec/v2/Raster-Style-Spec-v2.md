# Raster Style Spec v2

**状态：MapSeek 项目规范提案，2.0.0-draft.3**  
**日期：2026-09-21**  
**JSON 协议版本：`2.0`；规范查询绑定：`Q2`**  
**定位：栅格数据的样式渲染格式，描述数值像元如何生成栅格图像；不定义专题图制作、图例或版面。**

本文件定义拟实施的 v2，不表示 MapSeek、ArcGIS、QGIS 或 TiTiler 已完整实现这些字段，也不宣称这是 OGC 标准。MUST/必须、SHOULD/应、MAY/可分别表示强制、建议和可选要求。配套 JSON Schema 负责结构校验；本文件的跨字段语义、数据上下文和适配器能力校验同样是强制要求。

## 1. 设计结论

**JSON 是持久化和交换的业务协议；Query 是传输绑定；适配器承担语义编译，而不只是字段改名。**

```text
RasterStyle + RenderContext
  → 结构与语义校验
  → 解析波段、拉伸统计量、颜色映射与数据修订
  → ResolvedStyle / RenderPlan
  → 能力匹配与显式近似决策
  ├─ MapSeek：强类型内部请求；外部仍可使用版本/预览引用
  ├─ TiTiler：COG / STAC / Mosaic 的版本化路径与查询参数
  ├─ ArcGIS ImageServer：exportImage + renderingRule / mosaicRule
  └─ QGIS：注册 QML / PyQGIS renderer，再用 WMS 命名样式引用
```

不能把任意合法 v2 JSON 转成某个 URL，就称该引擎“支持 v2”。有些能力需要统计预计算，有些需要渲染插件，有些只能报不支持。对 URL 参数比较友好的设计是：简单字段使用短参数和重复参数，复杂颜色表使用局部 JSON，长配置使用服务端样式引用。

### 1.1 范围：只定义栅格渲染，不定义制图产品

本规范只回答：**给定栅格输入、样式和必要渲染上下文，如何生成确定的像元颜色、透明度及输出图像。** 判定字段是否进入核心的依据是它是否改变渲染或输出行为，而不是某个桌面软件的面板中是否存在该选项。

图例、地图标题、类别名称、显示单位与小数位、标注、比例尺、指北针、版面布局和报表均不属于 RasterStyle。名称、描述、标签等资源管理信息由外层服务管理，也不进入样式对象；物理计算所需的单位（例如地形的 vertical_unit）仍属于渲染参数。

连续色带、离散分段与精确值颜色表直接决定像元颜色，必须保留；用它们显示数据不意味着本规范需要负责专题图制作。等距、分位数或 Jenks 等自动生成分级方案的流程属于上层工具，调用方把最终 breaks/colors 写入 color_map；渲染器不需要知道这些断点如何生成。百分位拉伸与直方图均衡等影像显示操作及其统计支持仍在范围内，不能与自动分级向导一并删除。

JSON Schema 和 Q2 均不得接收或静默丢弃 legend、顶层 metadata、renderer.classification 等已移除字段。extensions 只允许注册的像元处理能力，不能作为绕过上述边界的非渲染字段容器。

### 1.2 与 draft.1 的范围变更

移除图例及纯展示元数据；移除自动分类方案对象，改为显式颜色区间；保留全部像元着色模式和拉伸统计能力。Q2 从 47 项减至 46 项绑定，JSON/Query 往返不再有“过滤展示字段”的例外。draft.1 与 draft.2 均为未发布草案；旧字段需要显式迁移，不能声称两份草案完全兼容。详细迁移见 `CHANGELOG.md`。

## 2. 对标范围与本地基线

### 2.1 官方能力参照

这里以 QGIS 3.40 栅格符号系统文档和 QGIS Server 3.44 WMS 文档作为可核验基线；ArcGIS 使用官方 Pro/REST 文档；TiTiler 使用官方当前接口、依赖源码文档和 2.x 迁移说明。它们不是同一层级的产品，不应把桌面符号面板与瓦片 HTTP 参数视为一套接口。[R1–R8]

| 参照对象 | 对本规范的主要价值 | 不直接照搬的内容 |
|---|---|---|
| ArcGIS Pro | RGB、拉伸、精确值/区间着色、地形显示等栅格渲染概念 | GUI 参数尺度、专有函数对象、把动态规则套到所有缓存瓦片路由 |
| QGIS | 灰度、伪彩色、调色板、Linear/Discrete/Exact 区分、透明度与地形显示 | QML/XML 作为公共业务存储格式；把 WMS 当成 TiTiler 参数接口 |
| TiTiler / rio-tiler | 波段、表达式、rescale、colormap、图像处理、算法与瓦片输出的请求组织 | 让后端参数名决定业务模型；假定 COG/STAC 请求一致；假定所有渐变都能无损转为查表 |

### 2.2 栅格样式配置目录

下表是 **v2 的渲染配置目录**，不是三款产品逐项具备能力的断言。

| 类别 | 配置内容 | v2 承载位置 |
|---|---|---|
| 输入与通道 | 单波段、RGB 顺序、表达式、指数、波段角色 | `channels` |
| 像元校准 | 原值、元数据 scale/offset、显式线性校准 | `calibration` |
| 无效值 | 源 NoData、覆盖值、NaN/Inf、源 mask | `nodata` |
| 对比度增强 | 固定范围、Min/Max、百分位、标准差、直方图均衡、曲线、Gamma、Sigmoid | `stretch`、`statistics` |
| 渲染类型 | 灰度、RGB、伪彩色、唯一值、单色、阴影、地形着色 | `renderer` |
| 颜色映射 | 连续插值、离散区间、精确值；内置/自定义色带、反转、超范围色 | `renderer.color_map` |
| 图像调整 | 亮度、对比度、饱和度、灰化、反色 | `effects` |
| 透明度 | 全局透明度、Alpha 波段、数值/区间/RGB 透明规则、NoData 颜色 | `opacity` |
| 重采样 | 读取重采样、重投影重采样 | `resampling.read/warp` |
| 地形表现 | 光照角度、垂直单位、夸张系数、单向/多向阴影、混合强度 | `renderer.terrain` |
| 镶嵌 | 选择/统计策略、运算阶段、排序通道 | `mosaic` |
| 输出 | PNG/WebP/JPEG、尺寸、Alpha、背景、质量、无损模式 | `image` |
| 渲染扩展 | 色相、更多颜色空间、特定像元滤镜 | 版本化 `extensions`，需独立能力定义；不承载制图展示配置 |

图层混合模式、图层 Z 顺序、比例尺可见性属于 Map/Layer 合成配置，不放入单幅栅格的像元样式。Terrain-RGB/Terrarium 是高程数据编码，不当作普通着色图像输出。金字塔构建、压缩原始数据、CRS 修复等属于数据处理，不是样式。

### 2.3 本地代码证据

本次读取仓库 `/Users/zhang/code/mapseek`，HEAD `ed98cc24`：

| 文件 | 已核验内容 |
|---|---|
| `idl/rasterstyle/rasterstyle.thrift:1–64` | v1 的 selector/stretch/colormap/nodata/resampling/format/size/unscale；single/mosaic union |
| `shared/go/rasterstyle/v1/style.go` | 强类型校验；波段从 1 开始；JSON `cubicspline`；瓦片尺寸允许 64/128/256/512/1024 |
| `services/maptile/maptile-core/src/raster/style/indices.rs` | 五种现有指数公式、零分母生成 NaN |
| `services/api-gateway/handler/tile/raster_style.go:49–100` | 当前拒绝裸栅格样式查询参数；已保存样式走 `style_version`；临时样式走 `preview_id` |
| `docs/superpowers/specs/2026-07-11-dataset-owned-raster-style-design.md` | Dataset 拥有业务样式、Gateway 缓存投影、Maptile 渲染的所有权设计；其中早期裸 Query override 方案已与当前代码不一致 |

v1 并不是不能表达灰度或 RGB；它可以通过波段、拉伸和色带组合表达。v2 的改进是补充明确渲染类型、颜色映射语义、统计解析、透明规则和跨引擎绑定，而非把已有能力全部视为缺失。

当前 `style_version` 经 `ResolveAtLeast` 解析，不应直接称为“可重放的不可变历史样式版本”。不可变内容引用必须单独建立明确契约；瓦片缓存应绑定实际返回的样式内容 hash。

## 3. 分层、对象与一致性级别

### 3.1 RasterStyle

可持久化和交换的渲染配置。允许“2–98 百分位拉伸”“viridis 色带”等渲染参数，或显式连续/离散/精确颜色表；不描述分级方案生成或制图展示流程。结构见 `raster-style-v2.schema.json`。

```json
{
  "version": "2.0",
  "channels": {"kind": "bands", "bands": [4, 3, 2]},
  "renderer": {"type": "rgb"},
  "stretch": {"method": "percentile", "percentiles": [2, 98], "gamma": [1.1]},
  "statistics": {"scope": "dataset", "accuracy": "sample", "sample_size": 1000000},
  "image": {"format": "png", "size": 256}
}
```

### 3.2 RenderContext：不混入 Style

RenderContext 由受信任服务提供：租户/权限、Dataset 和数据修订、逻辑波段目录、实际资产绑定、源顺序、时间/高度切片、TMS、z/x/y、目标范围/CRS/分辨率、可用统计快照、工作网格、后端版本、编码器与执行预算。

`url`、访问令牌、存储路径、`bbox`、`z/x/y`、租户 ID 不写入 RasterStyle。逻辑波段 4 如何映射到 STAC 的哪个 asset、该 asset 的哪个 band，是绑定层的责任，不能只凭波段号猜测。

### 3.3 ResolvedStyle / RenderPlan

解析阶段必须产出：

```text
ResolvedStyle
  schema_version
  complete_render_style       补全有效默认值；输入不允许纯展示字段
  input_binding_revision      逻辑波段 → 固定源资产/波段/单位
  source_revision_set         含 mosaic 的稳定成员顺序
  statistics_snapshot         范围、算法、精度、样本、数据修订
  resolved_palette            实际停靠点/查找表，而不只色带名称
  resolved_ranges_or_curves   明确 min/max 或固定 CDF/曲线
  validated_breaks            已校验的显式颜色区间边界
  algorithm_profile           表达式、梯度、拉伸等算法版本
  semantic_hash
```

该描述是执行计划契约，不要求把上述派生字段塞回用户编辑 JSON。配套 Schema 只定义 RasterStyle。解析器、后端计划 Schema 和实际渲染器不是此次包中的实现。

发布样式必须解析为稳定范围、断点和色表，或绑定内容不可变的解析快照。不能在每个瓦片请求中重新自由推导颜色范围。

### 3.4 适配结果

编译器对每个特性返回以下之一：`native` 原生表达、`precompute` 先求值/生成表、`extension` 需已注册插件、`unsupported` 不支持。另有独立字段 `fidelity: exact | approximate`。

近似必须报告差异来源和误差预算，并由调用方明确允许；不允许静默忽略字段、自动替换算法、截断颜色表或丢弃透明度。`exact` 指在声明的数值与像元容差内语义等价，不自动表示不同 JPEG 编码器产生逐字节相同文件。

建议能力档案：`core`（gray/rgb/pseudocolor/categorized、固定拉伸和颜色映射）、`stretch-statistics`、`expression`、`terrain`、`mosaic`、`effects`。档案内部还需逐特性声明，不用一个“支持 v2”布尔值掩盖差异。

## 4. 通用约束与默认值

JSON 字段统一 `snake_case`；枚举使用小写。`version` 固定为 `2.0`。根对象必须有 `input` 和 `renderer`。缺省表示规范默认，不表示让目标引擎自行决定。可选的 resampling/effects/opacity/output 对象为空时应省略，不能用空对象占位。

| 字段 | 规范默认/约束 |
|---|---|
| 波段号 | 从 1 开始；是逻辑输入波段 ID，不是输出通道位置 |
| `calibration` | `{"mode":"none"}` |
| `nodata` | `{"mode":"source","use_mask":true}` |
| `resampling` | `{"read":"nearest","warp":"nearest"}` |
| `stretch` | `method=none`、`range_policy=clamp`、`gamma=[1]`，无 Sigmoid |
| `statistics` | 需要统计而未指定时：单源 dataset / 镶嵌 mosaic，sample，sample_size=1000000；发布前必须固定快照 |
| 连续色带 | `interpolation=srgb`、`reverse=false`、`under=clamp`、`over=clamp` |
| 离散色带 | `boundary=left_closed`、`outside_color=#00000000` |
| 精确查表 | `fallback_color=#00000000` |
| `effects` | brightness=0、contrast=1、saturation=1、grayscale=none、invert=false |
| `opacity` | value=1；没有附加规则/Alpha 波段；nodata_color=#00000000 |
| 地形 | Horn、azimuth=315（单向）、altitude=45、z_factor=1、vertical_unit=metre、edge=nodata |
| 地形着色 | strength=0.65 |
| `image` | format=png、size=256、alpha=preserve；WebP 的 lossless=false；有损质量默认 85 |

颜色接受 `#RRGGBB` 或 `#RRGGBBAA`，归一化为小写 8 位 RGBA；Alpha 为非预乘值，范围 0–255。JSON 数值必须有限；禁止裸 NaN/Infinity；NoData 的非有限标记使用字符串。拒绝重复 JSON 对象键、未知普通字段和非法 union 组合。

Schema 中的数值上界和数组长度是本草案的文档上限；服务可收紧预算，并必须通过 capabilities 暴露。Schema 校验不能替代检查波段存在性、单位、数据类型、颜色表与数组之间的关系。

## 5. 输入、校准与 NoData

### 5.1 选择器

`channels` 是互斥 union：

| kind | 字段 | 语义 |
|---|---|---|
| bands | `bands: [1]` 或 `[4,3,2]` | 按列表顺序输出；RGB 顺序即 R/G/B。允许重复波段作通道复用 |
| index | `name`、`bindings`、可选 `parameters` | 以角色绑定计算一个通道 |
| expression | `language`、`expressions` | 一或三个显式输出表达式 |

RGB 必须三输出；其他核心 renderer 必须一输出。结构 Schema 允许的二输出组合在语义校验中拒绝。`opacity.alpha_band` 不计入这三个颜色通道。

指数的角色值均是输入波段号。v2 明确公式，避免“NDWI”歧义：

| name | 角色与公式 |
|---|---|
| ndvi | `(nir-red)/(nir+red)` |
| ndwi_mcfeeters | `(green-nir)/(green+nir)`，对应本地 v1 NDWI 公式 |
| ndmi | `(nir-swir)/(nir+swir)` |
| ndbi | `(swir-nir)/(swir+nir)` |
| evi | `g*(nir-red)/(nir+c1*red-c2*blue+l)`；默认 g=2.5,c1=6,c2=7.5,l=1 |
| savi | `(1+l)*(nir-red)/(nir+red+l)`；默认 l=0.5 |

本表是规范的算法定义，其中五种现有公式与本地 `indices.rs` 核对。除零、非法开方和非有限结果形成无效像元，不能变成值 0。EVI/SAVI 有加法常数，必须确认输入是否为物理反射率，不能默认未经校准的 DN 等价于反射率。

### 5.2 表达式档案 raster-expr/1

只允许有限数值、`bN` 波段引用、括号、正负号、四则运算、比较运算，以及白名单 `abs/min/max/clamp/sqrt/log/exp/pow/where`。`^` 不定义为幂，必须写 `pow(a,b)`。`where(condition,a,b)` 只要求被选分支有效；普通算术要求参与计算的输入有效。比较返回逻辑值，只允许用于 where 条件，不直接充当 RGB 通道。

每个表达式最多 2048 字符；建议执行预算 AST ≤256 节点、深度 ≤32。禁止文件/网络访问、赋值、循环、任意函数和语言运行时 eval。编译为 TiTiler 表达式时应按 AST 转译，逐操作验证，不把原始字符串当 Python 代码拼接。

### 5.3 校准

`calibration.mode` 为 `none`、`metadata`、`linear`。

`metadata` 表示使用源元数据 `value * scale + offset`；这对应 TiTiler 的 `unscale=true` 语义，不是反向求逆。[R3] `linear` 使用 `coefficients:[{band,scale,offset}]`，每个 band 最多一组；未列出依赖波段按单位映射补全。metadata 与 linear 互斥，禁止重复校准。缺失必要元数据或单位时返回绑定错误，不猜测传感器。

### 5.4 NoData 与 mask

`source` 继承源 NoData；`override` 替换源 NoData 数值判断；`ignore` 忽略源 NoData 数值判断。`use_mask` 独立控制源显式 mask/Alpha 掩膜，不能把 ignore 误解为自动关闭 mask。

`override.values` 对所有依赖波段应用同一组值；`override.per_band` 按逻辑波段配置，未列出波段仍继承源值。两者互斥。允许有限数值及 `"nan"/"inf"/"-inf"`。源范围之外一直属于无覆盖，不因 ignore 变成有效数据。

引擎若只能拿到已经合并了 NoData 的 mask，无法可靠拆开数值 NoData 和独立 mask，应声明该组合不支持，不能声称完整遵守 override/ignore。数值无效判断发生在原始样本上，重采样必须排除无效贡献；再校准和计算表达式。

## 6. 拉伸与渲染统计

### 6.1 拉伸方法

| method | 参数 | 解析后表示 |
|---|---|---|
| none | 无范围 | 不估计统计量；灰度/RGB 的显示输入按 8-bit 域解释；数据域色表直接取值 |
| linear | `ranges:[[min,max],...]` | 固定线性映射 |
| minmax | statistics | 固定 min/max |
| percentile | `percentiles:[lo,hi]`，0≤lo<hi≤100 | 固定百分位范围 |
| stddev | `stddev:k`，k>0 | 均值±k×标准差的固定范围 |
| histogram_equalization | statistics | 固定、版本化 CDF 曲线 |
| curve | `curves:[[[x,u],...],...]` | x 严格递增、u 单调不减且位于 [0,1] 的分段线性传递函数 |

ranges/curves/gamma 数量必须为 1（广播）或输出通道数，RGB 最终按 R/G/B 顺序展开。固定范围必须 min<max。推导出的退化范围和空统计集必须报告错误或进入用户显式选择的替代策略，不自动除零。

`percentiles:[2,98]` 表示第 2 与第 98 百分位，不是“下侧裁剪 2、上侧裁剪 98”。范围归一化 `u=(x-min)/(max-min)`，按 range_policy 裁剪至 [0,1] 或把超范围像元设为透明。范围内 Gamma 定义为 `u^(1/gamma)`。Sigmoid 位于 Gamma 之后：

```text
L(u) = 1 / (1 + exp(contrast * (midpoint - u)))
sigmoid(u) = (L(u) - L(0)) / (L(1) - L(0))
```

实现必须数值稳定，并保持端点 0、1。不允许借用别的产品同名 Gamma 参数而不验证指数方向。

`none` 对灰度/RGB 的显示归一化为 clamp(x/255,0,1)；浮点 0–1 影像需要显式 linear `[0,1]`。对 `domain=data` 色表、categorized、single_color 和纯 hillshade，stretch 必须 none、Gamma 必须为 1、无 Sigmoid；它们不经过灰度/RGB 的 x/255 路径。对 `domain=normalized` 伪彩色允许该 none/255 行为，但建议显式 linear。

### 6.2 统计快照

statistics.scope 允许 dataset、mosaic、viewport。统计对象是**与当前校准、选择器和镶嵌阶段相匹配的数值数据**；不能用原始 DN 的范围拉伸已计算的 NDVI。统计必须排除无效值，并记录数据修订、输入绑定、算法版本与精度。

sample_size 是上限不是保证样本数。`sample` 的采样策略、种子/网格和实际样本数必须记录在统计快照中；不同统计提供器不能仅凭同名 sample 声称结果相同。`exact` 不得悄悄退化为 sample；超预算应失败或请求显式降低精度。

viewport 用于类似 DRA 的交互预览；必须绑定同一个范围、CRS、分辨率和数据快照后生成 preview_id。禁止每个 XYZ 瓦片独立统计，也不允许把可变视口统计当稳定发布样式。一个输出瓦片没有有效数据，不应触发重新估计全局范围。

解析器档案需要记录用于拉伸的百分位约定；本规范默认使用排序有效样本上的线性分位数 `h=(n-1)*p/100`，对相邻样本线性插值；stddev 使用总体标准差。此处百分位只用于推导拉伸范围，不表示要求本规范生成分级设色方案。

### 6.3 颜色区间由调用方提供

需要按数值区间着色时，调用方直接提供 `renderer.color_map.mode=discrete` 及 `breaks/colors/boundary`。范围、颜色数量与边界约束见 §7.3；所有瓦片必须使用同一份已确定的区间配置。

核心格式不包含 `classification.method/classes/ramp`，也不要求在渲染阶段调用等距、分位数或 Jenks 分级器。手工输入和外部算法生成的同一组区间必须得到相同渲染结果。生成方法、类别标签和图例展示信息由外层应用自行管理，不写入 RasterStyle。

## 7. 渲染器与颜色映射

### 7.1 renderer.type

| type | 输出依赖 | 显示方式 |
|---|---|---|
| gray | 一个数值通道 | 拉伸后写到 R/G/B，支持 renderer.invert |
| rgb | 三个数值通道 | 按通道顺序分别拉伸后合成 |
| pseudocolor | 一个数值通道 | 连续渐变或离散区间映射 |
| categorized | 一个分类通道 | 精确值查表，或读取源调色板并冻结为精确表 |
| single_color | 一个有效性/规则通道 | 所有有效像元填同一颜色 |
| hillshade | 一个高程通道 | 生成光照灰度，属于 terrain 能力档案 |
| shaded_relief | 一个高程通道 | 高程颜色与阴影合成，属于 terrain 能力档案 |

### 7.2 连续色带 continuous

必须声明 `domain=data|normalized`。data 的 stop.value 是校准/表达式后的值；normalized 的值在拉伸后的 [0,1]。自定义 stops 至少两个，value 严格递增。命名 ramp 在本草案中只允许 normalized 域；发布时解析为固定 stops/LUT 并记录版本。

插值 `srgb` 表示在编码后的 sRGB 通道上插值；`linear_rgb` 表示按标准 sRGB 解码到线性光域后插值，再编码。Alpha 在两种模式下都先预乘插值，再还原非预乘 RGBA；Alpha=0 时 RGB 归零。禁止对透明停靠点的未预乘 RGB 直接插值而引入彩色边缘。

reverse 反转各停靠点上的颜色序列，不改变数据值次序；under/over 可为 clamp 或明确 RGBA 色。没有范围外扩展时，不自行推断新的 stop。命名相同的色带跨库未必采样相同，缓存和一致性测试应依赖实际颜色表。

### 7.3 离散区间 discrete

要求 `domain=data`。N+1 个 breaks 对应 N 个 colors。breaks 严格递增，禁止 NaN、无穷大和零长度区间。

- left_closed：`[b0,b1),[b1,b2),...,[bN-1,bN]`。
- right_closed：`[b0,b1],(b1,b2],...,(bN-1,bN]`。

默认 left_closed；两个极端端点都覆盖。范围之外使用 outside_color。适配 QGIS 或其他采用不同闭合约定的色带时必须转换边界语义，而不只改名。没有无限端点时需要调用方显式决定范围外颜色。

### 7.4 精确值 exact

entries 只包含 value/color，不包含 label/name 等展示字段。值必须唯一；只做数值相等查找，没有自动容差和插值。无法匹配使用 fallback_color。类别通常为整数，但协议允许能精确表示的有限浮点键；适配器若只允许整型键必须拒绝或另行编译，不截断浮点值。

Categorized 数据禁止 bilinear/cubic/lanczos 等会制造新类别的重采样；默认 nearest，mode 只有在实际引擎与金字塔均保证类别语义时可用。连续高程被分级显示不等于分类型原始数据，前者可先连续重采样再按区间着色。已存在错误平均法金字塔时，仅修改请求为 nearest 不能还原真实类别。

## 8. 地形、图像调整与透明度

### 8.1 地形档案

工作网格必须由 RenderContext 解析为水平米制正交网格，并记录目标 CRS、原点和分辨率。vertical_unit=foot 的高程先乘 0.3048，再乘 z_factor。不能把经纬度的“度”直接当米计算梯度。

Horn 使用 3×3 邻域，东西/南北导数按实际网格间距计算；局部坐标为东 x、北 y、上 z。表面法向量 `n=normalize(-dz/dx,-dz/dy,1)`。太阳向量为 `s=(cos(a)*sin(A),cos(a)*cos(A),sin(a))`，A 从北顺时针，a 为高度角。单向明暗 `h=max(0,dot(n,s))`，输出灰度 h。

multidirectional 在本档案固定使用方位角 225/270/315/0 度、相同 altitude、等权平均四个 h。这是本规范的明确算法，不宣称与任何厂商同名多向阴影逐像元相同；需要匹配其他算法时注册不同算法档案。

edge=nodata 表示缺少必要有效邻域时透明。执行器应读取足够 halo，并把额外像素裁掉，保证瓦片无接缝。TiTiler 的 buffer 可能扩大输出尺寸，不能直接当“内部 halo 且自动裁剪”。[R3,R6]

shaded_relief 先取得高程颜色 C，再在**线性 RGB**中乘 `((1-strength)+strength*h)`；Alpha 不因阴影变小。hillshade 本身不再进入原始高程拉伸。需要不同阴影合成方式时使用扩展档案。

### 8.2 图像调整

effects 作用于 renderer 产出的颜色，先于全局 Alpha 和输出背景合成，不作用于原始像元分类值。本档案在 [0,1] 编码 sRGB 上定义：

```text
C1 = clamp((C - 0.5) * contrast + 0.5 + brightness, 0, 1)
L  = 0.2126*R1 + 0.7152*G1 + 0.0722*B1
C2 = clamp(L + saturation*(C1-L), 0, 1)
C3 = grayscale(none: C2; luma: 三通道写入对应加权值; average: 三通道均值)
C4 = invert ? (1-C3) : C3
```

默认颜色效果作用于有效着色像元；NoData 填充色不参与颜色效果。QGIS、ArcGIS 和 rio-color 的同名滑块可能有不同公式、范围和顺序，需要经测试转换。尤其 TiTiler 常规流水线的 color_formula 在 colormap 前，本规范 effects 在 colormap 后；伪彩色不能无条件直接映射。[R6]

### 8.3 透明度

opacity.value 范围 0–1。alpha_band 从其原始波段取值，使用显式 range 归一化到 [0,1]；不应用颜色通道 Gamma，不受 selector 的输出通道个数影响。

规则在 selector 输出的数值域判定：value 精确值、range `[min,max)`（include_max=true 时含上界）、rgb 三通道各自处于目标值±tolerance。规则按数组顺序，第一个匹配生效，未匹配为 1。规则不改动像元数值，也不重做分类。

对有效像元：`A = source_alpha * alpha_band * color_alpha * rule_alpha * opacity.value`。显式 source mask 只表示有效/无效；源 Alpha 使用独立归一化因子，不能既当 Alpha 又乘两遍。

对源覆盖范围内的无效像元：使用 nodata_color，再乘全局 opacity；不再乘“无效=0”的 mask 把该颜色消掉。源覆盖范围外默认透明。源 NoData、分类未匹配、超色带范围是不同情形，分别使用 nodata_color/fallback_color/under-over/outside_color。

`image.alpha=flatten` 时再与明确不透明 background 在**线性 RGB**中合成。JPEG 必须 flatten 且明确给 background；不能默默黑底。PNG/WebP 可 preserve；WebP lossless=true 时不能同时指定有损像元 quality，PNG 不接受该 quality 字段。浏览器层面的透明度由 Map/Layer 管理，不应在瓦片和图层重复乘同一个控制值。

## 9. Mosaic 与固定执行顺序

mosaic 不出现时服务仍可通过上下文是单源；单源服务带 mosaic 应拒绝。镶嵌服务必须有明确策略，禁止从不稳定资产遍历顺序推断。

| pixel_selection | 语义 |
|---|---|
| first | 稳定源顺序中第一个有效像元元组 |
| highest / lowest | 按 rank_channel 比較，从获胜源取完整通道元组；并列按稳定源顺序 |
| mean / median | 对有效样本按通道统计；median 偶数样本取中间两值均值，明确会生成新值 |

rank_channel 默认为 1，只允许 highest/lowest，指相应阶段的通道位置。均值和中位数不得用于 categorized 输入；若需要多数类别，另加明确的类别聚合扩展，不把 mean 改名成 mode。

mosaic.stage 是强制字段：before_channels 在已校准的对应输入波段上镶嵌后计算指数；after_channels 先逐源计算指数/表达式再镶嵌。两者通常不等价，必须进入 hash。before_channels 的输入向量顺序来自固定逻辑波段目录；after_channels 来自 selector 输出顺序。必要输入有无效值的候选按完整元组排除，不能从不同源拼出假的 RGB/指数输入。

固定参考顺序：

```text
授权与数据/样式绑定
→ 源覆盖/原始 NoData/mask 判断
→ read/warp 重采样至共同网格（排除无效贡献）
→ 每源校准（与重采样交换位置只允许已证明等价的优化）
→ before_channels 扩展
→ [mosaic.before_channels]
→ selector / index / expression
→ after_channels 扩展
→ [mosaic.after_channels]
→ 统计快照绑定；不在每个瓦片中求全局统计
→ stretch（仅适用的路径）
→ renderer / color_map / terrain
→ after_color 扩展
→ effects
→ opacity / NoData 填充
→ 背景合成 / 量化 / 编码
```

无效掩膜不等于值 0；mean/median 排除无效样本。地形操作需要邻域，不可简单把每个瓦片的边界当数据边界。任何优化都要证明对掩膜、类别边界、Gamma 顺序和 Alpha 的语义不变。

扩展必须采用命名空间 ID、版本化 config Schema 和已注册能力；同一 stage 的多个扩展按扩展 ID 的字典序执行，并进入执行计划和 hash。未知扩展必须拒绝，不能把未识别的 config 原样转发为任意代码。扩展若改变输出通道、单位或 mask，必须在其档案声明，供后续步骤重新校验。

## 10. JSON → 路由参数：Q2 规范绑定

### 10.1 三种传输形式

**JSON Body** 用于持久化、校验、生成预览；**Q2 inline Query** 用于可控内部接口、无状态预览或引擎适配中间层；**引用 Query** 用于公开生产瓦片和长样式。它们应解析到同一个有效样式，不维护三套配置逻辑。

当前 MapSeek 的 `style_version`/`preview_id` 路由应保留；Q2 不是宣布现有瓦片接口马上允许裸参数。

### 10.2 扁平但不失真

完整绑定表在 `query-bindings-v2.json`。常用字段示例：

| JSON 路径 | Q2 参数 | 编码 |
|---|---|---|
| version | rsv | `2.0` |
| channels.kind | selector | bands/index/expression |
| channels.bands | bidx | 重复：`bidx=4&bidx=3&bidx=2` |
| channels.expressions | expression | 一或三个重复字符串；不是手工按逗号分割 |
| channels.language | expr_lang | raster-expr/1 |
| channels.name/bindings/parameters | index / index_bands / index_params | 字符串 / 局部 JSON / 局部 JSON |
| calibration / nodata | calibration / nodata | 局部 JSON |
| resampling.read / warp | resampling / reproject | 字符串 |
| stretch.method | stretch | linear/percentile/... |
| stretch.ranges | rescale | 重复：`rescale=0,3000&rescale=0,2000` |
| stretch.percentiles / gamma | percentile / gamma | `2,98` / 重复数值 |
| statistics | statistics | 局部 JSON，拉伸所需统计策略在绑定阶段解析 |
| renderer.type | renderer | 字符串 |
| renderer.color_map | cmap | 局部 JSON，不冒充 TiTiler 原生 colormap |
| renderer.terrain | terrain | 局部 JSON |
| effects.* | brightness / contrast / saturation / grayscale / invert | 标量 |
| opacity.value / alpha_band / rules | opacity / alpha_band / alpha_rules | 标量 / 局部 JSON / 局部 JSON |
| mosaic.* | pixel_selection / mosaic_stage / rank_channel | 标量 |
| image.* | format / size / alpha / background / quality / lossless | 标量；颜色去掉 # |

将复杂表限定为 `cmap={...}`、`terrain={...}`，比把所有业务字段硬塞进一个 `style=base64(JSON)` 更便于调试，也比任意深层路径展开更容易做白名单和版本演进。

### 10.3 编码规则

Q2 采用 UTF-8。标量数字必须有限，规范输出采用 JCS 的数字字符串；布尔只写 true/false。Query 按 key 字典序排列，同名重复参数保持原数组顺序。singleton 出现两次，即使相同也报错。只允许绑定注册表中的 key；source/TMS/bbox/auth 参数在另一个经白名单校验的上下文参数集合中处理，不混合解析。

局部 JSON 先 JCS 紧凑序列化，再百分号编码一次。标量颜色使用小写 8 位 RGBA，不带 `#`。空格规范输出 `%20`，表达式中的 `+` 必须 `%2B`；`&`、`#`、`%`、`=` 等均正确编码。禁止拼字符串后再对整个 URL 统一编码，禁止二次 decode。[R10,R11]

```text
正确内部表示：Array<[string,string]> / ordered multimap
错误内部表示：map<string,string>（会丢失多个 bidx / rescale）
```

Q2 编码完整 RasterStyle 的所有已提供字段，不存在合法但被过滤的展示字段；它不是稀疏 patch。需要参数覆盖时，在受信任服务内先合并成完整 RasterStyle，校验并解析后再编码。不得把 Q2 的“缺省”同时解释为“继承服务旧值”和“规范默认”。

对通过校验、完成颜色与数值规范化的 S，`decode(encode(S))` 必须等于完整 S，不得依赖剔除展示字段来通过测试。正式 canonical 参数生成在默认值归一化和解析后执行；配套 codec 测试针对不补全默认值的传输 round-trip。绑定表对局部 JSON 负责传输，内部字段合法性仍由 Schema/语义校验器判定。

### 10.4 同一 RGB 配置的两种 Query

Q2 的可读展示（实际编码器会编码逗号、按 key 排序）：

```text
?rsv=2.0&selector=bands&bidx=4&bidx=3&bidx=2
&renderer=rgb&stretch=linear
&rescale=0,3000&rescale=0,3000&rescale=0,3000
&gamma=1.1&gamma=1.1&gamma=1.1
&resampling=bilinear&reproject=bilinear
&format=png&size=256&alpha=preserve
```

在校准/mask/像元顺序和 Gamma 等价性已验证的 TiTiler COG 2.x 适配器中，编译候选为：

```text
/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png
?url={ENCODED_AUTHORIZED_SOURCE}
&bidx=4&bidx=3&bidx=2
&rescale=0,3000&rescale=0,3000&rescale=0,3000
&color_formula=Gamma%20RGB%201.1
&resampling=bilinear&reproject=bilinear&tilesize=256
```

注意 `renderer/stretch/gamma/size` 不是照抄过去；有些字段变成函数、有些变成路径、有些由编译器消费。此例是文档级候选，不是此次已执行的 TiTiler 集成测试。实际请求必须以部署 OpenAPI 和 adapter profile 为准。[R3–R5]

### 10.5 长 URL 与引用

服务可设置 inline URL 预算，例如编码后 8 KiB，但这是部署策略，不是 HTTP 通用硬限制。必须测量编码后的真实字节数，同时服从 CDN/网关/应用中最小的限制。长颜色表、复杂透明规则或表达式超出预算时，先 POST JSON 保存临时预览或不可变样式快照，再使用短引用。

引用是服务端受控 ID，不是允许客户端指定任意远程 JSON URL。引用解析必须验证租户、数据源权限、过期和版本。内容 hash 是标识，不是访问凭证；不要把签名源 URL 写进公开样式 JSON。

## 11. 后端适配与真实兼容边界

### 11.1 TiTiler

| v2 能力 | 适配策略 | 必须检查 |
|---|---|---|
| bands / expression | COG 的重复 bidx / expression | AST、输出通道数、波段绑定与 mask |
| calibration.metadata | unscale=true | 源 scale/offset 是否一致；只执行一次 |
| 固定 linear ranges | 重复 rescale | 截断、量化和数值精度 |
| percentile/minmax/stddev | precompute → 固定 rescale | 不能直接把百分位参数当 rescale |
| histogram/curve | LUT 或注册算法 | CDF 与插值误差；预算 |
| continuous color_map | 有限表 LUT 或注册连续算法 | 原生整型字典不是任意浮点停靠点插值；近似须显式报告 |
| discrete / exact | 原生区间/查表或自定义算法 | 区间闭合、整型限制、fallback/mask |
| Gamma/Sigmoid | color_formula 或注册算法 | 参数方向、范围、执行顺序 |
| effects + pseudocolor | 常需 after-color 扩展 | 不能把 before-colormap 操作冒充 after-colormap |
| terrain | algorithm + algorithm_params | Horn/单位/halo/边界与真实实现是否一致 |
| output | 后缀、tilesize、编码参数 | 不同 endpoint 的参数/默认值不同 |

官方依赖源码把 Python `resampling_method` 的 HTTP alias 定义为 `resampling`，`reproject_method` 对应 `reproject`；因此不能凭内部变量名拼 URL。TiTiler 2.x 使用 `tilesize` 取代旧 `tile_scale/@Nx`；多资产 reader 与 COG 也不共享相同 bidx 规则。[R4,R5]

Stock colormap 的字典键会转整数。浮点 stop -1/0/1 不等于可直接传三个字典键就得到平滑 NDVI。编译器应按规范取样、控制量化误差并显式标 approximate，或使用连续着色插件。NoData、预乘 Alpha 与边界色也要独立验证。[R4]

### 11.2 ArcGIS ImageServer

主要目标为支持动态渲染的 `exportImage`，不是假设所有 `/tile/{level}/{row}/{col}` 接口都接受动态样式。标准参数中 `bandIds` 从 0 开始；适配器应对该字段转换 v2 的 1-based 逻辑绑定，但不能泛化为所有 Esri 表达式/函数字段均使用同一种索引。[R8]

建议按能力编译为 ExtractBand / BandArithmetic / Stretch / Remap / Colormap / Hillshade 等嵌套 raster function 对象，并放入 `renderingRule` JSON；镶嵌组织放 `mosaicRule`，空间请求放 bbox/size/imageSR，输出放 format。[R9] 上述是计划映射，不是断言所有 ArcGIS 服务都启用这些功能。

固定统计范围应显式传入；DRA 只用于受控 preview。复杂透明/颜色空间或完整对象链无法保持规范语义时，返回 extension/unsupported，不把 JSON 字段任意塞进 renderingRule。

### 11.3 QGIS / QGIS Server

可把 v2 编译成 QML/PyQGIS renderer 后注册到项目样式，再用 WMS `LAYERS`、`STYLES` 选择；`OPACITIES`、FORMAT、BGCOLOR 是服务层参数。WMS 的 SLD/SLD_BODY 是受支持子集，不是 QGIS 所有栅格特性的通用无损容器。[R7]

因此 QGIS 适配通常是“先注册样式，再生成引用 URL”，而不是把 bidx/rescale 原样挂在 WMS 后面。WMS 版本、CRS 轴序、BBOX 和尺寸属于 RenderContext/服务 binding。style 名称和项目必须权限隔离，不允许用户通过参数指定任意本地项目路径。

### 11.4 capabilities 建议响应

```json
{
  "adapter": "titiler-cog",
  "binding_version": "2.x",
  "actual_backend_version": "由部署查询填入",
  "features": {
    "renderer.rgb": {"mode": "native", "fidelity": "exact", "verified": false},
    "stretch.percentile": {"mode": "precompute", "fidelity": "exact", "verified": false},
    "color_map.continuous.data": {"mode": "extension", "fidelity": "exact", "verified": false}
  }
}
```

这是响应形状示例，verified=false 表示尚未通过该部署的一致性测试，不构成兼容性声明。能力探测必须包含 endpoint 类型、算法/色带注册项、允许格式、参数名和成本预算。

## 12. Hash、缓存、安全与错误

### 12.1 Canonical 规则

先执行结构/语义校验、显式默认补齐和颜色规范化，再解析可变依赖，最后用 RFC 8785 JCS 和域分离 SHA-256。[R10]

```text
style_revision = 外层服务保存的样式修订号，不写入 RasterStyle
semantic_hash = SHA256("raster-style-v2\n" + JCS(resolved semantic record))
render_key = SHA256("raster-tile-v2\n" + JCS({
  tenant_cache_scope, semantic_hash,
  source_revision_set, source_order, temporal_slice,
  statistics_snapshot, input_binding_revision,
  algorithm_profile, compiler_version, backend_version, encoder_profile,
  tms_revision, z, x, y, working_grid, format, size
}))
```

资源名称与其他展示信息在外层服务独立管理，不进入样式语义 hash。任何影响像元或输出的字段，包括读取重采样、镶嵌阶段、输出 Alpha、压缩选项、源调色板和算法档案都不能漏掉。核心规范不定义图例或版面的 hash。

JCS 只规范 JSON 字节，不自动替你补默认、做数据绑定或定义近似语义。禁止使用普通语言 Debug 输出当 hash 输入。不得排序 bands、colors、rules、源顺序等有语义的数组。Go/Rust/TS 必须共享 -0、极小/极大浮点和重复参数顺序的 golden vectors。

### 12.2 安全边界

必须做表达式 AST 白名单、JSON/颜色表长度限制、统计与栅格 IO 预算、源 URL 授权、防 SSRF、租户隔离、预览 TTL、算法扩展注册和输出尺寸限制。协议传输和授权相互独立；schema_valid 并不意味着用户有读取该 Dataset 的权限。

URL 参数校验拒绝未知 key、重复 singleton、无效转义、非法数字和冲突格式。路径 `.png` 与输出指定 jpeg 冲突应返回错误，不任意选一个。临时统计、源服务不可用和非法配置应区分，不能把参数错误降级为默认样式而继续出图。

### 12.3 错误模型

```json
{
  "code": "STYLE_FEATURE_UNSUPPORTED",
  "path": "/renderer/color_map",
  "message": "当前适配器未注册数据域连续插值算法",
  "adapter": "titiler-cog/2.x",
  "required_feature": "color_map.continuous.data"
}
```

建议代码包括 STYLE_SCHEMA_INVALID、STYLE_SEMANTIC_INVALID、BAND_BINDING_INVALID、STATISTICS_REQUIRED、STATISTICS_BUDGET_EXCEEDED、STYLE_FEATURE_UNSUPPORTED、STYLE_APPROXIMATION_REQUIRES_APPROVAL、STYLE_QUERY_DUPLICATE、STYLE_QUERY_UNKNOWN、STYLE_REFERENCE_EXPIRED、OUTPUT_ALPHA_UNSUPPORTED。HTTP 映射由服务统一定义；不与业务错误码含混合并。

## 13. v1 迁移与 MapSeek 落地

| v1 | v2 | 迁移注意 |
|---|---|---|
| selector.bands | channels.bands | 明确一通道 gray/三通道 rgb；有色带时按已验证语义推导 renderer |
| index NDWI | ndwi_mcfeeters | 保留现有 green/nir 公式，不改成另一种 NDWI |
| unscale | calibration.metadata / none | 核对真正执行行为与元数据；不是逆向变换 |
| stretch.custom | stretch.linear.ranges | 固定范围保留；按输出通道顺序映射 |
| stretch.percent | stretch.percentile | 确认 lo/hi 和统计作用域；不可无证据假定 v1 一定全局统计 |
| colormap.custom | continuous / discrete / exact | 不能只凭 value/color 列表猜测；检查 v1 pipeline/colormaps 后人工或测试确认 |
| colormap.nodata_color | opacity.nodata_color | 核对与 mask 的实际处理顺序 |
| nodata.none | source 或 ignore | 原语义需审计；不能机械映射 |
| resampling | read / warp | 原字段作用在哪一阶段需要审计；不能擅自同时应用两遍 |
| cubicspline | cubic_spline | v2 统一词汇，适配器再转目标枚举 |
| format/size | output | 保留 64/128/256/512/1024；明确 Alpha/背景 |
| mosaic.pixel_selection | mosaic + stage | 原算法阶段、排序、mask/tie 需审计，不默认等价 |

在当前仓库中建议新增 `shared/rasterstyle/v2/` 的 Schema/语义规范/fixtures，以及 Go/Rust/TS 的类型、normalizer、semantic validator 和 backend compiler。v1/v2 hash 域必须分开。持久化通过 Dataset 服务管理；Gateway 做引用解析/能力校验，Maptile 执行计划。

当前外部 GET 瓦片仍沿用 `style_version` 或 `preview_id`。现有 GET/PUT raster-style API 的 body 可按协议版本分派；PUT 维持完整替换和乐观锁，不恢复已删除的 default_params map。预览 POST 保存完整临时 JSON/计划，返回 preview_id；不要依赖稀疏 Query 拼接保存业务样式。

本地 7 月设计文档描述的裸 Query override 与当前实现不一致，本次 v2 应以实际路由为基线另写变更说明。旧历史参数与旧 hash 不能通过“读时自动转换”静默改变像元效果。迁移应先做离线报告和差异测试，再显式写 v2 或重建发布。

建议实施顺序：先 Core + JSON/Q2 round-trip + 单一真实后端；然后拉伸统计解析、显式颜色映射与稳定缓存；再增强透明/效果、Mosaic、Terrain；最后按需增加像元处理扩展与其他引擎。图例、专题图向导和版面不是本规范的实施阶段。Schema 定义全量词汇不代表第一阶段必须实现所有 renderer。

## 14. 一致性测试与本次交付边界

### 14.1 必须补齐的引擎验收

| 场景 | 断言 |
|---|---|
| RGB 波段重排 | bidx 列表顺序不丢失；红蓝通道不交换 |
| 2/98 百分位 | 同一快照跨瓦片范围一致、无局部重新拉伸 |
| 分级边界 | 每个断点及左右相邻值都按闭合规则落入预期类别 |
| NDVI / NDWI | 波段角色正确，分母 0 透明，不误当值 0 |
| 浮点色带 | 数据域阈值不被 0–255 重标度；LUT 近似误差有报告 |
| NoData / Alpha | 忽略 NoData 不误关闭源 mask；NoData 填充色不被无效 mask 清零 |
| 类别重采样 | 不生成未知中间类别；既有 overviews 语义被验证 |
| Mosaic | before/after selector 结果区别被覆盖，源顺序/tie 可复现 |
| 地形 | 平面 h=sin(altitude)，单位换算正确，邻瓦片边缘连续 |
| JPEG | 强制明确背景；不静默黑底 |
| Query | `+ & # %` 编码、重复 singleton、重复 bidx 顺序、长度预算 |
| 缓存 | 任一像元或输出相关参数变化导致键变化；外层资源名称不进入样式 hash |
| 格式边界 | 拒绝图例、资源展示元数据、类别标签、版面与自动分类方案对象 |
| 权限 | 已知 hash/preview_id 不绕过租户和 Dataset 授权 |
| 跨后端 | 比较 RGBA 像素，不先用 JPEG 误差掩盖渲染差异 |

### 14.2 本次提供的文件

`raster-style-v2.schema.json` 是结构 Schema；`query-bindings-v2.json` 是 46 项固定绑定表；`examples/` 是 11 份渲染配置示例；`query-codec.mjs` 是 Q2 编解码参考实现，配套严格传输测试；`validation-report.json` 记录实际执行结果。

测试参考实现不等于生产 SDK，也不实现引擎、统计解析、授权或完整数据上下文校验。测试中的 JCS 只针对已经解析且无重复键的有限 JSON 值；请求 JSON 重复键在解析入口拒绝。语义检查脚本只覆盖列出的跨字段不变量，不能作为完整服务端 validator。

本次未启动 ArcGIS、QGIS Server 或 TiTiler 进行像元级联调，未修改本地 MapSeek 仓库代码；因此不把适配方案标成已经通过的兼容性实现。

## 15. 参考资料

以下参考来源沿用 draft.1，其记录的链接核验日期为 2026-09-21；本次 draft.2 仅修正规范范围，未重新核验在线文档。公开文档能力需结合真实部署版本进一步验证。

- [R1] ArcGIS Pro Raster symbology：`https://doc.esri.com/en/arcgis-pro/latest/help/data/imagery/symbology-pane.html`
- [R2] QGIS 3.40 Raster Properties：`https://docs.qgis.org/3.40/en/docs/user_manual/working_with_raster/raster_properties.html`
- [R3] TiTiler COG endpoints：`https://developmentseed.org/titiler/endpoints/cog/`
- [R4] TiTiler dependencies（含源码与 HTTP alias）：`https://developmentseed.org/titiler/api/titiler/core/dependencies/`
- [R5] TiTiler 1.x → 2.x migration：`https://developmentseed.org/titiler/migrations/v2_migration/`
- [R6] TiTiler Algorithms / Rendering：`https://developmentseed.org/titiler/user_guide/algorithms/`；`https://developmentseed.org/titiler/user_guide/rendering/`
- [R7] QGIS Server 3.44 WMS：`https://docs.qgis.org/3.44/en/docs/server_manual/services/wms.html`
- [R8] ArcGIS REST Export Image：`https://developers.arcgis.com/rest/services-reference/enterprise/export-image/`
- [R9] ArcGIS Raster Function Objects：`https://developers.arcgis.com/rest/services-reference/enterprise/raster-function-objects/`
- [R10] RFC 8785 JSON Canonicalization Scheme：`https://www.rfc-editor.org/rfc/rfc8785`
- [R11] RFC 3986 URI：`https://www.rfc-editor.org/rfc/rfc3986`
