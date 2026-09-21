# Raster Style Spec v2

**状态：MapSeek 项目规范提案，2.0.0-draft.3**  
**日期：2026-09-21**  
**JSON 协议版本：`2.0`；规范查询绑定：`Q2`**  
**定位：栅格数据的样式渲染格式，描述数值像元如何生成栅格图像。**

本文件是 v2 实施提案。MUST/必须、SHOULD/应、MAY/可分别表示强制、建议和可选要求。实现须通过 JSON Schema 结构校验，以及跨字段语义、数据上下文和适配器能力校验。后端支持情况以各部署的一致性测试为准。

## 1. 协议设计

**JSON 是持久化和交换的业务协议；Query 是传输绑定；适配器将样式语义编译为后端执行计划。**

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

后端适配需逐项确认原生能力、统计预计算和插件需求，并报告适配结果。传输时，简单字段使用短参数和重复参数，复杂颜色表使用局部 JSON，长配置使用服务端样式引用。

### 1.1 栅格渲染能力

本规范描述如何根据栅格输入、样式和渲染上下文，生成确定的像元颜色、透明度及输出图像。核心字段以渲染和输出行为为依据。

RasterStyle 管理像元渲染参数，包括地形计算所需的物理单位。图例、类别标签、版面及资源名称等展示和管理信息由外层应用负责。

颜色映射支持连续色带、离散区间和精确值查表。调用方将手工或自动分级生成的断点与颜色写入 `color_map`。影像显示支持百分位拉伸、直方图均衡及相关统计。

JSON Schema 和 Q2 按注册字段严格校验，未知字段返回错误。`extensions` 用于注册的像元处理能力。

## 2. 渲染能力与配置

### 2.1 官方能力参照

设计参照包括 QGIS 3.40 栅格符号系统、QGIS Server 3.44 WMS、ArcGIS Pro/REST 和 TiTiler 接口文档。桌面渲染概念和服务接口分别用于模型设计与后端适配。[R1–R7]

| 参照对象 | 渲染能力参照 | 适配重点 |
|---|---|---|
| ArcGIS Pro | RGB、拉伸、精确值/区间着色、地形显示等栅格渲染概念 | 参数尺度、函数对象与动态渲染路由 |
| QGIS | 灰度、伪彩色、调色板、Linear/Discrete/Exact 区分、透明度与地形显示 | QML/PyQGIS 样式注册与 WMS 引用 |
| TiTiler / rio-tiler | 波段、表达式、rescale、colormap、图像处理、算法与瓦片输出的请求组织 | COG/STAC 绑定差异、颜色查表精度与算法顺序 |

### 2.2 栅格样式配置目录

下表列出 v2 的渲染配置及对应字段。

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
| 渲染扩展 | 色相、更多颜色空间、特定像元滤镜 | 版本化 `extensions`，需独立能力定义 |

Map/Layer 配置负责图层混合、Z 顺序和比例尺可见性；数据处理服务负责高程编码、金字塔、原始数据压缩和 CRS 修复。

## 3. 分层、对象与一致性级别

### 3.1 RasterStyle

可持久化和交换的渲染配置，支持百分位拉伸、命名色带和显式连续/离散/精确颜色表。结构见 `raster-style-v2.schema.json`。

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

### 3.2 RenderContext：渲染上下文

RenderContext 由受信任服务提供：租户/权限、Dataset 和数据修订、逻辑波段目录、实际资产绑定、源顺序、时间/高度切片、TMS、z/x/y、目标范围/CRS/分辨率、可用统计快照、工作网格、后端版本、编码器与执行预算。

`url`、访问令牌、存储路径、`bbox`、`z/x/y` 和租户 ID 由上下文管理。绑定层负责将逻辑波段映射到具体资产及其波段。

### 3.3 ResolvedStyle / RenderPlan

解析阶段必须产出：

```text
ResolvedStyle
  schema_version
  complete_render_style       补全有效默认值
  input_binding_revision      逻辑波段 → 固定源资产/波段/单位
  source_revision_set         含 mosaic 的稳定成员顺序
  statistics_snapshot         范围、算法、精度、样本、数据修订
  resolved_palette            固定的实际停靠点/查找表
  resolved_ranges_or_curves   明确 min/max 或固定 CDF/曲线
  validated_breaks            已校验的显式颜色区间边界
  algorithm_profile           表达式、梯度、拉伸等算法版本
  semantic_hash
```

