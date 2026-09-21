/** Generated from the draft.2 JSON Schema. Run pnpm generate; do not edit. */

export type Selector =
  | {
      kind: 'bands';
      /**
       * @minItems 1
       * @maxItems 3
       */
      bands: [number, ...number[]];
    }
  | {
      kind: 'expression';
      language: 'raster-expr/1';
      /**
       * @minItems 1
       * @maxItems 3
       */
      expressions: [string, ...string[]];
    }
  | {
      kind: 'index';
      name: 'ndvi';
      bindings: {
        red: number;
        nir: number;
      };
    }
  | {
      kind: 'index';
      name: 'ndwi_mcfeeters';
      bindings: {
        green: number;
        nir: number;
      };
    }
  | {
      kind: 'index';
      name: 'ndmi';
      bindings: {
        nir: number;
        swir: number;
      };
    }
  | {
      kind: 'index';
      name: 'ndbi';
      bindings: {
        nir: number;
        swir: number;
      };
    }
  | {
      kind: 'index';
      name: 'evi';
      bindings: {
        red: number;
        nir: number;
        blue: number;
      };
      parameters?: {
        g?: number;
        c1?: number;
        c2?: number;
        l?: number;
      };
    }
  | {
      kind: 'index';
      name: 'savi';
      bindings: {
        red: number;
        nir: number;
      };
      parameters?: {
        l?: number;
      };
    };
export type Calibration =
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
export type Nodata =
  | {
      mode: 'source' | 'ignore';
      use_mask?: boolean;
    }
  | {
      mode: 'override';
      use_mask?: boolean;
      /**
       * @minItems 1
       * @maxItems 64
       */
      values: [number | ('nan' | 'inf' | '-inf'), ...(number | ('nan' | 'inf' | '-inf'))[]];
    }
  | {
      mode: 'override';
      use_mask?: boolean;
      per_band: {
        /**
         * @minItems 1
         * @maxItems 64
         *
         * This interface was referenced by `undefined`'s JSON-Schema definition
         * via the `patternProperty` "^[1-9][0-9]*$".
         */
        [k: string]: [number | ('nan' | 'inf' | '-inf'), ...(number | ('nan' | 'inf' | '-inf'))[]];
      };
    };
