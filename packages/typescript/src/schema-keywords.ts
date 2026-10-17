import { Ajv2020 } from 'ajv/dist/2020.js';
import type { CodeKeywordDefinition, KeywordCxt } from 'ajv';
import { _, and, Name, not, or } from 'ajv/dist/compile/codegen/index.js';
import { evaluatedPropsToName, mergeEvaluated, Type } from 'ajv/dist/compile/util.js';
import { propertyInData, usePattern } from 'ajv/dist/vocabularies/code.js';

/** Shared dialect settings for core, extension and meta-schema compilation. */
export function createSchemaValidator(): Ajv2020 {
  const ajv = new Ajv2020({ strict: false, ownProperties: true });
  ajv.removeKeyword('multipleOf').addKeyword({
    keyword: 'multipleOf',
    type: 'number',
    schemaType: 'number',
    errors: false,
    compile(divisor: number) {
      if (!Number.isFinite(divisor) || divisor <= 0) throw new Error('multipleOf must be positive');
      const [coefficient, exponent] = decimal(divisor);
      return (value: number) => {
        if (!Number.isFinite(value)) return false;
        const [numerator, power] = decimal(value);
        const shift = power - exponent;
        return shift >= 0
          ? (numerator * 10n ** BigInt(shift)) % coefficient === 0n
          : numerator % (coefficient * 10n ** BigInt(-shift)) === 0n;
      };
    },
  });

  // Ajv's property annotations use ordinary JavaScript objects. Prefix every
  // annotation key (not data/schema keys) so __proto__ and inherited names are
  // ordinary entries through native allOf/anyOf/$ref annotation merging.
  for (const [keyword, code] of Object.entries({
    properties: compileProperties,
    patternProperties: compilePatternProperties,
    additionalProperties: compileAdditionalProperties,
    unevaluatedProperties: compileUnevaluatedProperties,
  })) {
    const definition = ajv.getKeyword(keyword) as CodeKeywordDefinition;
    ajv.removeKeyword(keyword).addKeyword({ ...definition, code });
  }
  return ajv;
}

function decimal(value: number): [bigint, number] {
  const [mantissa, power = '0'] = value.toString().split('e');
  const fraction = mantissa!.split('.')[1]?.length ?? 0;
  return [BigInt(mantissa!.replace('.', '')), Number(power) - fraction];
}

function compileProperties(cxt: KeywordCxt): void {
  const { gen, schema, data, it } = cxt;
  const fields = Object.keys(schema);
  for (const field of fields) it.definedProperties.add(field);
  if (it.props !== true) {
    const evaluated = Object.fromEntries(fields.map((field) => ['$' + field, true as const]));
    it.props = mergeEvaluated.props(gen, evaluated, it.props);
  }
  const valid = gen.name('valid');
  for (const field of fields) {
    gen.if(propertyInData(gen, data, field, true));
    cxt.subschema({ keyword: 'properties', schemaProp: field, dataProp: field }, valid);
    if (!it.allErrors) gen.else().var(valid, true);
    gen.endIf();
    cxt.ok(valid);
  }
}

function compilePatternProperties(cxt: KeywordCxt): void {
  const { gen, schema, data, it } = cxt;
  if (it.props !== true && !(it.props instanceof Name)) {
    it.props = evaluatedPropsToName(gen, it.props);
  }
  const props = it.props;
  for (const pattern of Object.keys(schema)) {
    const valid = gen.var('valid', true);
    gen.forIn('key', data, (key) => {
      gen.if(_`${usePattern(cxt, pattern)}.test(${key})`, () => {
        cxt.subschema(
          {
            keyword: 'patternProperties',
            schemaProp: pattern,
            dataProp: key,
            dataPropType: Type.Str,
          },
          valid,
        );
        if (props !== true) gen.assign(_`${props}[${'$'} + ${key}]`, true);
        if (!it.allErrors) gen.if(not(valid), () => gen.break());
      });
    });
    cxt.ok(valid);
  }
}

function compileAdditionalProperties(cxt: KeywordCxt): void {
  const { gen, schema, parentSchema, data, it, errsCount } = cxt;
  it.props = true;
  if (schema === true) return;
  const fields = Object.keys(parentSchema.properties ?? {});
  const patterns = Object.keys(parentSchema.patternProperties ?? {});
  gen.forIn('key', data, (key) => {
    const conditions = [
      ...fields.map((field) => _`${key} === ${field}`),
      ...patterns.map((pattern) => _`${usePattern(cxt, pattern)}.test(${key})`),
    ];
    gen.if(conditions.length ? not(or(...conditions)) : _`true`, () => {
      if (schema === false) {
        cxt.setParams({ additionalProperty: key });
        cxt.error();
        if (!it.allErrors) gen.break();
      } else {
        const valid = gen.name('valid');
        cxt.subschema(
          { keyword: 'additionalProperties', dataProp: key, dataPropType: Type.Str },
          valid,
        );
        if (!it.allErrors) gen.if(not(valid), () => gen.break());
      }
    });
  });
  cxt.ok(_`${errsCount!} === errors`);
}

function compileUnevaluatedProperties(cxt: KeywordCxt): void {
  const { gen, schema, data, it, errsCount } = cxt;
  const { props } = it;
  const checkFields = () =>
    gen.forIn('key', data, (key) => {
      const condition =
        props instanceof Name
          ? _`!${props} || !Object.prototype.hasOwnProperty.call(${props}, ${'$'} + ${key})`
          : props === undefined
            ? _`true`
            : and(...Object.keys(props).map((field) => _`${key} !== ${field.slice(1)}`));
      gen.if(condition, () => {
        if (schema === false) {
          cxt.setParams({ unevaluatedProperty: key });
          cxt.error();
          if (!it.allErrors) gen.break();
        } else if (schema !== true) {
          const valid = gen.name('valid');
          cxt.subschema(
            { keyword: 'unevaluatedProperties', dataProp: key, dataPropType: Type.Str },
            valid,
          );
          if (!it.allErrors) gen.if(not(valid), () => gen.break());
        }
      });
    });
  if (props instanceof Name) gen.if(_`${props} !== true`, checkFields);
  else if (props !== true) checkFields();
  it.props = true;
  cxt.ok(_`${errsCount!} === errors`);
}
