import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

// Run against an isolated local memory backend by default. Remote account writes
// are opt-in; the original site's backend is never contacted by this suite.
const project=fileURLToPath(new URL('../',import.meta.url));
const external=Boolean(process.env.TEST_BASE_URL);
let base=process.env.TEST_BASE_URL;
let server;
let serverOutput='';
let browser;
let completed=0;
const problems={pageErrors:[],failedAssets:[],externalRequests:[]};
const models=new Set();
const loadedAssets=new Set();

async function check(name,run){
  if(process.env.TEST_FILTER&&!new RegExp(process.env.TEST_FILTER).test(name)){console.log(`UNRUN ${name}`);return;}
  console.log(`RUN ${name}`);
  try{await run();completed++;console.log(`PASS ${name}`);}
  catch(error){
    if(browser){
      const pages=browser.contexts().flatMap(ctx=>ctx.pages());
      const current=pages.at(-1);
      if(current){
        await current.screenshot({path:fileURLToPath(new URL('../test-results/failure.png',import.meta.url)),timeout:30000}).catch(()=>{});
        console.error('Visible panels:',await current.locator('.modal').evaluateAll(nodes=>nodes.map(node=>({classes:node.className,title:node.querySelector('h2')?.textContent,activeTab:node.querySelector('.tab.active')?.textContent}))).catch(()=>[]));
      }
    }
    error.message=`${name}: ${error.message}`;throw error;
  }
}

async function startServer(){
  const reservation=createServer();
  reservation.listen(0,'127.0.0.1');
  await once(reservation,'listening');
  const port=reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  server=spawn(process.execPath,['scripts/serve.mjs'],{
    cwd:project,
    env:{...process.env,PORT:String(port),NODE_ENV:'test',BACKEND_TEST_MODE:'1'},
    stdio:['ignore','pipe','pipe'],
  });
  server.stdout.on('data',data=>serverOutput=(serverOutput+data).slice(-3000));
  server.stderr.on('data',data=>serverOutput=(serverOutput+data).slice(-3000));
  base=`http://127.0.0.1:${port}`;
  for(let attempt=0;attempt<80;attempt++){
    if(server.exitCode!==null)throw new Error(`Test server exited: ${serverOutput}`);
    try{if((await fetch(base)).ok)return;}catch{}
    await delay(100);
  }
  throw new Error(`Test server did not start: ${serverOutput}`);
}

function proxyForRemote(){
  if(!external)return undefined;
  const value=process.env.HTTPS_PROXY||process.env.https_proxy;
  if(!value)return undefined;
  const proxy=new URL(value);
  return {server:`${proxy.protocol}//${proxy.host}`,
    ...(proxy.username?{username:decodeURIComponent(proxy.username)}:{}),
    ...(proxy.password?{password:decodeURIComponent(proxy.password)}:{})};
}

async function context(options={}){
  const ctx=await browser.newContext({locale:'en-US',viewport:{width:1120,height:760},deviceScaleFactor:.5,...options});
  await ctx.addInitScript(()=>{
    // newPage first creates an opaque about:blank document, where storage is
    // unavailable. Initialize preferences only once an app origin is loaded.
    if(!['http:','https:'].includes(location.protocol))return;
    // Software WebGL is deliberately tested at the supported low quality setting.
    if(!localStorage.getItem('aquaverse-prefs'))localStorage.setItem('aquaverse-prefs',JSON.stringify({quality:'low',tempo:'normal',plantSway:1,leftWide:false}));
    if(!localStorage.getItem('aquaverse.lang'))localStorage.setItem('aquaverse.lang','en');
  });
  await ctx.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.protocol==='data:'||url.protocol==='blob:'||url.origin===new URL(base).origin)return route.continue();
    problems.externalRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  ctx.on('page',page=>{
    page.setDefaultTimeout(60000);
    page.on('pageerror',error=>problems.pageErrors.push(error.message));
    page.on('response',response=>{
      const url=new URL(response.url());
      if(process.env.TEST_DEBUG&&url.pathname.startsWith('/api/'))console.log(`API ${response.request().method()} ${url.pathname} ${response.status()}`);
      if(url.origin!==new URL(base).origin||url.pathname.startsWith('/api/'))return;
      if(response.status()>=400)problems.failedAssets.push(`${response.status()} ${url.pathname}`);
      else{
        loadedAssets.add(url.pathname);
        if(url.pathname.endsWith('.glb'))models.add(url.pathname);
      }
    });
    page.on('requestfailed',request=>{
      const url=new URL(request.url());
      if(url.origin===new URL(base).origin&&!url.pathname.startsWith('/api/')&&request.failure()?.errorText!=='net::ERR_ABORTED'){
        problems.failedAssets.push(`${request.failure()?.errorText} ${url.pathname}`);
      }
    });
  });
  return ctx;
}

