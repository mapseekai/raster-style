// Generated from extensions/raster/mosaic/v1.0.0/schema.json. Do not edit.
export default {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://mapseekai.github.io/raster-style/extensions/raster/mosaic/v1.0.0/schema.json",
  "title": "Mosaic Extension",
  "type": "object",
  "required": ["extensions", "raster:mosaic"],
  "properties": {
    "version": {
      "const": "3.0"
    },
    "extensions": {
      "type": "array",
      "contains": {
        "const": "https://mapseekai.github.io/raster-style/extensions/raster/mosaic/v1.0.0/schema.json"
      }
    },
    "raster:mosaic": {
      "type": "object",
      "properties": {
        "pixel_selection": {
          "enum": ["first", "highest", "lowest", "mean", "median"]
        },
        "stage": {
          "enum": ["before_channels", "after_channels"]
        },
        "rank_channel": {
          "type": "integer",
          "minimum": 1,
          "maximum": 64,
          "default": 1,
          "description": "One-based position: before_channels uses distinct dependency bands sorted by source band number; after_channels uses renderer output order. Applies only to highest/lowest."
        }
      },
      "required": ["pixel_selection", "stage"],
      "additionalProperties": false,
      "allOf": [
        {
          "if": {
            "required": ["rank_channel"]
          },
          "then": {
            "properties": {
              "pixel_selection": {
                "enum": ["highest", "lowest"]
              }
            }
          }
        }
      ]
    }
  },
  "allOf": [
    {
      "if": {
        "required": ["renderer"],
        "properties": {
          "renderer": {
            "required": ["type"],
            "properties": {
              "type": {
                "const": "categorized"
              }
            }
          }
        }
      },
      "then": {
        "properties": {
          "raster:mosaic": {
            "properties": {
              "pixel_selection": {
                "enum": ["first", "highest", "lowest"]
              }
            }
          }
        }
      }
    }
  ]
} as const;
