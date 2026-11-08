/* Build-only transforms. Keep public/assets/main-CvOo3B9w.js byte-for-byte verified. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const input = new URL('../public/assets/main-CvOo3B9w.js', import.meta.url);
const output = new URL('../public/assets/main-mobile-optimized.js', import.meta.url);
let code = await readFile(input, 'utf8');

const patches = [
  [
    'thumbnail render resolution',
    'const o_=320,r_=192,y0=2,Sy=new Map',
    'const o_=320,r_=192,y0=window.__AQUARIUM_THUMB_DPR__||2,Sy=new Map',
  ],
  [
    'fish thumbnail queue opening',
    'l=()=>{try{const c=eLe(t,e)',
    'l=()=>window.__AQUARIUM_QUEUE_THUMB__(()=>{try{const c=eLe(t,e)',
  ],
  [
    'fish thumbnail queue closing',
    'o(null)}};r&&!Kz(r.url,r.morph)',
    'o(null)}});r&&!Kz(r.url,r.morph)',
  ],
  [
    'plant thumbnail queue opening',
    'window.setTimeout(()=>{try{const o=iLe(t)',
    'window.__AQUARIUM_QUEUE_THUMB__(()=>{try{const o=iLe(t)',
  ],
  [
    'plant thumbnail queue closing',
    'a(null)}},0)})',
    'a(null)}})})',
  ],
  [
    'hardscape thumbnail queue',
    'o=sD(a);return lLe(a)',
    'o=await window.__AQUARIUM_QUEUE_THUMB_ASYNC__(()=>sD(a));return lLe(a)',
  ],
];

for (const [name, oldText, newText] of patches) {
  assert.equal(code.split(oldText).length - 1, 1, `Unexpected upstream bundle for ${name}; refusing unsafe patch`);
  code = code.replace(oldText, newText);
}
assert.ok(code.includes('window.__AQUARIUM_QUEUE_THUMB_ASYNC__'));
assert.ok(code.length > 2_000_000, 'Unexpectedly small output bundle');
await writeFile(output, code);
execFileSync(process.execPath, ['--check', fileURLToPath(output)], { stdio: 'pipe' });
console.log(`Mobile WebGL optimizations: ${patches.length} validated patches, ${code.length} characters. Original bundle unchanged.`);
