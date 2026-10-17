import type { RasterStyle } from './generated/types.js';
import { fail } from './errors.js';
import { canonicalJson, parseJsonStrict } from './json.js';
import type { JsonObject } from './json.js';
import { normalizeColors } from './normalize.js';
import { normalizeProfile } from './profile.js';
import { validateSemantics } from './semantics.js';
import { defaultSchemas, SchemaRegistry } from './schema.js';
import type { ValidationReport } from './schema.js';

/**
 * Return a normalized copy, preserving unknown declared extensions as incomplete.
 * Throws JSON, budget, known-schema and static-semantic errors. Success does not authorize execution.
 */
export function normalizeStyle(
  value: unknown,
  schemas: SchemaRegistry = defaultSchemas,
): RasterStyle {
  const document = parseJsonStrict(canonicalJson(value));
  schemas.check(document);
  normalizeProfile(document as JsonObject);
  validateSemantics(document as JsonObject);
  normalizeColors(document as JsonObject);
  // Normalization must not violate constraints imposed by an extension on core fields.
  schemas.check(document);
  return document as unknown as RasterStyle;
}

/** Strictly parse raw JSON before normalization, rejecting duplicate keys and invalid Unicode. */
export function parseStyle(json: string, schemas?: SchemaRegistry): RasterStyle {
  return normalizeStyle(parseJsonStrict(json), schemas);
}

/**
 * Normalize and inspect without modifying value; return an owned completeness snapshot.
 * Known errors still throw. Call again after registration to obtain a fresh report.
 */
export function inspectStyle(
  value: unknown,
  schemas: SchemaRegistry = defaultSchemas,
): ValidationReport {
  return schemas.check(normalizeStyle(value, schemas));
}

/**
 * Fully validate schemas and static semantics; missing resources throw E_SCHEMA_UNRESOLVED.
 * Execution capability must still be checked with requireExtensionSupport.
 */
export function validateStyle(value: unknown, schemas: SchemaRegistry = defaultSchemas): void {
  const report = inspectStyle(value, schemas);
  if (!report.complete)
    fail(
      'E_SCHEMA_UNRESOLVED',
      'Complete validation requires every declared schema',
      report.unresolvedSchemas.join(', '),
    );
}

/**
 * Fully validate, then require every exact declared URL in the executor's supported list.
 * Throws E_UNSUPPORTED_EXTENSION for a missing capability; parsing/validation errors propagate.
 */
export function requireExtensionSupport(
  value: unknown,
  supported: readonly string[],
  schemas: SchemaRegistry = defaultSchemas,
): void {
  validateStyle(value, schemas);
  for (const url of ((value as JsonObject).extensions ?? []) as string[])
    if (!supported.includes(url))
      fail(
        'E_UNSUPPORTED_EXTENSION',
        'Executor does not support this exact extension version',
        url,
      );
}
