import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  ALWAYS_EXCLUDED_DIR_NAMES,
  DEPENDENCY_DIR_NAMES,
  IMPORTANT_BASENAMES,
  KNOWN_BINARY_SUFFIXES,
  LANGUAGE_BY_SUFFIX,
  SAFE_SENSITIVE_EXAMPLES,
  SENSITIVE_EXACT_NAMES,
  SENSITIVE_SUFFIXES,
  SPECIAL_LANGUAGES,
} from './constants';

const IMPORTANT_NAME_PATTERNS = [
  /^requirements(?:[-_.].+)?\.txt$/i,
  /^dockerfile(?:\..+)?$/i,
  /^docker-compose(?:\..+)?\.ya?ml$/i,
  /^tsconfig(?:\..+)?\.json$/i,
  /^\.env\.(?:example|sample|template)$/i,
];

export function isWithin(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function toPosixRelative(repoDir: string, absolutePath: string): string {
  return path.relative(repoDir, absolutePath).split(path.sep).join('/');
}

export function isSensitive(relativePath: string): boolean {
  const name = path.posix.basename(relativePath.replace(/\\/g, '/')).toLowerCase();
  if (SAFE_SENSITIVE_EXAMPLES.has(name)) {
    return false;
  }
  if (SENSITIVE_EXACT_NAMES.has(name)) {
    return true;
  }
  if (name.startsWith('.env.')) {
    return !SAFE_SENSITIVE_EXAMPLES.has(name);
  }
  return SENSITIVE_SUFFIXES.has(path.posix.extname(name).toLowerCase());
}

export function isInstructionFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  const name = path.posix.basename(normalized);
  if (['agents.md', 'claude.md', 'gemini.md', 'copilot-instructions.md'].includes(name)) {
    return true;
  }
  if (normalized === '.github/copilot-instructions.md') {
    return true;
  }
  return normalized.startsWith('.cursor/rules/') && ['.md', '.mdc'].includes(path.posix.extname(normalized));
}

export function isImportant(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  const name = path.posix.basename(normalized);
  if (isInstructionFile(normalized) || IMPORTANT_BASENAMES.has(name)) {
    return true;
  }
  if (IMPORTANT_NAME_PATTERNS.some((pattern) => pattern.test(name))) {
    return true;
  }
  if (normalized.startsWith('.github/workflows/') && ['.yml', '.yaml'].includes(path.posix.extname(normalized))) {
    return true;
  }
  return new Set([
    '.gitlab-ci.yml',
    'azure-pipelines.yml',
    'bitbucket-pipelines.yml',
    'jenkinsfile',
    'appveyor.yml',
  ]).has(normalized);
}

export function knownBinary(relativePath: string): boolean {
  return KNOWN_BINARY_SUFFIXES.has(path.posix.extname(relativePath.replace(/\\/g, '/')).toLowerCase());
}

export function detectLanguage(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  const lowerName = path.posix.basename(normalized).toLowerCase();
  const special = SPECIAL_LANGUAGES[lowerName];
  if (special !== undefined) {
    return special;
  }
  if (lowerName.startsWith('dockerfile')) {
    return 'dockerfile';
  }
  return LANGUAGE_BY_SUFFIX[path.posix.extname(lowerName).toLowerCase()] ?? 'text';
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function looksLikePythonVenv(directory: string): Promise<boolean> {
  return pathExists(path.join(directory, 'pyvenv.cfg'));
}

export async function shouldExcludeDirectory(
  directory: string,
  includeDependencies: boolean,
  additionalExcludes: ReadonlySet<string>,
): Promise<string | undefined> {
  const name = path.basename(directory).toLowerCase();
  if (additionalExcludes.has(name)) {
    return 'user-specified directory exclusion';
  }
  if (ALWAYS_EXCLUDED_DIR_NAMES.has(name)) {
    return 'VCS metadata/cache directory';
  }
  try {
    const stat = await fs.lstat(directory);
    if (stat.isSymbolicLink()) {
      return 'directory symlink not followed (loop/scope safety)';
    }
  } catch {
    // Git discovery can report tracked paths whose parent disappeared from the working tree.
    // Do not treat that as an exclusion; the file loader will report the missing path explicitly.
  }
  if (!includeDependencies) {
    if (DEPENDENCY_DIR_NAMES.has(name)) {
      return 'dependency/environment directory';
    }
    if (await looksLikePythonVenv(directory)) {
      return 'Python virtual environment';
    }
  }
  return undefined;
}

export function compareCaseInsensitivePath(a: string, b: string): number {
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  if (lowerA < lowerB) return -1;
  if (lowerA > lowerB) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
