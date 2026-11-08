import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { optimizePngLosslessly } from './png-lossless.mjs';

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

const mib = bytes => (bytes / 1024 / 1024).toFixed(2);
console.log('Deployment PNG: ' + optimized + '/' + images +
  ' losslessly recompressed; ' + mib(originalBytes) + ' -> ' + mib(deployedBytes) +
  ' MiB (saved ' + mib(originalBytes - deployedBytes) +
  ' MiB). Source assets, GLB geometry, textures and animations are unchanged.');
