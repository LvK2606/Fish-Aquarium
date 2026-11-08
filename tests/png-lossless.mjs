import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { optimizePngLosslessly } from '../scripts/png-lossless.mjs';

const signature = Buffer.from('89504e470d0a1a0a', 'hex');
// Independent bit-at-a-time CRC implementation for PNG fixture validation.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, payload) {
  const bytes = Buffer.alloc(payload.length + 12);
  bytes.writeUInt32BE(payload.length, 0);
  bytes.write(type, 4, 4, 'ascii');
  payload.copy(bytes, 8);
  bytes.writeUInt32BE(crc32(bytes.subarray(4, bytes.length - 4)), bytes.length - 4);
  return bytes;
}
function parse(bytes) {
  assert.ok(bytes.subarray(0, 8).equals(signature));
  const items = [];
  let offset = 8;
  while (offset < bytes.length) {
    const len = bytes.readUInt32BE(offset);
    const end = offset + len + 12;
    const raw = bytes.subarray(offset, end);
    assert.equal(bytes.readUInt32BE(end - 4), crc32(raw.subarray(4, raw.length - 4)));
    const type = raw.toString('ascii', 4, 8);
    items.push({ type, raw, data: raw.subarray(8, raw.length - 4) });
    offset = end;
  }
  assert.equal(offset, bytes.length);
  return items;
}

test('lossless PNG deployment recompression keeps every decoded scanline and metadata', () => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(64, 0);
  ihdr.writeUInt32BE(64, 4);
  ihdr[8] = 8; // RGBA, 8 bit
  ihdr[9] = 6;
  const scanlines = Buffer.alloc((64 * 4 + 1) * 64);
  for (let row = 0; row < 64; row++) {
    scanlines[row * 257] = 0;
    for (let col = 0; col < 64; col++) {
      const p = row * 257 + 1 + col * 4;
      scanlines[p] = 12;
      scanlines[p + 1] = 100;
      scanlines[p + 2] = 210;
      scanlines[p + 3] = 255;
    }
  }
  const originalData = deflateSync(scanlines, { level: 0 });
  const half = Math.floor(originalData.length / 2);
  const before = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from('Title\0Aqualator')),
    chunk('IDAT', originalData.subarray(0, half)),
    chunk('IDAT', originalData.subarray(half)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  const after = optimizePngLosslessly(before);
  assert.ok(after.length < before.length / 2, 'lossless recompression must save bytes for an uncompressed fixture');
  const oldChunks = parse(before);
  const newChunks = parse(after);
  assert.deepEqual(newChunks.map(x => x.type), ['IHDR', 'tEXt', 'IDAT', 'IEND']);
  for (const type of ['IHDR', 'tEXt', 'IEND']) {
    assert.deepEqual(newChunks.find(x => x.type === type).raw, oldChunks.find(x => x.type === type).raw);
  }
  assert.deepEqual(inflateSync(Buffer.concat(newChunks.filter(x => x.type === 'IDAT').map(x => x.data))), scanlines);
  assert.deepEqual(inflateSync(Buffer.concat(oldChunks.filter(x => x.type === 'IDAT').map(x => x.data))), scanlines);
});

test('invalid PNG and files too small to benefit are never modified', () => {
  const invalid = Buffer.from('not a PNG');
  assert.strictEqual(optimizePngLosslessly(invalid), invalid);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const tiny = Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]);
  assert.strictEqual(optimizePngLosslessly(tiny), tiny);
});
