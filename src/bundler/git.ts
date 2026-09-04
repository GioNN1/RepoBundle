import { spawn } from 'node:child_process';
import { BundlerRuntime, GitInfo } from './types';
import { checkCancelled } from './runtime';

interface ProcessResult {
  code: number;
  stdout: Buffer;
  stderr: Buffer;
}

async function runProcess(command: string, args: string[], runtime: BundlerRuntime): Promise<ProcessResult> {
  checkCancelled(runtime);
  return new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const cancelTimer = setInterval(() => {
      if (runtime.isCancellationRequested?.()) {
        child.kill();
      }
    }, 100);

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', (error: Error) => {
      clearInterval(cancelTimer);
      reject(error);
    });
    child.once('close', (code: number | null) => {
      clearInterval(cancelTimer);
      if (runtime.isCancellationRequested?.()) {
        try {
          checkCancelled(runtime);
        } catch (error) {
          reject(error);
          return;
        }
      }
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    });
  });
}

async function runGit(repoDir: string, args: string[], runtime: BundlerRuntime): Promise<ProcessResult> {
  return runProcess('git', ['-C', repoDir, ...args], runtime);
}

export async function getGitInfo(repoDir: string, runtime: BundlerRuntime): Promise<GitInfo> {
  try {
    const inside = await runGit(repoDir, ['rev-parse', '--is-inside-work-tree'], runtime);
    if (inside.code !== 0 || inside.stdout.toString('utf8').trim() !== 'true') {
      return { available: false };
    }

    const [branchResult, commitResult, statusResult] = await Promise.all([
      runGit(repoDir, ['branch', '--show-current'], runtime),
      runGit(repoDir, ['rev-parse', 'HEAD'], runtime),
      runGit(repoDir, ['status', '--porcelain'], runtime),
    ]);

    const result: GitInfo = { available: true };
    const branch = branchResult.code === 0 ? branchResult.stdout.toString('utf8').trim() : '';
    const commit = commitResult.code === 0 ? commitResult.stdout.toString('utf8').trim() : '';
    if (branch) {
      result.branch = branch;
    }
    if (commit) {
      result.commit = commit;
    }
    if (statusResult.code === 0) {
      result.dirty = statusResult.stdout.length > 0;
    }
    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { available: false };
    }
    throw error;
  }
}

export async function listGitFiles(repoDir: string, runtime: BundlerRuntime): Promise<string[]> {
  let result: ProcessResult;
  try {
    result = await runGit(repoDir, ['ls-files', '-co', '--exclude-standard', '-z'], runtime);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('git is not available on PATH.');
    }
    throw error;
  }
  if (result.code !== 0) {
    throw new Error(result.stderr.toString('utf8').trim() || 'git ls-files failed.');
  }
  return result.stdout
    .toString('utf8')
    .split('\0')
    .filter((item: string) => item.length > 0)
    .map((item: string) => item.replace(/\\/g, '/'));
}
