# Tile 扩展 1.0.0

适用核心协议：Raster Style 3.0。完整样式 Schema：[schema.json](schema.json)。不可变版本标识：

```text
https://mapseekai.github.io/raster-style/extensions/raster/tile/v1.0.0/schema.json
```

本扩展在完整样式顶层定义 `raster:tile`。字段名称、位置、结构及声明关系由 Schema 明确定义。声明本扩展时，`extensions` 必须包含上述精确 URL，并提供至少一项 Tile 参数。

```json
{
  "version": "3.0",
  "extensions": [
    "https://mapseekai.github.io/raster-style/extensions/raster/tile/v1.0.0/schema.json"
  ],
  "renderer": { "type": "gray", "bidx": [1] },
  "opacity": 0.8,
  "raster:tile": { "format": "jpeg", "tilesize": 512, "quality": 90, "background": "#ffffffff" }
}
```

## 参数、默认值与适用条件

| 参数       | 类型与范围                  | 默认值与规则                                               |
| ---------- | --------------------------- | ---------------------------------------------------------- |
| format     | png / webp / jpeg           | png                                                        |
| tilesize   | 64 / 128 / 256 / 512 / 1024 | 256，目标正方形瓦片宽高                                    |
| quality    | 整数 1–100                  | 85，仅 JPEG 与有损 WebP；PNG 和 lossless=true 不接受此字段 |
| lossless   | boolean                     | WebP 默认 false；该字段仅在显式 format=webp 时提供         |
| background | #RRGGBB 或不透明 #RRGGBBFF  | #000000ff，JPEG 背景合成使用                               |

颜色大小写可输入，SDK 将官方 Tile background 规范化为小写八位 RGBA。背景 Alpha 必须为 1。默认值只在相应模式下适用，由执行计划解析；SDK 保留省略状态。不接受未知参数或空对象。background 可以随配置保留，但只有 JPEG 编码采用背景合成。

## 目标网格规划与最终编码

`tilesize` 参与读取、重投影和渲染前的目标网格规划。执行端结合 TMS、z/x/y、CRS、范围与分辨率确定输出变换和尺寸，提前读取地形或其他处理所需的邻域，最终裁剪到目标尺寸。改变尺寸必须相应改变输出计划与缓存依赖，而不是在最后随意缩放已有像元。统计网格仍按核心 statistics 契约独立固定，不因瓦片尺寸改变而擅自重定义统计范围。

`format`、`quality`、`lossless` 与 `background` 决定最终合成和编码。Tile 同时涉及前置目标网格与输出边界，不能把整个扩展解释为最后一次后处理，也不要求其他扩展接受相同执行模型。

核心样式可独立使用；没有 Tile 时，核心渲染结果由调用方消费，所需网格由调用上下文约定。普通核心样式解析和完整校验不要求声明 Tile。核心 `opacity` 的值域和一次性 Alpha 乘法仍由核心规范定义。

## 颜色、透明度与量化

PNG/WebP 保留透明度；JPEG 将结果与 background 在线性 RGB 中合成，默认背景为不透明黑色。quality 的默认值为 85，适用于 JPEG 和有损 WebP。WebP 的 lossless 默认为 false；无损 WebP 使用 lossless=true，编码参数由该模式确定。

编码输入固定为 sRGB 的 8 位非预乘 RGB/RGBA。各分量按 `floor(255×clamp(C,0,1)+0.5)` 量化；若 `255×clamp(C,0,1)` 距最近半整数不超过 1e-10，先吸附到该半整数。色表索引使用核心定义的同一规则。中间颜色保持 binary64，不因 Tile 结构变化提前量化。最终 Alpha 量化为 0 时 RGB 统一为 0。

JPEG 在线性 RGB 合成后转回 sRGB，再量化。对每个分量，先解码前景与背景的 sRGB，计算 `linear_result=alpha×linear_foreground+(1-alpha)×linear_background`，再编码回 sRGB。全局透明度在进入编码前只乘一次：`A=source_alpha×color_alpha×opacity`。

sRGB 解码为 `c/12.92`（c≤0.04045），否则 `((c+0.055)/1.055)^2.4`；线性分量编码为 `12.92c`（c≤0.0031308），否则 `1.055c^(1/2.4)-0.055`。半整数容差仅用于颜色量化，不得改变数据域类别比较或分级边界。

PNG 和无损 WebP 验证解码后的 RGBA，不要求编码字节相同。JPEG/有损 WebP 在编码前先匹配参考 RGB，编码后的容差、色度采样、库版本与选项由部署档案固定。

## 版本与验收

Schema 独立校验配置及适用条件，执行端还须验证工作网格、实际编码器与背景合成。发布后的 v1.0.0 Schema 和语义保持稳定；变更使用新的版本化地址。SDK 内置 Schema 支持离线完整校验；渲染端须单独声明并验证对此精确扩展版本的支持。

参考契约见[核心颜色与数值计算](../../../../spec/v3/Raster-Style-Execution.md#5-颜色与数值计算)、[执行语义验收](../../../../spec/v3/Raster-Style-Execution.md#7-验收)及[适配档案](../../../../spec/v3/Raster-Style-TiTiler-Profile.md)。
