import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const registry = JSON.parse(
  await readFile(resolve(root, 'spec/v2/query-bindings-v2.json'), 'utf8'),
);
const schema = JSON.parse(
  await readFile(resolve(root, 'spec/v2/raster-style-v2.schema.json'), 'utf8'),
);
const keys = new Set();
const paths = new Set();
for (const binding of registry.bindings) {
  if (!/^[a-z][a-z0-9_]*$/.test(binding.key) || keys.has(binding.key) || paths.has(binding.path))
    throw new Error(`Duplicate or invalid binding: ${binding.key}`);
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
const assets = ['raster-style-v2.schema.json', 'query-bindings-v2.json'];
for (const name of assets) {
  const source = await readFile(resolve(root, 'spec/v2', name), 'utf8');
  const targets = [
    ['packages/go/internal/assets', name, source],
    ['crates/raster-style/assets', name, source],
    [
      'packages/typescript/src/generated',
      name.replace('.json', '.ts'),
      `// Generated from spec/v2/${name}. Do not edit.\nexport default ${source.trim()} as const;\n`,
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
