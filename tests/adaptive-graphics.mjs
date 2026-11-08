import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { patchAquariumBundle, createInteractionGovernor } from '../scripts/adaptive-graphics.mjs';

test('High starts at original sharp DPR 2 and NEVER degrades just because idle demand renders at 30 Hz', () => {
  const governor = createInteractionGovernor({max:2,min:1.55});
  let time=0;
  for(let i=0;i<500;i++) {
    time+=1000/30;
    assert.equal(governor.sample(time),null);
  }
  assert.equal(governor.getDpr(),2);
  assert.ok(governor.getFps()>27&&governor.getFps()<33);
});

test('poor FPS during a deliberate drag temporarily lowers DPR then restores 2x on release', () => {
  const governor=createInteractionGovernor({max:2,min:1.55});
  let time=0;
  for(let i=0;i<140;i++)governor.sample(time+=1000/18);
  assert.equal(governor.getDpr(),2,'idle must stay pixel sharp');
  governor.pointerDown(100,100);
  assert.equal(governor.pointerMove(105,106),null,'a tap or small move must stay sharp');
  assert.equal(governor.pointerMove(130,120),1.55,'heavy dragging can use temporary resolution');
  assert.equal(governor.getDpr(),1.55);
  assert.equal(governor.pointerUp(),2,'always recover high resolution after release');
  assert.equal(governor.getDpr(),2);
});

test('30 Hz touch movement retains native detail and background stalls do not force blur', () => {
  const governor=createInteractionGovernor({max:2,min:1.55});
  let now=0;
  for(let i=0;i<95;i++)governor.sample(now+=1000/30);
  governor.pointerDown(1,1);
  assert.equal(governor.pointerMove(99,99),null);
  for(let i=0;i<95;i++)governor.sample(now+=1000/30);
  assert.equal(governor.getDpr(),2);
  assert.equal(governor.pointerUp(),null);
  governor.sample(now+=4200);
  for(let i=0;i<90;i++)governor.sample(now+=1000/30);
  assert.equal(governor.getDpr(),2);
});

test('mobile High preserves all original leaves, tap picking, and near-camera moss geometry', async () => {
  const original=await readFile(new URL('../public/assets/main-CvOo3B9w.js',import.meta.url),'utf8');
  const output=patchAquariumBundle(original);
  assert.ok(output.includes('function __AquaverseSharpInteraction()'));
  assert.ok(output.includes('return Math.max(1,Math.min(2,typeof window'));
  assert.ok(output.includes('enableDamping:!__aquaverseMobile()'));
  assert.ok(output.includes('pointermove"&&d.pointerType==="touch"'));
  assert.ok(output.includes('multisampling:__aquaverseMobile()?0:4'));
  assert.ok(output.includes('resolutionScale:__aquaverseMobile()?.3:.5'));
  assert.ok(output.includes('t.position[2]<-.15?4:6'));
  assert.ok(output.includes('d=Qa(x=>x.quality==="low"),f=B.useMemo(()=>d?V5e(h):h,[h,d])'),'full original High leaf counts stay');
  assert.ok(!output.includes('__aquaverseFarLeaves'),'no leaf hiding by camera orientation');
  assert.ok(!output.includes('__setSector'),'no geometry regeneration during camera orbit');
  assert.ok(!original.includes('__AquaverseSharpInteraction'));
  assert.throws(()=>patchAquariumBundle(output),/anchor missing or ambiguous/);
});

test('fingerprinted deploy bundle remains valid JavaScript', async t => {
  const index=new URL('../dist/index.html',import.meta.url);
  try{await access(index)}catch{t.skip('npm run build not executed');return}
  const html=await readFile(index,'utf8');
  const match=html.match(/\/assets\/(main-adaptive-[0-9a-f]{12}\.js)/);
  assert.ok(match);
  assert.doesNotMatch(html,/src="\/assets\/main-CvOo3B9w.js"/);
  const file=new URL('../dist/assets/'+match[1],import.meta.url);
  const run=spawnSync(process.execPath,['--check',file.pathname],{encoding:'utf8',timeout:30000});
  assert.equal(run.status,0,run.stderr||run.stdout||'generated bundle does not parse');
});
