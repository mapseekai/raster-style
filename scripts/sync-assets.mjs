import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const registry = JSON.parse(
  await readFile(resolve(root, 'spec/v3/query-bindings-v3.json'), 'utf8'),
);
const schema = JSON.parse(
  await readFile(resolve(root, 'spec/v3/raster-style-v3.schema.json'), 'utf8'),
);
const keys = new Set();
const paths = new Set();
for (const binding of registry.bindings) {
  if (!/^[a-z][a-z0-9_]*$/.test(binding.key) || keys.has(binding.key) || paths.has(binding.path))
    throw new Error(`Duplicate or invalid binding: ${binding.key}`);
  if (binding.path === '*') {
    keys.add(binding.key);
    paths.add(binding.path);
    continue;
  }
  let node = schema;
  for (const part of binding.path.split('.')) {
    const candidates = node.oneOf ?? [node];
    node = candidates.find((candidate) => candidate.properties?.[part])?.properties?.[part];
    if (!node) throw new Error(`Unknown schema path: ${binding.path}`);
  }
  keys.add(binding.key);
  paths.add(binding.path);
}
function checkBindingCoverage(node, path = '') {
  if (paths.has(path)) return;
  if (node.oneOf) {
    for (const variant of node.oneOf) checkBindingCoverage(variant, path);
    return;
  }
  if (node.properties) {
    for (const [key, child] of Object.entries(node.properties))
      checkBindingCoverage(child, path ? `${path}.${key}` : key);
    return;
  }
  throw new Error(`Missing query binding: ${path}`);
}
checkBindingCoverage(schema);
const assets = [
  ['spec/v3/raster-style-v3.schema.json', 'raster-style-v3.schema.json'],
  ['spec/v3/query-bindings-v3.json', 'query-bindings-v3.json'],
  ['extensions/raster/mosaic/v1.0.0/schema.json', 'mosaic-v1.0.0.schema.json'],
  ['extensions/raster/tile/v1.0.0/schema.json', 'tile-v1.0.0.schema.json'],
];
for (const [sourcePath, name] of assets) {
  const source = await readFile(resolve(root, sourcePath), 'utf8');
  const targets = [
    ['packages/go/internal/assets', name, source],
    ['crates/raster-style/assets', name, source],
    [
      'packages/typescript/src/generated',
      name.replace('.json', '.ts'),
      `// Generated from ${sourcePath}. Do not edit.\nexport default ${source.trim()} as const;\n`,
    ],
  ];
  for (const [directory, filename, content] of targets) {
    const path = resolve(root, directory, filename);
    if (check) {
      if ((await readFile(path, 'utf8')) !== content)
        throw new Error(`Stale generated asset: ${path}`);
    } else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
  }
}
console.log(check ? 'Generated assets are current.' : 'Generated assets synchronized.');

// Crate tests are self-contained; shared testdata remains the source of truth.
for (const name of (await readdir(resolve(root, 'testdata')))
  .filter((name) => name.endsWith('.json'))
  .sort()) {
  const source = await readFile(resolve(root, 'testdata', name), 'utf8');
  const target = resolve(root, 'crates/raster-style/tests/data', name);
  if (check) {
    if ((await readFile(target, 'utf8')) !== source)
      throw new Error(`Stale Rust test fixture: ${target}`);
  } else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, source);
  }
}
