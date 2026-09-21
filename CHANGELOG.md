# Changelog

## Unreleased

- Raster Style Spec 更新到 2.0.0-draft.3：input.selector → channels，input.calibration → calibration，input.nodata → nodata。
- output → image，tile_size → size；mosaic stage 改为 before_channels / after_channels。
- TS、Go/Fiber、Rust codec、Schema、Q2 绑定和共享测试向量同步更新。

## 0.1.0 — 2026-09-21

- 引入未改写的 Raster Style Spec 2.0.0-draft.2、Schema 和 46 项 Q2 绑定。
- 新增 TypeScript、Go、Rust 双向查询编解码、结构与静态跨字段校验。
- 新增 Fiber v3 原始查询解析、JSON 输出与中间件。
- 新增共享正反例、JCS、跨语言往返、格式化与 CI 质量门禁。

不包含实际像元渲染、统计解析或 TiTiler/ArcGIS/QGIS 参数编译器。
