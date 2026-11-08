import { constants, deflateSync, inflateSync } from 'node:zlib';

// Lossless PNG optimization for the deploy copy only. A PNG's decoded scanline
// bytes, color profile, palette, ancillary chunks and dimensions stay intact.
// The original mirrored files remain byte-for-byte untouched.
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) {
    crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readChunks(bytes) {
  if (bytes.length < 20 || !bytes.subarray(0, 8).equals(signature)) return null;
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (length > bytes.length - offset - 12 || end > bytes.length) return null;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) return null;
    const chunk = bytes.subarray(offset, end);
    if (crc32(chunk.subarray(4, chunk.length - 4)) !== bytes.readUInt32BE(end - 4)) return null;
    chunks.push({ type, chunk, data: bytes.subarray(offset + 8, end - 4) });
    offset = end;
    if (type === 'IEND') break;
  }
  if (!chunks.length || chunks[0].type !== 'IHDR' ||
      chunks.at(-1).type !== 'IEND' || offset !== bytes.length) return null;
  return chunks;
}

function makeIdat(compressed) {
  const chunk = Buffer.allocUnsafe(compressed.length + 12);
  chunk.writeUInt32BE(compressed.length, 0);
  chunk.write('IDAT', 4, 4, 'ascii');
  compressed.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, compressed.length + 8)), compressed.length + 8);
  return chunk;
}

export function optimizePngLosslessly(input) {
  const chunks = readChunks(input);
  if (!chunks) return input;
  const first = chunks.findIndex(chunk => chunk.type === 'IDAT');
  const last = chunks.findLastIndex(chunk => chunk.type === 'IDAT');
  if (first < 0 || chunks.slice(first, last + 1).some(chunk => chunk.type !== 'IDAT')) return input;

  const originalIdat = Buffer.concat(chunks.slice(first, last + 1).map(chunk => chunk.data));
  if (originalIdat.length < 1024) return input;
  try {
    // Limit decompression of untrusted image streams during the build.
    const scanlines = inflateSync(originalIdat, { maxOutputLength: 128 * 1024 * 1024 });
    let best = originalIdat;
    for (const strategy of [constants.Z_DEFAULT_STRATEGY, constants.Z_FILTERED]) {
      const compressed = deflateSync(scanlines, { level: 9, memLevel: 9, strategy });
      if (compressed.length < best.length) best = compressed;
    }
    if (best === originalIdat || best.length + 32 >= originalIdat.length) return input;
    if (!inflateSync(best, { maxOutputLength: 128 * 1024 * 1024 }).equals(scanlines)) {
      throw new Error('PNG scanlines changed during lossless recompression');
    }
    const output = Buffer.concat([
      signature,
      ...chunks.slice(0, first).map(chunk => chunk.chunk),
      makeIdat(best),
      ...chunks.slice(last + 1).map(chunk => chunk.chunk),
    ]);
    return output.length < input.length ? output : input;
  } catch (error) {
    // Preserve any unusual-but-valid PNG rather than risk changing its pixels.
    if (error.message === 'PNG scanlines changed during lossless recompression') throw error;
    return input;
  }
}
