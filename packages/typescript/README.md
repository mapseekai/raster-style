# raster-style — TypeScript

Raster Style 3.0 与 Q3 的严格 JSON / Query 编解码、离线 Schema 注册、静态语义校验和规范化。SDK 版本为 0.4.0，运行环境为 Node.js 22 及以上。

```sh
npm install @mapseek/raster-style@0.4.0
```

```ts
import { parseStyle, validateStyle, encodeQuery } from '@mapseek/raster-style';
const style = parseStyle(styleJSON);
validateStyle(style);
const query = encodeQuery(style);
```

核心字段保留渲染、重采样、校准、统计、拉伸、颜色效果和透明度语义。Mosaic 和 Tile 通过版本化 Schema URL 声明，配置为顶层 raster:mosaic 与 raster:tile。核心样式可独立使用。

SchemaRegistry 内置两个官方扩展及核心 Schema，并支持注册第三方完整样式 Schema。字段位置和结构由 Schema 定义，不从 URL 推导。第三方可定义多个字段，Query 通用传输无需增加专用绑定。

解析接口保留扩展声明和扩展字段，完整校验接口核对所有声明及引用的 Schema。执行端可按扩展的精确版本检查支持情况。解析与校验使用内置及已注册资源，应用可通过显式 resolve 回调提供 Schema 解析。

接口、预算、错误码和示例见[SDK 文档](https://github.com/mapseekai/raster-style/blob/v0.4.0/docs/SDK.md)、[核心规范](https://github.com/mapseekai/raster-style/blob/v0.4.0/spec/v3/Raster-Style-Spec-v3.md)与[Q3 绑定](https://github.com/mapseekai/raster-style/blob/v0.4.0/spec/v3/Raster-Style-Query.md)。
