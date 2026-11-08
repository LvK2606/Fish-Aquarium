# CPU / raycasting / memory optimization (08 Nov 2026)

Scope: follows PR #7 at `5db5ebcb`; this branch is **not merged**.

## Applied
- Replaced tutorial spotlight's full-speed RAF + repeated layout reads with 250ms sampled layout while visible, plus resize/scroll listeners and cleanup.
- Added 120ms canvas rectangle cache for R3F pointer coordinates, layout picking, and drag events.
- Added an inexpensive `meshBounds` bounding-box raycaster to aquarium interaction proxy; disabled raycasts on two purely decorative glass layers. Kept accurate raycasts elsewhere.
- Added 48-entry LRU for Shop WebP blob URLs, cleaned **only when Shop closes**; revoked object URLs on eviction. The Shop render texture context remains reusable.
- Disposed newly created procedural hardscape thumbnail geometry after capture. Preserved GLB-derived geometries shared with live aquarium instances.
- Removed rejected GLB and texture load promises so errors can retry; successful shared GLB/texture caches intentionally remain resident.
- Exposed `window.__aqPerfSnapshot()` with live `renderer.info.memory` and cache sizes for development tests.
- Added `tests/cpu-browser.mjs` to sample mobile High rendered WebGL FPS, frame pacing p95, long tasks, and memory counters; compare job checks unchanged #7 baseline and this branch under the same Playwright runner.

## Constraints
- Repo contains only an already-minified application bundle, not the original React/Three source and dependencies. Official `three-mesh-bvh` cannot be safely inserted as another copy of THREE without risking type mismatch, extra bundle size, and broken ray hits; **not yet integrated**. `meshBounds` is a cheap conservative proxy fallback, not a replacement for triangle-level BVH.
- Shared GLB and texture caches are deliberately **not** disposed on tank switch or on Shop close because referenced GPU objects may still be rendering; correct eviction requires ownership/reference counting in the upstream source. Only Shop-generated thumbnails and owned procedural geometries are reclaimed.
- `renderer.info.memory` counts GPU-related geometries/textures, not GPU bytes. Before-version does not export its renderer info; comparative WebGL texture/buffer live counts are separately instrumented for both versions.
- These browser metrics are measured on software-rendered Chromium and may not predict FPS on actual Android GPUs.

## Reproduce
```sh
npm ci
npm run build
npm run test:backend
PERF_LABEL=after npm run test:cpu-benchmark
```
GitHub Actions uploads `cpu-benchmark-before.json` and `cpu-benchmark-after.json` where runs complete.
