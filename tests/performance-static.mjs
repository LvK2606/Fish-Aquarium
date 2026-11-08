import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const bundle=await readFile(new URL('../public/assets/main-CvOo3B9w.js',import.meta.url),'utf8');

test('Shop uses 256px async WebP thumbnails instead of synchronous PNG',()=>{
  const start=bundle.indexOf('const o_=256,r_=154,y0=1');
  assert.ok(start>0,'Thumbnail render target should be 256px wide');
  const end=bundle.indexOf('function QT(',start);
  assert.ok(end>start,'Shop thumbnail segment missing');
  const shop=bundle.slice(start,end);
  assert.doesNotMatch(shop,/toDataURL\s*\(/);
  assert.match(shop,/createImageBitmap\(source\)/);
  assert.match(shop,/toBlob\(resolve,"image\/webp"/);
  assert.match(shop,/shopCaptureQueue/);
  assert.match(shop,/await sD\(/);
  assert.match(shop,/URL\.revokeObjectURL/);
  assert.match(shop,/function useLazyShopThumbnail\(/);
  assert.match(shop,/new IntersectionObserver\(/);
  assert.match(shop,/rootMargin:"80px 0px"/);
  assert.doesNotMatch(shop,/B\.useState\(\(\)=>s9\(/);
  assert.doesNotMatch(shop,/B\.useState\(\(\)=>a9\(/);
  assert.doesNotMatch(shop,/B\.useState\(\(\)=>r9\(/);
});

test('Application screenshot encoding does not call toDataURL',()=>{
  const calls=[...bundle.matchAll(/\.toDataURL\s*\(/g)];
  // One remaining occurrence belongs to the unmodified synchronous THREE
  // texture exporter; changing its return contract would corrupt serialization.
  assert.equal(calls.length,1,`Unexpected synchronous canvas serialization: ${calls.length} sites`);
  const index=calls[0].index;
  assert.match(bundle.slice(index-6,index+30),/n\.toDataURL\("image\/png"\)/);
  assert.ok(index<250000,'toDataURL should only occur inside vendored Three.js');
  assert.match(bundle,/i\.toBlob\(l=>/);
});

test('InstancedMesh frustum culling is on and dynamic bounds are refreshed',()=>{
  const assignments=[...bundle.matchAll(/\.frustumCulled=!1/g)];
  assert.equal(assignments.length,2,'Only THREE JSON exporter and fullscreen postprocess quad may disable culling');
  assert.match(bundle.slice(assignments[0].index-70,assignments[0].index+45),/this\.frustumCulled===!1/);
  assert.match(bundle.slice(assignments[1].index-240,assignments[1].index+50),/fullscreenMaterial/);
  assert.doesNotMatch(bundle,/u\.jsx\("instancedMesh",\{[^}]*?frustumCulled:!1/);
  assert.ok((bundle.match(/invalidateInstanceBounds\(/g)||[]).length>=14);
  // Two Points meshes retain their exemptions because their vertices move in shaders.
  assert.equal((bundle.match(/u\.jsx\("points",\{[^}]*?frustumCulled:!1/g)||[]).length,2);
});

test('Main aquarium adaptively controls DPR with mobile 1–1.5 bounds',()=>{
  assert.match(bundle,/function PerformanceMonitor\(/);
  assert.match(bundle,/function AdaptiveDpr\(/);
  assert.match(bundle,/window\.innerWidth<=767/);
  assert.match(bundle,/dpr:i\?1:\[1,d\]/);
  assert.match(bundle,/u\.jsx\(AdaptiveDpr,\{min:1,max:i\?1:Math\.min\(d,/);
  assert.match(bundle,/Math\.max\(t,Math\.round/);
  assert.match(bundle,/Math\.min\(e,Math\.round/);
});
