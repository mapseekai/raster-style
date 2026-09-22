// Generated from spec/v2/query-bindings-v2.json. Do not edit.
export default {
  "binding_version": "Q2",
  "spec_version": "2.0",
  "description": "Grouped JSON maps to short query names. Color operation arrays use formula strings; repeated bidx/rescale retain order.",
  "bindings": [
    {
      "key": "version",
      "path": "version",
      "codec": "string"
    },
    {
      "key": "type",
      "path": "renderer.type",
      "codec": "string"
    },
    {
      "key": "renderer_invert",
      "path": "renderer.renderer_invert",
      "codec": "boolean"
    },
    {
      "key": "color",
      "path": "renderer.color",
      "codec": "color"
    },
    {
      "key": "color_mapping",
      "path": "renderer.color_mapping",
      "codec": "json"
    },
    {
      "key": "colormap",
      "path": "renderer.colormap",
      "codec": "json"
    },
    {
      "key": "colormap_name",
      "path": "renderer.colormap_name",
      "codec": "string"
    },
    {
      "key": "terrain",
      "path": "renderer.terrain",
      "codec": "json"
    },
    {
      "key": "strength",
      "path": "renderer.strength",
      "codec": "number"
    },
    {
      "key": "bidx",
      "path": "renderer.bidx",
      "codec": "repeat_integer"
    },
    {
      "key": "expression",
      "path": "renderer.expression",
      "codec": "string"
    },
    {
      "key": "language",
      "path": "renderer.language",
      "codec": "string"
    },
    {
      "key": "index",
      "path": "renderer.index",
      "codec": "json"
    },
    {
      "key": "resampling",
      "path": "resampling.read",
      "codec": "string"
    },
    {
      "key": "reproject",
      "path": "resampling.reproject",
      "codec": "string"
    },
    {
      "key": "method",
      "path": "stretch.method",
      "codec": "string"
    },
    {
      "key": "rescale",
      "path": "stretch.rescale",
      "codec": "repeat_pair"
    },
    {
      "key": "range_policy",
      "path": "stretch.range_policy",
      "codec": "string"
    },
    {
      "key": "percentiles",
      "path": "stretch.percentiles",
      "codec": "pair"
    },
    {
      "key": "stddev",
      "path": "stretch.stddev",
      "codec": "number"
    },
    {
      "key": "curves",
      "path": "stretch.curves",
      "codec": "json"
    },
    {
      "key": "nodata",
      "path": "nodata",
      "codec": "nodata"
    },
    {
      "key": "opacity",
      "path": "opacity",
      "codec": "number"
    },
    {
      "key": "color_formula",
      "path": "effects.color_formula",
      "codec": "formula"
    },
    {
      "key": "post_color_formula",
      "path": "effects.post_color_formula",
      "codec": "post_formula"
    },
    {
      "key": "format",
      "path": "image.format",
      "codec": "string"
    },
    {
      "key": "tilesize",
      "path": "image.tilesize",
      "codec": "integer"
    },
    {
      "key": "quality",
      "path": "image.quality",
      "codec": "integer"
    },
    {
      "key": "lossless",
      "path": "image.lossless",
      "codec": "boolean"
    },
    {
      "key": "background",
      "path": "image.background",
      "codec": "color"
    },
    {
      "key": "calibration",
      "path": "calibration",
      "codec": "json"
    },
    {
      "key": "statistics",
      "path": "statistics",
      "codec": "json"
    },
    {
      "key": "extensions",
      "path": "extensions",
      "codec": "json"
    },
    {
      "key": "pixel_selection",
      "path": "mosaic.pixel_selection",
      "codec": "string"
    },
    {
      "key": "stage",
      "path": "mosaic.stage",
      "codec": "string"
    },
    {
      "key": "rank_channel",
      "path": "mosaic.rank_channel",
      "codec": "integer"
    }
  ]
} as const;
