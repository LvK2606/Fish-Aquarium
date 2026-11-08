import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createInteractionGovernor, createRenderCadence, mobileLeafSegments, patchAquariumBundle } from '../scripts/adaptive-graphics.mjs';

test('High gradually lowers DPR at sustained 30 FPS even when not dragging',()=>{
  const gov=createInteractionGovernor({max:1.8,min:1,windowMs:500,slowBelow:47,fastAbove:57,settleMs:0});
  let now=10;
  for(let i=0;i<130;i++)gov.sample(now+=1000/30);
  assert.ok(gov.getDpr()<1.8,'slow idle frames must trigger adaptation');
  assert.ok(gov.getDpr()>=1,'never cross minimum DPR');
  assert.ok(gov.getFps()>27&&gov.getFps()<33);
});

test('sustained 60 FPS gradually restores quality, without flickering',()=>{
  const gov=createInteractionGovernor({max:1.75,min:1,windowMs:400,settleMs:0});
  let now=10;
  for(let i=0;i<170;i++)gov.sample(now+=1000/30);
  const low=gov.getDpr();
  assert.ok(low<1.75);
  for(let i=0;i<300;i++)gov.sample(now+=1000/60);
  assert.ok(gov.getDpr()>low);
  assert.ok(gov.getDpr()<=1.75);
});

test('60Hz render cadence prioritizes touch and reduces work behind modals',()=>{
  const cadence=createRenderCadence({idleHz:60,activeHz:60,overlayHz:12});
  let idle=0,active=0,overlay=0;
  for(let i=0;i<120;i++)if(cadence.shouldRender(i*1000/60,false))idle++;
  cadence.reset();
  for(let i=0;i<120;i++)if(cadence.shouldRender(i*1000/60,true))active++;
  cadence.reset();
  for(let i=0;i<120;i++)if(cadence.shouldRender(i*1000/60,false,true))overlay++;
  assert.ok(idle>=115&&idle<=120,'expected 60Hz idle, got '+idle);
  assert.ok(active>=115&&active<=120,'expected 60Hz active, got '+active);
  assert.ok(overlay>=20&&overlay<=27,'expected 12Hz obscured, got '+overlay);
  assert.equal(cadence.shouldRender(NaN,true),false);
});

test('touch release does not force full DPR on an overloaded device',()=>{
  const gov=createInteractionGovernor({max:1.8,min:1.1,windowMs:450,settleMs:0});
  let now=10;
  gov.pointerDown(0,0);
  gov.pointerMove(45,50);
  assert.equal(gov.isDragging(),true);
  for(let i=0;i<130;i++)gov.sample(now+=1000/30);
  const dpr=gov.getDpr();
  assert.ok(dpr<1.8);
  assert.equal(gov.pointerUp(),null);
  assert.equal(gov.getDpr(),dpr);
  assert.equal(gov.isDragging(),false);
  gov.reset(now+2000);
  assert.equal(gov.sample(now+2016),null);
});

test('procedural high geometry keeps every leaf and only reduces dense tessellation',()=>{
  assert.equal(mobileLeafSegments({count:599,mobile:true,low:false}),10);
  assert.equal(mobileLeafSegments({count:600,mobile:true,low:false}),8);
  assert.equal(mobileLeafSegments({count:2600,mobile:false,low:false}),10);
  assert.equal(mobileLeafSegments({count:2600,mobile:true,low:true}),4);
});

test('deployment patch keeps all source fish GLBs and original high foliage instances',async()=>{
  const original=await readFile(new URL('../public/assets/main-CvOo3B9w.js',import.meta.url),'utf8');
  const output=patchAquariumBundle(original);
  assert.ok(output.includes('frameloop:t?"never":!i&&__aquaverseMobile()?"demand"'));
  assert.ok(output.includes('const __aquaverseMakeRenderCadence'));
  assert.ok(output.includes('idleHz:60,activeHz:60,overlayHz:12'));
  assert.ok(output.includes('function sD(make,dispose=nJ)'));
  assert.ok(output.includes('toBlob(resolve,"image/webp",.85)'));
  assert.ok(output.includes('const __aqThumbUrls=new Set'));
  assert.ok(!output.includes('e.domElement.toDataURL("image/png")'));
  assert.ok(output.includes('q.computeBoundingSphere()'));
  assert.ok(output.includes('geo "+mem.geometries+" tex "+mem.textures'));
  assert.ok(output.includes('aquaverse-perf-hud'));
  assert.ok(output.includes('__aquaverseMobileLeafSegments({count:f.length'));
  assert.ok(output.includes('enableDamping:!__aquaverseMobile()'));
  assert.ok(output.includes('multisampling:__aquaverseMobile()?0:4'));
  assert.ok(output.includes('f=B.useMemo(()=>d?V5e(h):h,[h,d])'),'leaf instances are preserved');
  assert.ok(!output.includes('__aquaverseFarLeaves'),'no camera-triggered foliage rebuild');
  assert.ok(!original.includes('__aquaverseMakeRenderCadence'));
  assert.throws(()=>patchAquariumBundle(output),/anchor missing or ambiguous/);
});

test('fingerprinted High render build is valid JS',async t=>{
  try{await access(new URL('../dist/index.html',import.meta.url))}catch{t.skip('requires npm run build');return}
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const m=html.match(/\/assets\/(main-adaptive-[0-9a-f]{12}\.js)/);
  assert.ok(m,'HTML references the unique adaptive bundle');
  const file=new URL('../dist/assets/'+m[1],import.meta.url);
  const check=spawnSync(process.execPath,['--check',file.pathname],{encoding:'utf8',timeout:30000});
  assert.equal(check.status,0,check.stderr||check.stdout||'bundle syntax error');
});

test('mobile high uses GPU-light caustics and skips the heavy composer, desktop high remains unchanged', async () => {
  const source=await readFile(new URL('../public/assets/main-CvOo3B9w.js',import.meta.url),'utf8');
  const patched=patchAquariumBundle(source);
  assert.ok(patched.includes('const Gz=__aquaverseMobile()?'));
  assert.ok(patched.includes('float d1=sin(p.x*4.8'));
  assert.ok(patched.includes('float voronoiEdge('),'desktop caustics remain intact');
  assert.ok(patched.includes('):__aquaverseMobile()&&!__aquaverseForceEffects()?null:u.jsxs(jO'),
    'skip full-screen bloom and vignette passes in mobile High');
  assert.ok(patched.includes('function __aquaverseForceEffects()'));
});
test('modal overlay frames use ~10Hz budget while direct touch keeps 60Hz scheduling',()=>{
  const clock=createRenderCadence();
  let overlay=0;for(let n=0;n<180;n++)if(clock.shouldRender(n*1000/60,false,true))overlay++;
  assert.ok(overlay>=25&&overlay<=33,'overlay should not waste GPU frames behind dialogs');
  clock.reset();let drag=0;for(let n=0;n<180;n++)if(clock.shouldRender(n*1000/60,true,true))drag++;
  assert.ok(drag>=170&&drag<=180,'gesture should take priority over modal budget');
});
