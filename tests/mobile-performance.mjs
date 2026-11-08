/**
 * 30-second mobile High telemetry, without asserting a hardware-specific FPS.
 * Chromium + SwiftShader cannot predict real Android GPU performance.
 * Run after "npm run build" with SERVE_DEPLOY_OUTPUT=1.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const repo=new URL('../',import.meta.url);
let server=null,browser=null;
async function freePort(){
  const s=createServer();
  s.listen(0,'127.0.0.1');await once(s,'listening');
  const port=s.address().port;await new Promise(done=>s.close(done));return port;
}
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function start(){
  if(process.env.PERF_BASE_URL)return process.env.PERF_BASE_URL;
  const port=await freePort();
  server=spawn(process.execPath,['scripts/serve.mjs'],{
    cwd:new URL('../',import.meta.url).pathname,
    env:{...process.env,PORT:String(port),NODE_ENV:'test',BACKEND_TEST_MODE:'1',SERVE_DEPLOY_OUTPUT:'1'},
    stdio:'ignore'
  });
  const url='http://127.0.0.1:'+port;
  for(let i=0;i<100;i++){
    try{if((await fetch(url)).ok)return url}catch{}
    await sleep(100);
  }
  throw new Error('Local preview server did not start');
}
function parse(s){
  const pick=re=>Number(s.match(re)?.[1]??NaN);
  return {fps:pick(/FPS (\d+)/),dpr:pick(/DPR ([\d.]+)/),calls:pick(/calls (\d+)/),
    triangles:pick(/triangles (\d+)/),geometries:pick(/geo (\d+)/),textures:pick(/tex (\d+)/)};
}
async function run(){
  const base=await start();
  browser=await chromium.launch({
    headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,
    args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']
  });
  const context=await browser.newContext({
    viewport:{width:390,height:844},deviceScaleFactor:2.5,isMobile:true,hasTouch:true
  });
  await context.addInitScript(()=>{
    if(location.protocol==='http:'||location.protocol==='https:'){
      localStorage.setItem('aquaverse-prefs',JSON.stringify({quality:'high',tempo:'normal',plantSway:1,leftWide:false}));
    }
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(base+'/?moi=1&hocviec=0&hoithoai=0&luu=0&perf=1',{waitUntil:'domcontentloaded'});
  const hud=page.locator('#aquaverse-perf-hud');
  await hud.waitFor({state:'visible',timeout:60000});
  await page.waitForTimeout(2500);
  const samples=[];
  for(let i=0;i<60;i++){
    const metrics=parse(await hud.textContent());
    if(Number.isFinite(metrics.fps)&&metrics.fps>0)samples.push(metrics);
    await page.waitForTimeout(500);
  }
  assert.ok(samples.length>=15,'Insufficient performance samples collected');
  const avg=key=>samples.reduce((n,v)=>n+v[key],0)/samples.length;
  const report={
    mode:'mobile High (Chromium software renderer)',
    durationSeconds:30,samples:samples.length,
    averageFps:Number(avg('fps').toFixed(1)),
    minimumWindowFps:Math.min(...samples.map(s=>s.fps)),
    averageDpr:Number(avg('dpr').toFixed(2)),
    minimumDpr:Math.min(...samples.map(s=>s.dpr)),
    maximumDpr:Math.max(...samples.map(s=>s.dpr)),
    finalDrawCalls:samples.at(-1).calls,
    finalTriangles:samples.at(-1).triangles,
    beforeShop:{geometries:samples.at(-1).geometries,textures:samples.at(-1).textures},
    runtimeErrors:errors,
    caveat:'These are software-rendered Chromium estimates, not a real Android FPS guarantee.'
  };
  for(let i=0;i<2;i++){
    await page.locator('.tool').filter({hasText:/^Shop$/}).click();
    await page.locator('.shop-modal').waitFor({state:'visible',timeout:30000});
    await page.waitForTimeout(1000);
    await page.locator('.shop-modal button.close').click();
    await page.locator('.shop-modal').waitFor({state:'detached',timeout:30000});
  }
  report.afterShop=parse(await hud.textContent());
  assert.deepEqual(errors,[],'No JavaScript page errors during benchmark and repeated Shop visits');
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  await writeFile(new URL('../test-results/mobile-performance.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  await context.close();
}
try{await run()}finally{await browser?.close();server?.kill('SIGTERM')}
