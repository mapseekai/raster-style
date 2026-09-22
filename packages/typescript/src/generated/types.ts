/** Generated from the Raster Style Spec v2 JSON Schema. Run pnpm generate; do not edit. */

export type Continuous =
  | {
      mode: 'continuous';
      domain: 'data' | 'normalized';
      interpolation?: 'srgb' | 'linear_rgb';
      reverse?: boolean;
      under?: 'clamp' | string;
      over?: 'clamp' | string;
      /**
       * @minItems 2
       * @maxItems 4096
       */
      stops: [
        {
          value: number;
          color: string;
        },
        {
          value: number;
          color: string;
        },
        ...{
          value: number;
          color: string;
        }[]
      ];
    }
  | {
      mode: 'continuous';
      domain: 'normalized';
      interpolation?: 'srgb' | 'linear_rgb';
      reverse?: boolean;
      under?: 'clamp' | string;
      over?: 'clamp' | string;
      ramp: Ramp;
    };
export type Terrain =
  | {
      gradient?: 'horn';
      altitude?: number;
      z_factor?: number;
      vertical_unit?: 'metre' | 'foot';
      edge?: 'nodata';
      method: 'single';
      azimuth?: number;
    }
  | {
      gradient?: 'horn';
      altitude?: number;
      z_factor?: number;
      vertical_unit?: 'metre' | 'foot';
      edge?: 'nodata';
      method: 'multidirectional';
    };
export type PreOperation =
  | {
      op: 'gamma';
      value: number;
      channels?: 'r' | 'g' | 'b' | 'rg' | 'rb' | 'gb' | 'rgb';
    }
  | {
      op: 'sigmoidal';
      contrast: number;
      midpoint: number;
      channels?: 'r' | 'g' | 'b' | 'rg' | 'rb' | 'gb' | 'rgb';
    }
  | {
      op: 'saturation';
      value: number;
    };
export type PostOperation =
  | {
      op: 'gamma';
      value: number;
      channels?: 'r' | 'g' | 'b' | 'rg' | 'rb' | 'gb' | 'rgb';
    }
  | {
      op: 'sigmoidal';
      contrast: number;
      midpoint: number;
      channels?: 'r' | 'g' | 'b' | 'rg' | 'rb' | 'gb' | 'rgb';
    }
  | {
      op: 'brightness';
      value: number;
      channels?: 'r' | 'g' | 'b' | 'rg' | 'rb' | 'gb' | 'rgb';
    }
  | {
      op: 'contrast';
      value: number;
      channels?: 'r' | 'g' | 'b' | 'rg' | 'rb' | 'gb' | 'rgb';
    }
  | {
      op: 'saturation';
      value: number;
    }
  | {
      op: 'grayscale';
      method: 'luma' | 'average';
    }
  | {
      op: 'invert';
      channels?: 'r' | 'g' | 'b' | 'rg' | 'rb' | 'gb' | 'rgb';
    };

/**
 * Grouped raster style with structured color formulas and scalar opacity.
 */
