# Raster Style Spec v2

协议版本：`2.0`。查询绑定：`Q2`。日期：2026-09-26。

Raster Style 描述栅格的输入选择、拉伸、颜色、透明度和输出方式。JSON 按功能分组，适合存储、编辑和校验；Q2 使用简短的查询参数名，适合服务请求。TypeScript、Go 和 Rust SDK 使用同一份 Schema 与绑定表。

## 1. 完整示例

```json
{
  "version": "2.0",
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
  "image": {"format": "png", "tilesize": 256}
}
```

第 4、3、2 波段分别组成 RGB；三个通道统一按 0–3000 拉伸。颜色公式依次调整 Gamma 和饱和度，渲染后再增加亮度。NoData 像元输出透明，图像为 256×256 PNG。

## 2. 配置分组

| 字段 | 内容 | 默认行为 |
|---|---|---|
| version | 协议版本 | 必填，2.0 |
| renderer | 渲染类型与输入、色表、地形 | 必填 |
| resampling | 读取和重投影重采样 | 两阶段均为 nearest |
| stretch | 数值拉伸 | method=none |
| nodata | 无效像元覆盖值 | 使用数据源 NoData 与有效性掩膜 |
| effects | 映射前、渲染后的颜色操作数组 | 保持原有颜色 |
| opacity | 全局透明度 | 1 |
| image | 格式、尺寸、编码 | png、256 像素 |
| calibration | 像元校准 | 原值 |
| statistics | 统计范围、采样与快照 | 按数据上下文解析 |
| mosaic | 多源像元选择 | 单源请求可省略 |
| extensions | 注册的像元处理扩展 | 按需配置 |

省略可选字段时采用默认行为；可选分组在配置至少一项内容时提供。JSON 数值使用有限 binary64，字段名使用 snake_case。颜色采用 `#RRGGBB` 或 `#RRGGBBAA`，SDK 统一为小写八位 RGBA。

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
| mosaic.rank_channel | 1，仅 highest/lowest 使用 |
| image.quality / lossless / background | 85 / false / #000000ff，仅适用的编码模式使用 |

多源请求必须显式提供 mosaic。统计网格、数据源和注册资源由服务上下文绑定；无法解析必需上下文时返回错误。本文、[执行语义](Raster-Style-Execution.md)和[表达式档案](Raster-Expression-v1.md)共同构成规范性契约。

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
- source：categorized 从单个 bidx 波段读取源调色板；输入必须为 bidx，calibration 省略或 mode=none，扩展仅允许 after_color。多源请求须在所有源上绑定同一份规范化调色板，否则服务拒绝。实际颜色表固定在执行计划中，重采样和源金字塔须保持类别编码。

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

中间结果保持浮点；有限极值的拉伸与 sigmoidal 使用执行语义 §5 的稳定算法。最终 8 位量化只在 §8 的输出边界执行，原生命名/整数色表索引是明确的提前量化边界。

Query 的可读写法：

```text
color_formula=gamma r 1.1, gamma b 0.9, sigmoidal rgb 6 0.5
post_color_formula=brightness rgb 0.05, grayscale luma, invert rb
```

每个操作的参数顺序固定：gamma/brightness/contrast 使用 channels value；sigmoidal 使用 channels contrast midpoint；saturation 使用 value；grayscale 使用 method；invert 使用 channels。

## 8. opacity 与 image

opacity 是 [0,1] 数值，默认 1。0 表示全透明，1 表示保持源和颜色映射产生的有效 Alpha。全局透明度只乘入一次：`A=source_alpha×color_alpha×opacity`。

image.format 为 png/webp/jpeg，默认 png。tilesize 为 64/128/256/512/1024，默认 256。PNG/WebP 保留透明度；JPEG 将结果与 background 在线性 RGB 中合成，默认背景为不透明黑色。

background 接受不透明 RGBA 色。quality 范围 1–100，适用于 JPEG 和有损 WebP，默认 85。WebP 的 lossless 默认为 false；无损 WebP 使用 lossless=true，编码参数由该模式确定。

编码输入固定为 sRGB 的 8 位非预乘 RGB/RGBA，各分量按 `floor(255×clamp(C,0,1)+0.5)` 量化，并使用执行语义 §5 的半整数浮点容差；色表索引采用同一规则。最终 Alpha 量化为 0 时 RGB 统一为 0。JPEG 在线性 RGB 合成后转回 sRGB，再量化。PNG 和无损 WebP 验证解码后的 RGBA；JPEG/有损 WebP 的编解码版本、选项与误差界限由部署档案固定。

