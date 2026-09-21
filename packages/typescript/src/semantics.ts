import { fail } from './errors.js';
import type { JsonObject, JsonValue } from './json.js';
import { arrayAt, objectAt } from './paths.js';

function requireCondition(condition: boolean, path: string, message: string): void {
  if (!condition) fail('E_SEMANTIC', message, path);
}

function increasing(values: number[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

/** Cross-field rules that can be checked without a raster dataset or renderer. */
export function validateSemantics(style: JsonObject): void {
  const input = objectAt(style, 'input');
  const selector = objectAt(input, 'selector');
  const channels =
    selector.kind === 'bands'
      ? arrayAt(selector, 'bands').length
      : selector.kind === 'expression'
        ? arrayAt(selector, 'expressions').length
        : 1;
  const renderer = objectAt(style, 'renderer');
  const type = renderer.type;
  requireCondition(
    channels === (type === 'rgb' ? 3 : 1),
    'input.selector',
    'Renderer channel cardinality mismatch',
  );
  const stretch = objectAt(style, 'stretch');
  for (const key of ['ranges', 'curves', 'gamma']) {
    if (key in stretch) {
      const count = arrayAt(stretch, key).length;
      requireCondition(
        count === 1 || count === channels,
        'stretch.' + key,
        'Expected one value or one per channel',
      );
    }
  }
  for (const pair of arrayAt(stretch, 'ranges') as number[][]) {
    requireCondition(pair[0]! < pair[1]!, 'stretch.ranges', 'Range must increase');
  }
  const percentiles = stretch.percentiles as number[] | undefined;
  if (percentiles)
    requireCondition(
      percentiles[0]! < percentiles[1]!,
      'stretch.percentiles',
      'Percentiles must increase',
    );
  for (const curve of arrayAt(stretch, 'curves') as number[][][]) {
    requireCondition(
      curve.every((point) => point[1]! >= 0 && point[1]! <= 1),
      'stretch.curves',
      'Curve output must be in [0,1]',
    );
    requireCondition(
      increasing(curve.map((point) => point[0]!)) &&
        curve.every((point, index) => index === 0 || curve[index - 1]![1]! <= point[1]!),
      'stretch.curves',
      'Curve must be monotonic',
    );
  }
  const colorMap = objectAt(renderer, 'color_map');
  const bypass =
    ['categorized', 'single_color', 'hillshade'].includes(type as string) ||
    colorMap.domain === 'data';
  if (bypass) {
    requireCondition(
      (stretch.method ?? 'none') === 'none' &&
        arrayAt(stretch, 'gamma').every((value) => value === 1) &&
        !('sigmoid' in stretch),
      'stretch',
      'Data-domain renderer must bypass stretch',
    );
  }
  if (colorMap.mode === 'continuous' && 'stops' in colorMap) {
    const values = (colorMap.stops as JsonObject[]).map((stop) => stop.value as number);
    requireCondition(increasing(values), 'renderer.color_map.stops', 'Stops must increase');
    if (colorMap.domain === 'normalized')
      requireCondition(
        values.every((value) => value >= 0 && value <= 1),
        'renderer.color_map.stops',
        'Normalized stops must be in [0,1]',
      );
  }
  if (colorMap.mode === 'discrete') {
    const breaks = colorMap.breaks as number[];
    requireCondition(
      arrayAt(colorMap, 'colors').length + 1 === breaks.length,
      'renderer.color_map',
      'Break/color cardinality mismatch',
    );
    requireCondition(increasing(breaks), 'renderer.color_map.breaks', 'Breaks must increase');
  }
  if (colorMap.mode === 'exact') {
    const values = (colorMap.entries as JsonObject[]).map((entry) => entry.value);
    requireCondition(
      new Set(values).size === values.length,
      'renderer.color_map.entries',
      'Exact keys must be unique',
    );
  }
  const mosaic = objectAt(style, 'mosaic');
  if (type === 'categorized') {
    requireCondition(
      Object.values(objectAt(style, 'resampling')).every(
        (value) => value === 'nearest' || value === 'mode',
      ),
      'resampling',
      'Categorical rendering requires nearest or mode',
    );
    requireCondition(
      !['mean', 'median'].includes(mosaic.pixel_selection as string),
      'mosaic.pixel_selection',
      'Categorical rendering forbids arithmetic mosaic',
    );
  }
  const opacity = objectAt(style, 'opacity');
  if (opacity.alpha_band) {
    const range = (opacity.alpha_band as JsonObject).range as number[];
    requireCondition(
      range[0]! < range[1]!,
      'opacity.alpha_band.range',
      'Alpha range must increase',
    );
  }
  for (const rule of arrayAt(opacity, 'rules') as JsonObject[]) {
    if ('channel' in rule)
      requireCondition(
        (rule.channel as number) <= channels,
        'opacity.rules',
        'Rule channel is out of bounds',
      );
    if (rule.kind === 'range')
      requireCondition(
        (rule.min as number) < (rule.max as number),
        'opacity.rules',
        'Rule range must increase',
      );
    if (rule.kind === 'rgb')
      requireCondition(channels === 3, 'opacity.rules', 'RGB rule requires three channels');
  }
  const calibration = objectAt(input, 'calibration');
  if (calibration.mode === 'linear') {
    const bands = (calibration.coefficients as JsonObject[]).map((coefficient) => coefficient.band);
    requireCondition(
      new Set(bands).size === bands.length,
      'input.calibration',
      'Duplicate calibration band',
    );
  }
  if ('rank_channel' in mosaic) {
    requireCondition(
      ['highest', 'lowest'].includes(mosaic.pixel_selection as string),
      'mosaic.rank_channel',
      'Rank applies only to highest/lowest',
    );
    if (mosaic.stage === 'after_selector')
      requireCondition(
        (mosaic.rank_channel as number) <= channels,
        'mosaic.rank_channel',
        'Rank channel is out of bounds',
      );
  }
  const output = objectAt(style, 'output');
  const format = output.format ?? 'png';
  if (format === 'jpeg' || output.alpha === 'flatten') {
    requireCondition(
      output.alpha === 'flatten' && 'background' in output,
      'output',
      'Flatten requires background; JPEG requires flatten',
    );
  }
  if ('background' in output) {
    const color = output.background as string;
    requireCondition(
      color.length === 7 || color.slice(-2).toLowerCase() === 'ff',
      'output.background',
      'Background must be opaque',
    );
  }
  if (format === 'png')
    requireCondition(!('quality' in output), 'output.quality', 'PNG does not accept lossy quality');
  if ('lossless' in output)
    requireCondition(format === 'webp', 'output.lossless', 'Lossless is a WebP option');
  if (output.lossless === true)
    requireCondition(
      !('quality' in output),
      'output.quality',
      'Lossless output does not accept lossy quality',
    );
}
