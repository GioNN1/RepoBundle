import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  BUNDLE_HEADER_RESERVE_BYTES,
  DEFAULT_HARD_MAX_MB,
  DEFAULT_TARGET_MB,
} from './constants';
import { getGitInfo, listGitFiles } from './git';
import { bundleFilename } from './markdown';
import { makeRenderedChunks, splitIntoBundles } from './chunker';
import { writeBundleFile, writeManifest, writeNotEmbeddedDetail } from './manifest';
import { commitOutput, prepareOutput, validateExistingOutput } from './output';
import { checkCancelled, log } from './runtime';
import { filterDiscoveredPaths, listFilesystemFiles } from './scanner';
import { isWithin } from './security';
import { loadSourceFiles } from './sourceLoader';
import { BundleResult, BundlerOptions, BundlerRuntime } from './types';

function normalizeOptions(options: BundlerOptions): Required<BundlerOptions> {
  const repoDir = path.resolve(options.repoDir);
  const outputDir = path.resolve(options.outputDir ?? path.join(path.dirname(repoDir), `${path.basename(repoDir)}_bundled`));
  return {
    repoDir,
    outputDir,
    targetMb: options.targetMb ?? DEFAULT_TARGET_MB,
    hardMaxMb: options.hardMaxMb ?? DEFAULT_HARD_MAX_MB,
    maxBundles: options.maxBundles,
    lineNumbers: options.lineNumbers,
    includeDependencies: options.includeDependencies,
    includeSensitive: options.includeSensitive,
    respectGitignore: options.respectGitignore,
    excludeDirs: options.excludeDirs,
  };
}

async function ensureDirectory(directory: string): Promise<void> {
  const stat = await fs.stat(directory).catch(() => undefined);
  if (stat === undefined || !stat.isDirectory()) {
    throw new Error(`Repository folder not found: ${directory}`);
  }
}

function validateOptions(options: Required<BundlerOptions>): void {
  if (options.targetMb <= 0) {
    throw new Error('targetMb must be greater than 0.');
  }
  if (options.hardMaxMb <= 0) {
    throw new Error('hardMaxMb must be greater than 0.');
  }
  if (options.hardMaxMb < options.targetMb) {
    throw new Error('hardMaxMb must be greater than or equal to targetMb.');
  }
  if (options.maxBundles < 0) {
    throw new Error('maxBundles cannot be negative.');
  }
  if (isWithin(options.outputDir, options.repoDir)) {
    throw new Error('The output directory must be outside the repository to avoid self-bundling.');
  }
  if (isWithin(options.repoDir, options.outputDir)) {
    throw new Error('The output directory must not contain the repository; refusing a destructive ancestor output path.');
  }
}

