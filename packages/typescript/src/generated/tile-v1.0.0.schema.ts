// Generated from extensions/raster/tile/v1.0.0/schema.json. Do not edit.
export default {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://mapseekai.github.io/raster-style/extensions/raster/tile/v1.0.0/schema.json",
  "title": "Tile Extension",
  "type": "object",
  "required": ["extensions", "raster:tile"],
  "properties": {
    "version": {
      "const": "3.0"
    },
    "extensions": {
      "type": "array",
      "contains": {
        "const": "https://mapseekai.github.io/raster-style/extensions/raster/tile/v1.0.0/schema.json"
      }
    },
    "raster:tile": {
      "type": "object",
      "properties": {
        "format": {
          "enum": ["png", "webp", "jpeg"],
          "default": "png"
        },
        "tilesize": {
          "enum": [64, 128, 256, 512, 1024],
          "default": 256
        },
        "quality": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100,
          "default": 85
        },
        "lossless": {
          "type": "boolean",
          "default": false
        },
        "background": {
          "type": "string",
          "pattern": "^#[0-9a-fA-F]{6}([fF]{2})?$",
          "default": "#000000ff"
        }
      },
      "required": [],
      "additionalProperties": false,
      "minProperties": 1,
      "allOf": [
        {
          "if": {
            "properties": {
              "format": {
                "const": "png"
              }
            }
          },
          "then": {
            "not": {
              "required": ["quality"]
            }
          }
        },
        {
          "if": {
            "required": ["lossless"]
          },
          "then": {
            "required": ["format"],
            "properties": {
              "format": {
                "const": "webp"
              }
            }
          }
        },
        {
          "if": {
            "required": ["lossless"],
            "properties": {
              "lossless": {
                "const": true
              }
            }
          },
          "then": {
            "not": {
              "required": ["quality"]
            }
          }
        }
      ]
    }
  }
} as const;