上述为执行计划契约，由渲染服务实现；配套 Schema 定义用户编辑的 RasterStyle。

发布样式必须固定范围、断点和色表，或绑定内容不可变的解析快照，供各瓦片请求复用。

### 3.4 适配结果

编译器对每个特性返回以下之一：`native` 原生表达、`precompute` 先求值/生成表、`extension` 需已注册插件、`unsupported` 不支持。另有独立字段 `fidelity: exact | approximate`。

近似必须报告差异来源和误差预算，并获得调用方明确允许。编译器须逐项处理字段；算法替换、颜色表精简和透明度调整均按此规则报告。`exact` 表示在声明的数值与像元容差内语义等价，编码文件的字节一致性需单独验证。

建议能力档案：`core`（gray/rgb/pseudocolor/categorized、固定拉伸和颜色映射）、`stretch-statistics`、`expression`、`terrain`、`mosaic`、`effects`。各档案须逐项声明特性支持情况。

## 4. 通用约束与默认值

JSON 字段统一 `snake_case`，枚举使用小写。根对象必须包含 `version: "2.0"`、`channels` 和 `renderer`。缺省字段采用规范默认值；可选的 resampling/effects/opacity/image 对象为空时应省略。

| 字段 | 规范默认/约束 |
|---|---|
| 波段号 | 从 1 开始的逻辑输入波段 ID |
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

颜色接受 `#RRGGBB` 或 `#RRGGBBAA`，归一化为小写 8 位 RGBA；Alpha 为非预乘值，范围 0–255。JSON 数值必须有限；NoData 的非有限标记使用字符串。拒绝重复 JSON 对象键、未知普通字段和非法 union 组合。

Schema 中的数值上界和数组长度是本草案的文档上限；服务可收紧预算，并必须通过 capabilities 暴露。结构校验后，还须检查波段存在性、单位、数据类型及颜色表与数组的对应关系。

## 5. 输入、校准与 NoData

### 5.1 选择器

`channels` 是互斥 union：

| kind | 字段 | 语义 |
|---|---|---|
| bands | `bands: [1]` 或 `[4,3,2]` | 按列表顺序输出；RGB 顺序即 R/G/B。允许重复波段作通道复用 |
| index | `name`、`bindings`、可选 `parameters` | 以角色绑定计算一个通道 |
| expression | `language`、`expressions` | 一或三个显式输出表达式 |

RGB 必须三输出，其他核心 renderer 必须一输出，由语义校验器检查。`opacity.alpha_band` 作为独立透明度通道处理。

指数的角色值均是输入波段号。v2 明确公式，避免“NDWI”歧义：

| name | 角色与公式 |
|---|---|
| ndvi | `(nir-red)/(nir+red)` |
| ndwi_mcfeeters | `(green-nir)/(green+nir)` |
| ndmi | `(nir-swir)/(nir+swir)` |
| ndbi | `(swir-nir)/(swir+nir)` |
| evi | `g*(nir-red)/(nir+c1*red-c2*blue+l)`；默认 g=2.5,c1=6,c2=7.5,l=1 |
| savi | `(1+l)*(nir-red)/(nir+red+l)`；默认 l=0.5 |

除零、非法开方和非有限结果形成无效像元。EVI/SAVI 含加法常数，输入须确认为物理反射率。

### 5.2 表达式档案 raster-expr/1

只允许有限数值、`bN` 波段引用、括号、正负号、四则运算、比较运算，以及白名单 `abs/min/max/clamp/sqrt/log/exp/pow/where`。幂运算使用 `pow(a,b)`。`where(condition,a,b)` 只要求被选分支有效；普通算术要求参与计算的输入有效。比较返回逻辑值，仅用于 where 条件。

每个表达式最多 2048 字符；建议执行预算为 AST ≤256 节点、深度 ≤32。执行环境限于白名单运算，文件/网络访问、赋值、循环和 eval 均须拒绝。编译为 TiTiler 表达式时按 AST 转译并逐操作验证。

### 5.3 校准

`calibration.mode` 为 `none`、`metadata`、`linear`。