export interface RasterStyle {
  version: '2.0';
  renderer: {
    [k: string]: unknown;
  } & (
    | {
        color?: never;
        color_mapping?: never;
        colormap?: never;
        colormap_name?: never;
        renderer_invert?: boolean;
        strength?: never;
        terrain?: never;
        type: 'gray';
      }
    | {
        color?: never;
        color_mapping?: never;
        colormap?: never;
        colormap_name?: never;
        renderer_invert?: never;
        strength?: never;
        terrain?: never;
        type: 'rgb';
      }
    | {
        color: string;
        color_mapping?: never;
        colormap?: never;
        colormap_name?: never;
        renderer_invert?: never;
        strength?: never;
        terrain?: never;
        type: 'single_color';
      }
    | {
        color?: never;
        color_mapping?: Continuous | Discrete;
        colormap?:
          | {
              /**
               * @minItems 4
               * @maxItems 4
               *
               * This interface was referenced by `undefined`'s JSON-Schema definition
               * via the `patternProperty` "^(0|-?[1-9][0-9]*)$".
               */
              [k: string]: [number, number, number, number, ...number[]];
            }
          | [never[], ...never[][]];
        colormap_name?: string;
        renderer_invert?: never;
        strength?: never;
        terrain?: never;
        type: 'pseudocolor';
      }
    | {
        color?: never;
        color_mapping?: Continuous | Discrete;
        colormap?:
          | {
              /**
               * @minItems 4
               * @maxItems 4
               *
               * This interface was referenced by `undefined`'s JSON-Schema definition
               * via the `patternProperty` "^(0|-?[1-9][0-9]*)$".
               */
              [k: string]: [number, number, number, number, ...number[]];
            }
          | [never[], ...never[][]];
        colormap_name?: string;
        renderer_invert?: never;
        strength?: number;
        terrain: Terrain;
        type: 'shaded_relief';
      }
    | {
        color?: never;
        color_mapping?:
          | Exact
          | {
              mode: 'source';
            };
        colormap?: {
          /**
           * @minItems 4
           * @maxItems 4
           *
           * This interface was referenced by `undefined`'s JSON-Schema definition
           * via the `patternProperty` "^(0|-?[1-9][0-9]*)$".
           */
          [k: string]: [number, number, number, number, ...number[]];
        };
        colormap_name?: string;
        renderer_invert?: never;
        strength?: never;
        terrain?: never;
        type: 'categorized';
      }
    | {
        color?: never;
        color_mapping?: never;
        colormap?: never;
        colormap_name?: never;
        renderer_invert?: never;
        strength?: never;
        terrain: Terrain;
        type: 'hillshade';
      }
  );
  resampling?: {
    read?: 'nearest' | 'bilinear' | 'cubic' | 'cubic_spline' | 'lanczos' | 'average' | 'mode';
    reproject?: 'nearest' | 'bilinear' | 'cubic' | 'cubic_spline' | 'lanczos' | 'average' | 'mode';
  };
  stretch?:
    | {
        method: 'none';
        range_policy?: 'clamp' | 'transparent';
      }
    | {
        method: 'linear';
        range_policy?: 'clamp' | 'transparent';
        /**
         * @minItems 1
         * @maxItems 3
         */
        rescale: [[number, number, ...number[]], ...[number, number, ...number[]][]];
      }
    | {
        method: 'minmax';
        range_policy?: 'clamp' | 'transparent';
      }
    | {
        method: 'percentile';
        range_policy?: 'clamp' | 'transparent';
        /**
         * @minItems 2
         * @maxItems 2
         */
        percentiles: [number, number, ...number[]];
      }
    | {
        method: 'stddev';
        range_policy?: 'clamp' | 'transparent';
        stddev: number;
      }
    | {
        method: 'histogram_equalization';
        range_policy?: 'clamp' | 'transparent';
      }
    | {
        method: 'curve';
        range_policy?: 'clamp' | 'transparent';
        /**
         * @minItems 1
         * @maxItems 3
         */
        curves: [
          [
            [number, number, ...number[]],
            [number, number, ...number[]],
            ...[number, number, ...number[]][]
          ],
          ...[
            [number, number, ...number[]],
            [number, number, ...number[]],
            ...[number, number, ...number[]][]
          ][]
        ];
      };
  nodata?: number | 'nan';
  effects?: {
    /**
     * @minItems 1
     * @maxItems 64
     */
    color_formula?: [PreOperation, ...PreOperation[]];
    /**
     * @minItems 1
     * @maxItems 64
     */
    post_color_formula?: [PostOperation, ...PostOperation[]];
  };
  opacity?: number;
  image?: {
    format?: 'png' | 'webp' | 'jpeg';
    tilesize?: 64 | 128 | 256 | 512 | 1024;
    quality?: number;
    lossless?: boolean;
    background?: string;
  };
  calibration?:
    | {
        mode: 'none' | 'metadata';
      }
    | {
        mode: 'linear';
        /**
         * @minItems 1
         * @maxItems 64
         */
        coefficients: [
          {
            band: number;
            scale: number;
            offset: number;
          },
          ...{
            band: number;
            scale: number;
            offset: number;
          }[]
        ];
      };
  statistics?: Statistics;
  mosaic?: {
    pixel_selection: 'first' | 'highest' | 'lowest' | 'mean' | 'median';
    stage: 'before_channels' | 'after_channels';
    rank_channel?: number;
  };
  extensions?: Extensions;
}
export interface Ramp {
  name: string;
  revision?: string;
}
export interface Discrete {
  mode: 'discrete';
  domain: 'data';
  /**
   * @minItems 2
   * @maxItems 4097
   */
  breaks: [number, number, ...number[]];
  /**
   * @minItems 1
   * @maxItems 4096
   */
  colors: [string, ...string[]];
  boundary?: 'left_closed' | 'right_closed';
  outside_color?: string;
}
export interface Exact {
  mode: 'exact';
  /**
   * @minItems 1
   * @maxItems 65536
   */
  entries: [
    {
      value: number;
      color: string;
    },
    ...{
      value: number;
      color: string;
    }[]
  ];
  fallback_color?: string;
}
export interface Statistics {
  scope: 'dataset' | 'mosaic' | 'viewport';
  accuracy: 'exact' | 'sample';
  sample_size?: number;
  ref?: string;
}
export interface Extensions {
  /**
   * This interface was referenced by `Extensions`'s JSON-Schema definition
   * via the `patternProperty` "^[a-z][a-z0-9]*(\.[a-z][a-z0-9_-]*){2,}$".
   */
  [k: string]: {
    version: string;
    stage: 'before_channels' | 'after_channels' | 'after_color';
    config: {};
  };
}