export async function bundleRepository(
  rawOptions: BundlerOptions,
  runtime: BundlerRuntime = {},
): Promise<BundleResult> {
  const options = normalizeOptions(rawOptions);
  await ensureDirectory(options.repoDir);
  validateOptions(options);
  await validateExistingOutput(options.outputDir);
  checkCancelled(runtime);

  const repoName = path.basename(options.repoDir);
  log(runtime, `Repository: ${options.repoDir}`);
  log(runtime, `Output: ${options.outputDir}`);

  runtime.onProgress?.({ stage: 'scan', message: 'Inspecting repository and Git metadata...' });
  const gitInfo = await getGitInfo(options.repoDir, runtime);

  let relativePaths: string[];
  let excludedDirs;
  let discoveryMode: string;

  if (options.respectGitignore) {
    if (!gitInfo.available) {
      throw new Error('respectGitignore requires a Git work tree and the git executable.');
    }
    const gitPaths = await listGitFiles(options.repoDir, runtime);
    const filtered = await filterDiscoveredPaths(
      options.repoDir,
      gitPaths,
      options.includeDependencies,
      options.excludeDirs,
      runtime,
    );
    relativePaths = filtered.files;
    excludedDirs = filtered.excludedDirs;
    discoveryMode = 'git ls-files (-co --exclude-standard); ignored files excluded by request';
  } else {
    const discovered = await listFilesystemFiles(
      options.repoDir,
      options.includeDependencies,
      options.excludeDirs,
      runtime,
    );
    relativePaths = discovered.files;
    excludedDirs = discovered.excludedDirs;
    discoveryMode = 'filesystem scan; .gitignore intentionally ignored';
  }
  runtime.onProgress?.({ stage: 'scan', completed: 1, total: 1, message: `Discovered ${relativePaths.length} paths` });
  log(runtime, `Discovery: ${discoveryMode}`);

  const excludeSensitive = !options.includeSensitive;
  const { sources, omitted } = await loadSourceFiles(
    options.repoDir,
    relativePaths,
    excludeSensitive,
    runtime,
  );
  if (sources.length === 0) {
    throw new Error('No readable text files were found after the minimal safety exclusions.');
  }

  const targetBytes = Math.floor(options.targetMb * 1024 * 1024);
  const hardMaxBytes = Math.floor(options.hardMaxMb * 1024 * 1024);
  if (targetBytes <= BUNDLE_HEADER_RESERVE_BYTES || hardMaxBytes <= BUNDLE_HEADER_RESERVE_BYTES) {
    throw new Error('Bundle size budgets are too small; use values above about 0.02 MB.');
  }
  const targetContentBytes = targetBytes - BUNDLE_HEADER_RESERVE_BYTES;
  const hardContentBytes = hardMaxBytes - BUNDLE_HEADER_RESERVE_BYTES;

  const renderedChunks = await makeRenderedChunks(
    sources,
    hardContentBytes,
    options.lineNumbers,
    runtime,
  );
  const { bundles, effectiveTarget } = splitIntoBundles(
    renderedChunks,
    targetContentBytes,
    hardContentBytes,
    options.maxBundles,
  );
  const effectiveTargetBytes = effectiveTarget + BUNDLE_HEADER_RESERVE_BYTES;

  checkCancelled(runtime);
  const tempDir = await prepareOutput(options.outputDir);
  try {
    const totalBundles = bundles.length;
    for (let index = 0; index < totalBundles; index += 1) {
      checkCancelled(runtime);
      const entries = bundles[index] ?? [];
      runtime.onProgress?.({
        stage: 'write',
        completed: index + 1,
        total: totalBundles + 1,
        message: `Writing bundle ${index + 1}/${totalBundles}`,
      });
      const bundlePath = path.join(tempDir, bundleFilename(index + 1, totalBundles));
      await writeBundleFile(
        bundlePath,
        repoName,
        index + 1,
        totalBundles,
        entries,
      );
      const actualSize = (await fs.stat(bundlePath)).size;
      if (actualSize > hardMaxBytes) {
        throw new Error(
          `Generated bundle ${path.basename(bundlePath)} is ${actualSize} bytes, exceeding the hard limit of ${hardMaxBytes} bytes.`,
        );
      }
    }

    const omittedDetailCreated = await writeManifest(
      path.join(tempDir, '00_REPO_INDEX.md'),
      repoName,
      sources,
      omitted,
      excludedDirs,
      bundles,
      gitInfo,
      discoveryMode,
      excludeSensitive,
      options.lineNumbers,
      effectiveTargetBytes,
      hardMaxBytes,
      options.maxBundles,
    );
    if (omittedDetailCreated) {
      await writeNotEmbeddedDetail(path.join(tempDir, '01_NOT_EMBEDDED.md'), omitted);
    }
    runtime.onProgress?.({
      stage: 'write',
      completed: totalBundles + 1,
      total: totalBundles + 1,
      message: 'Finalizing repository index',
    });

    checkCancelled(runtime);
    await commitOutput(tempDir, options.outputDir);
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  log(runtime, `Included text: ${sources.length} files`);
  log(runtime, `Source chunks: ${renderedChunks.length}`);
  log(runtime, `Bundles: ${bundles.length}`);
  log(runtime, `Not embedded: ${omitted.length} files`);
  log(runtime, `Excluded dirs: ${excludedDirs.length}`);

  return {
    repoDir: options.repoDir,
    outputDir: options.outputDir,
    indexPath: path.join(options.outputDir, '00_REPO_INDEX.md'),
    includedFiles: sources.length,
    sourceChunks: renderedChunks.length,
    bundles: bundles.length,
    notEmbedded: omitted.length,
    excludedDirs: excludedDirs.length,
    discoveryMode,
    sensitiveFilesIncluded: options.includeSensitive,
    lineNumbers: options.lineNumbers,
  };
}
