import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BUNDLE_OUTPUT_RE, FORMAT_VERSION, GENERATOR_ID, LEGACY_GENERATOR_IDS, LEGACY_OUTPUT_MARKER_NAME } from './constants';

async function exists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

function isGeneratedOutputEntry(name: string): boolean {
  return (
    name === '00_REPO_INDEX.md' ||
    name === '01_NOT_EMBEDDED.md' ||
    name === LEGACY_OUTPUT_MARKER_NAME ||
    BUNDLE_OUTPUT_RE.test(name)
  );
}

async function readPrefix(filePath: string, maxBytes = 1024 * 1024): Promise<string | undefined> {
  try {
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

async function bundleHeadersAreValid(outputDir: string, names: readonly string[]): Promise<boolean> {
  const bundleNames = names.filter((name) => BUNDLE_OUTPUT_RE.test(name)).sort();
  if (bundleNames.length === 0) {
    return false;
  }
  for (const name of bundleNames) {
    const prefix = await readPrefix(path.join(outputDir, name), 512);
    const firstLine = prefix?.split(/\r?\n/, 1)[0] ?? '';
    if (!firstLine.startsWith('# Repository bundle: ')) {
      return false;
    }
  }
  return true;
}

async function looksLikeManagedOutput(outputDir: string, names: readonly string[]): Promise<boolean> {
  const indexPath = path.join(outputDir, '00_REPO_INDEX.md');
  const prefix = await readPrefix(indexPath);
  if (prefix === undefined) {
    return false;
  }
  const firstLine = prefix.split(/\r?\n/, 1)[0] ?? '';
  if (!firstLine.startsWith('# Repository index: ')) {
    return false;
  }
  if (!prefix.includes('## Bundle index') || !prefix.includes('## Files not embedded')) {
    return false;
  }
  const signed = (
    prefix.includes(`- Generator: \`${GENERATOR_ID}\``) &&
    prefix.includes(`- Format version: \`${FORMAT_VERSION}\``)
  );
  const legacySigned = [...LEGACY_GENERATOR_IDS].some((id) => (
    prefix.includes(`- Generator: \`${id}\``) &&
    prefix.includes(`- Format version: \`${FORMAT_VERSION}\``)
  ));
  const legacy = names.includes(LEGACY_OUTPUT_MARKER_NAME) || !prefix.includes('- Generator:') || legacySigned;
  if (!signed && !legacy) {
    return false;
  }
  return bundleHeadersAreValid(outputDir, names);
}

export async function validateExistingOutput(outputDir: string): Promise<void> {
  if (!(await exists(outputDir))) {
    return;
  }
  const stat = await fs.stat(outputDir);
  if (!stat.isDirectory()) {
    throw new Error(`Output path exists and is not a directory: ${outputDir}`);
  }
  const dirents = await fs.readdir(outputDir, { withFileTypes: true });
  if (dirents.length === 0) {
    return;
  }
  const fileNames = dirents.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const unknown = dirents
    .filter((entry) => !entry.isFile() || !isGeneratedOutputEntry(entry.name))
    .map((entry) => entry.name);
  const recognized = await looksLikeManagedOutput(outputDir, fileNames);
  if (!recognized || unknown.length > 0) {
    const detail = unknown.length > 0 ? ` Unknown entries: ${unknown.sort().slice(0, 8).join(', ')}.` : '';
    throw new Error(
      `Refusing to replace a non-empty output directory that is not a clean RepoBundle output.${detail} ` +
      'Choose another output directory, empty it manually, or rename it.',
    );
  }
}

export async function prepareOutput(outputDir: string): Promise<string> {
  await fs.mkdir(path.dirname(outputDir), { recursive: true });
  return fs.mkdtemp(path.join(path.dirname(outputDir), `.${path.basename(outputDir)}.tmp-`));
}

export async function commitOutput(tempDir: string, outputDir: string): Promise<void> {
  await validateExistingOutput(outputDir);
  if (!(await exists(outputDir))) {
    await fs.rename(tempDir, outputDir);
    return;
  }

  const backupDir = path.join(path.dirname(outputDir), `.${path.basename(outputDir)}.old-${randomUUID()}`);
  await fs.rename(outputDir, backupDir);
  try {
    await fs.rename(tempDir, outputDir);
  } catch (error) {
    if (!(await exists(outputDir)) && await exists(backupDir)) {
      await fs.rename(backupDir, outputDir);
    }
    throw error;
  }
  await fs.rm(backupDir, { recursive: true, force: true });
}
