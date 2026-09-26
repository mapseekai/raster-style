import type { NativeColormap, RasterStyle } from '../src/generated/types.js';

type Statistics = NonNullable<RasterStyle['statistics']>;

const exact: Statistics = { scope: 'dataset', accuracy: 'exact', ref: 'stats-1' };
const sample: Statistics = { scope: 'mosaic', accuracy: 'sample', sample_size: 1000 };
const defaultSample: Statistics = { scope: 'viewport', accuracy: 'sample' };
// @ts-expect-error Exact statistics cannot specify a sampling budget.
const invalidExact: Statistics = { scope: 'dataset', accuracy: 'exact', sample_size: 1 };
// @ts-expect-error A snapshot reference requires scope and accuracy assertions.
const invalidReference: Statistics = { ref: 'stats-1' };
// @ts-expect-error Schema generation must not widen statistics to arbitrary keys.
const unknownField: Statistics = { scope: 'dataset', accuracy: 'exact', unexpected: true };

const intervals: NativeColormap = [
  [
    [0, 10],
    [255, 0, 0, 255],
  ],
];
const intervalColormap: RasterStyle = {
  version: '2.0',
  renderer: { type: 'pseudocolor', bidx: [1], colormap: intervals },
};
const exactColormap: RasterStyle = {
  version: '2.0',
  renderer: { type: 'categorized', bidx: [1], colormap: { '1': [255, 0, 0, 255] } },
};
const invalidCategoricalIntervals: RasterStyle = {
  version: '2.0',
  // @ts-expect-error Categorized colormaps require exact values, not intervals.
  renderer: { type: 'categorized', bidx: [1], colormap: intervals },
};

void [
  exact,
  sample,
  defaultSample,
  invalidExact,
  invalidReference,
  unknownField,
  intervalColormap,
  exactColormap,
  invalidCategoricalIntervals,
];
