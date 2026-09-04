import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { STREAM_READ_BYTES } from './constants';
import { TextEncoding } from './types';

export function hasTextBom(data: Uint8Array): boolean {
  return (
    startsWith(data, [0xef, 0xbb, 0xbf]) ||
    startsWith(data, [0xff, 0xfe, 0x00, 0x00]) ||
    startsWith(data, [0x00, 0x00, 0xfe, 0xff]) ||
    startsWith(data, [0xff, 0xfe]) ||
    startsWith(data, [0xfe, 0xff])
  );
}

function startsWith(data: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.length <= data.length && prefix.every((value, index) => data[index] === value);
}

export function isProbablyBinary(data: Uint8Array): boolean {
  if (data.length === 0) {
    return false;
  }
  if (hasTextBom(data)) {
    return false;
  }
  if (data.includes(0)) {
    return true;
  }
  const length = Math.min(data.length, 65536);
  let suspicious = 0;
  for (let i = 0; i < length; i += 1) {
    const byte = data[i] ?? 0;
    if (byte < 9 || (byte > 13 && byte < 32) || byte === 127) {
      suspicious += 1;
    }
  }
  return suspicious / length > 0.08;
}

function decodeUtf32(data: Uint8Array, littleEndian: boolean, stripBom: boolean): string {
  let offset = stripBom ? 4 : 0;
  if ((data.length - offset) % 4 !== 0) {
    throw new Error('Invalid UTF-32 byte length.');
  }
  const codePoints: number[] = [];
  const flush = (): string => {
    const text = String.fromCodePoint(...codePoints);
    codePoints.length = 0;
    return text;
  };
  const parts: string[] = [];

  for (; offset < data.length; offset += 4) {
    const b0 = data[offset] ?? 0;
    const b1 = data[offset + 1] ?? 0;
    const b2 = data[offset + 2] ?? 0;
    const b3 = data[offset + 3] ?? 0;
    const codePoint = littleEndian
      ? (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0
      : (b3 | (b2 << 8) | (b1 << 16) | (b0 << 24)) >>> 0;
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      throw new Error(`Invalid UTF-32 code point: 0x${codePoint.toString(16)}`);
    }
    codePoints.push(codePoint);
    if (codePoints.length >= 8192) {
      parts.push(flush());
    }
  }
  if (codePoints.length > 0) {
    parts.push(flush());
  }
  return parts.join('');
}

function decodeWithTextDecoder(data: Uint8Array, encoding: string): string {
  return new TextDecoder(encoding, { fatal: true }).decode(data);
}

export function decodeText(data: Uint8Array): { text: string; encoding: TextEncoding } {
  if (startsWith(data, [0xff, 0xfe, 0x00, 0x00])) {
    return { text: decodeUtf32(data, true, true), encoding: 'utf-32le' };
  }
  if (startsWith(data, [0x00, 0x00, 0xfe, 0xff])) {
    return { text: decodeUtf32(data, false, true), encoding: 'utf-32be' };
  }
  if (startsWith(data, [0xff, 0xfe])) {
    return { text: decodeWithTextDecoder(data.slice(2), 'utf-16le'), encoding: 'utf-16le' };
  }
  if (startsWith(data, [0xfe, 0xff])) {
    return { text: decodeWithTextDecoder(data.slice(2), 'utf-16be'), encoding: 'utf-16be' };
  }
  if (startsWith(data, [0xef, 0xbb, 0xbf])) {
    return { text: decodeWithTextDecoder(data.slice(3), 'utf-8'), encoding: 'utf-8-sig' };
  }
  try {
    return { text: decodeWithTextDecoder(data, 'utf-8'), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(data), encoding: 'windows-1252' };
  }
}

export async function detectLargeFileEncoding(filePath: string, sample: Uint8Array): Promise<TextEncoding> {
  if (startsWith(sample, [0xff, 0xfe, 0x00, 0x00])) {
    return 'utf-32le';
  }
  if (startsWith(sample, [0x00, 0x00, 0xfe, 0xff])) {
    return 'utf-32be';
  }
  if (startsWith(sample, [0xff, 0xfe])) {
    return 'utf-16le';
  }
  if (startsWith(sample, [0xfe, 0xff])) {
    return 'utf-16be';
  }
  if (startsWith(sample, [0xef, 0xbb, 0xbf])) {
    return 'utf-8-sig';
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for await (const rawChunk of createReadStream(filePath, { highWaterMark: STREAM_READ_BYTES })) {
      decoder.decode(rawChunk as Buffer, { stream: true });
    }
    decoder.decode();
    return 'utf-8';
  } catch {
    return 'windows-1252';
  }
}

