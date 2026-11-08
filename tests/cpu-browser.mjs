import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {setTimeout as sleep} from 'node:timers/promises';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// Run identical scenarios against the PR #6 baseline and optimized branch.
// rAF frame p95 measures main-thread frame pacing; rendered FPS counts WebGL
// draw-bearing frames, not theoretical display refresh. Software GL is noisy.
const label=process.env.PERF_LABEL||'local';
const project=fileURLToPath(new URL('../',import.meta.url));
let server,base=process.env.TEST_BASE_URL;
async function localServer(){
  const reservation=createServer();
  reservation.listen(0,'127.0.0.1');
  await once(reservation,'listening');
  const port=reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  server=spawn(process.execPath,['scripts/serve.mjs'],{
    cwd:project,env:{...process.env,PORT:String(port),NODE_ENV:'test',BACKEND_TEST_MODE:'1'},
    stdio:'ignore'
  });
  base='http://127.0.0.1:'+port;
  for(let attempt=0;attempt<100;attempt++){
    if(server.exitCode!==null)throw new Error('Server exited '+server.exitCode);
    try{if((await fetch(base)).ok)return;}catch{}
    await sleep(150);
  }
  throw new Error('Server did not start');
}
const p95=xs=>xs.length?xs.slice().sort((a,b)=>a-b)[Math.max(0,Math.ceil(xs.length*.95)-1)]:null;
const round=n=>Math.round(n*10)/10;
let browser;
try{
  if(!base)await localServer();
  browser=await chromium.launch({headless:true,
    executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),
    args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await ctx.addInitScript(()=>{
    if(['http:','https:'].includes(location.protocol)){
      localStorage.setItem('aquaverse-prefs',JSON.stringify({quality:'high',tempo:'normal',plantSway:1,leftWide:false}));
      localStorage.setItem('aquaverse.lang','en');
    }
    const metrics=window.__aqWebGL={drawCalls:0,texturesCreated:0,texturesDeleted:0,buffersCreated:0,buffersDeleted:0};
    for(const Type of [window.WebGLRenderingContext,window.WebGL2RenderingContext]){
      if(!Type)continue;
      for(const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced',
        'createTexture','deleteTexture','createBuffer','deleteBuffer']){
        if(!Object.hasOwn(Type.prototype,method))continue;
        const original=Type.prototype[method];
        if(typeof original!=='function')continue;
        Object.defineProperty(Type.prototype,method,{configurable:true,writable:true,
          value:function(...args){
            if(method.startsWith('draw'))metrics.drawCalls++;
            else if(method==='createTexture')metrics.texturesCreated++;
            else if(method==='deleteTexture')metrics.texturesDeleted++;
            else if(method==='createBuffer')metrics.buffersCreated++;
            else if(method==='deleteBuffer')metrics.buffersDeleted++;
            return original.apply(this,args);
          }});
      }
    }
  });
  const page=await ctx.newPage();
  page.setDefaultTimeout(180000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('/?moi=1&hoithoai=0&luu=0&bocuc=cong-lua',base).href,{waitUntil:'domcontentloaded'});
  await page.locator('#root canvas').first().waitFor({state:'visible'});
  await page.locator('.aq-boot').waitFor({state:'detached',timeout:180000});
  await page.waitForTimeout(500);
  async function measure(scenario,ms){
    return await page.evaluate(async ({scenario,ms})=>{
      const pct=xs=>xs.length?xs.slice().sort((a,b)=>a-b)[Math.max(0,Math.ceil(xs.length*.95)-1)]:null;
      const rnd=n=>Math.round(n*10)/10;
      const pacing=[],rendered=[],longTasks=[];
      const start=performance.now(),initial=window.__aqWebGL.drawCalls;
      let previous=start,previousDraw=initial;
      const obs=PerformanceObserver.supportedEntryTypes?.includes('longtask')
        ?new PerformanceObserver(list=>{for(const t of list.getEntries())if(t.startTime>=start)longTasks.push(t.duration)})
        :null;
      obs?.observe({type:'longtask'});
      await new Promise(resolve=>{
        function frame(now){
          const dt=now-previous;if(dt>0)pacing.push(dt);
          if(window.__aqWebGL.drawCalls>previousDraw)rendered.push(now);
          previousDraw=window.__aqWebGL.drawCalls;
          previous=now;
          if(now-start<ms)requestAnimationFrame(frame);else resolve();
        }
        requestAnimationFrame(frame);
      });
      obs?.disconnect();
      const elapsed=performance.now()-start;
      const r=window.__aqPerfSnapshot?.()??null;
      return {scenario,elapsedMs:Math.round(elapsed),
        renderedFps:rnd(rendered.length*1000/elapsed),renderedFrames:rendered.length,
        frameTimeP95Ms:pct(pacing),frameTimeAverageMs:rnd(pacing.reduce((a,b)=>a+b,0)/Math.max(1,pacing.length)),
        rafSamples:pacing.length,
        longTasks:longTasks.length,longTaskP95Ms:pct(longTasks),
        longTaskBlockingMs:Math.round(longTasks.reduce((a,b)=>a+Math.max(0,b-50),0)),
        webglDrawCalls:window.__aqWebGL.drawCalls-initial,
        rendererInfoMemory:r?{geometries:r.geometries,textures:r.textures,programs:r.programs,drawCalls:r.drawCalls}:null,
        cache:r?{shopThumbnails:r.shopThumbnails,glb:r.glbCache,texture:r.textureCache,fishVariants:r.fishVariants}:null,
        webglLive:{textures:window.__aqWebGL.texturesCreated-window.__aqWebGL.texturesDeleted,
          buffers:window.__aqWebGL.buffersCreated-window.__aqWebGL.buffersDeleted}};
    },{scenario,ms});
  }
  const aquarium=await measure('mobile-high-aquarium',6000);
  await page.locator('.tool').filter({hasText:/^Shop$/}).click();
  await page.locator('.shop-modal').waitFor({state:'visible'});
  await page.locator('.shop-modal .tabs .tab').filter({hasText:/Fish & shrimp/}).click();
  const shop=await measure('mobile-high-shop',6000);
  await page.locator('.shop-modal button.close').click();
  await page.locator('.shop-modal').waitFor({state:'detached'});
  await page.waitForTimeout(300);
  const afterClose=await measure('mobile-high-after-shop-close',3000);
  assert.equal(errors.length,0,'JS errors: '+errors.join('; '));
  const results={label,viewport:'390x844',quality:'high',deviceScaleFactor:2,renderer:'Chromium software WebGL',
    metrics:[aquarium,shop,afterClose]};
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  await writeFile(new URL('../test-results/cpu-benchmark-'+label+'.json',import.meta.url),JSON.stringify(results,null,2));
  console.log('AQUARIUM CPU BENCHMARK '+JSON.stringify(results));
  await ctx.close();
}catch(error){console.error(error.stack||error);process.exitCode=1;}
finally{
  if(browser)await browser.close();
  if(server){server.kill('SIGTERM');await Promise.race([once(server,'exit'),sleep(3000)]);if(server.exitCode===null)server.kill('SIGKILL');}
}
