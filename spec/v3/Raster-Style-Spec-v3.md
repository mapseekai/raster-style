# Raster Style Spec v3

协议版本：`3.0`。查询绑定：`Q3`。日期：2026-10-16。

Raster Style 描述栅格的输入选择、拉伸、颜色、透明度和输出方式。JSON 按功能分组，适合存储、编辑和校验；Q3 使用简短的查询参数名，适合服务请求。TypeScript、Go 和 Rust SDK 使用同一份 Schema 与绑定表。

## 1. 完整示例

```json
{
  "version": "3.0",
  "extensions": ["https://mapseekai.github.io/raster-style/extensions/raster/tile/v1.0.0/schema.json"],
  "renderer": {"type": "rgb", "bidx": [4, 3, 2]},
  "resampling": {"read": "bilinear", "reproject": "bilinear"},
  "stretch": {"method": "linear", "rescale": [[0, 3000]]},
  "nodata": -9999,
  "effects": {
    "color_formula": [
      {"op": "gamma", "channels": "rgb", "value": 1.1},
      {"op": "saturation", "value": 1.2}
    ],
    "post_color_formula": [
      {"op": "brightness", "channels": "rgb", "value": 0.05}
    ]
  },
  "opacity": 1,
  "raster:tile": {"format": "png", "tilesize": 256}
}
```

第 4、3、2 波段分别组成 RGB；三个通道统一按 0–3000 拉伸。颜色公式依次调整 Gamma 和饱和度，渲染后再增加亮度。NoData 像元输出透明，图像为 256×256 PNG。

## 2. 配置分组

| 字段 | 内容 | 默认行为 |
|---|---|---|
| version | 协议版本 | 必填，3.0 |
| renderer | 渲染类型与输入、色表、地形 | 必填 |
| resampling | 读取和重投影重采样 | 两阶段均为 nearest |
| stretch | 数值拉伸 | method=none |
| nodata | 无效像元覆盖值 | 使用数据源 NoData 与有效性掩膜 |
| effects | 映射前、渲染后的颜色操作数组 | 保持原有颜色 |
| opacity | 全局透明度 | 1 |
| calibration | 像元校准 | 原值 |
| statistics | 统计范围、采样与快照 | 按数据上下文解析 |
| extensions | 版本化扩展 Schema URL 数组 | 可省略或为空数组 |

省略可选字段时采用默认行为；可选分组在配置至少一项内容时提供。JSON 数值使用有限 binary64，核心字段名使用 snake_case；扩展字段由各自 Schema 定义。颜色采用 `#RRGGBB` 或 `#RRGGBBAA`，SDK 对核心颜色和官方 Tile.background 统一为小写八位 RGBA；其他扩展内容不作颜色猜测。

以下默认值由渲染服务解析到执行计划；Schema 的 default 是注释，SDK 保留可选字段的省略状态，仅补全颜色操作的 channels。

| 字段 | 默认值 |
|---|---|
| renderer.renderer_invert / renderer.strength | false / 0.65 |
| continuous.interpolation / reverse | srgb / false |
| continuous.under / over | clamp / clamp |
| discrete.boundary / outside_color | left_closed / #00000000 |
| exact.fallback_color | #00000000 |
| terrain.gradient / altitude / azimuth | horn / 45 / 315（single） |
| terrain.z_factor / vertical_unit / edge | 1 / metre / nodata |
| stretch.range_policy | clamp，仅显示路径使用 |
| calibration.mode | none（省略 calibration 时） |
| statistics | 单源 dataset、多源 mosaic；accuracy=sample、sample_size=1000000 |

多源执行必须声明并配置 [Mosaic 扩展](../../extensions/raster/mosaic/v1.0.0/README.md)。尺寸与图像编码由 [Tile 扩展](../../extensions/raster/tile/v1.0.0/README.md)定义。核心样式可独立使用，两项扩展均不是普通解析或完整校验的前提。统计网格、数据源和注册资源由服务上下文绑定；无法解析必需上下文时返回错误。本文、[执行语义](Raster-Style-Execution.md)和[表达式档案](Raster-Expression-v1.md)共同构成规范性契约。

## 3. renderer：输入与渲染

### 3.1 渲染类型

