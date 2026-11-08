import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const load = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('optimized bundle retains original and queues all three shop thumbnail types', async () => {
  const [source, optimized, html] = await Promise.all([
    load('../public/assets/main-CvOo3B9w.js'),
    load('../public/assets/main-mobile-optimized.js'),
    load('../public/index.html'),
  ]);
  assert.ok(source.includes('const o_=320,r_=192,y0=2,Sy=new Map'));
  assert.ok(source.includes('o=sD(a);return lLe(a)'));
  assert.ok(optimized.includes('y0=window.__AQUARIUM_THUMB_DPR__||2'));
  assert.ok(optimized.includes('l=()=>window.__AQUARIUM_QUEUE_THUMB__'));
  assert.ok(optimized.includes('window.__AQUARIUM_QUEUE_THUMB__(()=>{try{const o=iLe(t)'));
  assert.ok(optimized.includes('o=await window.__AQUARIUM_QUEUE_THUMB_ASYNC__'));
  assert.ok(html.indexOf('/performance-runtime.js') < html.indexOf('/assets/main-mobile-optimized.js'));
});

test('mobile scheduler queues one thumbnail per idle slice and resumes after visibility', async () => {
  const script = await load('../public/performance-runtime.js');
  const idle = [];
  const listeners = {};
  const doc = { visibilityState: 'visible', addEventListener(name, cb) { listeners[name] = cb; } };
  const win = {
    screen: { width: 390, height: 844 },
    matchMedia() { return { matches: true }; },
    requestIdleCallback(cb) { idle.push(cb); },
    setTimeout() { throw new Error('Should prefer idle callbacks'); },
  };
  vm.runInNewContext(script, {
    window: win, document: doc,
    navigator: { deviceMemory: 3, hardwareConcurrency: 4 },
    console,
  });
  assert.equal(win.__FISH_AQUARIUM_PERF__.thumbnailScale, 1);
  const events = [];
  win.__AQUARIUM_QUEUE_THUMB__(() => events.push(1));
  win.__AQUARIUM_QUEUE_THUMB__(() => events.push(2));
  assert.equal(idle.length, 1);
  idle.shift()();
  assert.deepEqual(events, [1]);
  assert.equal(win.__FISH_AQUARIUM_PERF__.pendingThumbnails(), 1);

  doc.visibilityState = 'hidden';
  listeners.visibilitychange();
  idle.shift()(); // old scheduled callback must not run
  assert.deepEqual(events, [1]);
  doc.visibilityState = 'visible';
  listeners.visibilitychange();
  idle.shift()();
  assert.deepEqual(events, [1, 2]);
  assert.equal(win.__FISH_AQUARIUM_PERF__.pendingThumbnails(), 0);
  assert.equal(win.__FISH_AQUARIUM_PERF__.renderedThumbnails(), 2);
});
