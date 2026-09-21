// Generated from spec/v2/raster-style-v2.schema.json. Do not edit.
export default {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:mapseek:raster-style:2.0",
  "title": "Raster Style Spec v2 — 2.0.0-draft.3",
  "description": "Raster rendering configuration only. No legend, presentation metadata, category labels or automatic classification recipes. Normative semantic and backend-capability validation is additionally required; see the specification.",
  "type": "object",
  "properties": {
    "version": {
      "const": "2.0"
    },
    "channels": {
      "$ref": "#/$defs/channels"
    },
    "calibration": {
      "$ref": "#/$defs/calibration"
    },
    "nodata": {
      "$ref": "#/$defs/nodata"
    },
    "resampling": {
      "$ref": "#/$defs/resampling"
    },
    "stretch": {
      "$ref": "#/$defs/stretch"
    },
    "statistics": {
      "$ref": "#/$defs/statistics"
    },
    "renderer": {
      "$ref": "#/$defs/renderer"
    },
    "effects": {
      "$ref": "#/$defs/effects"
    },
    "opacity": {
      "$ref": "#/$defs/opacity"
    },
    "mosaic": {
      "$ref": "#/$defs/mosaic"
    },
    "image": {
      "$ref": "#/$defs/image"
    },
    "extensions": {
      "$ref": "#/$defs/extensions"
    }
  },
  "required": [
    "version",
    "channels",
    "renderer"
  ],
  "additionalProperties": false,
  "$defs": {
    "color": {
      "type": "string",
      "pattern": "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
    },
    "pair": {
      "type": "array",
      "items": {
        "type": "number"
      },
      "minItems": 2,
      "maxItems": 2
    },
    "calibration": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "mode": {
              "enum": [
                "none",
                "metadata"
              ]
            }
          },
          "required": [
            "mode"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "mode": {
              "const": "linear"
            },
            "coefficients": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "band": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 65535
                  },
                  "scale": {
                    "type": "number"
                  },
                  "offset": {
                    "type": "number"
                  }
                },
                "required": [
                  "band",
                  "scale",
                  "offset"
                ],
                "additionalProperties": false
              },
              "minItems": 1,
              "maxItems": 64
            }
          },
          "required": [
            "mode",
            "coefficients"
          ],
          "additionalProperties": false
        }
      ]
    },
    "nodata": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "mode": {
              "enum": [
                "source",
                "ignore"
              ]
            },
            "use_mask": {
              "type": "boolean"
            }
          },
          "required": [
            "mode"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "mode": {
              "const": "override"
            },
            "use_mask": {
              "type": "boolean"
            },
            "values": {
              "type": "array",
              "items": {
                "oneOf": [
                  {
                    "type": "number"
                  },
                  {
                    "enum": [
                      "nan",
                      "inf",
                      "-inf"
                    ]
                  }
                ]
              },
              "minItems": 1,
              "maxItems": 64
            }
          },
          "required": [
            "mode",
            "values"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "mode": {
              "const": "override"
            },
            "use_mask": {
              "type": "boolean"
            },
            "per_band": {
              "type": "object",
              "patternProperties": {
                "^[1-9][0-9]*$": {
                  "type": "array",
                  "items": {
                    "oneOf": [
                      {
                        "type": "number"
                      },
                      {
                        "enum": [
                          "nan",
                          "inf",
                          "-inf"
                        ]
                      }
                    ]
                  },
                  "minItems": 1,
                  "maxItems": 64
                }
              },
              "minProperties": 1,
              "additionalProperties": false
            }
          },
          "required": [
            "mode",
            "per_band"
          ],
          "additionalProperties": false
        }
      ]
    },
    "resampling": {
      "type": "object",
      "properties": {
        "read": {
          "enum": [
            "nearest",
            "bilinear",
            "cubic",
            "cubic_spline",
            "lanczos",
            "average",
            "mode"
          ]
        },
        "warp": {
          "enum": [
            "nearest",
            "bilinear",
            "cubic",
            "cubic_spline",
            "lanczos",
            "average",
            "mode"
          ]
        }
      },
      "required": [],
      "additionalProperties": false,
      "minProperties": 1
    },
    "stretch": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "method": {
              "const": "none"
            },
            "range_policy": {
              "enum": [
                "clamp",
                "transparent"
              ]
            },
            "gamma": {
              "type": "array",
              "items": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "minItems": 1,
              "maxItems": 3
            },
            "sigmoid": {
              "type": "object",
              "properties": {
                "contrast": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "midpoint": {
                  "type": "number",
                  "exclusiveMinimum": 0,
                  "exclusiveMaximum": 1
                }
              },
              "required": [
                "contrast",
                "midpoint"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "method"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "method": {
              "const": "linear"
            },
            "range_policy": {
              "enum": [
                "clamp",
                "transparent"
              ]
            },
            "gamma": {
              "type": "array",
              "items": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "minItems": 1,
              "maxItems": 3
            },
            "sigmoid": {
              "type": "object",
              "properties": {
                "contrast": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "midpoint": {
                  "type": "number",
                  "exclusiveMinimum": 0,
                  "exclusiveMaximum": 1
                }
              },
              "required": [
                "contrast",
                "midpoint"
              ],
              "additionalProperties": false
            },
            "ranges": {
              "type": "array",
              "items": {
                "type": "array",
                "items": {
                  "type": "number"
                },
                "minItems": 2,
                "maxItems": 2
              },
              "minItems": 1,
              "maxItems": 3
            }
          },
          "required": [
            "method",
            "ranges"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "method": {
              "const": "minmax"
            },
            "range_policy": {
              "enum": [
                "clamp",
                "transparent"
              ]
            },
            "gamma": {
              "type": "array",
              "items": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "minItems": 1,
              "maxItems": 3
            },
            "sigmoid": {
              "type": "object",
              "properties": {
                "contrast": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "midpoint": {
                  "type": "number",
                  "exclusiveMinimum": 0,
                  "exclusiveMaximum": 1
                }
              },
              "required": [
                "contrast",
                "midpoint"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "method"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "method": {
              "const": "percentile"
            },
            "range_policy": {
              "enum": [
                "clamp",
                "transparent"
              ]
            },
            "gamma": {
              "type": "array",
              "items": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "minItems": 1,
              "maxItems": 3
            },
            "sigmoid": {
              "type": "object",
              "properties": {
                "contrast": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "midpoint": {
                  "type": "number",
                  "exclusiveMinimum": 0,
                  "exclusiveMaximum": 1
                }
              },
              "required": [
                "contrast",
                "midpoint"
              ],
              "additionalProperties": false
            },
            "percentiles": {
              "type": "array",
              "items": {
                "type": "number",
                "minimum": 0,
                "maximum": 100
              },
              "minItems": 2,
              "maxItems": 2
            }
          },
          "required": [
            "method",
            "percentiles"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "method": {
              "const": "stddev"
            },
            "range_policy": {
              "enum": [
                "clamp",
                "transparent"
              ]
            },
            "gamma": {
              "type": "array",
              "items": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "minItems": 1,
              "maxItems": 3
            },
            "sigmoid": {
              "type": "object",
              "properties": {
                "contrast": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "midpoint": {
                  "type": "number",
                  "exclusiveMinimum": 0,
                  "exclusiveMaximum": 1
                }
              },
              "required": [
                "contrast",
                "midpoint"
              ],
              "additionalProperties": false
            },
            "stddev": {
              "type": "number",
              "exclusiveMinimum": 0
            }
          },
          "required": [
            "method",
            "stddev"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "method": {
              "const": "histogram_equalization"
            },
            "range_policy": {
              "enum": [
                "clamp",
                "transparent"
              ]
            },
            "gamma": {
              "type": "array",
              "items": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "minItems": 1,
              "maxItems": 3
            },
            "sigmoid": {
              "type": "object",
              "properties": {
                "contrast": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "midpoint": {
                  "type": "number",
                  "exclusiveMinimum": 0,
                  "exclusiveMaximum": 1
                }
              },
              "required": [
                "contrast",
                "midpoint"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "method"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "method": {
              "const": "curve"
            },
            "range_policy": {
              "enum": [
                "clamp",
                "transparent"
              ]
            },
            "gamma": {
              "type": "array",
              "items": {
                "type": "number",
                "exclusiveMinimum": 0
              },
              "minItems": 1,
              "maxItems": 3
            },
            "sigmoid": {
              "type": "object",
              "properties": {
                "contrast": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "midpoint": {
                  "type": "number",
                  "exclusiveMinimum": 0,
                  "exclusiveMaximum": 1
                }
              },
              "required": [
                "contrast",
                "midpoint"
              ],
              "additionalProperties": false
            },
            "curves": {
              "type": "array",
              "items": {
                "type": "array",
                "items": {
                  "type": "array",
                  "items": {
                    "type": "number"
                  },
                  "minItems": 2,
                  "maxItems": 2
                },
                "minItems": 2,
                "maxItems": 4096
              },
              "minItems": 1,
              "maxItems": 3
            }
          },
          "required": [
            "method",
            "curves"
          ],
          "additionalProperties": false
        }
      ]
    },
    "statistics": {
      "type": "object",
      "properties": {
        "scope": {
          "enum": [
            "dataset",
            "mosaic",
            "viewport"
          ]
        },
        "accuracy": {
          "enum": [
            "exact",
            "sample"
          ]
        },
        "sample_size": {
          "type": "integer",
          "minimum": 1,
          "maximum": 10000000
        },
        "ref": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "scope",
        "accuracy"
      ],
      "additionalProperties": false
    },
    "ramp": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1
        },
        "revision": {
          "type": "string",
          "minLength": 1
        }
      },
      "required": [
        "name"
      ],
      "additionalProperties": false
    },
    "continuous": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "mode": {
              "const": "continuous"
            },
            "domain": {
              "enum": [
                "data",
                "normalized"
              ]
            },
            "interpolation": {
              "enum": [
                "srgb",
                "linear_rgb"
              ]
            },
            "reverse": {
              "type": "boolean"
            },
            "under": {
              "oneOf": [
                {
                  "const": "clamp"
                },
                {
                  "type": "string",
                  "pattern": "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
                }
              ]
            },
            "over": {
              "oneOf": [
                {
                  "const": "clamp"
                },
                {
                  "type": "string",
                  "pattern": "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
                }
              ]
            },
            "stops": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "value": {
                    "type": "number"
                  },
                  "color": {
                    "type": "string",
                    "pattern": "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
                  }
                },
                "required": [
                  "value",
                  "color"
                ],
                "additionalProperties": false
              },
              "minItems": 2,
              "maxItems": 4096
            }
          },
          "required": [
            "mode",
            "domain",
            "stops"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "mode": {
              "const": "continuous"
            },
            "domain": {
              "const": "normalized"
            },
            "interpolation": {
              "enum": [
                "srgb",
                "linear_rgb"
              ]
            },
            "reverse": {
              "type": "boolean"
            },
            "under": {
              "oneOf": [
                {
                  "const": "clamp"
                },
                {
                  "type": "string",
                  "pattern": "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
                }
              ]
            },
            "over": {
              "oneOf": [
                {
                  "const": "clamp"
                },
                {
                  "type": "string",
                  "pattern": "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
                }
              ]
            },
            "ramp": {
              "$ref": "#/$defs/ramp"
            }
          },
          "required": [
            "mode",
            "domain",
            "ramp"
          ],
          "additionalProperties": false
        }
      ]
    },
    "discrete": {
      "type": "object",
      "properties": {
        "mode": {
          "const": "discrete"
        },
        "domain": {
          "const": "data"
        },
        "breaks": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "minItems": 2,
          "maxItems": 4097
        },
        "colors": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
          },
          "minItems": 1,
          "maxItems": 4096
        },
        "boundary": {
          "enum": [
            "left_closed",
            "right_closed"
          ]
        },
        "outside_color": {
          "type": "string",
          "pattern": "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
        }
      },
      "required": [
        "mode",
        "domain",
        "breaks",
        "colors"
      ],
      "additionalProperties": false
    },
    "exact": {
      "type": "object",
      "properties": {
        "mode": {
          "const": "exact"
        },
        "entries": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "value": {
                "type": "number"
              },
              "color": {
                "type": "string",
                "pattern": "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
              }
            },
            "required": [
              "value",
              "color"
            ],
            "additionalProperties": false
          },
          "minItems": 1,
          "maxItems": 65536
        },
        "fallback_color": {
          "type": "string",
          "pattern": "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
        }
      },
      "required": [
        "mode",
        "entries"
      ],
      "additionalProperties": false
    },
    "terrain": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "gradient": {
              "const": "horn"
            },
            "altitude": {
              "type": "number",
              "exclusiveMinimum": 0,
              "maximum": 90
            },
            "z_factor": {
              "type": "number",
              "exclusiveMinimum": 0
            },
            "vertical_unit": {
              "enum": [
                "metre",
                "foot"
              ]
            },
            "edge": {
              "const": "nodata"
            },
            "method": {
              "const": "single"
            },
            "azimuth": {
              "type": "number",
              "minimum": 0,
              "exclusiveMaximum": 360
            }
          },
          "required": [
            "method"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "gradient": {
              "const": "horn"
            },
            "altitude": {
              "type": "number",
              "exclusiveMinimum": 0,
              "maximum": 90
            },
            "z_factor": {
              "type": "number",
              "exclusiveMinimum": 0
            },
            "vertical_unit": {
              "enum": [
                "metre",
                "foot"
              ]
            },
            "edge": {
              "const": "nodata"
            },
            "method": {
              "const": "multidirectional"
            }
          },
          "required": [
            "method"
          ],
          "additionalProperties": false
        }
      ]
    },
    "renderer": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "type": {
              "const": "gray"
            },
            "invert": {
              "type": "boolean"
            }
          },
          "required": [
            "type"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "const": "rgb"
            }
          },
          "required": [
            "type"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "const": "single_color"
            },
            "color": {
              "type": "string",
              "pattern": "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
            }
          },
          "required": [
            "type",
            "color"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "const": "pseudocolor"
            },
            "color_map": {
              "oneOf": [
                {
                  "$ref": "#/$defs/continuous"
                },
                {
                  "$ref": "#/$defs/discrete"
                }
              ]
            }
          },
          "required": [
            "type",
            "color_map"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "const": "shaded_relief"
            },
            "terrain": {
              "$ref": "#/$defs/terrain"
            },
            "strength": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "color_map": {
              "oneOf": [
                {
                  "$ref": "#/$defs/continuous"
                },
                {
                  "$ref": "#/$defs/discrete"
                }
              ]
            }
          },
          "required": [
            "type",
            "terrain",
            "color_map"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "const": "categorized"
            },
            "color_map": {
              "oneOf": [
                {
                  "$ref": "#/$defs/exact"
                },
                {
                  "type": "object",
                  "properties": {
                    "mode": {
                      "const": "source"
                    }
                  },
                  "required": [
                    "mode"
                  ],
                  "additionalProperties": false
                }
              ]
            }
          },
          "required": [
            "type",
            "color_map"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "const": "hillshade"
            },
            "terrain": {
              "$ref": "#/$defs/terrain"
            }
          },
          "required": [
            "type",
            "terrain"
          ],
          "additionalProperties": false
        }
      ]
    },
    "effects": {
      "type": "object",
      "properties": {
        "brightness": {
          "type": "number",
          "minimum": -1,
          "maximum": 1
        },
        "contrast": {
          "type": "number",
          "minimum": 0,
          "maximum": 4
        },
        "saturation": {
          "type": "number",
          "minimum": 0,
          "maximum": 4
        },
        "grayscale": {
          "enum": [
            "none",
            "luma",
            "average"
          ]
        },
        "invert": {
          "type": "boolean"
        }
      },
      "required": [],
      "additionalProperties": false,
      "minProperties": 1
    },
    "opacity": {
      "type": "object",
      "properties": {
        "value": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "alpha_band": {
          "type": "object",
          "properties": {
            "band": {
              "type": "integer",
              "minimum": 1,
              "maximum": 65535
            },
            "range": {
              "type": "array",
              "items": {
                "type": "number"
              },
              "minItems": 2,
              "maxItems": 2
            }
          },
          "required": [
            "band",
            "range"
          ],
          "additionalProperties": false
        },
        "rules": {
          "type": "array",
          "items": {
            "oneOf": [
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "value"
                  },
                  "channel": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 3
                  },
                  "value": {
                    "type": "number"
                  },
                  "alpha": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  }
                },
                "required": [
                  "kind",
                  "channel",
                  "value",
                  "alpha"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "range"
                  },
                  "channel": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 3
                  },
                  "min": {
                    "type": "number"
                  },
                  "max": {
                    "type": "number"
                  },
                  "include_max": {
                    "type": "boolean"
                  },
                  "alpha": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  }
                },
                "required": [
                  "kind",
                  "channel",
                  "min",
                  "max",
                  "alpha"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "kind": {
                    "const": "rgb"
                  },
                  "values": {
                    "type": "array",
                    "items": {
                      "type": "number"
                    },
                    "minItems": 3,
                    "maxItems": 3
                  },
                  "tolerance": {
                    "type": "array",
                    "items": {
                      "type": "number",
                      "minimum": 0
                    },
                    "minItems": 3,
                    "maxItems": 3
                  },
                  "alpha": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  }
                },
                "required": [
                  "kind",
                  "values",
                  "tolerance",
                  "alpha"
                ],
                "additionalProperties": false
              }
            ]
          },
          "minItems": 1,
          "maxItems": 256
        },
        "nodata_color": {
          "type": "string",
          "pattern": "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
        }
      },
      "required": [],
      "additionalProperties": false,
      "minProperties": 1
    },
    "mosaic": {
      "type": "object",
      "properties": {
        "pixel_selection": {
          "enum": [
            "first",
            "highest",
            "lowest",
            "mean",
            "median"
          ]
        },
        "stage": {
          "enum": [
            "before_channels",
            "after_channels"
          ]
        },
        "rank_channel": {
          "type": "integer",
          "minimum": 1,
          "maximum": 64
        }
      },
      "required": [
        "pixel_selection",
        "stage"
      ],
      "additionalProperties": false
    },
    "extensions": {
      "type": "object",
      "patternProperties": {
        "^[a-z][a-z0-9]*(\\.[a-z][a-z0-9_-]*){2,}$": {
          "type": "object",
          "properties": {
            "version": {
              "type": "string",
              "minLength": 1
            },
            "stage": {
              "enum": [
                "before_channels",
                "after_channels",
                "after_color"
              ]
            },
            "config": {
              "type": "object"
            }
          },
          "required": [
            "version",
            "stage",
            "config"
          ],
          "additionalProperties": false
        }
      },
      "minProperties": 1,
      "additionalProperties": false
    },
    "channels": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "bands"
            },
            "bands": {
              "type": "array",
              "items": {
                "type": "integer",
                "minimum": 1,
                "maximum": 65535
              },
              "minItems": 1,
              "maxItems": 3
            }
          },
          "required": [
            "kind",
            "bands"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "expression"
            },
            "language": {
              "const": "raster-expr/1"
            },
            "expressions": {
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 2048
              },
              "minItems": 1,
              "maxItems": 3
            }
          },
          "required": [
            "kind",
            "language",
            "expressions"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "index"
            },
            "name": {
              "const": "ndvi"
            },
            "bindings": {
              "type": "object",
              "properties": {
                "red": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 65535
                },
                "nir": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 65535
                }
              },
              "required": [
                "red",
                "nir"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "kind",
            "name",
            "bindings"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "index"
            },
            "name": {
              "const": "ndwi_mcfeeters"
            },
            "bindings": {
              "type": "object",
              "properties": {
                "green": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 65535
                },
                "nir": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 65535
                }
              },
              "required": [
                "green",
                "nir"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "kind",
            "name",
            "bindings"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "index"
            },
            "name": {
              "const": "ndmi"
            },
            "bindings": {
              "type": "object",
              "properties": {
                "nir": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 65535
                },
                "swir": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 65535
                }
              },
              "required": [
                "nir",
                "swir"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "kind",
            "name",
            "bindings"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "index"
            },
            "name": {
              "const": "ndbi"
            },
            "bindings": {
              "type": "object",
              "properties": {
                "nir": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 65535
                },
                "swir": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 65535
                }
              },
              "required": [
                "nir",
                "swir"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "kind",
            "name",
            "bindings"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "index"
            },
            "name": {
              "const": "evi"
            },
            "bindings": {
              "type": "object",
              "properties": {
                "red": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 65535
                },
                "nir": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 65535
                },
                "blue": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 65535
                }
              },
              "required": [
                "red",
                "nir",
                "blue"
              ],
              "additionalProperties": false
            },
            "parameters": {
              "type": "object",
              "properties": {
                "g": {
                  "type": "number",
                  "exclusiveMinimum": 0
                },
                "c1": {
                  "type": "number"
                },
                "c2": {
                  "type": "number"
                },
                "l": {
                  "type": "number"
                }
              },
              "required": [],
              "additionalProperties": false
            }
          },
          "required": [
            "kind",
            "name",
            "bindings"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "index"
            },
            "name": {
              "const": "savi"
            },
            "bindings": {
              "type": "object",
              "properties": {
                "red": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 65535
                },
                "nir": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 65535
                }
              },
              "required": [
                "red",
                "nir"
              ],
              "additionalProperties": false
            },
            "parameters": {
              "type": "object",
              "properties": {
                "l": {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 1
                }
              },
              "required": [],
              "additionalProperties": false
            }
          },
          "required": [
            "kind",
            "name",
            "bindings"
          ],
          "additionalProperties": false
        }
      ]
    },
    "image": {
      "type": "object",
      "properties": {
        "format": {
          "enum": [
            "png",
            "webp",
            "jpeg"
          ]
        },
        "alpha": {
          "enum": [
            "preserve",
            "flatten"
          ]
        },
        "background": {
          "type": "string",
          "pattern": "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
        },
        "quality": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "lossless": {
          "type": "boolean"
        },
        "size": {
          "enum": [
            64,
            128,
            256,
            512,
            1024
          ]
        }
      },
      "required": [],
      "additionalProperties": false,
      "minProperties": 1
    }
  }
} as const;
