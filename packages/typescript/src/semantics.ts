import { fail } from './errors.js';
import type { JsonObject } from './json.js';
import { arrayAt, objectAt } from './paths.js';

function requireCondition(condition: boolean, path: string, message: string): void {
  if (!condition) fail('E_SEMANTIC', message, path);
}

function increasing(values: number[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

/** Cross-field rules that can be checked without a raster dataset or renderer. */
export function validateSemantics(style: JsonObject): void {
  const channelSpec = objectAt(style, 'renderer');
  const channels =
    'bidx' in channelSpec
      ? arrayAt(channelSpec, 'bidx').length
      : 'expression' in channelSpec
        ? (channelSpec.expression as string).split(';').length
        : 1;
  const renderer = channelSpec;
  const type = renderer.type;
  requireCondition(
    channels === (type === 'rgb' ? 3 : 1),
    'kind',
    'Renderer channel cardinality mismatch',
  );
  const stretch = objectAt(style, 'stretch');
  for (const key of ['rescale', 'curves']) {
    if (key in stretch) {
      const count = arrayAt(stretch, key).length;
      requireCondition(
        count === 1 || count === channels,
        key,
        'Expected one value or one per channel',
      );
    }
  }
  for (const pair of arrayAt(stretch, 'rescale') as number[][]) {
    requireCondition(pair[0]! < pair[1]!, 'rescale', 'Range must increase');
  }
  const percentiles = stretch.percentiles as number[] | undefined;
  if (percentiles)
    requireCondition(percentiles[0]! < percentiles[1]!, 'percentiles', 'Percentiles must increase');
  for (const curve of arrayAt(stretch, 'curves') as number[][][]) {
    requireCondition(
      curve.every((point) => point[1]! >= 0 && point[1]! <= 1),
      'curves',
      'Curve output must be in [0,1]',
    );
    requireCondition(
      increasing(curve.map((point) => point[0]!)) &&
        curve.every((point, index) => index === 0 || curve[index - 1]![1]! <= point[1]!),
      'curves',
      'Curve must be monotonic',
    );
  }
  const colorMap = objectAt(renderer, 'color_mapping');
  const bypass =
    ['categorized', 'single_color', 'hillshade'].includes(type as string) ||
    colorMap.domain === 'data';
  const nativeData =
    'colormap' in renderer &&
    (stretch.method ?? 'none') === 'none' &&
    !('color_formula' in objectAt(style, 'effects'));
  if (nativeData)
    requireCondition(
      !('range_policy' in stretch),
      'stretch.range_policy',
      'Native data colormaps use their own boundaries',
    );
  if (bypass) {
    requireCondition(
      (stretch.method ?? 'none') === 'none' && !('color_formula' in objectAt(style, 'effects')),
      'method',
      'Data-domain renderer must bypass stretch',
    );
    requireCondition(
      !('range_policy' in stretch),
      'stretch.range_policy',
      'Range policy requires a display-domain stretch',
    );
  }
  if (colorMap.mode === 'continuous' && 'stops' in colorMap) {
    const values = (colorMap.stops as JsonObject[]).map((stop) => stop.value as number);
    requireCondition(increasing(values), 'color_mapping.stops', 'Stops must increase');
    if (colorMap.domain === 'normalized')
      requireCondition(
        values.every((value) => value >= 0 && value <= 1),
        'color_mapping.stops',
        'Normalized stops must be in [0,1]',
      );
  }
  if (colorMap.mode === 'discrete') {
    const breaks = colorMap.breaks as number[];
    requireCondition(
      arrayAt(colorMap, 'colors').length + 1 === breaks.length,
      'color_mapping',
      'Break/color cardinality mismatch',
    );
    requireCondition(increasing(breaks), 'color_mapping.breaks', 'Breaks must increase');
  }
  if (colorMap.mode === 'exact') {
    const values = (colorMap.entries as JsonObject[]).map((entry) => entry.value);
    requireCondition(
      new Set(values).size === values.length,
      'color_mapping.entries',
      'Exact keys must be unique',
    );
  }
  const mosaic = objectAt(style, 'mosaic');
  if (type === 'categorized') {
    requireCondition(
      [
        objectAt(style, 'resampling').read ?? 'nearest',
        objectAt(style, 'resampling').reproject ?? 'nearest',
      ].every((value) => value === 'nearest' || value === 'mode'),
      'resampling',
      'Categorical rendering requires nearest or mode',
    );
    requireCondition(
      !['mean', 'median'].includes(mosaic.pixel_selection as string),
      'pixel_selection',
      'Categorical rendering forbids arithmetic mosaic',
    );
  }
  const calibration = objectAt(style, 'calibration');
  if (colorMap.mode === 'source') {
    requireCondition(
      (calibration.mode ?? 'none') === 'none',
      'calibration.mode',
      'Source palettes require unmodified category values',
    );
    requireCondition(
      Object.values(objectAt(style, 'extensions')).every(
        (extension) => (extension as JsonObject).stage === 'after_color',
      ),
      'extensions',
      'Source palettes allow only after_color extensions',
    );
  }
  if (calibration.mode === 'linear') {
    const bands = (calibration.coefficients as JsonObject[]).map((coefficient) => coefficient.band);
    requireCondition(
      new Set(bands).size === bands.length,
      'calibration',
      'Duplicate calibration band',
    );
  }
  if ('rank_channel' in mosaic) {
    requireCondition(
      ['highest', 'lowest'].includes(mosaic.pixel_selection as string),
      'rank_channel',
      'Rank applies only to highest/lowest',
    );
    if (mosaic.stage === 'after_channels')
      requireCondition(
        (mosaic.rank_channel as number) <= channels,
        'rank_channel',
        'Rank channel is out of bounds',
      );
    else if ('bidx' in renderer || 'index' in renderer) {
      const inputs =
        'bidx' in renderer
          ? arrayAt(renderer, 'bidx')
          : Object.values(objectAt(objectAt(renderer, 'index'), 'bindings'));
      requireCondition(
        (mosaic.rank_channel as number) <= new Set(inputs).size,
        'rank_channel',
        'Rank channel exceeds the distinct input band count',
      );
    }
  }
  const image = objectAt(style, 'image');
  const format = image.format ?? 'png';
  if ('background' in image) {
    const color = image.background as string;
    requireCondition(
      color.length === 7 || color.slice(-2).toLowerCase() === 'ff',
      'background',
      'Background must be opaque',
    );
  }
  if (format === 'png')
    requireCondition(!('quality' in image), 'quality', 'PNG does not accept lossy quality');
  if ('lossless' in image)
    requireCondition(format === 'webp', 'lossless', 'Lossless is a WebP option');
  if (image.lossless === true)
    requireCondition(
      !('quality' in image),
      'quality',
      'Lossless output does not accept lossy quality',
    );
}