`metadata` 表示使用源元数据 `value * scale + offset`；对应 TiTiler 的 `unscale=true` 语义。[R3] `linear` 使用 `coefficients:[{band,scale,offset}]`，每个 band 最多一组；未列出依赖波段按单位映射补全。metadata 与 linear 二选一，执行一次校准；缺失必要元数据或单位时返回绑定错误。

### 5.4 NoData 与 mask

`source` 继承源 NoData；`override` 替换源 NoData 数值判断；`ignore` 忽略源 NoData 数值判断。`use_mask` 独立控制源显式 mask/Alpha 掩膜。

`override.values` 对所有依赖波段应用同一组值；`override.per_band` 按逻辑波段配置，未列出波段仍继承源值。两者互斥。允许有限数值及 `"nan"/"inf"/"-inf"`。所有模式下，源范围之外均为无覆盖区域。

引擎若只能拿到已经合并了 NoData 的 mask，无法可靠拆开数值 NoData 和独立 mask，须将该 override/ignore 组合标记为 `unsupported`。数值无效判断发生在原始样本上，重采样必须排除无效贡献；再校准和计算表达式。

## 6. 拉伸与渲染统计

### 6.1 拉伸方法

| method | 参数 | 解析后表示 |
|---|---|---|
| none | 无范围 | 灰度/RGB 按 8-bit 显示域解释；数据域色表直接取值 |
| linear | `ranges:[[min,max],...]` | 固定线性映射 |
| minmax | statistics | 固定 min/max |
| percentile | `percentiles:[lo,hi]`，0≤lo<hi≤100 | 固定百分位范围 |
| stddev | `stddev:k`，k>0 | 均值±k×标准差的固定范围 |
| histogram_equalization | statistics | 固定、版本化 CDF 曲线 |
| curve | `curves:[[[x,u],...],...]` | x 严格递增、u 单调不减且位于 [0,1] 的分段线性传递函数 |

ranges/curves/gamma 数量必须为 1（广播）或输出通道数，RGB 最终按 R/G/B 顺序展开。固定范围必须 min<max。推导出的退化范围和空统计集必须报告错误或进入用户显式选择的替代策略。

`percentiles:[2,98]` 表示第 2 与第 98 百分位。范围归一化 `u=(x-min)/(max-min)`，按 range_policy 裁剪至 [0,1] 或把超范围像元设为透明。范围内 Gamma 定义为 `u^(1/gamma)`。Sigmoid 位于 Gamma 之后：

```text
L(u) = 1 / (1 + exp(contrast * (midpoint - u)))
sigmoid(u) = (L(u) - L(0)) / (L(1) - L(0))
```

实现必须数值稳定，并保持端点 0、1。适配其他产品的 Gamma 参数时须验证指数方向。

`none` 对灰度/RGB 的显示归一化为 clamp(x/255,0,1)；浮点 0–1 影像需要显式 linear `[0,1]`。对 `domain=data` 色表、categorized、single_color 和纯 hillshade，stretch 必须 none、Gamma 必须为 1、无 Sigmoid，直接使用各自的渲染路径。对 `domain=normalized` 伪彩色允许该 none/255 行为，但建议显式 linear。

### 6.2 统计快照

statistics.scope 允许 dataset、mosaic、viewport。统计对象是**与当前校准、选择器和镶嵌阶段相匹配的数值数据**。统计必须排除无效值，并记录数据修订、输入绑定、算法版本与精度。

sample_size 为采样数量上限。`sample` 的策略、种子/网格和实际样本数必须记录在统计快照中，供复现与比较。`exact` 须保持声明精度，超预算时返回错误，或由调用方明确选择降低精度。

viewport 用于类似 DRA 的交互预览，须绑定统一的范围、CRS、分辨率和数据快照，再生成 preview_id。各瓦片复用同一统计快照，包括无有效数据的瓦片；发布时须固定统计结果。

解析器档案需要记录用于拉伸的百分位约定；本规范默认使用排序有效样本上的线性分位数 `h=(n-1)*p/100`，对相邻样本线性插值；stddev 使用总体标准差。

### 6.3 颜色区间由调用方提供

需要按数值区间着色时，调用方直接提供 `renderer.color_map.mode=discrete` 及 `breaks/colors/boundary`。范围、颜色数量与边界约束见 §7.3；所有瓦片必须使用同一份已确定的区间配置。