| type | 输入输出要求 | 配置 |
|---|---|---|
| rgb | 三个数值输出 | bidx 或 expression |
| gray | 一个数值输出 | 可选 renderer_invert |
| pseudocolor | 一个数值输出 | colormap_name、colormap 或 color_mapping |
| categorized | 一个分类输出 | 命名/精确值色表，或 source 调色板 |
| single_color | 一个数值输出的有效性 | color 指定固定颜色，数值 0 仍可有效 |
| hillshade | 一个高程输出 | terrain 指定光照 |
| shaded_relief | 一个高程输出 | terrain、颜色映射，可选 strength |

renderer 在 `bidx`、`expression`、`index` 中选择一种输入来源。RGB 按输出顺序对应 R/G/B，其他类型使用一个输出。

gray 在 stretch 与 color_formula 之后执行 renderer_invert：true 时令 `g=1-u`，false 时令 `g=u`，再输出 `(g,g,g)`。渲染后的颜色操作仍按 §7 执行。

### 3.2 波段与表达式

`bidx` 为 1–3 个波段号，波段号取 1–65535，按数组顺序读取。重复波段号表示复用同一输入。

```json
{"renderer":{"type":"rgb","bidx":[4,3,2]}}
```

`expression` 为字符串，多个输出通过分号分隔。每个输出长度 1–2048 个 Unicode 字符。`language` 可显式设为 `raster-expr/1`，也是表达式的默认档案。

```json
{"renderer":{"type":"pseudocolor","expression":"(b8-b4)/(b8+b4)","colormap_name":"viridis"},"stretch":{"method":"linear","rescale":[[-1,1]]}}
```

表达式使用 bN 引用波段，支持有限数值、括号、正负号、四则运算和 abs/min/max/clamp/sqrt/log/exp/pow/where。比较运算用于 where 条件。服务以 AST 编译表达式，除零、非法开方和非有限结果形成无效像元。SDK 校验输出数量、长度与非空条件，并去除各输出两端的 ASCII 空白。

词法、优先级、函数签名和 where 的按分支有效性见 [raster-expr/1](Raster-Expression-v1.md)。SDK 去除的 ASCII 空白为 SP、HT、CR、LF；服务按该档案编译 AST，校验引用波段与函数。

### 3.3 指数

```json
{
  "renderer": {
    "type": "pseudocolor",
    "index": {"name":"ndvi","bindings":{"red":4,"nir":8}},
    "colormap_name": "viridis"
  },
  "stretch": {"method":"linear","rescale":[[-1,1]]}
}
```

| name | 波段角色 | 公式 |
|---|---|---|
| ndvi | red、nir | (nir-red)/(nir+red) |
| ndwi_mcfeeters | green、nir | (green-nir)/(green+nir) |
| ndmi | nir、swir | (nir-swir)/(nir+swir) |
| ndbi | nir、swir | (swir-nir)/(swir+nir) |
| evi | red、nir、blue | g×(nir-red)/(nir+c1×red-c2×blue+l) |
| savi | red、nir | (1+l)×(nir-red)/(nir+red+l) |

index.parameters 可设置 EVI 的 g/c1/c2/l，默认 2.5/6/7.5/1；SAVI 的 l 默认 0.5，范围 0–1。EVI 的 g > 0。EVI/SAVI 使用已确定单位的反射率。

### 3.4 颜色映射

每个带颜色映射的 renderer 选择一个来源：

| 字段 | 结构 | 用途 |
|---|---|---|
| colormap_name | 注册色带名称 | viridis 等命名色带 |
| colormap | 整数键 RGBA 对象或区间数组 | TiTiler 风格色表 |
| color_mapping | 显式映射对象 | 连续、离散、精确值与边界颜色 |

命名色带在发布时解析为固定色表和版本。pseudocolor/shaded_relief 的命名色带固定为 0–255 共 256 项；categorized 的命名色表与原生 colormap 使用数据域精确值对象，服务拒绝不符合所需类型的注册资源。

```json
{"renderer":{"type":"categorized","bidx":[1],"colormap":{"1":[34,139,34,255],"2":[65,105,225,255]}}}
```

