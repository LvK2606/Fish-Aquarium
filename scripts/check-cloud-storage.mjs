import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {del} from '@vercel/blob';
import {createBlobStore,StorageConflict} from '../server/storage.js';
import {createHandler} from '../server/handler.js';

// This runs inside the Vercel build, where the project's Blob binding exists.
// It uses a unique disposable object and never modifies application/user data.
assert(process.env.BLOB_READ_WRITE_TOKEN,'Missing private Blob binding');
assert(process.env.AUTH_SECRET?.length>=32,'Missing authentication secret');
const pathname=`deployment-checks/${randomUUID()}.json`;
const store=createBlobStore({pathname});
async function request(handler,method,path,body,cookie){
 const text=body===undefined?'':JSON.stringify(body);
 const req=Readable.from(text?[Buffer.from(text)]:[]);
 Object.assign(req,{method,url:`/api${path}`,headers:{host:'storage-check.internal',origin:'https://storage-check.internal','content-type':'application/json','content-length':String(Buffer.byteLength(text)),...(cookie?{cookie}:{})}});
 const headers={};let output='';
 const res={statusCode:200,setHeader(name,value){headers[name.toLowerCase()]=value;},end(value){output=value?.toString()||'';}};
 await handler(req,res);
 return{status:res.statusCode,headers,body:output?JSON.parse(output):null};
}
let wrote=false;
try{
 const initial=await store.read();assert.equal(initial.etag,null);
 initial.state.probe=randomUUID();
 await store.write(initial.state,null);wrote=true;
 const current=await createBlobStore({pathname}).read();
 assert.equal(current.state.probe,initial.state.probe);assert(current.etag);
 const concurrent=await Promise.allSettled([
  store.write({...current.state,probe:'first'},current.etag),
  store.write({...current.state,probe:'second'},current.etag),
 ]);
 assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1,'Only one concurrent write may win');
 assert(concurrent.some(result=>result.status==='rejected'&&result.reason instanceof StorageConflict),'Stale ETag must conflict');

 const options={store,secret:process.env.AUTH_SECRET,email:{configured:false},secureCookies:true};
 const handler=createHandler(options);
 const registered=await request(handler,'POST','/auth/register',{email:`build-${randomUUID()}@example.invalid`,displayName:'Deployment Check',password:randomBytes(24).toString('base64url')});
 assert.equal(registered.status,201,'Account creation must work with real storage');
 const cookie=registered.headers['set-cookie']?.split(';')[0];assert(cookie);
 const save=await request(handler,'PUT','/saves/0',{version:2,baseRevision:0,clientSavedAt:Date.now(),data:{checkpoint:'persistent'}},cookie);
 assert.equal(save.status,200,'Cloud save must persist');
 const cold=createHandler({...options,store:createBlobStore({pathname})});
 const restored=await request(cold,'GET','/saves/0',undefined,cookie);
 assert.equal(restored.status,200);assert.equal(restored.body.data.checkpoint,'persistent');
 const stale=await request(cold,'PUT','/saves/0',{version:2,baseRevision:0,clientSavedAt:Date.now(),data:{checkpoint:'stale'}},cookie);
 assert.equal(stale.status,409,'Stale saves must not overwrite current data');
 console.log('CLOUD STORAGE CHECK PASSED: private persistence, concurrent ETag writes, account sessions and save/reload/conflict.');
}finally{
 if(wrote)await del(pathname,{token:process.env.BLOB_READ_WRITE_TOKEN});
 console.log('Disposable deployment-check object removed.');
}
