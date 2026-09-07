import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { bundleRepository } from '../src/bundler/bundler';
import { markdownInlineCode } from '../src/bundler/markdown';
import { isWithin, toPosixRelative } from '../src/bundler/security';
import { BundlerCancelledError, BundlerOptions } from '../src/bundler/types';

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'repobundle-test-'));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function options(repoDir: string, overrides: Partial<BundlerOptions> = {}): BundlerOptions {
  return {
    repoDir,
    targetMb: 0.08,
    hardMaxMb: 0.1,
    maxBundles: 0,
    lineNumbers: false,
    includeDependencies: false,
    includeSensitive: false,
    respectGitignore: false,
    excludeDirs: [],
    ...overrides,
  };
}

test('markdownInlineCode safely handles backticks in paths', () => {
  assert.equal(markdownInlineCode('odd`name.ts'), '`` odd`name.ts ``');
  assert.equal(markdownInlineCode('normal.ts'), '`normal.ts`');
});

test('Windows extended-length paths compare as the same repository root', () => {
  const repo = 'D:\\work\\repo';
  const extendedChild = '\\\\?\\D:\\work\\repo\\.env';
  const extendedOutside = '\\\\?\\D:\\work\\other\\.env';

  assert.equal(isWithin(extendedChild, repo), true);
  assert.equal(toPosixRelative(repo, extendedChild), '.env');
  assert.equal(isWithin(extendedOutside, repo), false);
});

