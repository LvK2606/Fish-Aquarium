import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium} from 'playwright';

// The exact same software Chromium runtime is used to compare both builds.
// rAF cadence is a browser-visible frame-pacing proxy, NOT a GPU timer or
// proof of actual Android hardware FPS.
const current=process.cwd();
const baseline=join(current,'baseline');
assert.ok(existsSync(join(baseline,'public/index.html')),'Checkout baseline into ./baseline before benchmarking');
const resultsDir=join(current,'test-results');
await mkdir(resultsDir,{recursive:true});
const browser=await chromium.launch({
  headless:true,
  executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),
  args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader'],
});
const samples={baseline:[],optimized:[]};
const percentile=(a,p)=>a.length?a[Math.min(a.length-1,Math.ceil(p*a.length)-1)]:null;
const median=a=>percentile([...a].sort((x,y)=>x-y),.5);
async function startServer(root){
  const listener=createServer();
  listener.listen(0,'127.0.0.1');
  await once(listener,'listening');
  const port=listener.address().port;
  await new Promise(resolve=>listener.close(resolve));
  const server=spawn(process.execPath,['scripts/serve.mjs'],{
    cwd:root,env:{...process.env,PORT:String(port),NODE_ENV:'test',BACKEND_TEST_MODE:'1'},
    stdio:['ignore','pipe','pipe']
  });
  let output='';
  server.stdout.on('data',b=>output=(output+b).slice(-2500));
  server.stderr.on('data',b=>output=(output+b).slice(-2500));
  const url='http://127.0.0.1:'+port;
  for(let k=0;k<100;k++){
    if(server.exitCode!==null)throw new Error('Server exited: '+output);
    try{if((await fetch(url)).ok)return {server,url};}catch{}
    await sleep(120);
  }
  throw new Error('Server timeout: '+output);
}
async function take(label,root,index){
  const running=await startServer(root);
  const errors=[];
  const context=await browser.newContext({
    locale:'en-US',viewport:{width:390,height:844},
    isMobile:true,hasTouch:true,deviceScaleFactor:3,
    reducedMotion:'no-preference'
  });
  await context.addInitScript(()=>{
    if(location.protocol==='http:'||location.protocol==='https:'){
      localStorage.setItem('aquaverse-prefs',JSON.stringify({
        quality:'high',tempo:'normal',plantSway:1,leftWide:false
      }));
      localStorage.setItem('aquaverse.lang','en');
    }
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{
    if(msg.type()==='error'&&/(WebGLProgram|Shader Error|ERROR:\s*0:|VALIDATE_STATUS)/i.test(msg.text())){
      errors.push('GLSL compile: '+msg.text().slice(0,400));
    }
  });
  try{
    await page.goto(running.url+'/?moi=1&hocviec=0&hoithoai=0&luu=0&bocuc=cong-lua',{waitUntil:'domcontentloaded',timeout:90000});
    await page.locator('#root canvas').first().waitFor({state:'visible',timeout:90000});
    await page.waitForFunction(()=>!document.querySelector('.aq-boot:not(.is-done)'),undefined,{timeout:90000});
    await page.waitForTimeout(2000);
    const measurement=await page.evaluate(async()=>{
      const canvas=document.querySelector('#root canvas');
      const dpr=canvas.width/canvas.getBoundingClientRect().width;
      const longTasks=[];
      let obs;
      if(PerformanceObserver.supportedEntryTypes?.includes('longtask')){
        obs=new PerformanceObserver(list=>{
          for(const t of list.getEntries())longTasks.push(t.duration);
        });
        obs.observe({type:'longtask'});
      }
      const started=performance.now();
      const times=[];
      await new Promise(resolve=>{
        function step(now){
          times.push(now);
          if(now-started<10000)requestAnimationFrame(step);else resolve();
        }
        requestAnimationFrame(step);
      });
      obs?.disconnect();
      const gaps=times.slice(1).map((t,i)=>t-times[i]).sort((a,b)=>a-b);
      const span=times.at(-1)-times[0];
      const p=p=>gaps.length?gaps[Math.min(gaps.length-1,Math.ceil(p*gaps.length)-1)]:null;
      return {
        viewport:{width:390,height:844},
        requestedQuality:JSON.parse(localStorage.getItem('aquaverse-prefs')).quality,
        deviceScaleFactor:window.devicePixelRatio,
        actualRenderDpr:dpr,
        sampleMs:Math.round(span),
        rafFrames:times.length,
        rafFps:span>0?Math.round((times.length-1)*10000/span)/10:0,
        frameGapP50Ms:p(.5),frameGapP95Ms:p(.95),
        frameGapMaxMs:gaps.at(-1)||null,
        gapsOver33Ms:gaps.filter(v=>v>33.33).length,
        longTaskCount:longTasks.length
      };
    });
    await page.screenshot({path:join(resultsDir,label+'-'+index+'.png'),timeout:60000}).catch(()=>{});
    assert.equal(measurement.requestedQuality,'high');
    assert.ok(measurement.actualRenderDpr>=.95&&measurement.actualRenderDpr<=1.56,'DPR should be bounded on mobile');
    assert.ok(measurement.rafFrames>1,'No animation frames sampled');
    if(errors.length)throw new Error('Browser JS errors: '+errors.slice(0,5).join('; '));
    samples[label].push(measurement);
    console.log('FPS_SAMPLE '+label+' #'+index+' '+JSON.stringify(measurement));
  }finally{
    await context.close().catch(()=>{});
    running.server.kill('SIGTERM');
    await Promise.race([once(running.server,'exit').catch(()=>{}),sleep(3000)]);
    if(running.server.exitCode===null)running.server.kill('SIGKILL');
  }
}
try{
  // Alternate within the same CI runner to minimize order/thermal bias.
  for(let i=1;i<=3;i++){
    await take('baseline',baseline,i);
    await take('optimized',current,i);
  }
  const before=median(samples.baseline.map(s=>s.rafFps));
  const after=median(samples.optimized.map(s=>s.rafFps));
  const report={
    label:'390x844 mobile High, deviceScaleFactor=3, software WebGL',
    measurement:'requestAnimationFrame pacing FPS (not direct GPU present FPS)',
    browser:'Chromium / SwiftShader',
    baselineSha:'83c920e1295429e2f6d46bfd06f5680f31abebd3',
    beforeMedianRafFps:before,
    afterMedianRafFps:after,
    deltaPercent:before>0?Math.round((after/before-1)*1000)/10:null,
    baseline:samples.baseline,optimized:samples.optimized
  };
  await writeFile(join(resultsDir,'mobile-high-fps.json'),JSON.stringify(report,null,2));
  console.log('FPS_COMPARISON '+JSON.stringify({
    beforeMedianRafFps:before,afterMedianRafFps:after,deltaPercent:report.deltaPercent
  }));
}finally{
  await browser.close();
}