```json
{"opacity":0.8,"image":{"format":"jpeg","tilesize":512,"quality":90,"background":"#ffffffff"}}
```

## 9. mosaic 与 extensions

多源请求提供 mosaic.pixel_selection 与 mosaic.stage：

| pixel_selection | 行为 |
|---|---|
| first | 按稳定源顺序选择首个有效像元元组 |
| highest / lowest | 以 rank_channel 排序，选择完整元组；并列按源顺序 |
| mean / median | 对有效样本按通道聚合；偶数中位数取中间两值均值 |

stage=before_channels 在已校准输入波段上镶嵌后计算表达式/指数；after_channels 先逐源计算，再镶嵌。rank_channel 默认 1，仅供 highest/lowest 使用，编号从 1 开始：before_channels 对应所有输入依赖波段去重后按原始波段号升序排列的列表，after_channels 对应输出通道顺序。例：bidx=[4,3,2] 的输入依赖表为 [2,3,4]，before_channels 的 rank_channel=1 指波段 2。SDK 检查 bidx/index 的已知范围，服务在 AST 编译后检查 expression 的范围。类别输出采用 first/highest/lowest 等保留类别的策略。

```json
{"mosaic":{"pixel_selection":"first","stage":"before_channels"}}
```

extensions 使用命名空间 ID，每项提供 version、stage、config。stage 为 before_channels/after_channels/after_color，同一阶段按 ID 的 ASCII 字典序执行。服务注册扩展的参数结构、单位和有效性规则；扩展必须保持网格、通道数量与顺序。阶段内扩展先于该阶段的镶嵌，具体调用次数见执行语义 §2。地形扩展须保持高程单位，类别扩展须保持类别编码。after_color 接受和返回非预乘浮点 RGBA，并保留 Alpha。

## 10. 执行顺序与服务集成

```text
绑定数据源、权限与工作网格
→ 原始 NoData / mask
→ 读取与重投影重采样
→ 校准
→ 每源 before_channels 扩展
→ before_channels 镶嵌（若选择该阶段）
→ 波段选择 / 表达式 / 指数
→ after_channels 扩展（输入已镶嵌则一次，否则逐源）
→ after_channels 镶嵌（若选择该阶段）
→ 保存物理高程分支（地形 renderer）
→ 统计与拉伸 → effects.color_formula → renderer / 色表
→ 地形光照与颜色合成（shaded_relief）；hillshade 直接使用高程分支
→ after_color 扩展
→ effects.post_color_formula
→ opacity
→ 背景合成与图像编码
```

样式 SDK 实现 JSON/Q2 编解码、Schema 和静态语义校验。渲染服务实现波段绑定、表达式执行、统计、算法和像元输出。

MapSeek 的数据源、授权、TMS、z/x/y、CRS、style_version 与 preview_id 由服务上下文管理。发布时固定数据修订、实际色表、统计快照与算法版本。缓存键包含已解析默认值的样式、数据与源顺序、工作/统计网格、统计快照摘要、色表内容摘要、算法/扩展版本和编码配置；颜色操作数组顺序参与 hash。依赖变化后不得命中旧像元缓存。

## 11. Q2 字段绑定

JSON 分组路径转换为简短 Query 名称。绑定表 `query-bindings-v2.json` 与 Schema 一同生成三语言资源。

| JSON 路径 | Query 名称 | 编码 |
|---|---|---|
| `version` | `version` | `string` |
| `renderer.type` | `type` | `string` |
| `renderer.renderer_invert` | `renderer_invert` | `boolean` |
| `renderer.color` | `color` | `color` |
| `renderer.color_mapping` | `color_mapping` | `json` |
| `renderer.colormap` | `colormap` | `json` |
| `renderer.colormap_name` | `colormap_name` | `string` |
| `renderer.terrain` | `terrain` | `json` |
| `renderer.strength` | `strength` | `number` |
| `renderer.bidx` | `bidx` | `repeat_integer` |
| `renderer.expression` | `expression` | `string` |
| `renderer.language` | `language` | `string` |
| `renderer.index` | `index` | `json` |
| `resampling.read` | `resampling` | `string` |
| `resampling.reproject` | `reproject` | `string` |
| `stretch.method` | `method` | `string` |
| `stretch.rescale` | `rescale` | `repeat_pair` |
| `stretch.range_policy` | `range_policy` | `string` |
| `stretch.percentiles` | `percentiles` | `pair` |
| `stretch.stddev` | `stddev` | `number` |
| `stretch.curves` | `curves` | `json` |
| `nodata` | `nodata` | `nodata` |
| `opacity` | `opacity` | `number` |
| `effects.color_formula` | `color_formula` | `formula` |
| `effects.post_color_formula` | `post_color_formula` | `post_formula` |
| `image.format` | `format` | `string` |
| `image.tilesize` | `tilesize` | `integer` |
| `image.quality` | `quality` | `integer` |
| `image.lossless` | `lossless` | `boolean` |
| `image.background` | `background` | `color` |
| `calibration` | `calibration` | `json` |
| `statistics` | `statistics` | `json` |
| `extensions` | `extensions` | `json` |
| `mosaic.pixel_selection` | `pixel_selection` | `string` |
| `mosaic.stage` | `stage` | `string` |
| `mosaic.rank_channel` | `rank_channel` | `integer` |