原生 colormap 的整数键在 binary64 安全整数范围内，RGBA 每项为 0–255；对象最多 4096 项，按数值精确匹配。区间形式为 `[[[min,max],[r,g,b,a]], ...]`，最多 4096 项，区间升序且互不重叠，min < max；每个区间均为 `[min,max)`，包括最后一个区间。未匹配值与区间间隙输出透明。其输入数值域由 §5 的路径表确定。

color_mapping 支持：

- continuous：domain=data 或 normalized，stops 至少两个，value 严格递增；normalized 的值在 [0,1]。也可在 normalized 域使用注册 ramp。interpolation 为 srgb 或 linear_rgb；reverse 反转颜色序列。under/over 使用 clamp 或 RGBA 色。
- discrete：domain=data，N+1 个严格递增 breaks 对应 N 个 colors。boundary=left_closed 对应 `[b0,b1),…,[bN-1,bN]`；right_closed 对应 `[b0,b1],…,(bN-1,bN]`。范围外使用 outside_color，默认透明。
- exact：entries 包含唯一的 value/color，未匹配时使用 fallback_color，默认透明。
- source：categorized 从单个 bidx 波段读取源调色板；输入必须为 bidx，calibration 省略或 mode=none，附加扩展对类别数据的影响由各自 Schema 与执行约束定义，服务在绑定时核对实际处理后的类别与调色板契约。多源请求须在所有源上绑定同一份规范化调色板，否则服务拒绝。实际颜色表固定在执行计划中，重采样和源金字塔须保持类别编码。

连续颜色插值使用预乘 Alpha，完成后还原为非预乘 RGBA。linear_rgb 在标准 sRGB 解码后的线性光域插值。categorized 使用 nearest，或经过类别与金字塔语义验证的 mode 重采样。

