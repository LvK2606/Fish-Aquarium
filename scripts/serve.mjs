import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';

try{process.loadEnvFile('.env.local');}catch(error){if(error.code!=='ENOENT')throw error;}

const root=fileURLToPath(new URL('../public/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.glb':'model/gltf-binary'};
let apiHandler;
function getApiHandler(){
 if(!apiHandler)apiHandler=(async()=>{
  if(process.env.NODE_ENV==='test'&&process.env.BACKEND_TEST_MODE==='1'){
   const [{createHandler},{createMemoryStore}]=await Promise.all([import('../server/handler.js'),import('../server/storage.js')]);
   return createHandler({store:createMemoryStore(),secret:randomBytes(48).toString('base64url'),secureCookies:false});
  }
  return (await import('../api/[...path].js')).default;
 })();
 return apiHandler;
}
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.startsWith('/api/')){
   const handler=await getApiHandler();
   await handler(req,res);return;
  }
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
  const body=await readFile(path);
  res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});
  res.end(req.method==='HEAD'?undefined:body);
 }catch(error){
  if(req.url.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:{code:'internal',detail:'Backend is not configured'}}));}
  else res.writeHead(404,{'Content-Type':'text/plain'}).end('Not found');
 }
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log(`Fish Aquarium listening on port ${process.env.PORT||3000}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
