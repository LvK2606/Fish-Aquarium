# Fish Aquarium — Mobile WebGL performance pass

## Observed baseline (08 Nov 2026)

- Vercel production: `fish-aquarium-five.vercel.app`, commit `9df3374`, READY; no recorded Vercel Function runtime errors in the last day. This does **not** measure browser FPS.
- Git tree: 1,096 tracked files / ~74.0 MB on disk; original application JS ~2.98 MB, 76 GLB models and many fish morph textures.
- The original simulation already offers automatic high/low settings: the low preset uses canvas DPR=1 and reduces plant geometry, whereas high can use DPR up to 2.
- The shop previously rendered 640x384 WebGL thumbnails synchronously/with zero-delay timers, potentially creating main-thread stalls when many items were listed.

## Changes in this branch

1. Keep the mirrored application bundle and its original SHA-256 verification intact. During build, create a separate optimized runtime using six exact, checked substitutions. Fail the build if the upstream bundle changes.
2. Queue fish, plant and hardscape preview renders one at a time using `requestIdleCallback` (timed fallback). Pause while the tab is hidden. The original shop fallback placeholders remain visible until previews finish.
3. Render shop thumbnails at 320x192 on narrow touch screens / devices with at most 4 GB reported memory or 4 logical CPUs; keep 640x384 on other machines. Reduces **thumbnail pixel count by 75%** on constrained devices, **not** in-tank fish textures or GLB geometry.
4. Cache static models, fonts and scripts for repeat visits without caching API/auth responses. Original models, textures, water rendering and animation are unchanged.

## Verification

- `npm ci && npm run build && npm run test:performance && npm run test:backend`
- `npm run test:frontend` after installing Chromium / Playwright as documented in README.
- Manual comparison on real low-end Android: open aquarium, open fish/plant/decor shop, scroll, switch tabs, verify item thumbnails and feeding/animation. Record FPS / frame-time p95, long tasks, memory, startup and visual diffs before and after.
- Runtime diagnostics in DevTools: `window.__FISH_AQUARIUM_PERF__` (thumbnailScale, pendingThumbnails(), renderedThumbnails()).

## Release guard

Do not merge into `main` or publish production until real mobile browser comparison approves the trade-off. Git-linked Vercel preview should build from this branch; validate preview status separately from GitHub CI.

**Unmeasured:** We have not measured FPS or first-load bytes on physical low-end Android; the patch is a targeted mitigation, not a promise of 60 FPS. Shop thumbnail generation still uses WebGL on the main thread, only serialized.