手工输入和外部算法生成的同一组区间须得到相同渲染结果。生成方法、类别标签和图例由外层应用管理。

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

插值 `srgb` 表示在编码后的 sRGB 通道上插值；`linear_rgb` 表示按标准 sRGB 解码到线性光域后插值，再编码。Alpha 在两种模式下都先预乘插值，再还原非预乘 RGBA；Alpha=0 时 RGB 归零。

reverse 反转各停靠点的颜色序列，保留数据值顺序；under/over 可为 clamp 或明确 RGBA 色。范围外行为按显式配置处理。缓存和一致性测试使用实际颜色表，以固定跨库采样差异。

### 7.3 离散区间 discrete

要求 `domain=data`。N+1 个 breaks 对应 N 个 colors。breaks 必须为有限数值且严格递增。

- left_closed：`[b0,b1),[b1,b2),...,[bN-1,bN]`。
- right_closed：`[b0,b1],(b1,b2],...,(bN-1,bN]`。

默认 left_closed；两个极端端点都覆盖。范围之外使用 outside_color。适配 QGIS 或其他采用不同闭合约定的色带时必须转换边界语义。调用方须显式确定范围外颜色。

### 7.4 精确值 exact

entries 由 value/color 组成，value 必须唯一。查找按数值精确相等匹配，未匹配时使用 fallback_color。键可为整数或能精确表示的有限浮点数。仅支持整型键的后端须另行编译浮点配置，或返回 `unsupported`。

Categorized 数据默认使用 nearest；mode 须经引擎与金字塔的类别语义验证。bilinear/cubic/lanczos 会生成新类别，应在校验时拒绝。已有金字塔也须保持原始类别。连续高程的区间着色可先连续重采样，再映射颜色。

## 8. 地形、图像调整与透明度

### 8.1 地形档案

工作网格必须由 RenderContext 解析为水平米制正交网格，并记录目标 CRS、原点和分辨率。vertical_unit=foot 的高程先乘 0.3048，再乘 z_factor。经纬度数据须先转换到该工作网格。

Horn 使用 3×3 邻域，东西/南北导数按实际网格间距计算；局部坐标为东 x、北 y、上 z。表面法向量 `n=normalize(-dz/dx,-dz/dy,1)`。太阳向量为 `s=(cos(a)*sin(A),cos(a)*cos(A),sin(a))`，A 从北顺时针，a 为高度角。单向明暗 `h=max(0,dot(n,s))`，输出灰度 h。

multidirectional 在本档案固定使用方位角 225/270/315/0 度、相同 altitude、等权平均四个 h。匹配其他多向阴影算法时，须注册对应算法档案。

edge=nodata 表示缺少必要有效邻域时透明。执行器应读取足够 halo，并把额外像素裁掉，保证瓦片无接缝。适配 TiTiler buffer 时须检查输出尺寸，并显式处理裁剪。[R3,R5]

shaded_relief 先取得高程颜色 C，再在**线性 RGB**中乘 `((1-strength)+strength*h)`；Alpha 保持原值，hillshade 直接使用光照结果。需要不同阴影合成方式时使用扩展档案。

### 8.2 图像调整

effects 作用于 renderer 产出的颜色，先于全局 Alpha 和输出背景合成。本档案在 [0,1] 编码 sRGB 上定义：

```text
C1 = clamp((C - 0.5) * contrast + 0.5 + brightness, 0, 1)
L  = 0.2126*R1 + 0.7152*G1 + 0.0722*B1
C2 = clamp(L + saturation*(C1-L), 0, 1)
C3 = grayscale(none: C2; luma: 三通道写入对应加权值; average: 三通道均值)
C4 = invert ? (1-C3) : C3
```

默认颜色效果作用于有效着色像元；NoData 填充色在后续步骤应用。QGIS、ArcGIS 和 rio-color 的同名滑块可能有不同公式、范围和顺序，需要经测试转换。尤其 TiTiler 常规流水线的 color_formula 在 colormap 前，本规范 effects 在 colormap 后；伪彩色适配须保持此执行顺序。[R5]

### 8.3 透明度

opacity.value 范围 0–1。alpha_band 从其原始波段取值，使用显式 range 归一化到 [0,1]；其处理独立于颜色通道 Gamma 和 selector 输出数量。

