# Raster Style Q3 绑定

核心协议：3.0。绑定版本：Q3。唯一机器可读资源：[query-bindings-v3.json](query-bindings-v3.json)。三语言 SDK 使用该文件生成的包内资源。

## 核心字段与扩展参数

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
| `calibration` | `calibration` | `json` |
| `statistics` | `statistics` | `json` |
| `extensions` | `extensions` | `json` |
| `*` | `extension_fields` | `json` |

`*` 是绑定表内部的虚拟路径，表示全部非核心顶层字段。`extension_fields` 是传输容器，不是样式业务字段。它的值必须为 JSON 对象，不得包含 version、renderer、extensions 等任何核心顶层字段，避免覆盖核心或绕过专用绑定。编码器仅在非空时输出该参数。

声明编码为单个 extensions 参数，值为 JCS 字符串数组；声明顺序保留，省略和显式空数组分别保留。配置编码为单个 extension_fields 参数，值为全部扩展顶层字段组成的 JCS 对象；每个名称是完整 JSON 字段名，点号、斜杠、冒号、Unicode 不参与路径推导。一个 Schema 可以定义多个字段，未知配置也按相同机制往返。

可读形式（发送时由编码器进行百分号编码）：

```text
extensions=["https://mapseekai.github.io/raster-style/extensions/raster/tile/v1.0.0/schema.json"]
extension_fields={"raster:tile":{"format":"webp","quality":85,"tilesize":256}}
```

## 顺序、重复与编码

编码器按 Query 键的 ASCII 字典序输出。重复 bidx、rescale 保留数组顺序，包括重复值。其他参数为单值，同名出现两次即 E_DUPLICATE_PARAMETER，包括 extensions 和 extension_fields。颜色操作按原顺序转换为公式字符串，允许重复操作，参数顺序与核心规范 §7 一致。

键和值按 UTF-8 编码一次，除 RFC 3986 字母、数字和 `-._~` 外使用大写十六进制百分号编码。空格为 %20，加号为 %2B，逗号为 %2C。解码器接受可选前导问号、未排序键和小写百分号十六进制，重编码统一规范形式；不接受原始加号、空白、非编码 Unicode、片段符号、畸形百分号或非法 UTF-8。

数字使用有限 binary64 与 JSON 数字词法，布尔仅 true/false；专用整数参数还满足安全整数及对应字段范围。标量颜色为八位 rrggbbaa，不含 #；JSON 中颜色继续含 #。核心颜色与官方 Tile.background 可输入六位或八位，并规范化为小写八位；其他扩展的类似颜色字符串保持原值。

局部 JSON 使用 RFC 8785 JCS：对象成员按 UTF-16 键序排序、数值规范化、数组顺序保留。SDK 拒绝重复键、非有限数字及非法 Unicode。往返保持 JSON 语义，不保留空白、原始对象顺序或数字词法。

## 校验与预算

输入必须显式提供 version=3.0。只有绑定表中的 Query 名称合法；旧图像与镶嵌短参数不转换为扩展。extension_fields 合并后仍经过核心与可用扩展 Schema 校验。未取得 Schema 时配置被保留，但不等于完整校验通过，执行前须显式检查。

默认 Query 上限 8192 个 UTF-8 字节、256 个参数；JSON 2 MiB、深度 64。编码与解码均检查预算。超长样式由服务端样式引用传输，不由 SDK 截断。若声明 Tile，服务路由输出格式必须与实际 Tile.format 一致。

[SDK 接口](../../docs/SDK.md)说明配置保留、完整校验和执行支持检查。
