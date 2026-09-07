import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const pkg = JSON.parse(read('package.json'));
const errors = [];

function requireValue(condition, message) {
  if (!condition) errors.push(message);
}

function isExactVersion(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}

requireValue(pkg.name === 'repobundle', 'package.json name must be "repobundle".');
requireValue(pkg.displayName === 'RepoBundle', 'package.json displayName must be "RepoBundle".');
requireValue(pkg.main === './dist/src/extension.js', 'Unexpected extension entrypoint.');
requireValue(fs.existsSync(path.join(root, 'dist', 'src', 'extension.js')), 'Compiled extension entrypoint is missing. Run npm run compile.');
requireValue(fs.existsSync(path.join(root, 'media', 'dashboard.css')), 'Dashboard CSS is missing.');
requireValue(fs.existsSync(path.join(root, 'media', 'dashboard.js')), 'Dashboard JavaScript is missing.');
requireValue(fs.existsSync(path.join(root, 'resources', 'repobundle.svg')), 'Activity Bar icon is missing.');
requireValue(fs.existsSync(path.join(root, 'resources', 'repobundle.png')), 'Marketplace icon is missing.');
requireValue(pkg.icon === 'resources/repobundle.png', 'Marketplace icon must use the PNG asset.');
requireValue(pkg.engines?.vscode === '^1.100.0', 'engines.vscode must remain ^1.100.0 for this release.');
requireValue(pkg.engines?.node === undefined, 'engines.node belongs to build tooling, not the VS Code runtime manifest.');

const nodeTypes = pkg.devDependencies?.['@types/node'];
const vscodeTypes = pkg.devDependencies?.['@types/vscode'];
const typescript = pkg.devDependencies?.typescript;
requireValue(isExactVersion(nodeTypes), '@types/node must be pinned to an exact version.');
requireValue(vscodeTypes === '1.100.0', '@types/vscode must be pinned exactly to 1.100.0.');
requireValue(isExactVersion(typescript), 'TypeScript must be pinned to an exact version.');
requireValue(!pkg.devDependencies?.['@vscode/vsce'], '@vscode/vsce must not be installed in the normal test dependency set.');

const readme = read('README.md');
requireValue(!readme.includes('resources/repobundle.svg'), 'README must use the PNG logo; VSCE rejects local SVG images in Marketplace Markdown.');

const constants = read('src/bundler/constants.ts');
const generatorVersion = /GENERATOR_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(constants)?.[1];
requireValue(generatorVersion === pkg.version, `Generator version (${generatorVersion ?? 'missing'}) must match package version (${pkg.version}).`);

requireValue(pkg.files === undefined, 'Use .vscodeignore as the single VSIX file-selection mechanism; do not also define package.json files.');

const vscodeIgnore = read('.vscodeignore');
requireValue(!/^dist(?:\/\*\*)?$/m.test(vscodeIgnore), '.vscodeignore must not exclude dist/.');
requireValue(!/^media(?:\/\*\*)?$/m.test(vscodeIgnore), '.vscodeignore must not exclude media/.');
requireValue(!/^resources(?:\/\*\*)?$/m.test(vscodeIgnore), '.vscodeignore must not exclude resources/.');
requireValue(/^\.test-dist\/\*\*$/m.test(vscodeIgnore), '.vscodeignore must exclude .test-dist/.');
requireValue(!fs.existsSync(path.join(root, 'dist', 'test')), 'Runtime build must not contain compiled tests under dist/test/.');

const lockPath = path.join(root, 'package-lock.json');
requireValue(fs.existsSync(lockPath), 'package-lock.json is required for deterministic CI.');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const rootPackage = lock.packages?.[''];
  requireValue(lock.lockfileVersion === 3, 'package-lock.json must use lockfileVersion 3.');
  requireValue(rootPackage?.version === pkg.version, 'package-lock.json root version does not match package.json.');

  const expectedPins = [
    ['@types/node', nodeTypes],
    ['@types/vscode', vscodeTypes],
    ['typescript', typescript],
  ];

  for (const [name, expected] of expectedPins) {
    requireValue(
      rootPackage?.devDependencies?.[name] === expected,
      `package-lock.json root dependency ${name} (${rootPackage?.devDependencies?.[name] ?? 'missing'}) does not match package.json (${expected ?? 'missing'}).`,
    );
    requireValue(
      lock.packages?.[`node_modules/${name}`]?.version === expected,
      `package-lock.json installed package ${name} (${lock.packages?.[`node_modules/${name}`]?.version ?? 'missing'}) does not match package.json (${expected ?? 'missing'}).`,
    );
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log('RepoBundle manifest verification passed.');
