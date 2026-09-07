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
requireValue(pkg.devDependencies?.['@types/vscode'] === '1.100.0', '@types/vscode must be pinned exactly to 1.100.0.');
requireValue(pkg.devDependencies?.['@types/node'] === '22.15.30', '@types/node must be pinned exactly to 22.15.30.');
requireValue(pkg.devDependencies?.typescript === '5.8.3', 'TypeScript must be pinned exactly to 5.8.3.');
requireValue(!pkg.devDependencies?.['@vscode/vsce'], '@vscode/vsce must not be installed in the normal test dependency set.');

const readme = read('README.md');
requireValue(!readme.includes('resources/repobundle.svg'), 'README must use the PNG logo; VSCE rejects local SVG images in Marketplace Markdown.');

const constants = read('src/bundler/constants.ts');
const generatorVersion = /GENERATOR_VERSION\s*=\s*['\"]([^'\"]+)['\"]/.exec(constants)?.[1];
requireValue(generatorVersion === pkg.version, `Generator version (${generatorVersion ?? 'missing'}) must match package version (${pkg.version}).`);

requireValue(pkg.files === undefined, 'Use .vscodeignore as the single VSIX file-selection mechanism; do not also define package.json files.');

const vscodeIgnore = read('.vscodeignore');
requireValue(!/^dist(?:\/\*\*)?$/m.test(vscodeIgnore), '.vscodeignore must not exclude dist/.');
requireValue(!/^media(?:\/\*\*)?$/m.test(vscodeIgnore), '.vscodeignore must not exclude media/.');
requireValue(!/^resources(?:\/\*\*)?$/m.test(vscodeIgnore), '.vscodeignore must not exclude resources/.');
requireValue(/^\.test-dist\/\*\*$/m.test(vscodeIgnore), '.vscodeignore must exclude .test-dist/.');
requireValue(/^dist\/test\/\*\*$/m.test(vscodeIgnore), '.vscodeignore must exclude legacy dist/test/.');
requireValue(!fs.existsSync(path.join(root, 'dist', 'test')), 'Runtime build must not contain compiled tests under dist/test/.');


const lockPath = path.join(root, 'package-lock.json');
requireValue(fs.existsSync(lockPath), 'package-lock.json is required for deterministic CI.');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const rootPackage = lock.packages?.[''];
  requireValue(lock.lockfileVersion === 3, 'package-lock.json must use lockfileVersion 3.');
  requireValue(rootPackage?.version === pkg.version, 'package-lock.json root version does not match package.json.');
  requireValue(rootPackage?.devDependencies?.['@types/vscode'] === '1.100.0', 'package-lock.json does not pin @types/vscode 1.100.0.');
  requireValue(rootPackage?.devDependencies?.['@types/node'] === '22.15.30', 'package-lock.json does not pin @types/node 22.15.30.');
  requireValue(rootPackage?.devDependencies?.typescript === '5.8.3', 'package-lock.json does not pin TypeScript 5.8.3.');
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log('RepoBundle manifest verification passed.');
