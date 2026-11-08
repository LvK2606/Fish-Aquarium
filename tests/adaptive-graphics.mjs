import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createInteractionGovernor, createRenderCadence, mobileLeafSegments, patchAquariumBundle } from '../scripts/adaptive-graphics.mjs';

test('High remains DPR 2 at 30 FPS idle and does not confuse idle frames with overload', () => {
  const gov=createInteractionGovernor({max:2,min:1.55});
  let now=0;
  for(let i=0;i<220;i++){now+=1000/30;assert.equal(gov.sample(now),null)}
  assert.equal(gov.getDpr(),2);
  assert.ok(gov.getFps()>27&&gov.getFps()<33);
});

test('demand renderer halves baseline frame requests but prioritizes drag', () => {
  const clock=createRenderCadence();
  let idle=0;
  for(let i=0;i<120;i++)if(clock.shouldRender(i*1000/60,false))idle++;
  clock.reset();
  let moving=0;
  for(let i=0;i<120;i++)if(clock.shouldRender(i*1000/60,true))moving++;
  assert.ok(idle>=55&&idle<=62,`expected ~60 idle frames over 2 seconds, got ${idle}`);
  assert.ok(moving>=115&&moving<=120,`expected ~120 active frames, got ${moving}`);
  assert.equal(clock.shouldRender(NaN,true),false);
});

test('only an overloaded drag reduces resolution temporarily, then full detail restores', () => {
  const gov=createInteractionGovernor({max:2,min:1.55});
  let now=0;
  for(let i=0;i<140;i++)gov.sample(now+=1000/30);
  assert.equal(gov.getDpr(),2);
  gov.pointerDown(10,10);
  assert.equal(gov.pointerMove(16,17),null,'tap remains full quality');
  assert.equal(gov.pointerMove(60,60),null,'drag initially stays full quality');
  for(let i=0;i<33;i++)gov.sample(now+=1000/29);
  assert.equal(gov.getDpr(),1.55);
  assert.equal(gov.pointerUp(),2);
  assert.equal(gov.getDpr(),2);
});

test('responsive gestures keep sharp DPR when device can draw quickly',()=>{
  const gov=createInteractionGovernor({max:2,min:1.55});
  let now=0;
  gov.pointerDown(5,5);gov.pointerMove(50,50);
  for(let i=0;i<180;i++)assert.equal(gov.sample(now+=1000/60),null);
  assert.equal(gov.getDpr(),2);
  assert.equal(gov.pointerUp(),null);
  gov.sample(now+=3000);
  for(let i=0;i<120;i++)gov.sample(now+=1000/30);
  assert.equal(gov.getDpr(),2);
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
