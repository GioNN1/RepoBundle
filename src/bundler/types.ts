export interface SourceFile {
  relativePath: string;
  sourcePath: string;
  text: string | undefined;
  sizeBytes: number;
  sha256: string;
  language: string;
  important: boolean;
  encoding: TextEncoding;
  lineCount: number;
}

export type TextEncoding =
  | 'utf-8'
  | 'utf-8-sig'
  | 'utf-16le'
  | 'utf-16be'
  | 'utf-32le'
  | 'utf-32be'
  | 'windows-1252';

export interface SourceChunk {
  source: SourceFile;
  text: string;
  startLine: number;
  endLine: number;
  partIndex: number;
  partTotal: number;
}

export interface RenderedChunk {
  chunk: SourceChunk;
  markdown: string;
  sizeBytes: number;
  approxTokens: number;
}

export interface NotEmbeddedFile {
  relativePath: string;
  reason: string;
  sizeBytes?: number;
}

export interface ExcludedDirectory {
  relativePath: string;
  reason: string;
}

export interface GitInfo {
  available: boolean;
  branch?: string;
  commit?: string;
  dirty?: boolean;
}

export interface BundlerOptions {
  repoDir: string;
  outputDir?: string;
  targetMb: number;
  hardMaxMb: number;
  maxBundles: number;
  lineNumbers: boolean;
  includeDependencies: boolean;
  includeSensitive: boolean;
  respectGitignore: boolean;
  excludeDirs: string[];
}

export interface BundlerProgress {
  stage: 'scan' | 'load' | 'chunk' | 'write';
  completed?: number;
  total?: number;
  message: string;
}

export interface BundlerRuntime {
  isCancellationRequested?: () => boolean;
  onProgress?: (progress: BundlerProgress) => void;
  log?: (message: string) => void;
}

export interface BundleResult {
  repoDir: string;
  outputDir: string;
  indexPath: string;
  includedFiles: number;
  sourceChunks: number;
  bundles: number;
  notEmbedded: number;
  excludedDirs: number;
  discoveryMode: string;
  sensitiveFilesIncluded: boolean;
  lineNumbers: boolean;
}

export class BundlerCancelledError extends Error {
  public constructor() {
    super('Bundling cancelled.');
    this.name = 'BundlerCancelledError';
  }
}
