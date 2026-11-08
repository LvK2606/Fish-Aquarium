import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { optimizePngLosslessly } from './png-lossless.mjs';
import { patchAquariumBundle } from './adaptive-graphics.mjs';

const sourceDir = fileURLToPath(new URL('../public/', import.meta.url));
const outputDir = fileURLToPath(new URL('../dist/', import.meta.url));

// Verify original hashes before this step (npm run build runs verify-assets first).
// Vercel serves dist/, never replacing the verified source files under public/.
await rm(outputDir, { recursive: true, force: true });
await cp(sourceDir, outputDir, { recursive: true });

let images = 0;
let optimized = 0;
let originalBytes = 0;
let deployedBytes = 0;
async function optimizeDirectory(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await optimizeDirectory(path);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
      const before = await readFile(path);
      const after = optimizePngLosslessly(before);
      images++;
      originalBytes += before.length;
      deployedBytes += after.length;
      if (after !== before) {
        await writeFile(path, after);
        optimized++;
      }
    }
  }
}
await optimizeDirectory(outputDir);


// Keep the original source bundle byte-for-byte in public/. Patch only the
// verified deployment copy. Fingerprint it to avoid stale immutable JS caches.
const originalJs = 'main-CvOo3B9w.js';
const sourceJsPath = join(outputDir, 'assets', originalJs);
const adaptedJs = patchAquariumBundle(await readFile(sourceJsPath, 'utf8'));
const fingerprint = createHash('sha256').update(adaptedJs).digest('hex').slice(0, 12);
const adaptiveJs = 'main-adaptive-' + fingerprint + '.js';
await writeFile(join(outputDir, 'assets', adaptiveJs), adaptedJs);
await rm(sourceJsPath);
const htmlPath = join(outputDir, 'index.html');
const html = await readFile(htmlPath, 'utf8');
const oldUrl = '/assets/' + originalJs;
if (html.split(oldUrl).length !== 2) throw new Error('Unexpected entrypoint JS reference in index.html');
await writeFile(htmlPath, html.replace(oldUrl, '/assets/' + adaptiveJs));
console.log('High Adaptive WebGL: capped mobile DPR, measured FPS scaling, cheaper Bloom/MSAA, view-dependent plant LOD. Bundle: ' + adaptiveJs);

const mib = bytes => (bytes / 1024 / 1024).toFixed(2);
console.log('Deployment PNG: ' + optimized + '/' + images +
  ' losslessly recompressed; ' + mib(originalBytes) + ' -> ' + mib(deployedBytes) +
  ' MiB (saved ' + mib(originalBytes - deployedBytes) +
  ' MiB). Source assets, GLB geometry, textures and animations are unchanged.');