规则在 selector 输出的数值域判定：value 精确值、range `[min,max)`（include_max=true 时含上界）、rgb 三通道各自处于目标值±tolerance。规则按数组顺序，第一个匹配生效，未匹配为 1。规则仅计算透明度，保留原有像元值和分类。

对有效像元：`A = source_alpha * alpha_band * color_alpha * rule_alpha * opacity.value`。显式 source mask 只表示有效/无效；源 Alpha 作为独立归一化因子乘入一次。

对源覆盖范围内的无效像元：使用 nodata_color，再乘全局 opacity，作为最终填充色。源覆盖范围外默认透明。源 NoData、分类未匹配、超色带范围是不同情形，分别使用 nodata_color/fallback_color/under-over/outside_color。

`image.alpha=flatten` 时与显式不透明 background 在**线性 RGB**中合成。JPEG 必须使用 flatten 并指定 background，PNG/WebP 支持 preserve。quality 适用于 JPEG 和有损 WebP；PNG 或 WebP lossless=true 时指定 quality 应报错。浏览器图层透明度由 Map/Layer 独立管理，每个控制值应用一次。

## 9. Mosaic 与固定执行顺序

上下文确定数据源类型：单源请求省略 mosaic，携带该字段时返回错误；镶嵌请求须显式指定策略，并使用稳定的资产顺序。

| pixel_selection | 语义 |
|---|---|
| first | 稳定源顺序中第一个有效像元元组 |
| highest / lowest | 按 rank_channel 比較，从获胜源取完整通道元组；并列按稳定源顺序 |
| mean / median | 对有效样本按通道统计；median 偶数样本取中间两值均值，明确会生成新值 |

rank_channel 默认为 1，只允许 highest/lowest，指相应阶段的通道位置。均值和中位数适用于连续数值；categorized 输入须使用保留类别的策略，多数类别聚合通过扩展定义。

mosaic.stage 是强制字段：before_channels 在已校准的对应输入波段上镶嵌后计算指数；after_channels 先逐源计算指数/表达式再镶嵌。阶段会影响结果，必须进入 hash。before_channels 的输入向量顺序来自固定逻辑波段目录；after_channels 来自 selector 输出顺序。候选元组的必要输入须全部有效，RGB/指数输入保持源内完整性。

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
→ 绑定预先确定的统计快照
→ stretch（仅适用的路径）
→ renderer / color_map / terrain
→ after_color 扩展
→ effects
→ opacity / NoData 填充
→ 背景合成 / 量化 / 编码
```

有效性由掩膜独立表示，mean/median 排除无效样本。地形操作须读取跨瓦片邻域。优化须保持掩膜、类别边界、Gamma 顺序和 Alpha 语义。

扩展必须采用命名空间 ID、版本化 config Schema 和已注册能力；同一 stage 的多个扩展按扩展 ID 的字典序执行，并进入执行计划和 hash。未知扩展返回错误。扩展若改变输出通道、单位或 mask，必须在其档案声明，供后续步骤重新校验。

## 10. JSON → 路由参数：Q2 规范绑定

### 10.1 三种传输形式

**JSON Body** 用于持久化、校验、生成预览；**Q2 inline Query** 用于可控内部接口、无状态预览或引擎适配中间层；**引用 Query** 用于公开生产瓦片和长样式。三种形式共用样式解析逻辑。

MapSeek 公开瓦片路由使用 `style_version`/`preview_id` 引用。

### 10.2 字段绑定

完整绑定表在 `query-bindings-v2.json`。常用字段示例：

| JSON 路径 | Q2 参数 | 编码 |
|---|---|---|
| version | rsv | `2.0` |
| channels.kind | selector | bands/index/expression |
| channels.bands | bidx | 重复：`bidx=4&bidx=3&bidx=2` |
| channels.expressions | expression | 一或三个重复字符串 |
| channels.language | expr_lang | raster-expr/1 |
| channels.name/bindings/parameters | index / index_bands / index_params | 字符串 / 局部 JSON / 局部 JSON |
| calibration / nodata | calibration / nodata | 局部 JSON |
| resampling.read / warp | resampling / reproject | 字符串 |
| stretch.method | stretch | linear/percentile/... |
| stretch.ranges | rescale | 重复：`rescale=0,3000&rescale=0,2000` |
| stretch.percentiles / gamma | percentile / gamma | `2,98` / 重复数值 |
| statistics | statistics | 局部 JSON，拉伸所需统计策略在绑定阶段解析 |
| renderer.type | renderer | 字符串 |
| renderer.color_map | cmap | 局部 JSON |
| renderer.terrain | terrain | 局部 JSON |
| effects.* | brightness / contrast / saturation / grayscale / invert | 标量 |
| opacity.value / alpha_band / rules | opacity / alpha_band / alpha_rules | 标量 / 局部 JSON / 局部 JSON |
| mosaic.* | pixel_selection / mosaic_stage / rank_channel | 标量 |
| image.* | format / size / alpha / background / quality / lossless | 标量；颜色去掉 # |

复杂对象使用 `cmap={...}`、`terrain={...}` 等局部 JSON，便于调试、字段校验和版本演进。

### 10.3 编码规则

Q2 采用 UTF-8。标量数字必须有限，规范输出采用 JCS 的数字字符串；布尔只写 true/false。Query 按 key 字典序排列，同名重复参数保持原数组顺序。singleton 出现两次，即使相同也报错。只允许绑定注册表中的 key；source/TMS/bbox/auth 参数在另一个经白名单校验的上下文参数集合中处理，与 Q2 分别解析。

局部 JSON 先 JCS 紧凑序列化，再百分号编码一次。标量颜色使用小写 8 位 RGBA，不带 `#`。空格规范输出 `%20`，表达式中的 `+` 必须 `%2B`；`&`、`#`、`%`、`=` 等均正确编码。按参数分别编码后组装查询串；解码执行一次。[R9,R10]