function bomLength(encoding: TextEncoding): number {
  switch (encoding) {
    case 'utf-8-sig':
      return 3;
    case 'utf-16le':
    case 'utf-16be':
      return 2;
    case 'utf-32le':
    case 'utf-32be':
      return 4;
    default:
      return 0;
  }
}

function textDecoderLabel(encoding: TextEncoding): string | undefined {
  switch (encoding) {
    case 'utf-8':
    case 'utf-8-sig':
      return 'utf-8';
    case 'utf-16le':
      return 'utf-16le';
    case 'utf-16be':
      return 'utf-16be';
    case 'windows-1252':
      return 'windows-1252';
    default:
      return undefined;
  }
}

export async function* iterateDecodedPieces(filePath: string, encoding: TextEncoding): AsyncGenerator<string> {
  const label = textDecoderLabel(encoding);
  let firstChunk = true;

  if (label !== undefined) {
    const decoder = new TextDecoder(label, { fatal: encoding !== 'windows-1252' });
    for await (const rawChunk of createReadStream(filePath, { highWaterMark: STREAM_READ_BYTES })) {
      let chunk = rawChunk as Buffer;
      if (firstChunk) {
        const strip = bomLength(encoding);
        if (strip > 0) {
          chunk = chunk.subarray(strip);
        }
        firstChunk = false;
      }
      const text = decoder.decode(chunk, { stream: true });
      if (text) {
        yield text;
      }
    }
    const final = decoder.decode();
    if (final) {
      yield final;
    }
    return;
  }

  const littleEndian = encoding === 'utf-32le';
  let carry = Buffer.alloc(0);
  for await (const rawChunk of createReadStream(filePath, { highWaterMark: STREAM_READ_BYTES })) {
    let chunk = rawChunk as Buffer;
    if (firstChunk) {
      chunk = chunk.subarray(bomLength(encoding));
      firstChunk = false;
    }
    if (carry.length > 0) {
      chunk = Buffer.concat([carry, chunk]);
      carry = Buffer.alloc(0);
    }
    const usable = chunk.length - (chunk.length % 4);
    if (usable > 0) {
      yield decodeUtf32(chunk.subarray(0, usable), littleEndian, false);
    }
    if (usable < chunk.length) {
      carry = chunk.subarray(usable);
    }
  }
  if (carry.length !== 0) {
    throw new Error('Invalid UTF-32 byte length.');
  }
}

export async function* iterateNormalizedTextPieces(filePath: string, encoding: TextEncoding): AsyncGenerator<string> {
  let pendingCarriageReturn = false;
  for await (const decoded of iterateDecodedPieces(filePath, encoding)) {
    let text = pendingCarriageReturn ? `\r${decoded}` : decoded;
    pendingCarriageReturn = false;
    if (text.endsWith('\r')) {
      pendingCarriageReturn = true;
      text = text.slice(0, -1);
    }
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (normalized) {
      yield normalized;
    }
  }
  if (pendingCarriageReturn) {
    yield '\n';
  }
}

export async function hashFile(filePath: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const rawChunk of createReadStream(filePath, { highWaterMark: STREAM_READ_BYTES })) {
    digest.update(rawChunk as Buffer);
  }
  return digest.digest('hex');
}

export async function countTextLinesStreaming(filePath: string, encoding: TextEncoding): Promise<number> {
  let lineBreaks = 0;
  let sawText = false;
  let lastCharacter = '';
  for await (const piece of iterateNormalizedTextPieces(filePath, encoding)) {
    if (piece.length === 0) {
      continue;
    }
    sawText = true;
    lastCharacter = piece[piece.length - 1] ?? '';
    for (const char of piece) {
      if (char === '\n') {
        lineBreaks += 1;
      }
    }
  }
  const lines = lineBreaks + (sawText && lastCharacter !== '\n' ? 1 : 0);
  return Math.max(1, lines);
}

export async function readSample(filePath: string, maxBytes = 65536): Promise<Buffer> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
