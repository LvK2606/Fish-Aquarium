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
  assert.match(bundle,/shopOpen=F\(h=>h\.modal==="shop"\)/);
  assert.match(bundle,/shopOpen\|\|c\?"demand":"always"/);
  assert.match(bundle,/function AdaptiveDpr\(/);
  assert.match(bundle,/window\.innerWidth<=767/);
  assert.match(bundle,/dpr:i\?1:\[1,d\]/);
  assert.match(bundle,/u\.jsx\(AdaptiveDpr,\{min:1,max:i\?1:Math\.min\(d,/);
  assert.match(bundle,/Math\.max\(t,Math\.round/);
  assert.match(bundle,/Math\.min\(e,Math\.round/);
});

test('High postprocessing uses zero MSAA and merged color effects',()=>{
  assert.match(bundle,/u\.jsxs\(jO,\{multisampling:0,mergeMode:"auto",children:\[u\.jsx\(G0e,/);
  assert.doesNotMatch(bundle,/u\.jsxs\(jO,\{multisampling:4/);
  assert.match(bundle,/u\.jsx\(q0e,\{offset:\.25,darkness:\.45\}\)/);
  assert.match(bundle,/intensity:aquaMobileShader\?\.42:\.6/);
});

test('Mobile High caustics and water avoid expensive multi-octave noise',()=>{
  assert.match(bundle,/const aquaMobileShader=typeof window/);
  assert.match(bundle,/aquaFallbackShader=aquaMobileShader/);
  assert.match(bundle,/GzMobile=`[\s\S]*?float caustics\(vec3 world\)/);
  assert.match(bundle,/GzFallback=`[\s\S]*?float caustics\(vec3 world\)/);
  assert.equal(bundle.split('aquaFallbackShader?GzFallback:GzMobile').length-1,3);
  assert.match(bundle,/for \(int i = 0; i < \$\{aquaMobileShader\?3:5\}; i\+\+\)/);
  assert.match(bundle,/aquaMobileShader\?"g \+= vec2/);
});

test('Mobile High uses distance-based plant and moss LOD, 512px background',()=>{
  assert.match(bundle,/l\.width=i\|\|aquaMobileShader\?512:1024/);
  assert.match(bundle,/mobilePlantLOD\(h,mobileCamera\.position\)/);
  assert.match(bundle,/function mobilePlantLOD\(t,eye\)/);
  assert.match(bundle,/c\.distance>16\?3:c\.distance>13\?2:1/);
  assert.match(bundle,/d\?4:aquaMobileShader\?6:10/);
  assert.match(bundle,/mobileMossLod=aquaMobileShader/);
  assert.match(bundle,/aquaMobileShader\?300:W5e/);
  assert.match(bundle,/aquaMobileShader\?55:90/);
});

test('Transparent glass film skips clean overlay and zero-alpha pixels',()=>{
  assert.match(bundle,/if \(alpha \* uStrength < 0\.012\) discard;/);
  assert.match(bundle,/group\.visible=yt\.uGlassHaze\.value>0\.004/);
  assert.match(bundle,/yt\.uGlassCover\.value\*Math\.max/);
  assert.match(bundle,/transparent:!0,depthWrite:!1/);
});