test('default bundle is signed in the index and writes no marker file', async () => {
  await withTempDir(async (root) => {
    const repo = path.join(root, 'repo');
    await fs.mkdir(path.join(repo, 'src'), { recursive: true });
    await fs.mkdir(path.join(repo, 'node_modules', 'pkg'), { recursive: true });
    await fs.writeFile(path.join(repo, 'src', 'app.ts'), 'export const answer = 42;\n');
    await fs.writeFile(path.join(repo, '.env'), 'TOKEN=super-secret\n');
    await fs.writeFile(path.join(repo, '.gitignore'), 'ignored.txt\n');
    await fs.writeFile(path.join(repo, 'ignored.txt'), 'still included by filesystem scan\n');
    await fs.writeFile(path.join(repo, 'node_modules', 'pkg', 'index.js'), 'dependency\n');
    await fs.writeFile(path.join(repo, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const result = await bundleRepository(options(repo));
    const index = await fs.readFile(result.indexPath, 'utf8');
    const outputEntries = await fs.readdir(result.outputDir);
    const bundleText = (await Promise.all(
      outputEntries.filter((name) => /^bundle_\d+\.md$/.test(name)).map((name) => fs.readFile(path.join(result.outputDir, name), 'utf8')),
    )).join('\n');

    assert.match(index, /- Generator: `repobundle`/);
    assert.match(index, /- Format version: `1`/);
    assert.match(index, /filesystem scan; \.gitignore intentionally ignored/);
    assert.match(index, /ignored\.txt/);
    assert.match(index, /\.env.*sensitive credential\/key file excluded/);
    assert.match(index, /node_modules\/.*dependency\/environment directory/);
    assert.equal(outputEntries.filter((name) => name.startsWith('.')).length, 0);
    assert.doesNotMatch(bundleText, /super-secret/);
    assert.doesNotMatch(bundleText, /dependency\n/);
  });
});

test('sensitive symlink targets are excluded even when the alias name is harmless', async (t) => {
  await withTempDir(async (root) => {
    const repo = path.join(root, 'repo');
    await fs.mkdir(repo, { recursive: true });
    await fs.writeFile(path.join(repo, '.env'), 'API_KEY=symlink-secret\n');
    try {
      await fs.symlink('.env', path.join(repo, 'config.txt'));
    } catch (error) {
      t.skip(`Symlinks unavailable in this environment: ${String(error)}`);
      return;
    }
    await fs.writeFile(path.join(repo, 'safe.txt'), 'safe\n');

    const result = await bundleRepository(options(repo));
    const index = await fs.readFile(result.indexPath, 'utf8');
    const bundleNames = (await fs.readdir(result.outputDir)).filter((name) => /^bundle_\d+\.md$/.test(name));
    const contents = (await Promise.all(bundleNames.map((name) => fs.readFile(path.join(result.outputDir, name), 'utf8')))).join('\n');

    assert.match(index, /config\.txt.*sensitive credential\/key symlink target excluded/);
    assert.doesNotMatch(contents, /symlink-secret/);
  });
});

test('backtick filenames remain unambiguous in generated Markdown', async () => {
  await withTempDir(async (root) => {
    const repo = path.join(root, 'repo');
    await fs.mkdir(repo, { recursive: true });
    await fs.writeFile(path.join(repo, 'odd`name.ts'), 'export default 1;\n');
    const result = await bundleRepository(options(repo));
    const index = await fs.readFile(result.indexPath, 'utf8');
    assert.match(index, /`` odd`name\.ts ``/);
  });
});

test('hard bundle size is respected for large text', async () => {
  await withTempDir(async (root) => {
    const repo = path.join(root, 'repo');
    await fs.mkdir(repo, { recursive: true });
    const lines = Array.from({ length: 12000 }, (_, index) => `line-${index.toString().padStart(5, '0')} ${'x'.repeat(20)}\n`).join('');
    await fs.writeFile(path.join(repo, 'large.txt'), lines);
    const hardMaxMb = 0.06;
    const result = await bundleRepository(options(repo, { targetMb: 0.045, hardMaxMb }));
    const entries = (await fs.readdir(result.outputDir)).filter((name) => /^bundle_\d+\.md$/.test(name));
    assert.ok(entries.length > 1);
    const hardBytes = Math.floor(hardMaxMb * 1024 * 1024);
    for (const name of entries) {
      const stat = await fs.stat(path.join(result.outputDir, name));
      assert.ok(stat.size <= hardBytes, `${name} is ${stat.size} bytes, expected <= ${hardBytes}`);
    }
  });
});

test('unknown output entries prevent destructive replacement', async () => {
  await withTempDir(async (root) => {
    const repo = path.join(root, 'repo');
    await fs.mkdir(repo, { recursive: true });
    await fs.writeFile(path.join(repo, 'a.txt'), 'hello\n');
    const first = await bundleRepository(options(repo));
    await fs.writeFile(path.join(first.outputDir, 'notes.txt'), 'do not delete\n');
    await assert.rejects(bundleRepository(options(repo)), /Refusing to replace/);
    assert.equal(await fs.readFile(path.join(first.outputDir, 'notes.txt'), 'utf8'), 'do not delete\n');
  });
});

test('respectGitignore uses git discovery and omits ignored files', async (t) => {
  await withTempDir(async (root) => {
    const repo = path.join(root, 'repo');
    await fs.mkdir(repo, { recursive: true });
    const git = spawnSync('git', ['init', repo], { encoding: 'utf8' });
    if (git.status !== 0) {
      t.skip('git is unavailable');
      return;
    }
    await fs.writeFile(path.join(repo, '.gitignore'), 'ignored.txt\n');
    await fs.writeFile(path.join(repo, 'ignored.txt'), 'ignore me\n');
    await fs.writeFile(path.join(repo, 'keep.txt'), 'keep me\n');

    const result = await bundleRepository(options(repo, { respectGitignore: true }));
    const index = await fs.readFile(result.indexPath, 'utf8');
    const bundles = (await fs.readdir(result.outputDir)).filter((name) => /^bundle_\d+\.md$/.test(name));
    const contents = (await Promise.all(bundles.map((name) => fs.readFile(path.join(result.outputDir, name), 'utf8')))).join('\n');

    assert.match(index, /git ls-files/);
    assert.match(contents, /keep me/);
    assert.doesNotMatch(contents, /ignore me/);
  });
});

test('cancellation aborts before changing output', async () => {
  await withTempDir(async (root) => {
    const repo = path.join(root, 'repo');
    await fs.mkdir(repo, { recursive: true });
    await fs.writeFile(path.join(repo, 'a.txt'), 'hello\n');
    await assert.rejects(
      bundleRepository(options(repo), { isCancellationRequested: () => true }),
      (error: unknown) => error instanceof BundlerCancelledError,
    );
  });
});

test('a clean signed output can be regenerated in place', async () => {
  await withTempDir(async (root) => {
    const repo = path.join(root, 'repo');
    await fs.mkdir(repo, { recursive: true });
    await fs.writeFile(path.join(repo, 'a.txt'), 'one\n');
    const first = await bundleRepository(options(repo));
    await fs.writeFile(path.join(repo, 'a.txt'), 'two\n');
    const second = await bundleRepository(options(repo));
    assert.equal(second.outputDir, first.outputDir);
    const bundles = (await fs.readdir(second.outputDir)).filter((name) => /^bundle_\d+\.md$/.test(name));
    const contents = (await Promise.all(bundles.map((name) => fs.readFile(path.join(second.outputDir, name), 'utf8')))).join('\n');
    assert.match(contents, /two/);
    assert.doesNotMatch(contents, /\none\n/);
  });
});



test('generated-looking output without the current RepoBundle signature is never replaced', async () => {
  await withTempDir(async (root) => {
    const repo = path.join(root, 'repo');
    const output = path.join(root, 'repo_bundled');
    await fs.mkdir(repo, { recursive: true });
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(repo, 'a.txt'), 'new content\n');
    await fs.writeFile(
      path.join(output, '00_REPO_INDEX.md'),
      '# Repository index: repo\n\n## Snapshot\n\n- Generator: `other-generator`\n- Format version: `1`\n\n## Bundle index\n\n- old\n\n## Files not embedded\n\n- None.\n',
    );
    await fs.writeFile(path.join(output, 'bundle_001.md'), '# Repository bundle: repo (1/1)\n\nold\n');

    await assert.rejects(bundleRepository(options(repo)), /Refusing to replace/);
    assert.match(await fs.readFile(path.join(output, 'bundle_001.md'), 'utf8'), /old/);
  });
});

test('respectGitignore falls back to a filesystem scan outside a Git work tree', async () => {
  await withTempDir(async (root) => {
    const repo = path.join(root, 'repo');
    await fs.mkdir(repo, { recursive: true });
    await fs.writeFile(path.join(repo, '.gitignore'), 'ignored.txt\n');
    await fs.writeFile(path.join(repo, 'ignored.txt'), 'fallback content\n');
    await fs.writeFile(path.join(repo, 'keep.txt'), 'keep\n');

    const result = await bundleRepository(options(repo, { respectGitignore: true }));
    const index = await fs.readFile(result.indexPath, 'utf8');
    assert.match(index, /Git work tree unavailable, so \.gitignore could not be applied/);
    assert.match(index, /ignored\.txt/);
  });
});
