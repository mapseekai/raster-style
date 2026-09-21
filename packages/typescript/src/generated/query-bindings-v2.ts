// Generated from spec/v2/query-bindings-v2.json. Do not edit.
export default {
  "binding_version": "Q2",
  "spec_version": "2.0",
  "description": "Every field belongs to raster rendering and must have a Q2 binding. No presentation fields are silently removed. Unknown query keys and duplicate singleton keys are errors. Keys sort lexically; occurrences of the same repeated key retain array order. JSON codec uses RFC 8785 JCS in production.",
  "bindings": [
    {
      "key": "rsv",
      "path": "version",
      "codec": "string"
    },
    {
      "key": "selector",
      "path": "input.selector.kind",
      "codec": "string"
    },
    {
      "key": "bidx",
      "path": "input.selector.bands",
      "codec": "repeat_integer"
    },
    {
      "key": "index",
      "path": "input.selector.name",
      "codec": "string"
    },
    {
      "key": "index_bands",
      "path": "input.selector.bindings",
      "codec": "json"
    },
    {
      "key": "index_params",
      "path": "input.selector.parameters",
      "codec": "json"
    },
    {
      "key": "expr_lang",
      "path": "input.selector.language",
      "codec": "string"
    },
    {
      "key": "expression",
      "path": "input.selector.expressions",
      "codec": "repeat_string"
    },
    {
      "key": "calibration",
      "path": "input.calibration",
      "codec": "json"
    },
    {
      "key": "nodata",
      "path": "input.nodata",
      "codec": "json"
    },
    {
      "key": "resampling",
      "path": "resampling.read",
      "codec": "string"
    },
    {
      "key": "reproject",
      "path": "resampling.warp",
      "codec": "string"
    },
    {
      "key": "statistics",
      "path": "statistics",
      "codec": "json"
    },
    {
      "key": "stretch",
      "path": "stretch.method",
      "codec": "string"
    },
    {
      "key": "rescale",
      "path": "stretch.ranges",
      "codec": "repeat_pair"
    },
    {
      "key": "percentile",
      "path": "stretch.percentiles",
      "codec": "pair"
    },
    {
      "key": "stddev",
      "path": "stretch.stddev",
      "codec": "number"
    },
    {
      "key": "curve",
      "path": "stretch.curves",
      "codec": "json"
    },
    {
      "key": "range_policy",
      "path": "stretch.range_policy",
      "codec": "string"
    },
    {
      "key": "gamma",
      "path": "stretch.gamma",
      "codec": "repeat_number"
    },
    {
      "key": "sigmoid",
      "path": "stretch.sigmoid",
      "codec": "json"
    },
    {
      "key": "renderer",
      "path": "renderer.type",
      "codec": "string"
    },
    {
      "key": "gray_invert",
      "path": "renderer.invert",
      "codec": "boolean"
    },
    {
      "key": "cmap",
      "path": "renderer.color_map",
      "codec": "json"
    },
    {
      "key": "terrain",
      "path": "renderer.terrain",
      "codec": "json"
    },
    {
      "key": "shade_strength",
      "path": "renderer.strength",
      "codec": "number"
    },
    {
      "key": "fill",
      "path": "renderer.color",
      "codec": "color"
    },
    {
      "key": "brightness",
      "path": "effects.brightness",
      "codec": "number"
    },
    {
      "key": "contrast",
      "path": "effects.contrast",
      "codec": "number"
    },
    {
      "key": "saturation",
      "path": "effects.saturation",
      "codec": "number"
    },
    {
      "key": "grayscale",
      "path": "effects.grayscale",
      "codec": "string"
    },
    {
      "key": "invert",
      "path": "effects.invert",
      "codec": "boolean"
    },
    {
      "key": "opacity",
      "path": "opacity.value",
      "codec": "number"
    },
    {
      "key": "alpha_band",
      "path": "opacity.alpha_band",
      "codec": "json"
    },
    {
      "key": "alpha_rules",
      "path": "opacity.rules",
      "codec": "json"
    },
    {
      "key": "nodata_color",
      "path": "opacity.nodata_color",
      "codec": "color"
    },
    {
      "key": "pixel_selection",
      "path": "mosaic.pixel_selection",
      "codec": "string"
    },
    {
      "key": "mosaic_stage",
      "path": "mosaic.stage",
      "codec": "string"
    },
    {
      "key": "rank_channel",
      "path": "mosaic.rank_channel",
      "codec": "integer"
    },
    {
      "key": "format",
      "path": "output.format",
      "codec": "string"
    },
    {
      "key": "tile_size",
      "path": "output.tile_size",
      "codec": "integer"
    },
    {
      "key": "alpha",
      "path": "output.alpha",
      "codec": "string"
    },
    {
      "key": "background",
      "path": "output.background",
      "codec": "color"
    },
    {
      "key": "quality",
      "path": "output.quality",
      "codec": "integer"
    },
    {
      "key": "lossless",
      "path": "output.lossless",
      "codec": "boolean"
    },
    {
      "key": "extensions",
      "path": "extensions",
      "codec": "json"
    }
  ]
} as const;
