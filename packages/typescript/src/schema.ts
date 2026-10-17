import { createSchemaValidator } from './schema-keywords.js';
import type { ValidateFunction } from 'ajv';
import coreSchema from './generated/raster-style-v3.schema.js';
import mosaicSchema from './generated/mosaic-v1.0.0.schema.js';
import tileSchema from './generated/tile-v1.0.0.schema.js';
import { fail, RasterStyleError } from './errors.js';
import { canonicalJson, parseJsonStrict } from './json.js';
import type { JsonObject } from './json.js';

/** Exact identity of the embedded Raster Style 3.0 core schema. */
export const CORE_SCHEMA_URL = coreSchema.$id;
/** Exact identity of the embedded Mosaic 1.0.0 extension schema. */
export const MOSAIC_SCHEMA_URL = mosaicSchema.$id;
/** Exact identity of the embedded Tile 1.0.0 extension schema. */
export const TILE_SCHEMA_URL = tileSchema.$id;
export const coreFields: ReadonlySet<string> = new Set(Object.keys(coreSchema.properties));

/** Owned validation result; later resource registrations do not update this snapshot. */
export interface ValidationReport {
  /** False means preservation succeeded, not complete extension validation. */
  complete: boolean;
  /** Unregistered declarations in input order; no remote lookup is performed. */
  unresolvedSchemas: string[];
}

/**
 * Offline schema registry. URLs are exact resource identities, never field-name hints.
 * @example
 * const schemas = new SchemaRegistry();
 * const report = schemas.check({ version: '3.0', renderer: { type: 'gray', bidx: [1] } });
 * // report.complete === true; execution support remains a separate check.
 */
export class SchemaRegistry {
  readonly #schemas = new Map<string, JsonObject>();
  readonly #validators = new Map<string, ValidateFunction>();
  readonly #core: ValidateFunction = createSchemaValidator().compile(coreSchema);

  /** Initialize the embedded core and official extensions; resource failures throw E_CONFIG. */
  constructor() {
    for (const schema of [coreSchema, mosaicSchema, tileSchema]) this.register(schema);
  }

  /**
   * Own a copy of a draft 2020-12 resource and invalidate compiled combinations.
   * Invalid JSON/budgets throw their SDK errors; invalid or duplicate resources throw E_CONFIG.
   * Existing report snapshots are unchanged.
   */
  register(value: unknown): this {
    const schema = parseJsonStrict(canonicalJson(value));
    if (!schema || typeof schema !== 'object' || Array.isArray(schema))
      fail('E_CONFIG', 'A schema resource must be an object');
    const id = schema.$id;
    if (typeof id !== 'string' || !/^https?:\/\/[^\s#]+$/.test(id))
      fail('E_CONFIG', 'Schema $id must be an absolute HTTP(S) URL without a fragment');
    if (this.#schemas.has(id)) fail('E_CONFIG', 'Schema identity is already registered', id);
    if (schema.$schema !== undefined && schema.$schema !== coreSchema.$schema)
      fail('E_CONFIG', 'Extension composition requires JSON Schema draft 2020-12', id);
    if (!createSchemaValidator().validateSchema(schema))
      fail('E_CONFIG', 'Invalid JSON Schema resource', id);
    this.#schemas.set(id, schema);
    this.#validators.clear();
    return this;
  }

  /**
   * Invoke resolver once; callers own networking, cancellation, budgets and timeouts.
   * Rejections propagate. A returned $id differing from url rejects with E_CONFIG.
   */
  async resolve(url: string, resolver: (url: string) => unknown | Promise<unknown>): Promise<this> {
    if (!/^https?:\/\/[^\s#]+$/.test(url)) fail('E_CONFIG', 'Invalid schema URL', url);
    const schema = parseJsonStrict(canonicalJson(await resolver(url))) as JsonObject;
    if (schema?.$id !== url)
      fail('E_CONFIG', 'Resolved schema $id does not match the request', url);
    return this.register(schema);
  }

  /**
   * Check structure and return an owned completeness snapshot without modifying value.
   * Unknown declarations remain incomplete; known errors throw E_SCHEMA, unresolved
   * references throw E_SCHEMA_UNRESOLVED, and compilation failures throw E_CONFIG.
   * Use inspectStyle/validateStyle for JSON budgets, normalization and static semantics.
   */
  check(value: unknown): ValidationReport {
    if (!this.#core(value)) this.#reject(this.#core);
    const declarations = ((value as JsonObject).extensions ?? []) as string[];
    const unresolvedSchemas = declarations.filter((url) => !this.#schemas.has(url));
    const known = declarations.filter((url) => this.#schemas.has(url)).sort();
    const complete = unresolvedSchemas.length === 0;
    const key = canonicalJson([known, complete]);
    let validate = this.#validators.get(key);
    if (validate) {
      this.#validators.delete(key);
      this.#validators.set(key, validate);
    } else {
      const ajv = createSchemaValidator();
      const composition = {
        $schema: coreSchema.$schema,
        allOf: [CORE_SCHEMA_URL, ...known].map((url) => ({ $ref: url })),
        ...(complete ? { unevaluatedProperties: false } : {}),
      };
      try {
        for (const schema of this.#schemas.values()) ajv.addSchema(schema);
        validate = ajv.compile(composition);
      } catch (error) {
        if (error && typeof error === 'object' && 'missingSchema' in error)
          fail(
            'E_SCHEMA_UNRESOLVED',
            'A schema reference has not been registered',
            String(error.missingSchema),
          );
        throw new RasterStyleError(
          'E_CONFIG',
          `Schema composition could not be compiled: ${String(error)}`,
          '',
          { cause: error },
        );
      }
      // Bound combinations supplied by untrusted requests; resources remain caller-controlled.
      if (this.#validators.size >= 64) {
        const oldest = this.#validators.keys().next().value;
        if (oldest !== undefined) this.#validators.delete(oldest);
      }
      this.#validators.set(key, validate);
    }
    if (!validate(value)) this.#reject(validate);
    return { complete, unresolvedSchemas };
  }

  #reject(validate: ValidateFunction): never {
    const error = validate.errors?.[0];
    return fail(
      'E_SCHEMA',
      error?.message ?? 'Schema validation failed',
      error?.instancePath ?? '',
    );
  }
}

export const defaultSchemas = new SchemaRegistry();
