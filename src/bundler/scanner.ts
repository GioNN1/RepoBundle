import * as fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import * as path from 'node:path';
import { BundlerRuntime, ExcludedDirectory } from './types';
import { checkCancelled } from './runtime';
import { shouldExcludeDirectory } from './security';

export async function listFilesystemFiles(
  repoDir: string,
  includeDependencies: boolean,
  additionalExcludes: readonly string[],
  runtime: BundlerRuntime,
): Promise<{ files: string[]; excludedDirs: ExcludedDirectory[] }> {
  const files: string[] = [];
  const excludedDirs: ExcludedDirectory[] = [];
  const additional = new Set(additionalExcludes.map((name) => name.toLowerCase()));
  const pending = [''];

  while (pending.length > 0) {
    checkCancelled(runtime);
    const relativeRoot = pending.pop() ?? '';
    const root = path.join(repoDir, ...relativeRoot.split('/').filter(Boolean));
    let entries: Dirent[];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
      const detail = (error as NodeJS.ErrnoException).message || 'I/O error';
      excludedDirs.push({ relativePath: relativeRoot || '.', reason: `scan error: ${detail}` });
      continue;
    }

    for (const entry of entries) {
      checkCancelled(runtime);
      const relative = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
      const absolute = path.join(root, entry.name);

      if (entry.isDirectory()) {
        const reason = await shouldExcludeDirectory(absolute, includeDependencies, additional);
        if (reason !== undefined) {
          excludedDirs.push({ relativePath: relative, reason });
        } else {
          pending.push(relative);
        }
        continue;
      }

      if (entry.isSymbolicLink()) {
        try {
          const targetStat = await fs.stat(absolute);
          if (targetStat.isDirectory()) {
            excludedDirs.push({ relativePath: relative, reason: 'directory symlink not followed (loop/scope safety)' });
            continue;
          }
        } catch {
          // Broken symlinks are passed to the loader so they are reported explicitly.
        }
      }

      files.push(relative);
    }
  }

  return { files, excludedDirs };
}

export async function filterDiscoveredPaths(
  repoDir: string,
  relativePaths: readonly string[],
  includeDependencies: boolean,
  additionalExcludes: readonly string[],
  runtime: BundlerRuntime,
): Promise<{ files: string[]; excludedDirs: ExcludedDirectory[] }> {
  const additional = new Set(additionalExcludes.map((name) => name.toLowerCase()));
  const kept: string[] = [];
  const excludedByPath = new Map<string, ExcludedDirectory>();

  for (const relativePath of relativePaths) {
    checkCancelled(runtime);
    const parts = relativePath.replace(/\\/g, '/').split('/');
    let parent = '';
    let excluded = false;
    for (const part of parts.slice(0, -1)) {
      parent = parent ? `${parent}/${part}` : part;
      const fullDir = path.join(repoDir, ...parent.split('/'));
      const reason = await shouldExcludeDirectory(fullDir, includeDependencies, additional);
      if (reason !== undefined) {
        if (!excludedByPath.has(parent)) {
          excludedByPath.set(parent, { relativePath: parent, reason });
        }
        excluded = true;
        break;
      }
    }
    if (!excluded) {
      kept.push(relativePath.replace(/\\/g, '/'));
    }
  }

  return { files: kept, excludedDirs: [...excludedByPath.values()] };
}
