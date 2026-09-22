import { fail } from './errors.js';
import { canonicalJson } from './json.js';
import type { JsonObject, JsonValue } from './json.js';

const numericToken = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const trim = (value: string) => value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
function requireProfile(condition: boolean, path: string, message: string): void {
  if (!condition) fail('E_SEMANTIC', message, path);
}

/** Formula strings are a transport representation of structured operation arrays. */
export function decodeFormula(text: string, post = false): JsonObject[] {
  const steps = text.split(',');
  requireProfile(steps.length <= 64, 'effects', 'At most 64 operations are allowed');
  return steps.map((step) => {
    const t = trim(step).split(/[ \t\r\n]+/);
    const op = t[0]!;
    const expected =
      op === 'sigmoidal'
        ? 4
        : ['gamma', ...(post ? ['brightness', 'contrast'] : [])].includes(op)
          ? 3
          : ['saturation', ...(post ? ['grayscale', 'invert'] : [])].includes(op)
            ? 2
            : 0;
    requireProfile(
      expected > 0 && t.length === expected,
      'effects',
      'Invalid operation or argument count',
    );
    if (op === 'grayscale') return { op, method: t[1]! };
    const result: JsonObject = { op };
    let start = 1;
    if (op !== 'saturation') {
      result.channels = t[1]!;
      start = 2;
    }
    for (let i = start; i < t.length; i++) {
      const n = Number(t[i]);
      requireProfile(
        numericToken.test(t[i]!) && Number.isFinite(n),
        'effects',
        'Expected a finite numeric argument',
      );
      result[op === 'sigmoidal' ? (i === 2 ? 'contrast' : 'midpoint') : 'value'] = n;
    }
    return result;
  });
}

export function encodeFormula(value: JsonValue): string {
  return (value as JsonObject[])
    .map((step) => {
      const args: string[] = [step.op as string];
      if ('channels' in step) args.push(step.channels as string);
      if ('method' in step) args.push(step.method as string);
      for (const key of ['value', 'contrast', 'midpoint'])
        if (key in step) args.push(canonicalJson(step[key]!));
      return args.join(' ');
    })
    .join(', ');
}

export function normalizeProfile(document: JsonObject): void {
  const style = document.renderer as JsonObject;
  if (typeof style.expression === 'string') {
    const parts = style.expression.split(';').map(trim);
    requireProfile(
      parts.length <= 3 && parts.every((v) => [...v].length > 0 && [...v].length <= 2048),
      'renderer.expression',
      'Invalid expression length',
    );
    style.expression = parts.join(';');
  }
  const channels = Array.isArray(style.bidx)
    ? style.bidx.length
    : typeof style.expression === 'string'
      ? style.expression.split(';').length
      : 1;
  const effects = (document.effects ?? {}) as JsonObject;
  for (const key of ['color_formula', 'post_color_formula']) {
    for (const step of (effects[key] ?? []) as JsonObject[]) {
      if (!['saturation', 'grayscale'].includes(step.op as string)) {
        step.channels ??= key === 'color_formula' && channels === 1 ? 'r' : 'rgb';
        if (key === 'color_formula')
          requireProfile(
            [...(step.channels as string)].every((c) => 'rgb'.indexOf(c) < channels),
            'effects.' + key,
            'Selected channel does not exist',
          );
      } else if (key === 'color_formula')
        requireProfile(
          channels === 3,
          'effects.' + key,
          'Saturation requires three output channels',
        );
    }
  }
  if (Array.isArray(style.colormap)) {
    let end = -Infinity;
    for (const entry of style.colormap as number[][][]) {
      const [lo, hi] = entry[0]!;
      requireProfile(
        lo! < hi! && lo! >= end,
        'renderer.colormap',
        'Intervals must increase and not overlap',
      );
      end = hi!;
    }
  } else if (style.colormap)
    requireProfile(
      Object.keys(style.colormap).every((k) => Number.isSafeInteger(Number(k))),
      'renderer.colormap',
      'Colormap keys must be safe integers',
    );
}
