import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { patchAquariumBundle, createAdaptiveGovernor } from '../scripts/adaptive-graphics.mjs';

test('High Adaptive drops DPR on sustained low FPS and recovers after stable frames', () => {
  const governor = createAdaptiveGovernor({ max: 1.5, min: 1 });
  let clock = 0;
  function frames(fps, seconds) {
    for (let frame = 0; frame < Math.floor(fps * seconds); frame++) {
      clock += 1000 / fps;
      governor.sample(clock);
    }
  }
  frames(60, 8);
  assert.equal(governor.getDpr(), 1.5, '60 FPS should preserve full mobile High Adaptive resolution');
  frames(29, 9);
  assert.ok(governor.getDpr() < 1.5, 'sustained ~29 FPS should scale the canvas down');
  const reduced = governor.getDpr();
  assert.ok(reduced >= 1 && reduced <= 1.5);
  frames(60, 28);
  assert.ok(governor.getDpr() > reduced, 'stable fast frames should progressively recover fidelity');
  assert.ok(governor.getDpr() <= 1.5);
});

test('governor does not misinterpret inactive-tab stalls as sustained low FPS', () => {
  const governor = createAdaptiveGovernor();
  let clock = 0;
  for (let i = 0; i < 100; i++) governor.sample(clock += 1000 / 60);
  governor.sample(clock += 3500);
  for (let i = 0; i < 50; i++) governor.sample(clock += 1000 / 60);
  assert.equal(governor.getDpr(), 1.5);
});

test('High Adaptive patches the exact source bundle without touching source bytes', async () => {
  const original = await readFile(new URL('../public/assets/main-CvOo3B9w.js', import.meta.url), 'utf8');
  const optimized = patchAquariumBundle(original);
  assert.ok(optimized.length > original.length);
  assert.ok(optimized.includes('function __AquaverseAdaptiveDpr()'));
  assert.ok(optimized.includes('function __aquaverseFarLeaves('));
  assert.ok(optimized.includes('resolutionScale:__aquaverseMobile()?.35:.5'));
  assert.ok(optimized.includes('multisampling:__aquaverseMobile()?0:2'));
  assert.ok(original.includes('multisampling:4'));
  assert.ok(!original.includes('__aquaverseCreateGovernor'));
  assert.throws(() => patchAquariumBundle(optimized), /anchor missing or ambiguous/);
});

test('optimized deploy bundle has a fresh asset hash and parses as JavaScript', async t => {
  const index = new URL('../dist/index.html', import.meta.url);
  try { await access(index); } catch { t.skip('npm run build was not executed'); return; }
  const html = await readFile(index, 'utf8');
  const match = html.match(/\/assets\/(main-adaptive-[0-9a-f]{12}\.js)/);
  assert.ok(match, 'deployment HTML must reference fingerprinted adaptive JS');
  assert.doesNotMatch(html, /src="\/assets\/main-CvOo3B9w.js"/);
  const file = new URL('../dist/assets/' + match[1], import.meta.url);
  const run = spawnSync(process.execPath, ['--check', file.pathname], { encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stderr || run.stdout || 'JavaScript syntax check failed');
});
