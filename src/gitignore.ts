import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { OUTPUT_DIR_NAME } from './bundler/constants';

export const OUTPUT_GITIGNORE_ENTRY = `/${OUTPUT_DIR_NAME}/`;

export async function appendOutputToGitignore(repoDir: string): Promise<void> {
  const gitignorePath = path.join(repoDir, '.gitignore');
  let current = '';
  try {
    const stat = await fs.lstat(gitignorePath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to modify a symlinked .gitignore. Add ${OUTPUT_GITIGNORE_ENTRY} manually.`);
    }
    if (!stat.isFile()) {
      throw new Error(`.gitignore exists but is not a regular file. Add ${OUTPUT_GITIGNORE_ENTRY} manually.`);
    }
    current = await fs.readFile(gitignorePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const lines = current.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(OUTPUT_GITIGNORE_ENTRY)) {
    return;
  }

  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const separator = current.length > 0 && !current.endsWith('\n') && !current.endsWith('\r') ? eol : '';
  await fs.appendFile(gitignorePath, `${separator}${OUTPUT_GITIGNORE_ENTRY}${eol}`, 'utf8');
}