export type Stretch =
  | {
      method: 'none';
      range_policy?: 'clamp' | 'transparent';
      /**
       * @minItems 1
       * @maxItems 3
       */
      gamma?: [number, ...number[]];
      sigmoid?: {
        contrast: number;
        midpoint: number;
      };
    }
  | {
      method: 'linear';
      range_policy?: 'clamp' | 'transparent';
      /**
       * @minItems 1
       * @maxItems 3
       */
      gamma?: [number, ...number[]];
      sigmoid?: {
        contrast: number;
        midpoint: number;
      };
      /**
       * @minItems 1
       * @maxItems 3
       */
      ranges: [[number, number, ...number[]], ...[number, number, ...number[]][]];
    }
  | {
      method: 'minmax';
      range_policy?: 'clamp' | 'transparent';
      /**
       * @minItems 1
       * @maxItems 3
       */
      gamma?: [number, ...number[]];
      sigmoid?: {
        contrast: number;
        midpoint: number;
      };
    }
  | {
      method: 'percentile';
      range_policy?: 'clamp' | 'transparent';
      /**
       * @minItems 1
       * @maxItems 3
       */
      gamma?: [number, ...number[]];
      sigmoid?: {
        contrast: number;
        midpoint: number;
      };
      /**
       * @minItems 2
       * @maxItems 2
       */
      percentiles: [number, number, ...number[]];
    }
  | {
      method: 'stddev';
      range_policy?: 'clamp' | 'transparent';
      /**
       * @minItems 1
       * @maxItems 3
       */
      gamma?: [number, ...number[]];
      sigmoid?: {
        contrast: number;
        midpoint: number;
      };
      stddev: number;
    }
  | {
      method: 'histogram_equalization';
      range_policy?: 'clamp' | 'transparent';
      /**
       * @minItems 1
       * @maxItems 3
       */
      gamma?: [number, ...number[]];
      sigmoid?: {
        contrast: number;
        midpoint: number;
      };
    }
  | {
      method: 'curve';
      range_policy?: 'clamp' | 'transparent';
      /**
       * @minItems 1
       * @maxItems 3
       */
      gamma?: [number, ...number[]];
      sigmoid?: {
        contrast: number;
        midpoint: number;
      };
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
export type Renderer =
  | {
      type: 'gray';
      invert?: boolean;
    }
  | {
      type: 'rgb';
    }
  | {
      type: 'single_color';
      color: string;
    }
  | {
      type: 'pseudocolor';
      color_map: Continuous | Discrete;
    }
  | {
      type: 'shaded_relief';
      terrain: Terrain;
      strength?: number;
      color_map: Continuous | Discrete;
    }
  | {
      type: 'categorized';
      color_map:
        | Exact
        | {
            mode: 'source';
          };
    }
  | {
      type: 'hillshade';
      terrain: Terrain;
    };
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

/**
 * Raster rendering configuration only. No legend, presentation metadata, category labels or automatic classification recipes. Normative semantic and backend-capability validation is additionally required; see the specification.
 */
export interface RasterStyle {
  version: '2.0';
  input: Input;
  resampling?: Resampling;
  stretch?: Stretch;
  statistics?: Statistics;
  renderer: Renderer;
  effects?: Effects;
  opacity?: Opacity;
  mosaic?: Mosaic;
  output?: Output;
  extensions?: Extensions;
}
export interface Input {
  selector: Selector;
  calibration?: Calibration;
  nodata?: Nodata;
}
export interface Resampling {
  read?: 'nearest' | 'bilinear' | 'cubic' | 'cubic_spline' | 'lanczos' | 'average' | 'mode';
  warp?: 'nearest' | 'bilinear' | 'cubic' | 'cubic_spline' | 'lanczos' | 'average' | 'mode';
}
export interface Statistics {
  scope: 'dataset' | 'mosaic' | 'viewport';
  accuracy: 'exact' | 'sample';
  sample_size?: number;
  ref?: string;
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
export interface Effects {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  grayscale?: 'none' | 'luma' | 'average';
  invert?: boolean;
}
export interface Opacity {
  value?: number;
  alpha_band?: {
    band: number;
    /**
     * @minItems 2
     * @maxItems 2
     */
    range: [number, number, ...number[]];
  };
  /**
   * @minItems 1
   * @maxItems 256
   */
  rules?: [
    (
      | {
          kind: 'value';
          channel: number;
          value: number;
          alpha: number;
        }
      | {
          kind: 'range';
          channel: number;
          min: number;
          max: number;
          include_max?: boolean;
          alpha: number;
        }
      | {
          kind: 'rgb';
          /**
           * @minItems 3
           * @maxItems 3
           */
          values: [number, number, number, ...number[]];
          /**
           * @minItems 3
           * @maxItems 3
           */
          tolerance: [number, number, number, ...number[]];
          alpha: number;
        }
    ),
    ...(
      | {
          kind: 'value';
          channel: number;
          value: number;
          alpha: number;
        }
      | {
          kind: 'range';
          channel: number;
          min: number;
          max: number;
          include_max?: boolean;
          alpha: number;
        }
      | {
          kind: 'rgb';
          /**
           * @minItems 3
           * @maxItems 3
           */
          values: [number, number, number, ...number[]];
          /**
           * @minItems 3
           * @maxItems 3
           */
          tolerance: [number, number, number, ...number[]];
          alpha: number;
        }
    )[]
  ];
  nodata_color?: string;
}
export interface Mosaic {
  pixel_selection: 'first' | 'highest' | 'lowest' | 'mean' | 'median';
  stage: 'before_selector' | 'after_selector';
  rank_channel?: number;
}
export interface Output {
  format?: 'png' | 'webp' | 'jpeg';
  tile_size?: 64 | 128 | 256 | 512 | 1024;
  alpha?: 'preserve' | 'flatten';
  background?: string;
  quality?: number;
  lossless?: boolean;
}
export interface Extensions {
  /**
   * This interface was referenced by `Extensions`'s JSON-Schema definition
   * via the `patternProperty` "^[a-z][a-z0-9]*(\.[a-z][a-z0-9_-]*){2,}$".
   */
  [k: string]: {
    version: string;
    stage: 'before_selector' | 'after_selector' | 'after_color';
    config: {};
  };
}
