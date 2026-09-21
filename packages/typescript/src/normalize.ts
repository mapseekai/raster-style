import type { JsonObject } from './json.js';
import { getPath, setPath } from './paths.js';

export function normalizeColor(color: string): string {
  return color.toLowerCase() + (color.length === 7 ? 'ff' : '');
}

/** Normalize only declared color fields. Extension configuration remains opaque. */
export function normalizeColors(style: JsonObject): void {
  const scalarPaths = ['renderer.color', 'opacity.nodata_color', 'output.background'];
  for (const path of scalarPaths) {
    const color = getPath(style, path);
    if (typeof color === 'string') setPath(style, path, normalizeColor(color));
  }
  const map = getPath(style, 'renderer.color_map') as JsonObject | undefined;
  if (!map) return;
  for (const key of ['under', 'over', 'outside_color', 'fallback_color']) {
    const color = map[key];
    if (typeof color === 'string' && color.startsWith('#')) map[key] = normalizeColor(color);
  }
  for (const key of ['stops', 'entries']) {
    const entries = map[key] as JsonObject[] | undefined;
    entries?.forEach((entry) => {
      entry.color = normalizeColor(entry.color as string);
    });
  }
  if (Array.isArray(map.colors))
    map.colors = map.colors.map((color) => normalizeColor(color as string));
}