```text
内部表示：Array<[string,string]> / ordered multimap
保留 bidx / rescale 等重复参数及其顺序
```

Q2 编码完整 RasterStyle 的所有已提供字段，缺省遵循规范默认。需要覆盖参数时，先在受信任服务内合并为完整样式，校验并解析后再编码。

对已校验并完成颜色、数值规范化的 S，`decode(encode(S))` 必须等于完整 S，保留字段省略状态。用于渲染的 canonical 参数在默认值补齐和解析后生成。局部 JSON 的内部字段由 Schema 和语义校验器检查。

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

适配器将 `renderer/stretch/gamma/size` 编译为函数、路径或执行配置。上例为待集成验证的请求方案，实际请求以部署 OpenAPI 和 adapter profile 为准。[R3,R4]

### 10.5 长 URL 与引用

服务按部署环境设置 inline URL 预算，例如编码后 8 KiB。必须测量编码后的真实字节数，同时服从 CDN/网关/应用中最小的限制。长颜色表、复杂透明规则或表达式超出预算时，先 POST JSON 保存临时预览或不可变样式快照，再使用短引用。

引用使用服务端受控 ID，解析时验证租户、数据源权限、过期时间和版本。内容 hash 用于标识，访问权限单独校验；签名源 URL 由受信任上下文管理。

## 11. 后端适配

### 11.1 TiTiler

| v2 能力 | 适配策略 | 必须检查 |
|---|---|---|
| bands / expression | COG 的重复 bidx / expression | AST、输出通道数、波段绑定与 mask |
| calibration.metadata | unscale=true | 源 scale/offset 是否一致；只执行一次 |
| 固定 linear ranges | 重复 rescale | 截断、量化和数值精度 |
| percentile/minmax/stddev | precompute → 固定 rescale | 先解析统计范围，再生成 rescale |
| histogram/curve | LUT 或注册算法 | CDF 与插值误差；预算 |
| continuous color_map | 有限表 LUT 或注册连续算法 | 验证浮点插值与量化精度，报告近似误差 |
| discrete / exact | 原生区间/查表或自定义算法 | 区间闭合、整型限制、fallback/mask |
| Gamma/Sigmoid | color_formula 或注册算法 | 参数方向、范围、执行顺序 |
| effects + pseudocolor | 常需 after-color 扩展 | 保持 after-colormap 执行顺序 |
| terrain | algorithm + algorithm_params | Horn/单位/halo/边界与真实实现是否一致 |
| image | 后缀、tilesize、编码参数 | 不同 endpoint 的参数/默认值不同 |

