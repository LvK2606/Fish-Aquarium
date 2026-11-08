import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const code=await readFile(new URL('../public/assets/main-CvOo3B9w.js',import.meta.url),'utf8');
const shopIndex=code.indexOf('let aqThumbQueue=Promise.resolve()');
assert.ok(shopIndex>0,'Thumbnail queue implementation not found');
const shopThumb=code.slice(shopIndex,code.indexOf('function nJ(',shopIndex));

test('Shop thumbnails are 256px and encoded asynchronously as WebP/JPEG',()=>{
  assert.match(code,/const o_=256,r_=154,y0=1/);
  assert.match(shopThumb,/requestIdleCallback/);
  assert.match(shopThumb,/createImageBitmap\(canvas\)/);
  assert.match(shopThumb,/\.toBlob\(/);
  assert.match(shopThumb,/image\/webp/);
  assert.match(shopThumb,/image\/jpeg/);
  assert.match(shopThumb,/URL\.createObjectURL\(blob\)/);
  assert.doesNotMatch(shopThumb,/toDataURL\s*\(/);
});

test('Shop call sites await completion and never synchronously encode PNG',()=>{
  const appCode=code.slice(2000000);
  assert.doesNotMatch(appCode,/toDataURL\s*\(/);
  assert.match(code,/c\?await sD\(c\):null/);
  assert.match(code,/r=await sD\(o\)/);
  assert.match(code,/o=await sD\(a\)/);
  // The only remaining toDataURL use is an unmodified Three.js serialization
  // helper that requires a synchronous return value, not a Shop code path.
  assert.equal((code.match(/\.toDataURL\(/g)||[]).length,1);
});

test('InstancedMeshes in the application have frustum culling enabled',()=>{
  const appCode=code.slice(2000000);
  assert.doesNotMatch(appCode,/\.frustumCulled\s*=\s*(?:!1|false)\b/);
  assert.ok((appCode.match(/\.frustumCulled=!0/g)||[]).length>=12);
  // Remaining exclusions are Three.js object serialization and a full-screen
  // postprocessing triangle, which must not be culled.
  assert.equal((code.match(/\.frustumCulled=!1/g)||[]).length,2);
});

test('Scene uses mobile DPR 1-1.5 and frame performance monitoring',()=>{
  assert.match(code,/function AdaptiveDpr\(\)/);
  assert.match(code,/function PerformanceMonitor\(\)/);
  assert.match(code,/window\.matchMedia\("\(pointer: coarse\)"\)/);
  assert.match(code,/\[1,1\.5\]/);
  assert.match(code,/performance:\{min:\.66,max:1,debounce:7000\}/);
  assert.match(code,/e\.performance\.regress\(\)/);
});
