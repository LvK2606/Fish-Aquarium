import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,extname} from 'node:path';

const root=fileURLToPath(new URL('../public/',import.meta.url));
const manifest=JSON.parse(await readFile(new URL('../source-assets.json',import.meta.url),'utf8'));
assert.equal(manifest.failures.length,0,'Unresolved source assets');
let bytes=0;
for(const asset of manifest.files){
 const data=await readFile(join(root,asset.path));bytes+=data.length;
 let original=data;
 if(asset.path==='assets/main-CvOo3B9w.js')original=Buffer.from(data.toString()
  .replaceAll('/fonts/noto-sans-sc.css','https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@500;700;800&display=swap')
  .replaceAll('/fonts/m-plus-rounded-1c.css','https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;700;800&display=swap'));
 if(asset.path==='assets/main-CvOo3B9w.js'){
  // The original source hash remains in source-assets.json for provenance.
  // Pin the intentionally patched bundle by its Git blob SHA instead.
  const blobSha=createHash('sha1').update('blob '+data.length).update(Buffer.from([0])).update(data).digest('hex');
  assert.equal(blobSha,'f471fed2f017325a6cac93015db8b58017435bb0','Unexpected changes to reviewed performance hotfix bundle');
 }else if(asset.path!=='index.html')assert.equal(createHash('sha256').update(original).digest('hex'),asset.sha256,`Unexpected change to original asset: ${asset.path}`);
 assert(data.length>0,`Empty asset: ${asset.path}`);
 if(extname(asset.path)==='.glb'){
  assert.equal(data.toString('utf8',0,4),'glTF');
  assert.equal(data.readUInt32LE(8),data.length,`Invalid GLB length: ${asset.path}`);
 }
 if(extname(asset.path)==='.png')assert.equal(data.toString('hex',0,8),'89504e470d0a1a0a',`Invalid PNG: ${asset.path}`);
 if(asset.path!=='index.html')assert(!data.subarray(0,100).toString().toLowerCase().startsWith('<!doctype html'),`HTML saved as asset: ${asset.path}`);
}
assert(manifest.files.length>450,'Fish morph textures/designs have not all been mirrored');
const files=await readdir(join(root,'fonts/files'));
assert.equal(files.filter(file=>file.endsWith('.woff2')).length,4,'Missing local fonts');
for(const name of ['noto-sans-sc.css','m-plus-rounded-1c.css']){
 const css=await readFile(join(root,'fonts',name),'utf8');
 for(const match of css.matchAll(/url\(\.\/([^)]*)\)/g))await readFile(join(root,'fonts',match[1]));
}
console.log(`Verified ${manifest.files.length} source files (${(bytes/1024/1024).toFixed(1)} MiB), original hashes, GLB/PNG signatures and local fonts. Output: public/`);
if(process.env.RUN_CLOUD_STORAGE_CHECK==='1')await import('./check-cloud-storage.mjs');