官方依赖源码把 Python `resampling_method` 的 HTTP alias 定义为 `resampling`，`reproject_method` 对应 `reproject`，适配时使用 HTTP alias。TiTiler 2.x 使用 `tilesize` 指定瓦片尺寸；多资产 reader 与 COG 分别按各自 bidx 规则绑定。[R4]

Stock colormap 使用整数键。浮点连续色带须按规范采样、控制量化误差并标记 `approximate`，或使用连续着色插件。NoData、预乘 Alpha 与边界色须单独验证。[R4]

### 11.2 ArcGIS ImageServer

以支持动态渲染的 `exportImage` 为主要适配目标。其 `bandIds` 从 0 开始，适配器须转换 v2 的 1-based 逻辑绑定；其他表达式和函数字段按各自索引约定处理。[R7]

建议按能力编译为 ExtractBand / BandArithmetic / Stretch / Remap / Colormap / Hillshade 等嵌套 raster function 对象，并放入 `renderingRule` JSON；镶嵌组织放 `mosaicRule`，空间请求放 bbox/size/imageSR，输出放 format。[R8] 部署时须确认服务已启用相应功能。

固定统计范围应显式传入；DRA 只用于受控 preview。复杂透明/颜色空间或完整对象链无法保持规范语义时，返回 extension/unsupported。

### 11.3 QGIS / QGIS Server

可把 v2 编译成 QML/PyQGIS renderer 后注册到项目样式，再用 WMS `LAYERS`、`STYLES` 选择；`OPACITIES`、FORMAT、BGCOLOR 是服务层参数。使用 SLD/SLD_BODY 时须核对服务支持的特性子集。[R6]

QGIS 适配采用“注册样式 → 生成引用 URL”的流程。WMS 版本、CRS 轴序、BBOX 和尺寸由 RenderContext/服务绑定管理。样式和项目须按权限隔离，项目路径由服务端控制。

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

上例展示响应结构，`verified=false` 表示该部署的一致性测试待完成。能力探测须涵盖 endpoint 类型、算法/色带注册项、允许格式、参数名和成本预算。

## 12. Hash、缓存、安全与错误

### 12.1 Canonical 规则

先执行结构/语义校验、显式默认补齐和颜色规范化，再解析可变依赖，最后用 RFC 8785 JCS 和域分离 SHA-256。[R9]

```text
style_revision = 外层服务保存的样式修订号
semantic_hash = SHA256("raster-style-v2\n" + JCS(resolved semantic record))
render_key = SHA256("raster-tile-v2\n" + JCS({
  tenant_cache_scope, semantic_hash,
  source_revision_set, source_order, temporal_slice,
  statistics_snapshot, input_binding_revision,
  algorithm_profile, compiler_version, backend_version, encoder_profile,
  tms_revision, z, x, y, working_grid, format, size
}))
```

样式语义 hash 覆盖所有影响像元和输出的配置，包括读取重采样、镶嵌阶段、Alpha、压缩选项、源调色板和算法档案。资源名称等展示信息由外层服务独立管理。

默认值补齐、数据绑定和近似语义解析完成后，使用 JCS 规范 JSON 字节作为 hash 输入。保留 bands、colors、rules 和源顺序等数组的语义顺序。Go/Rust/TS 须共享 -0、极小/极大浮点和重复参数顺序的 golden vectors。

### 12.2 安全边界

必须做表达式 AST 白名单、JSON/颜色表长度限制、统计与栅格 IO 预算、源 URL 授权、防 SSRF、租户隔离、预览 TTL、算法扩展注册和输出尺寸限制。Dataset 读取权限须独立于 Schema 校验执行。

URL 参数校验须拒绝未知 key、重复 singleton、无效转义、非法数字和冲突格式。路径 `.png` 与输出 jpeg 冲突时返回错误。临时统计问题、源服务不可用和非法配置分别报告，参数错误终止渲染。

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

建议代码包括 STYLE_SCHEMA_INVALID、STYLE_SEMANTIC_INVALID、BAND_BINDING_INVALID、STATISTICS_REQUIRED、STATISTICS_BUDGET_EXCEEDED、STYLE_FEATURE_UNSUPPORTED、STYLE_APPROXIMATION_REQUIRES_APPROVAL、STYLE_QUERY_DUPLICATE、STYLE_QUERY_UNKNOWN、STYLE_REFERENCE_EXPIRED、OUTPUT_ALPHA_UNSUPPORTED。HTTP 映射由服务统一定义，并与业务错误码明确区分。

