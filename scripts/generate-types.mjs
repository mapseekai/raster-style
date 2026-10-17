import { compile } from 'json-schema-to-typescript';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const schema = JSON.parse(
  await readFile(new URL('../spec/v3/raster-style-v3.schema.json', import.meta.url), 'utf8'),
  (_key, value) => {
    // This generator expects draft-07 tuples. Adapt only its in-memory schema.
    if (value && typeof value === 'object' && Array.isArray(value.prefixItems)) {
      const { prefixItems, items, ...rest } = value;
      return { ...rest, items: prefixItems, additionalItems: items ?? true };
    }
    return value;
  },
);
schema.title = 'RasterStyle';
// SDK conveniences are derived from official extension schemas, not copied into the core schema.
for (const name of ['mosaic', 'tile']) {
  const extension = JSON.parse(
    await readFile(
      new URL(`../extensions/raster/${name}/v1.0.0/schema.json`, import.meta.url),
      'utf8',
    ),
  );
  for (const [field, definition] of Object.entries(extension.properties))
    if (!(field in schema.properties)) schema.properties[field] = definition;
}
// Third-party top-level fields are preserved; core/nested properties retain strict types.
schema.additionalProperties = true;
delete schema.if;
delete schema.else;
delete schema.not;
const output = await compile(schema, 'RasterStyle', {
  bannerComment:
    '/** Generated from Raster Style v3 and official extension JSON Schemas. Run pnpm generate; do not edit. */',
  maxItems: -1,
  additionalProperties: false,
  style: { singleQuote: true, printWidth: 100 },
});
const target = new URL('../packages/typescript/src/generated/types.ts', import.meta.url);
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')) !== output)
    throw new Error('Generated TypeScript types are stale.');
} else {
  await writeFile(target, output);
}
console.log(`TypeScript types: ${fileURLToPath(target)}`);