async function ready(page,path='/?moi=1&hocviec=0&hoithoai=0&luu=0'){
  await page.goto(new URL(path,base).href,{waitUntil:'domcontentloaded'});
  await page.locator('#root canvas').first().waitFor({state:'visible',timeout:60000});
  await page.waitForFunction(()=>!document.querySelector('.aq-boot:not(.is-done)'),undefined,{timeout:60000});
  await page.locator('.aq-boot').waitFor({state:'hidden',timeout:15000});
  assert.equal(await page.title(),'Aqualator');
  assert.ok(await page.locator('canvas').first().evaluate(canvas=>canvas.width>0&&canvas.height>0));
}

async function closeModal(page,selector='.modal'){
  const modal=page.locator(selector).last();
  await modal.locator('button.close').click();
  await modal.waitFor({state:'detached'});
}

async function openSettings(page){
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('.settings-modal').waitFor({state:'visible'});
}

async function feedOnce(page){
  const feed=page.locator('.tool').filter({hasText:/^Feed/});
  const before=Number(await feed.locator('.tool-count').innerText());
  await feed.click();
  // A full tank first asks for confirmation through a warning. A second user
  // click confirms feeding; check the inventory change rather than the toast.
  if(Number(await feed.locator('.tool-count').innerText())===before)await feed.click();
  await page.waitForFunction(previous=>Number(document.querySelector('[data-tour="feed"] .tool-count')?.textContent)<previous,before);
}