## 13. 服务集成

Dataset 服务管理样式持久化，Gateway 解析样式引用并校验能力，Maptile 执行渲染计划。

公开瓦片请求通过 `style_version` 或 `preview_id` 引用样式。GET/PUT raster-style API 按协议版本处理 JSON，PUT 使用完整替换和乐观锁。预览 POST 保存完整临时样式及执行计划，返回 `preview_id`。

瓦片缓存绑定解析后的样式内容 hash。各后端通过 capabilities 声明已实现的 renderer 和特性。

## 14. 一致性测试与交付文件

### 14.1 引擎验收要求

| 场景 | 断言 |
|---|---|
| RGB 波段重排 | bidx 顺序保持，R/G/B 对应正确 |
| 2/98 百分位 | 同一快照跨瓦片使用一致范围 |
| 分级边界 | 每个断点及左右相邻值都按闭合规则落入预期类别 |
| NDVI / NDWI | 波段角色正确，分母 0 时标记无效并输出透明 |
| 浮点色带 | 保留数据域阈值；报告 LUT 近似误差 |
| NoData / Alpha | NoData 与源 mask 独立控制；正确保留 NoData 填充色 |
| 类别重采样 | 保留原始类别，验证既有 overviews 语义 |
| Mosaic | before/after selector 结果区别被覆盖，源顺序/tie 可复现 |
| 地形 | 平面 h=sin(altitude)，单位换算正确，邻瓦片边缘连续 |
| JPEG | 使用显式指定的背景合成 |
| Query | `+ & # %` 编码、重复 singleton、重复 bidx 顺序、长度预算 |
| 缓存 | 像元或输出参数变化时更新键；资源名称变化时保持样式 hash |
| 格式边界 | 拒绝图例、资源展示元数据、类别标签、版面与自动分类方案对象 |
| 权限 | 通过 hash/preview_id 访问时执行租户和 Dataset 授权 |
| 跨后端 | 先比较 RGBA 像素，再单独验证有损编码 |

### 14.2 配套文件

- `raster-style-v2.schema.json`：结构 Schema。
- `query-bindings-v2.json`：46 项 Q2 字段绑定。
- [examples/styles/](../../examples/styles/)：18 份渲染配置示例。
- [testdata/](../../testdata/)：共享正反例、参考查询和 JCS 测试向量。
- [SDK 使用说明](../../docs/SDK.md)：TypeScript、Go/Fiber 和 Rust 编解码接口。

`pnpm test:all` 执行工程校验和跨语言往返测试，结果写入 `.build/validation-report.json`。校验内容见[验证与安全](../../docs/VALIDATION.md)。

上述后端适配方案处于设计阶段，完成 §14.1 的像元级联调后再标记为已验证。

## 15. 参考资料

参考资料的链接核验日期为 2026-09-21。实际能力以部署版本及一致性测试结果为准。

- [R1] ArcGIS Pro Raster symbology：`https://doc.esri.com/en/arcgis-pro/latest/help/data/imagery/symbology-pane.html`
- [R2] QGIS 3.40 Raster Properties：`https://docs.qgis.org/3.40/en/docs/user_manual/working_with_raster/raster_properties.html`
- [R3] TiTiler COG endpoints：`https://developmentseed.org/titiler/endpoints/cog/`
- [R4] TiTiler dependencies（含源码与 HTTP alias）：`https://developmentseed.org/titiler/api/titiler/core/dependencies/`
- [R5] TiTiler Algorithms / Rendering：`https://developmentseed.org/titiler/user_guide/algorithms/`；`https://developmentseed.org/titiler/user_guide/rendering/`
- [R6] QGIS Server 3.44 WMS：`https://docs.qgis.org/3.44/en/docs/server_manual/services/wms.html`
- [R7] ArcGIS REST Export Image：`https://developers.arcgis.com/rest/services-reference/enterprise/export-image/`
- [R8] ArcGIS Raster Function Objects：`https://developers.arcgis.com/rest/services-reference/enterprise/raster-function-objects/`
- [R9] RFC 8785 JSON Canonicalization Scheme：`https://www.rfc-editor.org/rfc/rfc8785`
- [R10] RFC 3986 URI：`https://www.rfc-editor.org/rfc/rfc3986`
