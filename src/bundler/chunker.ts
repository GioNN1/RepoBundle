import { iterateNormalizedTextPieces } from './encoding';
import { estimateTokens, longestBacktickRun, markdownInlineCode, splitLinesKeepEnds, splitLinesNoEnds } from './markdown';
import { checkCancelled } from './runtime';
import { BundlerRuntime, RenderedChunk, SourceChunk, SourceFile } from './types';

export function addLineNumbers(text: string, startLine: number): string {
  const lines = splitLinesNoEnds(text);
  if (lines.length === 0) {
    return `${String(startLine).padStart(6, '0')} |`;
  }
  const lastLine = startLine + lines.length - 1;
  const width = Math.max(6, String(lastLine).length);
  return lines
    .map((line, index) => `${String(startLine + index).padStart(width, '0')} | ${line}`)
    .join('\n');
}

export function splitTextByLines(text: string, maxChars: number): Array<[string, number, number]> {
  if (maxChars < 1024) {
    throw new Error('Internal chunk budget is too small.');
  }
  if (text === '') {
    return [['', 1, 1]];
  }

  const lines = splitLinesKeepEnds(text);
  if (lines.length === 0) {
    return [[text, 1, 1]];
  }

  const result: Array<[string, number, number]> = [];
  let currentParts: string[] = [];
  let currentChars = 0;
  let currentStart = 1;
  let currentEnd = 1;

  const flush = (): void => {
    if (currentParts.length > 0) {
      result.push([currentParts.join(''), currentStart, currentEnd]);
      currentParts = [];
      currentChars = 0;
    }
  };

  let lineNo = 1;
  for (const line of lines) {
    if (line.length > maxChars) {
      flush();
      for (let offset = 0; offset < line.length; offset += maxChars) {
        result.push([line.slice(offset, offset + maxChars), lineNo, lineNo]);
      }
      lineNo += 1;
      currentStart = lineNo;
      currentEnd = lineNo;
      continue;
    }

    if (currentParts.length > 0 && currentChars + line.length > maxChars) {
      flush();
      currentStart = lineNo;
    }
    if (currentParts.length === 0) {
      currentStart = lineNo;
    }
    currentParts.push(line);
    currentChars += line.length;
    currentEnd = lineNo;
    lineNo += 1;
  }

  flush();
  return result;
}

interface ChunkAccumulator {
  currentParts: string[];
  currentChars: number;
  currentStart: number;
  currentEnd: number;
}

function flushAccumulator(state: ChunkAccumulator): [string, number, number] | undefined {
  if (state.currentParts.length === 0) {
    return undefined;
  }
  const item: [string, number, number] = [state.currentParts.join(''), state.currentStart, state.currentEnd];
  state.currentParts = [];
  state.currentChars = 0;
  return item;
}

function consumeCompleteLine(
  line: string,
  lineNo: number,
  maxChars: number,
  state: ChunkAccumulator,
): Array<[string, number, number]> {
  const output: Array<[string, number, number]> = [];
  if (line.length > maxChars) {
    const flushed = flushAccumulator(state);
    if (flushed !== undefined) {
      output.push(flushed);
    }
    for (let offset = 0; offset < line.length; offset += maxChars) {
      output.push([line.slice(offset, offset + maxChars), lineNo, lineNo]);
    }
    state.currentStart = lineNo + 1;
    state.currentEnd = lineNo + 1;
    return output;
  }

  if (state.currentParts.length > 0 && state.currentChars + line.length > maxChars) {
    const flushed = flushAccumulator(state);
    if (flushed !== undefined) {
      output.push(flushed);
    }
    state.currentStart = lineNo;
  }
  if (state.currentParts.length === 0) {
    state.currentStart = lineNo;
  }
  state.currentParts.push(line);
  state.currentChars += line.length;
  state.currentEnd = lineNo;
  return output;
}

export async function* iterStreamedTextChunks(
  source: SourceFile,
  maxChars: number,
): AsyncGenerator<[string, number, number]> {
  if (maxChars < 1024) {
    throw new Error('Internal chunk budget is too small.');
  }
  const state: ChunkAccumulator = {
    currentParts: [],
    currentChars: 0,
    currentStart: 1,
    currentEnd: 1,
  };
  let lineNo = 1;
  let pending = '';

  for await (const piece of iterateNormalizedTextPieces(source.sourcePath, source.encoding)) {
    pending += piece;
    let newlineIndex = pending.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = pending.slice(0, newlineIndex + 1);
      pending = pending.slice(newlineIndex + 1);
      for (const item of consumeCompleteLine(line, lineNo, maxChars, state)) {
        yield item;
      }
      lineNo += 1;
      newlineIndex = pending.indexOf('\n');
    }

    while (pending.length > maxChars) {
      const flushed = flushAccumulator(state);
      if (flushed !== undefined) {
        yield flushed;
      }
      yield [pending.slice(0, maxChars), lineNo, lineNo];
      pending = pending.slice(maxChars);
    }
  }

  if (pending.length > 0) {
    for (const item of consumeCompleteLine(pending, lineNo, maxChars, state)) {
      yield item;
    }
  }
  const flushed = flushAccumulator(state);
  if (flushed !== undefined) {
    yield flushed;
  }
}