bidx/rescale 使用重复参数并保留顺序。其他数组和对象按绑定类型编码为 JCS 局部 JSON，颜色操作数组编码为公式字符串。标量颜色写成小写八位 rrggbbaa。

Query 使用 UTF-8，键按字典序排列，每个值进行一次百分号编码。空格为 %20，加号为 %2B，逗号为 %2C。每个单值 key 出现一次。表达式和公式在解码后按结构校验；颜色操作名称和数值使用规范形式。

上述排序和大写百分号十六进制属于编码器的规范输出。解码器接受未排序键、小写百分号十六进制和可选的前导 `?`，随后按同一规则重编码；重复 bidx/rescale 保持遇到顺序。原始 `+`、未编码的空白、非法 UTF-8、未知 key 和重复单值 key 均报错。标量布尔值仅 true/false，数字词法与 JSON 数字一致；JSON 颜色接受六位或八位，Query 标量颜色必须为八位且不带 #。局部 JSON 的颜色继续带 #。

默认预算为 Query 8192 字节、256 个参数，JSON 2 MiB、嵌套深度 64。长样式通过服务端样式引用传输。路径格式与 image.format 保持一致。

```text
/tiles/{z}/{x}/{y}.png?bidx=4&bidx=3&bidx=2&color_formula=gamma%20rgb%201.1&method=linear&opacity=1&rescale=0%2C3000&tilesize=256&type=rgb&version=2.0
```

post_color_formula 是项目的渲染后操作参数。TiTiler 适配器消费样式字段并编译为该部署支持的请求或处理步骤。适配 async-geotiff 时按其 TileStyle 和颜色表结构转换；后端能力由部署档案与像元测试确定。

## 12. 校验与验收

结构校验覆盖分组、类型、枚举、数值范围、输入来源和颜色映射来源的组合。语义校验覆盖输出通道数量、范围广播、单调曲线、色表边界、校准波段唯一性、分类重采样和编码配置。

公式验收覆盖所有操作、R/B 分离、默认通道、重复步骤、前后阶段和字符串往返。三语言对规范化 JSON 与 Query 进行字节级交叉验证。服务侧以 RGBA 像元样例验证后端执行，再验证编码结果。

执行 `pnpm test:all` 运行生成资源、格式化、TypeScript、Go vet/race、Rust fmt/clippy/test 和三语言往返检查。

[渲染参考向量](../../testdata/rendering-vectors.json)给出小型输入、阶段预期值和 RGBA。`scripts/rendering_reference.py` 校验规范的参考数值，工程检查同时验证这些向量中的样式能被三个 SDK 接受。部署后端须独立运行这些输入并比较像元；参考计算通过不等于后端已验收。验收范围和比较精度见执行语义 §7。

## 13. 参考资料

- [SDK 使用说明](../../docs/SDK.md)
- [执行语义](Raster-Style-Execution.md)
- [raster-expr/1](Raster-Expression-v1.md)
- [TiTiler 适配档案](Raster-Style-TiTiler-Profile.md)
- [配置示例](../../examples/styles/)
- [TiTiler 参数](https://developmentseed.org/titiler/endpoints/cog/)
- [TiTiler 颜色公式](https://developmentseed.org/titiler/user_guide/rendering/)
- [RFC 8785 JSON Canonicalization](https://www.rfc-editor.org/rfc/rfc8785)
- [RFC 3986 URI](https://www.rfc-editor.org/rfc/rfc3986)
