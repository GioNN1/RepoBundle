import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { LARGE_FILE_STREAM_THRESHOLD_BYTES } from './constants';
import {
  countTextLinesStreaming,
  decodeText,
  detectLargeFileEncoding,
  hashFile,
  isProbablyBinary,
  readSample,
} from './encoding';
import { normalizeNewlines, splitLinesKeepEnds } from './markdown';
import { checkCancelled } from './runtime';
import { compareCaseInsensitivePath, detectLanguage, isImportant, isSensitive, isWithin, knownBinary, toPosixRelative } from './security';
import { BundlerRuntime, NotEmbeddedFile, SourceFile } from './types';

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function validRelativePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return !path.posix.isAbsolute(normalized) && !normalized.split('/').includes('..');
}

export async function loadSourceFiles(
  repoDir: string,
  relativePaths: readonly string[],
  excludeSensitive: boolean,
  runtime: BundlerRuntime,
): Promise<{ sources: SourceFile[]; omitted: NotEmbeddedFile[] }> {
  const sources: SourceFile[] = [];
  const omitted: NotEmbeddedFile[] = [];
  // Canonicalize the repository root once so Windows realpath() results (which may
  // use the extended-length \\?\ prefix) are compared against an equivalent root.
  const canonicalRepoDir = await fs.realpath(repoDir);
  const unique = [...new Set(relativePaths.map((item) => item.replace(/\\/g, '/')))];
  unique.sort(compareCaseInsensitivePath);

  for (let index = 0; index < unique.length; index += 1) {
    checkCancelled(runtime);
    const relativePath = unique[index] ?? '';
    runtime.onProgress?.({
      stage: 'load',
      completed: index + 1,
      total: unique.length,
      message: `Reading ${relativePath}`,
    });

    if (!validRelativePath(relativePath)) {
      omitted.push({ relativePath, reason: 'invalid relative path' });
      continue;
    }

    const fullPath = path.join(repoDir, ...relativePath.split('/'));
    let size: number | undefined;

    try {
      const lstat = await fs.lstat(fullPath);
      let targetRelative: string | undefined;
      let stat = lstat;

      if (lstat.isSymbolicLink()) {
        let resolved: string;
        try {
          resolved = await fs.realpath(fullPath);
        } catch (error) {
          omitted.push({ relativePath, reason: `broken/unreadable symlink: ${describeError(error)}` });
          continue;
        }
        if (!isWithin(resolved, canonicalRepoDir)) {
          try {
            size = (await fs.stat(fullPath)).size;
          } catch {
            size = undefined;
          }
          omitted.push({ relativePath, reason: 'symlink target is outside repository', ...(size === undefined ? {} : { sizeBytes: size }) });
          continue;
        }
        stat = await fs.stat(fullPath);
        if (!stat.isFile()) {
          omitted.push({ relativePath, reason: 'symlink target is not a regular file' });
          continue;
        }
        targetRelative = toPosixRelative(canonicalRepoDir, resolved);
      }

      if (!stat.isFile()) {
        continue;
      }
      const fileSize = stat.size;
      size = fileSize;

      if (excludeSensitive && (isSensitive(relativePath) || (targetRelative !== undefined && isSensitive(targetRelative)))) {
        omitted.push({
          relativePath,
          reason: targetRelative !== undefined && isSensitive(targetRelative)
            ? 'sensitive credential/key symlink target excluded'
            : 'sensitive credential/key file excluded',
          sizeBytes: fileSize,
        });
        continue;
      }

      if (knownBinary(relativePath) || (targetRelative !== undefined && knownBinary(targetRelative))) {
        omitted.push({
          relativePath,
          reason: targetRelative !== undefined && knownBinary(targetRelative)
            ? 'known binary/container symlink target'
            : 'known binary/container format',
          sizeBytes: fileSize,
        });
        continue;
      }

      const sample = await readSample(fullPath);
      if (isProbablyBinary(sample)) {
        omitted.push({ relativePath, reason: 'binary content detected', sizeBytes: fileSize });
        continue;
      }

      let text: string | undefined;
      let encoding: SourceFile['encoding'];
      let sha256: string;
      let lineCount: number;

      if (fileSize >= LARGE_FILE_STREAM_THRESHOLD_BYTES) {
        encoding = await detectLargeFileEncoding(fullPath, sample);
        [sha256, lineCount] = await Promise.all([
          hashFile(fullPath),
          countTextLinesStreaming(fullPath, encoding),
        ]);
        text = undefined;
      } else {
        const data = await fs.readFile(fullPath);
        const decoded = decodeText(data);
        text = normalizeNewlines(decoded.text);
        encoding = decoded.encoding;
        sha256 = createHash('sha256').update(data).digest('hex');
        lineCount = Math.max(1, splitLinesKeepEnds(text).length);
      }

      sources.push({
        relativePath,
        sourcePath: fullPath,
        text,
        sizeBytes: fileSize,
        sha256,
        language: detectLanguage(relativePath),
        important: isImportant(relativePath),
        encoding,
        lineCount,
      });
    } catch (error) {
      omitted.push({
        relativePath,
        reason: `stat/read/decode error: ${describeError(error)}`,
        ...(size === undefined ? {} : { sizeBytes: size }),
      });
    }
  }

  return { sources, omitted };
}
