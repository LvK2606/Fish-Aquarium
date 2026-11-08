import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const bundle=await readFile(new URL('../public/assets/main-CvOo3B9w.js',import.meta.url),'utf8');

test('pointermove uses a short-lived canvas bounds cache, not forced layout per event',()=>{
  assert.match(bundle,/const aqCanvasRectCache=new WeakMap/);
  assert.match(bundle,/const p=aqCanvasRect\(f\.gl\.domElement\)/);
  assert.match(bundle,/const E=aqCanvasRect\(w\),z=\[\]/);
  assert.match(bundle,/const xe=aqCanvasRect\(de\)/);
});

test('tour overlay no longer runs requestAnimationFrame plus getBoundingClientRect every frame',()=>{
  const start=bundle.indexOf('function LNe(){');
  const end=bundle.indexOf('const k=(w==null',start);
  assert.ok(start>0&&end>start);
  const tour=bundle.slice(start,end);
  assert.doesNotMatch(tour,/requestAnimationFrame\(/);
  assert.match(tour,/setInterval\(\(\)=>\{document\.hidden\|\|q\(\)\},250\)/);
  assert.match(tour,/removeEventListener\("scroll",refresh/);
});

test('meshBounds is used for the aquarium interaction proxy; decorative glass is non-interactive',()=>{
  assert.match(bundle,/function meshBounds\(t,e\)/);
  assert.match(bundle,/position:\[0,i\.water\/2,0\],raycast:meshBounds,onPointerMove/);
  assert.match(bundle,/position:\[0,e\.water\/2,e\.frontZ-\.035\],raycast:\(\)=>null/);
  assert.match(bundle,/position:\[0,e\.water\/2,-e\.width\/2\+\.035\],raycast:\(\)=>null/);
});

test('shop thumbnail cache uses bounded LRU with revoke, GLB/texture caches retry errors',()=>{
  assert.match(bundle,/function aqThumbGet\(/);
  assert.match(bundle,/function aqTrimShopThumbs\(t=48\)/);
  assert.match(bundle,/Sy\.delete\(e\)/);
  assert.match(bundle,/URL\.revokeObjectURL\(n\)/);
  assert.match(bundle,/if\(!shopOpen\)aqTrimShopThumbs\(48\)/);
  assert.match(bundle,/lH\.delete\(t\);throw n/);
  assert.match(bundle,/cH\.delete\(t\);throw n/);
  assert.match(bundle,/ownedPreviewGeometry/);
});

test('instrumentation exposes renderer.info.memory and caches for browser metrics',()=>{
  assert.match(bundle,/window\.__aqPerfSnapshot=\(\)=>/);
  assert.match(bundle,/t\?\.memory\?\.geometries/);
  assert.match(bundle,/t\?\.memory\?\.textures/);
  assert.match(bundle,/onCreated:t=>\{window\.__aqRenderer=t\.gl/);
});
