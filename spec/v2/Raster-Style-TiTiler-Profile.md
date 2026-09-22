# TiTiler 风格查询绑定

[Raster Style Spec v2](Raster-Style-Spec-v2.md) 定义分组 JSON、结构化颜色公式和单值透明度。JSON 用于编辑与存储，Q2 使用 TiTiler 风格名称传输。

常用映射：renderer.bidx → bidx；stretch.rescale → rescale；resampling.read → resampling；effects.color_formula → color_formula；effects.post_color_formula → post_color_formula。

颜色操作在 JSON 中为对象数组，在 Query 中为有序公式字符串。完整字段、参数范围、执行顺序和路由示例见主规范 §7 与 §11。

三语言 SDK 使用同一份 Schema 与绑定表。服务适配器结合后端版本和像元验收结果生成执行请求。