export function renderChunk(chunk: SourceChunk, lineNumbers: boolean): RenderedChunk {
  const displayedText = lineNumbers ? addLineNumbers(chunk.text, chunk.startLine) : chunk.text;
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(displayedText) + 1));
  const language = lineNumbers ? 'text' : chunk.source.language;
  const pathCode = markdownInlineCode(chunk.source.relativePath);
  const location = chunk.partTotal > 1
    ? ` — original lines ${chunk.startLine}-${chunk.endLine}; part ${chunk.partIndex}/${chunk.partTotal}`
    : '';
  const markdown = `\n\n---\n\n## File: ${pathCode}${location}\n\n${fence}${language}\n${displayedText}\n${fence}\n`;
  const sizeBytes = Buffer.byteLength(markdown, 'utf8');
  return {
    chunk,
    markdown,
    sizeBytes,
    approxTokens: estimateTokens(markdown),
  };
}

export async function makeRenderedChunks(
  sources: readonly SourceFile[],
  hardMaxBytes: number,
  lineNumbers: boolean,
  runtime: BundlerRuntime,
): Promise<RenderedChunk[]> {
  const rendered: RenderedChunk[] = [];

  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    checkCancelled(runtime);
    const source = sources[sourceIndex];
    if (source === undefined) {
      continue;
    }
    runtime.onProgress?.({
      stage: 'chunk',
      completed: sourceIndex + 1,
      total: sources.length,
      message: `Chunking ${source.relativePath}`,
    });

    let maxChars = Math.max(4096, Math.floor(hardMaxBytes * (lineNumbers ? 0.58 : 0.72)));
    while (true) {
      checkCancelled(runtime);
      const sourceRendered: RenderedChunk[] = [];

      if (source.text !== undefined) {
        const raw = splitTextByLines(source.text, maxChars);
        const total = raw.length;
        raw.forEach(([chunkText, startLine, endLine], index) => {
          sourceRendered.push(renderChunk({
            source,
            text: chunkText,
            startLine,
            endLine,
            partIndex: index + 1,
            partTotal: total,
          }, lineNumbers));
        });
      } else {
        let total = 0;
        for await (const _chunk of iterStreamedTextChunks(source, maxChars)) {
          total += 1;
        }
        let index = 0;
        for await (const [chunkText, startLine, endLine] of iterStreamedTextChunks(source, maxChars)) {
          index += 1;
          sourceRendered.push(renderChunk({
            source,
            text: chunkText,
            startLine,
            endLine,
            partIndex: index,
            partTotal: total,
          }, lineNumbers));
        }
      }

      if (sourceRendered.every((item) => item.sizeBytes <= hardMaxBytes)) {
        rendered.push(...sourceRendered);
        break;
      }
      if (maxChars <= 4096) {
        const oversized = sourceRendered.reduce((largest, item) => item.sizeBytes > largest.sizeBytes ? item : largest);
        throw new Error(`Unable to fit a chunk under the hard bundle limit for ${oversized.chunk.source.relativePath}`);
      }
      maxChars = Math.max(4096, Math.floor(maxChars * 0.75));
    }
  }

  return rendered;
}

export function splitIntoBundles(
  renderedChunks: readonly RenderedChunk[],
  targetBytes: number,
  hardMaxBytes: number,
  softMaxBundles: number,
): { bundles: RenderedChunk[][]; effectiveTarget: number } {
  if (renderedChunks.length === 0) {
    return { bundles: [], effectiveTarget: targetBytes };
  }

  const totalBytes = renderedChunks.reduce((sum, item) => sum + item.sizeBytes, 0);
  let effectiveTarget = targetBytes;
  if (softMaxBundles > 0) {
    const desired = Math.ceil(totalBytes / softMaxBundles);
    effectiveTarget = Math.min(hardMaxBytes, Math.max(targetBytes, desired));
  }

  const bundles: RenderedChunk[][] = [];
  let current: RenderedChunk[] = [];
  let currentBytes = 0;

  for (const item of renderedChunks) {
    if (item.sizeBytes > hardMaxBytes) {
      throw new Error(`Internal error: rendered chunk exceeds hard limit for ${item.chunk.source.relativePath}`);
    }
    if (current.length > 0 && (
      currentBytes + item.sizeBytes > effectiveTarget ||
      currentBytes + item.sizeBytes > hardMaxBytes
    )) {
      bundles.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += item.sizeBytes;
  }

  if (current.length > 0) {
    bundles.push(current);
  }
  return { bundles, effectiveTarget };
}

export function bundleSize(bundle: readonly RenderedChunk[]): number {
  return bundle.reduce((sum, item) => sum + item.sizeBytes, 0);
}

export function bundleApproxTokens(bundle: readonly RenderedChunk[]): number {
  return bundle.reduce((sum, item) => sum + item.approxTokens, 0);
}
