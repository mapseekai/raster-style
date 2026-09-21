import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from './generated/raster-style-v2.schema.js';
import type { RasterStyle } from './generated/types.js';
import { fail } from './errors.js';
import { canonicalJson, parseJsonStrict } from './json.js';
import type { JsonObject } from './json.js';
import { normalizeColors } from './normalize.js';
import { validateSemantics } from './semantics.js';

// Compile once, never fetch schemas or mutate user documents during validation.
const validator = new Ajv2020({ strict: false, allErrors: false }).compile(schema);

/** Validate, clone and normalize colors without inserting renderer defaults. */
export function normalizeStyle(value: unknown): RasterStyle {
  const document = parseJsonStrict(canonicalJson(value));
  if (!validator(document)) {
    const error = validator.errors?.[0];
    fail('E_SCHEMA', error?.message ?? 'Schema validation failed', error?.instancePath ?? '');
  }
  validateSemantics(document as JsonObject);
  normalizeColors(document as JsonObject);
  return document as unknown as RasterStyle;
}

export function parseStyle(json: string): RasterStyle {
  return normalizeStyle(parseJsonStrict(json));
}

export function validateStyle(value: unknown): void {
  normalizeStyle(value);
}