async function run(){
  if(!base)await startServer();
  base=base.replace(/\/$/,'');
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',proxy:proxyForRemote(),
    args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});

  const presets=await context();
  for(const design of ['cong-lua','tuyet-trang','lang-tuyet']){
    await check(`3D preset ${design}: local models and animation`,async()=>{
      const page=await presets.newPage();
      const previousModels=models.size;
      await ready(page,`/?moi=1&hoithoai=0&luu=0&bocuc=${design}`);
      await page.locator('.tool').filter({hasText:/^Feed/}).waitFor({state:'visible'});
      await page.waitForTimeout(500);
      assert.ok(models.size>previousModels||models.has('/models/betta.glb'),'Preset did not request its GLB fish models');
      const canvas=page.locator('#root canvas').first();
      const clip=await canvas.boundingBox();
      assert.ok(clip?.width>0&&clip?.height>0);
      // Page clipping avoids Playwright waiting for a continuously rendering
      // WebGL element to become "stable" before capturing it.
      const frame1=await page.screenshot({clip,timeout:30000});
      await page.waitForTimeout(650);
      const frame2=await page.screenshot({clip,timeout:30000});
      await writeFile(new URL(`../test-results/${design}.png`,import.meta.url),frame2);
      assert.ok(frame1.length>5000,'WebGL frame is unexpectedly empty');
      assert.notDeepEqual(frame1,frame2,'Fish/water/plant animation did not change the rendered frame');
      if(design==='cong-lua'){
        const feed=page.locator('.tool').filter({hasText:/^Feed/});
        const before=Number(await feed.locator('.tool-count').innerText());
        await feed.click();
        await page.waitForFunction(previous=>Number(document.querySelector('[data-tour="feed"] .tool-count')?.textContent)<previous,before);
      }
      await page.close();
    });
  }
  await presets.close();

  const ctx=await context();
  const page=await ctx.newPage();
  await ready(page);

  await check('Water testing: dip, match pads and record results',async()=>{
    await page.locator('.tool').filter({hasText:/^Water test/}).click();
    const modal=page.locator('.test-modal');
    await modal.getByRole('button',{name:'Dip the strip',exact:true}).click();
    await modal.locator('.swatch:not([disabled])').first().waitFor({state:'visible',timeout:15000});
    const rows=modal.locator('.pad-row');
    assert.ok(await rows.count()>=5,'Water test charts are missing');
    for(let index=0;index<await rows.count();index++)await rows.nth(index).locator('button.swatch').first().click();
    await modal.getByRole('button',{name:'Record results',exact:true}).click();
    await modal.locator('.advice-list').waitFor({state:'visible'});
    assert.ok(await modal.locator('.verdict').count()>=5);
    await modal.getByRole('button',{name:'Done',exact:true}).click();
    await modal.waitFor({state:'detached'});
  });

  await check('Inventory and equipment controls',async()=>{
    await page.locator('.tool').filter({hasText:/^Storage/}).click();
    const modal=page.locator('.modal');
    await modal.locator('.tabs .tab').filter({hasText:'Plants'}).click();
    assert.ok(await modal.locator('.stock-row,.shop-card').count()>0,'Starter plants are missing from Storage');
    await modal.locator('.tabs .tab').filter({hasText:'Rock & driftwood'}).click();
    assert.ok(await modal.locator('.shop-card').count()>0,'Starter hardscape is missing from Storage');
    await closeModal(page);
    await page.locator('.tool').filter({hasText:/^Equipment$/}).click();
    const panel=page.locator('.device-panel');
    await panel.waitFor({state:'visible'});
    assert.match(await panel.textContent(),/Timer|Light|Filter/);
    await panel.getByRole('radio',{name:'Off',exact:true}).click();
    assert.equal(await panel.getByRole('radio',{name:'Off',exact:true}).getAttribute('aria-checked'),'true');
    await panel.getByRole('radio',{name:'Timer',exact:true}).click();
    assert.equal(await panel.getByRole('radio',{name:'Timer',exact:true}).getAttribute('aria-checked'),'true');
    await panel.locator('button.close').click();
    await panel.waitFor({state:'detached'});
  });

  await check('Aquascape editing enters and exits',async()=>{
    await page.locator('.tool').filter({hasText:/^Aquascape$/}).click();
    await page.locator('.layout-banner').waitFor({state:'visible'});
    assert.match(await page.locator('.layout-banner').textContent(),/Aquascape mode/);
    assert.ok(await page.locator('.layout-dock .layout-row').count()>0);
    await page.locator('.layout-banner').getByRole('button',{name:'Done',exact:true}).click();
    await page.locator('.layout-banner').waitFor({state:'detached'});
  });

  await check('Puzzle Book: catalog and playable first level',async()=>{
    await page.locator('.tool').filter({hasText:/^Puzzle Book$/}).click();
    const modal=page.locator('.mg-modal');
    assert.ok(await modal.locator('.mg-card').count()>=5,'Puzzle catalog is incomplete');
    await modal.locator('.mg-card').first().click();
    await modal.locator('button.mg-level').first().waitFor({state:'visible'});
    await modal.locator('button.mg-level').first().click();
    assert.ok(await modal.locator('button').count()>3,'Puzzle board controls did not appear');
    await closeModal(page,'.mg-modal');
  });

  await check('Settings: language, graphics quality and audio persist',async()=>{
    await openSettings(page);
    const settings=page.locator('.settings-modal');
    await settings.getByRole('radio',{name:'Tiếng Việt',exact:true}).click();
    assert.equal(await page.locator('html').getAttribute('lang'),'vi');
    for(const language of ['中文','日本語']){
      await settings.getByRole('radio',{name:language,exact:true}).click();
      await page.waitForFunction(()=>['zh','ja'].includes(document.documentElement.lang));
      await page.evaluate(()=>document.fonts.ready);
    }
    await settings.getByRole('radio',{name:'English',exact:true}).click();
    await settings.getByRole('radio',{name:'High',exact:true}).click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aquaverse-prefs')).quality),'high');
    await settings.getByRole('radio',{name:'Low',exact:true}).click();
    await settings.locator('.settings-tab').filter({hasText:'Sound'}).click();
    const music=settings.getByRole('slider',{name:'Music',exact:true});
    await music.fill('31');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aqua.audio.v1')).music),0.31);
    const soundToggle=settings.getByRole('checkbox',{name:'Sound on',exact:true});
    await soundToggle.locator('..').click();
    assert.equal(await soundToggle.isChecked(),false);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aqua.audio.v1')).muted),true);
    await soundToggle.locator('..').click();
    assert.equal(await soundToggle.isChecked(),true);
    await settings.locator('.settings-tab').filter({hasText:'Controls'}).click();
    assert.match(await settings.locator('.shortcut-grid').textContent(),/F · W · T/);
    await closeModal(page,'.settings-modal');
  });

  // Account integration is isolated to the automatically started memory server.
  // TEST_ACCOUNT=1 also enables it against a deliberately selected test deployment.
  if(!external||process.env.TEST_ACCOUNT==='1')await check('Account UI registration, cloud save, logout/login and published snapshot visit',async()=>{
    // The exploratory page uses luu=0, intentionally disabling all snapshots.
    // Exercise accounts on a normal game with a persisted local snapshot.
    await ready(page,'/?hocviec=0&hoithoai=0');
    await feedOnce(page);
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('aquaverse-save')||'null')?.stats?.feeds>=1,undefined,{timeout:15000});
    console.log('Account step: local game persisted');
    const email=`frontend-${Date.now()}@example.invalid`;
    const password='FishAquarium-test-2026!';
    await openSettings(page);
    await page.locator('.settings-tab').filter({hasText:'Account & saves'}).click();
    await page.locator('.settings-modal').getByRole('button',{name:'Sign in',exact:true}).click();
    let account=page.locator('.account-modal');
    await account.getByRole('button',{name:'No account yet? Create one',exact:true}).click();
    await account.getByLabel('Display name',{exact:true}).fill('Frontend Test');
    await account.getByLabel('Email',{exact:true}).fill(email);
    await account.getByLabel('Password',{exact:true}).fill(password);
    const registerResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/register'&&response.request().method()==='POST');
    const firstCloudResponse=page.waitForResponse(response=>/\/api\/saves\/\d+$/.test(new URL(response.url()).pathname)&&response.request().method()==='PUT');
    await account.getByRole('button',{name:'Create account',exact:true}).click();
    assert.equal((await registerResponse).status(),201);
    assert.equal((await firstCloudResponse).status(),200,'Registration must upload the existing game snapshot');
    await account.waitFor({state:'detached'});
    console.log('Account step: registration and initial cloud upload passed');
    const previousFeeds=await page.evaluate(()=>JSON.parse(localStorage.getItem('aquaverse-save')).stats.feeds);
    await feedOnce(page);
    await page.waitForFunction(previous=>JSON.parse(localStorage.getItem('aquaverse-save')||'null')?.stats?.feeds>previous,previousFeeds,{timeout:15000});
    await openSettings(page);
    await page.locator('.settings-tab').filter({hasText:'Account & saves'}).click();
    assert.match(await page.locator('.settings-modal').textContent(),/Frontend Test/);
    await page.locator('.settings-modal').getByRole('button',{name:'Account',exact:true}).click();
    account=page.locator('.account-modal');
    const cloudResponse=page.waitForResponse(response=>/\/api\/saves\/\d+$/.test(new URL(response.url()).pathname)&&response.request().method()==='PUT');
    await account.getByRole('button',{name:'Save to cloud now',exact:true}).click();
    const upload=await cloudResponse;
    assert.equal(upload.status(),200);
    const cloudSnapshot=await ctx.request.get(upload.url());
    assert.equal(cloudSnapshot.status(),200);
    const restored=(await cloudSnapshot.json()).data;
    assert.equal(restored.version,2);
    assert.ok(restored.stats.feeds>previousFeeds,'Cloud storage must contain the game change made before manual save');
    console.log('Account step: manual cloud save passed');
    await account.getByRole('button',{name:'Sign out…',exact:true}).click();
    const logout=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/logout');
    await account.locator('.btn.primary').click();
    assert.equal((await logout).status(),204);
    await account.waitFor({state:'detached'});
    await openSettings(page);
    await page.locator('.settings-tab').filter({hasText:'Account & saves'}).click();
    await page.locator('.settings-modal').getByRole('button',{name:'Sign in',exact:true}).click();
    account=page.locator('.account-modal');
    await account.getByLabel('Email',{exact:true}).fill(email);
    await account.getByLabel('Password',{exact:true}).fill(password);
    const login=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/login');
    await account.getByRole('button',{name:'Sign in',exact:true}).click();
    assert.equal((await login).status(),200);
    await account.waitFor({state:'detached'});
    console.log('Account step: logout and login passed');
    await page.locator('.tool').filter({hasText:/^Visit$/}).click();
    const showcase=page.locator('.showcase-panel');
    await showcase.getByRole('tab',{name:'My tanks',exact:true}).click();
    const published=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/showcases/mine/main'&&response.request().method()==='PUT');
    await showcase.locator('.showcase-toggle input').first().check();
    const publication=await published;
    assert.equal(publication.status(),200,'Publishing the real game snapshot must succeed');
    const publishedCard=(await publication.json()).showcase;
    assert.ok(publishedCard.id);
    console.log('Account step: published game snapshot');
    const visitor=await ctx.newPage();
    await ready(visitor,`/?xem=${encodeURIComponent(publishedCard.id)}`);
    await visitor.locator('.visit-bar .visit-title').waitFor({state:'visible'});
    assert.equal(await visitor.locator('.visit-title').textContent(),publishedCard.title);
    assert.equal(await visitor.locator('.visit-error').count(),0,'The saved tank must render in visit mode');
    await visitor.close();
    await closeModal(page,'.showcase-panel');
  });

  await check('Shop: fish catalog, equipment and three design previews',async()=>{
    // The original catalog renders all species thumbnails synchronously. The
    // software WebGL renderer can need substantially longer than hardware GPUs.
    page.setDefaultTimeout(180000);
    await page.locator('.tool').filter({hasText:/^Shop$/}).click();
    const modal=page.locator('.shop-modal');
    if(process.env.TEST_DEBUG)console.log('Shop DOM:',await modal.evaluate(node=>({text:node.innerText.slice(0,1000),bounds:node.getBoundingClientRect().toJSON(),buttons:[...node.querySelectorAll('.tabs .tab')].map(button=>({text:button.textContent,role:button.getAttribute('role'),display:getComputedStyle(button).display,visibility:getComputedStyle(button).visibility,bounds:button.getBoundingClientRect().toJSON()}))})));
    await modal.locator('.tabs .tab').filter({hasText:/Fish & shrimp/}).click();
    await modal.locator('.shop-name').first().waitFor({state:'visible'});
    assert.ok(await modal.locator('.shop-name').count()>=40,'Fish catalog is incomplete');
    await modal.locator('.tabs .tab').filter({hasText:'Equipment'}).click();
    assert.ok(await modal.locator('.shop-card').count()>=5,'Equipment catalog is incomplete');
    await modal.locator('.tabs .tab').filter({hasText:'Tank designs'}).click();
    assert.equal(await modal.locator('.design-pick').count(),3);
    for(let index=0;index<3;index++){
      await modal.locator('.design-pick').nth(index).click();
      await page.waitForFunction(()=>[...document.querySelectorAll('.design-shop img')].every(img=>img.complete&&img.naturalWidth>0));
    }
    await closeModal(page);
    page.setDefaultTimeout(60000);
  });
  await ctx.close();

  await check('Local game and settings survive a normal reload',async()=>{
    const persistent=await context();
    const saved=await persistent.newPage();
    await ready(saved,'/?hocviec=0&hoithoai=0');
    await feedOnce(saved);
    await saved.waitForFunction(()=>JSON.parse(localStorage.getItem('aquaverse-save')||'null')?.stats?.feeds>=1,undefined,{timeout:15000});
    const before=await saved.evaluate(()=>JSON.parse(localStorage.getItem('aquaverse-save')));
    assert.equal(before.version,2);
    assert.ok(before.stats.feeds>=1);
    await saved.reload({waitUntil:'domcontentloaded'});
    await saved.locator('#root canvas').waitFor({state:'visible',timeout:60000});
    const after=await saved.evaluate(()=>JSON.parse(localStorage.getItem('aquaverse-save')));
    assert.equal(after.phase,before.phase);
    assert.ok(after.stats.feeds>=before.stats.feeds);
    await persistent.close();
  });

  await check('Mobile: responsive aquarium and touch controls',async()=>{
    const mobile=await context({viewport:{width:390,height:844},deviceScaleFactor:2.5,isMobile:true,hasTouch:true});
    const phone=await mobile.newPage();
    await ready(phone,'/?moi=1&hocviec=0&hoithoai=0&luu=0&perf=1');
    await phone.screenshot({path:fileURLToPath(new URL('../test-results/mobile.png',import.meta.url)),timeout:30000});
    assert.ok(await phone.locator('canvas').first().isVisible());
    assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'Mobile page overflows horizontally');
    await phone.getByRole('button',{name:'Settings',exact:true}).tap();
    await phone.locator('.settings-modal').waitFor({state:'visible'});
    // Exercise real mobile High mode, not only the persisted settings radio.
    await phone.locator('.settings-modal').getByRole('radio',{name:'High',exact:true}).click();
    await phone.waitForFunction(()=>JSON.parse(localStorage.getItem('aquaverse-prefs')||'{}').quality==='high');
    await phone.waitForTimeout(1200);
    const resolution = await phone.locator('#root canvas').first().evaluate(canvas=>canvas.width/canvas.getBoundingClientRect().width);
    assert.ok(resolution>=1.85&&resolution<=2.05,`Mobile High must preserve original sharp 2x DPR, got ${resolution}`);
    // Real deploy bundle must expose opt-in performance diagnosis on mobile High.
    const perf=phone.locator('#aquaverse-perf-hud');
    await perf.waitFor({state:'visible',timeout:12000});
    assert.match(await perf.textContent(),/High GPU Lite/);
    assert.match(await perf.textContent(),/triangles/);
    await phone.locator('.settings-modal').getByRole('button',{name:'Back to the tank',exact:true}).tap();
    await phone.locator('.settings-modal').waitFor({state:'detached'});
    await mobile.close();
  });

  await check('All requested assets stay local and load without browser errors',async()=>{
    assert.ok(models.size>=8,`Only ${models.size} GLB models were requested`);
    assert.ok(loadedAssets.has('/designs/cong-lua.jpg'));
    assert.ok(loadedAssets.has('/designs/tuyet-trang.jpg'));
    assert.ok(loadedAssets.has('/designs/lang-tuyet.jpg'));
    assert.deepEqual([...new Set(problems.failedAssets)],[]);
    assert.deepEqual([...new Set(problems.externalRequests)],[]);
    assert.deepEqual([...new Set(problems.pageErrors)],[]);
  });
  console.log(`Frontend passed: ${completed} checks, ${models.size} GLB models, ${loadedAssets.size} local resources.`);
}

try{await run();}
catch(error){console.error(error.stack||error);process.exitCode=1;}
finally{
  if(browser)await browser.close();
  if(server){server.kill('SIGTERM');await Promise.race([once(server,'exit'),delay(3000)]);if(server.exitCode===null)server.kill('SIGKILL');}
}
