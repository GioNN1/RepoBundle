import { DEFAULT_APPROX_CHARS_PER_TOKEN } from './constants';

export function longestBacktickRun(text: string): number {
  let longest = 0;
  let current = 0;
  for (const char of text) {
    if (char === '`') {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

export function markdownInlineCode(text: string): string {
  const fenceLength = Math.max(1, longestBacktickRun(text) + 1);
  const fence = '`'.repeat(fenceLength);
  if (text.includes('`')) {
    return `${fence} ${text} ${fence}`;
  }
  return `${fence}${text}${fence}`;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / DEFAULT_APPROX_CHARS_PER_TOKEN);
}

export function formatBytes(value: number | undefined): string {
  if (value === undefined) {
    return 'unknown';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let number = value;
  for (const unit of units) {
    if (number < 1024 || unit === units[units.length - 1]) {
      return unit === 'B' ? `${Math.trunc(number)} B` : `${number.toFixed(1)} ${unit}`;
    }
    number /= 1024;
  }
  return `${value} B`;
}

export function bundleFilename(index: number, total: number): string {
  const width = Math.max(3, String(total).length);
  return `bundle_${String(index).padStart(width, '0')}.md`;
}

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function splitLinesKeepEnds(text: string): string[] {
  if (text === '') {
    return [];
  }
  const result: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') {
      result.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) {
    result.push(text.slice(start));
  }
  return result;
}

export function splitLinesNoEnds(text: string): string[] {
  return splitLinesKeepEnds(text).map((line) => line.endsWith('\n') ? line.slice(0, -1) : line);
}