reverse 仅反转 stops 的颜色序列，保留 value 顺序；ramp 先展开为固定 stops 再执行同一规则。under/over 保持各自所属边界。插值 Alpha 为 0 时 RGB 取 0。详见 [颜色计算](Raster-Style-Execution.md#5-颜色与数值计算)。

### 3.5 地形

terrain 使用 Horn 3×3 邻域，工作网格为水平米制正交网格。配置包含 gradient=horn、altitude、z_factor、vertical_unit、edge 和 method。altitude 取 (0,90]，默认 45；z_factor > 0，默认 1；vertical_unit 为 metre/foot；edge=nodata。

method=single 使用 azimuth，范围 [0,360)，默认 315。method=multidirectional 使用 225/270/315/0 度四个等权方向。foot 高程乘 0.3048 后应用 z_factor。

法向量 `n=normalize(-dz/dx,-dz/dy,1)`，光照 `h=max(0,dot(n,s))`。阴影显示为灰度 h；shaded_relief 在线性 RGB 中乘 `((1-strength)+strength*h)`，strength 范围 [0,1]，默认 0.65。服务读取邻域边缘，输出时裁剪到瓦片尺寸。

shaded_relief 在 after_channels 处理完成后分成高程与颜色两条路径：高程路径使用具有确定单位的输出计算梯度；颜色路径执行 stretch、color_formula 和色表。调整颜色路径不得改变高程或 h，两者最后合成。坐标、Horn 权重、光向量和邻域无效规则见[地形执行语义](Raster-Style-Execution.md#6-地形)。

## 4. resampling：重采样

read 指定读取重采样，reproject 指定重投影重采样。两者支持 nearest、bilinear、cubic、cubic_spline、lanczos、average、mode，默认 nearest。

```json
{"resampling":{"read":"bilinear","reproject":"bilinear"}}
```

Query 名称分别为 resampling 与 reproject。有效样本参与重采样，源覆盖与有效性掩膜贯穿执行过程。

掩膜逐波段传递，核支持范围、Alpha 加权和无有效贡献者时的行为见[有效性与重采样](Raster-Style-Execution.md#1-有效性与重采样)。部署档案固定各重采样核和 overview 选择规则。

## 5. stretch 与 statistics

| method | 参数 | 行为 |
|---|---|---|
| none | method | 显示路径使用 x/255；数据路径保持原值 |
| linear | rescale | 固定范围归一化 |
| minmax | statistics | 统计最小值与最大值 |
| percentile | percentiles | 百分位范围 |
| stddev | stddev | 均值±倍数×标准差 |
| histogram_equalization | statistics | 固定 CDF 曲线 |
| curve | curves | 分段线性传递函数 |

rescale 是 `[min,max]` 数组，min < max。一组广播到所有输出，RGB 可提供三组。归一化 `u=(x-min)/(max-min)`；range_policy 默认 clamp，也可选 transparent 将超范围像元设为透明。浮点 0–1 影像可显式使用 rescale=[[0,1]]。

| renderer / 颜色来源 | 映射输入 |
|---|---|
| gray / rgb | 显示路径：stretch → [0,1] → color_formula → renderer |
| pseudocolor/shaded_relief + continuous.normalized | 显示路径；none 的范围为 [0,255]；色带消费连续 u |
| pseudocolor/shaded_relief + colormap_name | 显示路径，颜色操作后取 `floor(255×u+0.5)` 查固定 256 项表 |
| pseudocolor/shaded_relief + 原生 colormap | none 且无 color_formula 时直接消费数据值；其余情况走显示路径，再以 `floor(255×u+0.5)` 查表 |
| continuous.data / discrete.data | 校准、通道计算及镶嵌后的数据值 |
| categorized | 数据域精确值，不量化类别值 |
| single_color / hillshade | 分别使用输入有效性与物理高程 |

显示路径先应用 range_policy，再执行 color_formula，最后判断色带 under/over。clamp 会把超出拉伸范围的值裁剪到端点；transparent 将该像元设为无效，色带不能恢复它。none 的显示范围为 [0,255]，curve 的范围为首尾 x。数据路径要求 method=none、无 color_formula，且不接受 range_policy；其边界由颜色映射自身处理。原生 colormap 的直接数据路径同样不接受 range_policy。

percentiles 满足 0 ≤ low < high ≤ 100；stddev > 0。curves 为一组或每通道一组 `[x,u]` 停靠点：x 严格递增，u 单调不减且位于 [0,1]。显式 data 域 color_mapping、categorized、single_color 和 hillshade 使用各自的数据路径，method=none；显示调整放入 post_color_formula。

statistics.scope 为 dataset/mosaic/viewport；accuracy 为 exact/sample。sample_size 是 1–10000000 的采样上限，仅 sample 可提供，省略时为 1000000。ref 绑定不可变统计快照，scope/accuracy 必填并作为匹配断言，任何依赖不匹配均报错，不重新解释旧快照。viewport 统计由同一视图中的瓦片共享。服务固定统计网格、数据修订和统计结果。百分位采用 `h=(n-1)×p/100` 的线性插值，stddev 使用总体标准差。

无有效样本时输出透明；统计范围退化为 [c,c] 时，有效的 x=c 映射到 0.5，其他值按 range_policy 处理。CDF 定义、采样顺序、快照匹配与缓存依赖见[统计执行语义](Raster-Style-Execution.md#4-统计与退化范围)。

## 6. calibration 与 nodata

calibration.mode 支持 none、metadata、linear。metadata 应用源数据的 `raw×scale+offset`；linear 使用 coefficients 数组，每项为 band/scale/offset，每个 band 一组。未列出的波段使用恒等变换。拉伸范围、表达式和指数以校准后的数值为准。

```json
{"calibration":{"mode":"metadata"},"nodata":-9999}
```

nodata 支持有限数值或字符串 `nan`，表示原始像元的统一无效值。省略时使用源定义。无效像元与源覆盖外区域输出透明；有效性判断先于校准和重采样。源有效性掩膜与源 Alpha 由渲染服务保留。

显式 nodata 替代源 NoData 值判断，仍与源 mask、覆盖范围求交。非有限源样本及校准结果始终无效。RGB 要求三个输出均有效；表达式按实际求值分支传播有效性。single_color 只检查有效性，合法的 0、负值均着色。源 Alpha 的归一化、重采样与镶嵌规则见执行语义 §1–3。

## 7. effects：结构化颜色操作

JSON 中两个字段均为操作对象数组；Query 中使用同名公式字符串。每组包含 1–64 个操作，严格按数组顺序执行，允许重复同一种操作。

| 字段 | 执行阶段 | 操作 |
|---|---|---|
| color_formula | 拉伸后、颜色映射前 | gamma、sigmoidal、saturation |
| post_color_formula | renderer 输出 RGB 后 | gamma、sigmoidal、saturation、brightness、contrast、grayscale、invert |

### 7.1 参数

| op | 参数 | 取值 |
|---|---|---|
| gamma | value、可选 channels | value > 0，1 为恒等 |
| sigmoidal | contrast、midpoint、可选 channels | contrast > 0；0 < midpoint < 1 |
| saturation | value | 0–4，1 为恒等 |
| brightness | value、可选 channels | −1–1，0 为恒等 |
| contrast | value、可选 channels | 0–4，1 为恒等 |
| grayscale | method | luma / average |
| invert | 可选 channels | 反转选中的分量 |

channels 取 r/g/b/rg/rb/gb/rgb。映射前的默认值为：单输出 r、RGB 输出 rgb；映射后的默认值为 rgb。SDK 将默认 channels 补入操作对象，以便 JSON 与 Query 双向转换。saturation 使用三个输出分量，grayscale 使用完整 RGB。

```json
{
  "effects": {
    "color_formula": [
      {"op":"gamma","channels":"r","value":1.1},
      {"op":"gamma","channels":"b","value":0.9},
      {"op":"sigmoidal","channels":"rgb","contrast":6,"midpoint":0.5}
    ],
    "post_color_formula": [
      {"op":"brightness","channels":"rgb","value":0.05},
      {"op":"grayscale","method":"luma"},
      {"op":"invert","channels":"rb"}
    ]
  }
}
```

### 7.2 计算与转换

color_formula 的 gamma/sigmoidal 采用本节公式，saturation 使用 Lab/Lch 的 chroma 缩放；转换常量、裁剪和算法档案见执行语义 §5。适配器记录精确的 rio-color 版本或源码提交，并验证该路径的数值结果。

post_color_formula 在 [0,1] 编码 sRGB 上计算，每一步裁剪至 [0,1]，保持 Alpha。设当前分量为 C，`L=0.2126R+0.7152G+0.0722B`：

| 操作 | 公式 |
|---|---|
| gamma | C^(1/value) |
| brightness | C+value |
| contrast | (C-0.5)×value+0.5 |
| saturation | L+value×(C-L) |
| grayscale | 将 L 或 RGB 均值写入三个通道 |
| invert | 1-C |

sigmoidal 使用 `S(x)=1/(1+exp(contrast×(midpoint-x)))`，输出 `(S(C)-S(0))/(S(1)-S(0))`，采用数值稳定算法保持端点 0、1。

中间结果保持浮点；有限极值的拉伸与 sigmoidal 使用执行语义 §5 的稳定算法。最终 8 位量化只在 Tile 定义的输出边界执行，原生命名/整数色表索引是明确的提前量化边界。

Query 的可读写法：

```text
color_formula=gamma r 1.1, gamma b 0.9, sigmoidal rgb 6 0.5
post_color_formula=brightness rgb 0.05, grayscale luma, invert rb
```

每个操作的参数顺序固定：gamma/brightness/contrast 使用 channels value；sigmoidal 使用 channels contrast midpoint；saturation 使用 value；grayscale 使用 method；invert 使用 channels。

## 8. opacity 与 Tile

opacity 是 [0,1] 数值，默认 1。0 表示全透明，1 表示保持源和颜色映射产生的有效 Alpha。全局透明度只乘入一次：`A=source_alpha×color_alpha×opacity`。

Tile 的网格规划、格式、背景合成、透明度保留、颜色空间、量化和编码约束见 [Tile 1.0.0](../../extensions/raster/tile/v1.0.0/README.md)。其 `raster:tile.tilesize` 参与前置目标网格规划，编码参数作用于最终输出；Tile 不是统一的末尾处理钩子。没有 Tile 的核心样式仍保留完整数值和颜色渲染语义。

## 9. 扩展声明、Schema 与执行能力

核心字段为 version、renderer、resampling、stretch、nodata、calibration、statistics、effects、opacity；`extensions` 是扩展声明数组，每项为带明确不可变版本的 HTTP(S) JSON Schema URL。Schema 使用相同的带版本 `$id`，发布后稳定，不使用可变 latest 地址作为版本标识。数组最多 64 项，不允许重复，顺序保留但不定义执行顺序。

```json
{
  "version": "3.0",
  "extensions": [
    "https://mapseekai.github.io/raster-style/extensions/raster/mosaic/v1.0.0/schema.json",
    "https://mapseekai.github.io/raster-style/extensions/raster/tile/v1.0.0/schema.json"
  ],
  "renderer": {"type": "rgb", "bidx": [4, 3, 2]},
  "resampling": {"read": "bilinear", "reproject": "bilinear"},
  "stretch": {"method": "linear", "rescale": [[0, 3000]]},
  "opacity": 1,
  "raster:mosaic": {"pixel_selection": "first", "stage": "before_channels"},
  "raster:tile": {"format": "webp", "tilesize": 256, "quality": 85}
}
```

配置直接位于完整样式中，不使用公共 version/config 包装，也没有 extension_versions。官方字段 `raster:mosaic` 与 `raster:tile` 由对应 Schema 定义。第三方扩展可以定义一个或多个顶层字段，及字段内部的嵌套结构；名称可以与 URL、路径和前缀完全不同。核心不从 URL 推导字段，不枚举全部扩展，不按命名空间自动授权未定义字段。

扩展 Schema 面向完整样式对象，通过 properties、required 和 extensions.contains 等规则定义字段位置、结构及自身声明关系。可以使用 allOf、条件、引用等 JSON Schema 2020-12 能力，约束自身字段或收紧核心字段的取值。核心既有嵌套对象仍严格校验，扩展不能绕过核心规则。具体示例与注册方式见 [SDK](../../docs/SDK.md)。

不定义所有扩展共同的 type、stage、config、固定阶段、网格保持、通道保持或 Alpha 保持限制。Mosaic 的 stage 仅属于 Mosaic；Tile 的前置规划与输出编码由 Tile 自己定义。处理顺序、调用次数、单位和有效性影响由各扩展和执行端的组合契约确定；无法无歧义组合时拒绝执行，而非按 URL 排序猜测。

### 9.1 组合校验与未知字段

核心 Schema 保持可组合：无非空声明时直接封闭核心字段；存在声明时，以 allOf 组合核心与每个声明的 Schema，最后在组合层使用 `unevaluatedProperties=false`。扩展应仅评价自己定义的字段，不用根 additionalProperties=true 无条件接纳其他字段，否则会削弱拼写检查。SDK 不通过简单拼接 properties 或根据 URL 生成字段白名单替代完整 Schema 校验。

| 层次 | 结果 |
|---|---|
| 配置保留 | 检查核心、可用扩展及 JSON 预算；未取得 Schema 的声明和配置保留其 JSON 语义，报告 complete=false |
| 完整校验 | 所有声明及引用均可解析，组合 Schema 与静态语义通过，未被定义的字段报错；否则不能报告完整通过 |
| 业务执行 | 完整校验后核对执行端是否支持每个精确扩展 URL，以及数据绑定与组合规则；未知扩展或版本明确拒绝 |

未知 Schema 尚未取得时，SDK 无法确定哪些新字段属于该扩展，保留模式不对这些字段作合法性背书。嵌套核心字段、已声明官方字段仍严格检查。完整校验接口对未解析声明或引用返回 `E_SCHEMA_UNRESOLVED`；执行能力缺失返回 `E_UNSUPPORTED_EXTENSION`。取得 Schema 只证明配置可校验，不意味着执行端实现了其业务。

官方资源随 SDK 内嵌，第三方通过本地 SchemaRegistry 注册，引用资源也应注册。默认解析、Query 转换和校验不联网。显式 resolve 回调由应用控制允许域名、凭证、重定向、超时、响应大小及缓存，并验证返回 `$id` 与请求一致。资源在注册表中不可覆盖；版本变化使用新 URL。

### 9.2 当前协议边界

所有输入必须显式提供 version="3.0"。旧版 version、顶层 mosaic/image、对象形式 extensions、extension_versions 和旧版 Query 名称均被拒绝；不根据内容猜测协议，不执行兼容转换。

## 10. 执行顺序与服务集成

```text
绑定数据源、权限与输出工作网格（Tile.tilesize 在此参与）
→ 原始 NoData / mask
→ 读取与重投影重采样 → 校准
→ Mosaic.before_channels（声明并选择时）
→ 波段选择 / 表达式 / 指数
→ Mosaic.after_channels（声明并选择时）
→ 保存物理高程分支（地形 renderer）
→ 统计与拉伸 → effects.color_formula → renderer / 色表
→ 地形光照与颜色合成；hillshade 直接使用高程分支
→ effects.post_color_formula → opacity
→ Tile 背景合成与图像编码（声明时）
```

该图描述核心与两项官方扩展的组合。其他扩展不被放入预设公共阶段；执行端按各自规范及与已有步骤的依赖编译确定计划。Mosaic 的分源调用次数见其独立规范。

样式 SDK 实现 JSON/Q3 编解码、离线 Schema 注册、完整性报告与静态语义校验；执行端支持列表另行显式核对。渲染服务实现波段绑定、表达式执行、统计、算法和像元输出。

MapSeek 的数据源、授权、TMS、z/x/y、CRS、style_version 与 preview_id 由服务上下文管理。发布时固定数据修订、实际色表、统计快照与算法版本。缓存键包含已解析默认值的样式、数据与源顺序、工作/统计网格、统计快照摘要、色表内容摘要、算法/扩展版本和编码配置；颜色操作数组顺序参与 hash。依赖变化后不得命中旧像元缓存。

## 11. Q3 字段绑定

Q3 保留核心字段的简短名称、固定键排序、重复 bidx/rescale 顺序、一次百分号编码和 JCS 规范 JSON。`extensions` 编码版本化 URL 数组；`extension_fields` 编码全部非核心顶层字段的单个 JCS 对象，解码时逐字段放回完整样式，不按点号或斜杠拆解名称。

新增扩展无需修改核心绑定表。完整绑定与词法规则见 [Q3 绑定说明](Raster-Style-Query.md)，唯一绑定资源为 [query-bindings-v3.json](query-bindings-v3.json)。

```text
bidx=4&bidx=3&bidx=2&type=rgb&version=3.0
```

数据源、授权、TMS、坐标和样式引用属于独立请求上下文。适配器先解析完整样式，再将 Tile、Mosaic 与核心字段编译为部署支持的处理计划，不把全部 Q3 参数直接透传给 TiTiler。

## 12. 校验与验收

结构校验覆盖分组、类型、枚举、数值范围、输入来源和颜色映射来源的组合。语义校验覆盖输出通道数量、范围广播、单调曲线、色表边界、校准波段唯一性、分类重采样和编码配置。

公式验收覆盖所有操作、R/B 分离、默认通道、重复步骤、前后阶段和字符串往返。三语言对规范化 JSON 与 Query 进行字节级交叉验证。服务侧以 RGBA 像元样例验证后端执行，再验证编码结果。

执行 `pnpm test:all` 运行生成资源、格式化、TypeScript、Go vet/race、Rust fmt/clippy/test 和三语言往返检查。

[渲染参考向量](../../testdata/rendering-vectors.json)给出小型输入、阶段预期值和 RGBA。`scripts/rendering_reference.py` 校验规范的参考数值，工程检查同时验证这些向量中的样式能被三个 SDK 接受。部署后端须独立运行这些输入并比较像元；参考计算通过不等于后端已验收。验收范围和比较精度见执行语义 §7。

## 13. 参考资料

- [STAC 扩展设计](https://github.com/radiantearth/stac-spec/blob/master/extensions/README.md)：参考版本化 Schema 声明与独立字段定义的设计；本规范采用 JSON Schema 2020-12 的组合封闭规则。
- [JSON Schema 对象与 unevaluatedProperties](https://json-schema.org/understanding-json-schema/reference/object#unevaluated-properties)

- [SDK 使用说明](../../docs/SDK.md)
- [执行语义](Raster-Style-Execution.md)
- [raster-expr/1](Raster-Expression-v1.md)
- [TiTiler 适配档案](Raster-Style-TiTiler-Profile.md)
- [配置示例](../../examples/styles/)
- [TiTiler 参数](https://developmentseed.org/titiler/endpoints/cog/)
- [TiTiler 颜色公式](https://developmentseed.org/titiler/user_guide/rendering/)
- [RFC 8785 JSON Canonicalization](https://www.rfc-editor.org/rfc/rfc8785)
- [RFC 3986 URI](https://www.rfc-editor.org/rfc/rfc3986)
