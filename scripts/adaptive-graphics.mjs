/**
 * Aqualator High "sharp first" mobile adaptation.
 * Original assets and the source JS under public/ are not modified.
 * Applied only to the content-fingerprinted dist/ JS output.
 * Build fails closed if a minified source anchor differs.
 */
export function createInteractionGovernor({
  max=1.8,min=1,windowMs=650,slowBelow=47,
  fastAbove=57,downStep=.2,upStep=.1,
  settleMs=1100,dragThreshold=10
}={}) {
  const ceiling=Math.max(1,Math.min(2,Number.isFinite(max)?max:1.8));
  const floor=Math.max(1,Math.min(ceiling,Number.isFinite(min)?min:1));
  let dpr=ceiling,start=null,last=null,frames=0,fps=null;
  let slowWindows=0,fastWindows=0,lastChange=-Infinity;
  let pointer=null,dragging=false;
  const resetWindow=now=>{start=now;last=now;frames=0;slowWindows=0;fastWindows=0;fps=null};
  return {
    getDpr(){return dpr},
    getFps(){return fps},
    isDragging(){return dragging},
    reset(now=0){resetWindow(now)},
    sample(now){
      if(!Number.isFinite(now))return null;
      // Tab switches and paused frames must not be interpreted as overload.
      if(last!==null&&(now-last>750||now<=last))resetWindow(now);
      if(start===null)start=now;
      last=now;
      frames++;
      const elapsed=now-start;
      if(elapsed<windowMs)return null;
      fps=Math.max(0,(frames-1)*1000/Math.max(1,elapsed));
      start=now;frames=1;
      slowWindows=fps<slowBelow?slowWindows+1:0;
      fastWindows=fps>fastAbove?fastWindows+1:0;
      if(now-lastChange<settleMs)return null;
      if(slowWindows>=2&&dpr>floor){
        dpr=Math.max(floor,Math.round((dpr-downStep)*100)/100);
        lastChange=now;slowWindows=fastWindows=0;return dpr;
      }
      if(fastWindows>=3&&dpr<ceiling){
        dpr=Math.min(ceiling,Math.round((dpr+upStep)*100)/100);
        lastChange=now;slowWindows=fastWindows=0;return dpr;
      }
      return null;
    },
    pointerDown(x,y){if(Number.isFinite(x)&&Number.isFinite(y))pointer={x,y};dragging=false},
    pointerMove(x,y){
      if(pointer&&Number.isFinite(x)&&Number.isFinite(y)
        &&Math.hypot(x-pointer.x,y-pointer.y)>=dragThreshold)dragging=true;
      return null;
    },
    pointerUp(){pointer=null;dragging=false;return null}
  };
}

export function createRenderCadence({ idleHz = 30, activeHz = 60, overlayHz = 10 } = {}) {
  let last = -Infinity;
  return {
    reset() { last = -Infinity; },
    shouldRender(now, active, overlay = false) {
      if (!Number.isFinite(now)) return false;
      const hz = active ? activeHz : overlay ? overlayHz : idleHz;
      if (!Number.isFinite(hz) || hz <= 0) return false;
      const interval = 1000 / hz;
      if (now < last) last = -Infinity;
      if (now - last + 0.75 < interval) return false;
      last = now;
      return true;
    },
  };
}

export function mobileLeafSegments({ count, mobile, low }) {
  if (low) return 4;
  // Preserve every leaf and original material; only reduce curve tessellation
  // by 20% on mobile tanks dense enough to justify it.
  return mobile && count >= 600 ? 8 : 10;
}

function replaceExactlyOnce(source, before, after, reason) {
  const index = source.indexOf(before);
  if (index < 0 || source.indexOf(before, index + before.length) !== -1)
    throw new Error('High Adaptive sharp-first patch anchor missing or ambiguous: ' + reason);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

const browserRuntime = `
const __aquaverseMakeInteractionGovernor = ${createInteractionGovernor.toString()};
const __aquaverseMakeRenderCadence = ${createRenderCadence.toString()};
const __aquaverseMobileLeafSegments = ${mobileLeafSegments.toString()};
function __aquaverseMobile(){
  if(typeof window==="undefined")return false;
  try{
    const coarse=window.matchMedia&&window.matchMedia("(pointer: coarse)").matches;
    const ua=typeof navigator!=="undefined"?navigator.userAgent:"";
    return Boolean(coarse||/Android|iPhone|iPad|Mobile/i.test(ua));
  }catch{return false}
}
function __aquaverseForceEffects(){return typeof location!=="undefined"&&new URLSearchParams(location.search).get("effects")==="on"}
function __aquaverseInitialDpr(){
  const native=Math.max(1,typeof window==="undefined"?2:window.devicePixelRatio||1);
  const limited=typeof navigator!=="undefined"&&(navigator.deviceMemory&&navigator.deviceMemory<=4||
    navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)?1.5:1.8;
  return Math.max(1,Math.min(native,limited));
}
function __AquaverseSharpInteraction(){
  const renderer=zi(s=>s.gl),setDpr=zi(s=>s.setDpr),invalidate=zi(s=>s.invalidate);
  const full=__aquaverseInitialDpr();
  const governor=B.useMemo(()=>__aquaverseMakeInteractionGovernor({max:full,min:Math.min(full,1)}),[full]);
  B.useEffect(()=>{
    if(Math.abs(renderer.getPixelRatio()-full)>.02)setDpr(full);
    const canvas=renderer.domElement;
    if(!canvas)return;
    let restore=0;
    const onDown=e=>{
      if(e.isPrimary===false)return;
      if(restore)cancelAnimationFrame(restore);
      governor.pointerDown(e.clientX,e.clientY);
      // Avoid state/renderer reconfiguration on taps already at full DPR.
      if(Math.abs(renderer.getPixelRatio()-governor.getDpr())>.02)setDpr(governor.getDpr());
      invalidate();
    };
    const onMove=e=>{
      if(e.isPrimary===false)return;
      const next=governor.pointerMove(e.clientX,e.clientY);
      if(next!==null)setDpr(next);
      if(governor.isDragging())invalidate();
    };
    const onUp=()=>{governor.pointerUp();invalidate()};
    canvas.addEventListener("pointerdown",onDown,{passive:true});
    window.addEventListener("pointermove",onMove,{passive:true});
    window.addEventListener("pointerup",onUp,{passive:true});
    window.addEventListener("pointercancel",onUp,{passive:true});
    window.addEventListener("blur",onUp);
    return ()=>{
      canvas.removeEventListener("pointerdown",onDown);
      window.removeEventListener("pointermove",onMove);
      window.removeEventListener("pointerup",onUp);
      window.removeEventListener("pointercancel",onUp);
      window.removeEventListener("blur",onUp);
      if(restore)cancelAnimationFrame(restore);
    };
  },[renderer,setDpr,full,governor,invalidate]);
  // Target 60 fps while visible; let DPR adapt down and recover gradually.
  // Throttle only frames fully obscured by an open modal.
  B.useEffect(()=>{
    const cadence=__aquaverseMakeRenderCadence({idleHz:60,activeHz:60,overlayHz:12});
    let raf=0;
    const frame=now=>{
      if(document.visibilityState==="visible"){
        const overlay=!!document.querySelector(".settings-modal,.device-panel,.modal-layer,.account-modal,.shop-modal");
        if(cadence.shouldRender(now,governor.isDragging(),overlay))invalidate();
      }else cadence.reset();
      raf=requestAnimationFrame(frame);
    };
    raf=requestAnimationFrame(frame);
    return()=>cancelAnimationFrame(raf);
  },[invalidate,governor]);
  On(()=>{
    if(typeof document!=="undefined"&&document.visibilityState!=="visible"){governor.reset(performance.now());return}
    const next=governor.sample(performance.now());
    if(next!==null)setDpr(next);
  });
  // Optional diagnostics: ?perf=1 (no overlay/timer in normal mode).
  B.useEffect(()=>{
    if(typeof location==="undefined"||!new URLSearchParams(location.search).has("perf"))return;
    const panel=document.createElement("aside");
    panel.id="aquaverse-perf-hud";
    panel.setAttribute("aria-label","Aquarium performance");
    Object.assign(panel.style,{position:"fixed",top:"8px",left:"8px",zIndex:"2147483645",
      background:"rgba(8,20,28,.82)",color:"#d9fff1",padding:"7px 9px",
      borderRadius:"7px",font:"12px/1.4 monospace",pointerEvents:"none"});
    document.body.appendChild(panel);
    const update=()=>{
      const info=renderer.info.render,rate=governor.getFps(),mem=renderer.info.memory;
      panel.textContent="High Adaptive | DPR "+renderer.getPixelRatio().toFixed(2)+
        " | FPS "+(rate===null?"--":Math.round(rate))+
        " | calls "+info.calls+" | triangles "+info.triangles+" | geo "+mem.geometries+" tex "+mem.textures+
        " | "+(governor.isDragging()?"drag":"idle");
    };
    update();
    const timer=setInterval(update,800);
    return()=>{clearInterval(timer);panel.remove()};
  },[renderer,governor]);
  return null;
}
`;

export function patchAquariumBundle(source) {
  if (typeof source !== 'string' || source.length < 100000)
    throw new Error('Expected complete source-verified Aqualator JavaScript bundle');
  let result = replaceExactlyOnce(source,
    'function U4e({parked:t=!1})',
    browserRuntime + 'function U4e({parked:t=!1})',
    'main aquarium renderer');
  result = replaceExactlyOnce(result,
    'dpr:i?1:[1,2],frameloop:t?',
    'dpr:i?1:__aquaverseMobile()?__aquaverseInitialDpr():[1,2],frameloop:t?',
    'crisp original DPR on mobile High');
  result = replaceExactlyOnce(result,
    'frameloop:t?"never":c?"demand":"always"',
    'frameloop:t?"never":!i&&__aquaverseMobile()?"demand":c?"demand":"always"',
    'mobile High demand rendering rather than 60fps busy loop');
  result = replaceExactlyOnce(result,
    'children:[u.jsx("color",{attach:"background",args:["#0b0f24"]}),u.jsx(z4e,{})',
    'children:[u.jsx("color",{attach:"background",args:["#0b0f24"]}),!i&&__aquaverseMobile()&&u.jsx(__AquaverseSharpInteraction,{}),u.jsx(z4e,{})',
    'gesture-aware controller inside main Canvas');
  result = replaceExactlyOnce(result,
    'enableDamping:!0,dampingFactor:.08,onStart:()=>{p.current=null}',
    'enableDamping:!__aquaverseMobile(),dampingFactor:.08,onStart:()=>{p.current=null}',
    'remove mobile touch inertia');
  result = replaceExactlyOnce(result,
    'f.pointer.set((d.clientX-p.left)/p.width*2-1,-((d.clientY-p.top)/p.height)*2+1),f.raycaster.setFromCamera(f.pointer,f.camera)',
    'f.pointer.set((d.clientX-p.left)/p.width*2-1,-((d.clientY-p.top)/p.height)*2+1),f.raycaster.layers.set(__aquaverseMobile()&&d.type==="pointermove"&&d.pointerType==="touch"&&!F.getState().layoutMode&&!F.getState().dragPreview?31:0),f.raycaster.setFromCamera(f.pointer,f.camera)',
    'avoid costly hover raycasts while finger drags the tank, keep tap/edit picking');
  result = replaceExactlyOnce(result,
    'multisampling:4,children:[u.jsx(G0e,{mipmapBlur:!0,luminanceThreshold:.92,luminanceSmoothing:.3,intensity:.6,radius:.8})',
    'multisampling:__aquaverseMobile()?0:4,children:[u.jsx(G0e,{mipmapBlur:!0,luminanceThreshold:.92,luminanceSmoothing:.3,intensity:.6,radius:.8,levels:__aquaverseMobile()?4:8,resolutionScale:__aquaverseMobile()?.3:.5})',
    'lighter bloom without texture blur; full desktop High preserved');
  result = replaceExactlyOnce(result,
    'new Jr(1,1,1,a?3:6)',
    'new Jr(1,1,1,a?3:__aquaverseMobile()&&t.position[2]<-.15?4:6)',
    'static far-side moss strand geometry only, no foliage deletion or redraw');
  result = replaceExactlyOnce(result,
    'const x=new Jr(1,1,2,d?4:10);x.translate(0,.5,0);const k=f.length',
    'const x=new Jr(1,1,2,__aquaverseMobileLeafSegments({count:f.length,mobile:__aquaverseMobile(),low:d}));x.translate(0,.5,0);const k=f.length',
    'reduce subdivision only for very dense mobile plant scenes');
  result = replaceExactlyOnce(result,
    'function F4e(){const t=zi(n=>n.invalidate),e=F(n=>n.ambient);return B.useEffect(()=>{if(!e)return;const n=window.setInterval(()=>t(),1e3/30);return()=>window.clearInterval(n)},[e,t]),null}',
    'function F4e(){const t=zi(n=>n.invalidate),e=F(n=>n.ambient),i=Qa(n=>n.quality==="low");return B.useEffect(()=>{if(!e||(!i&&__aquaverseMobile()))return;const n=window.setInterval(()=>{if(document.visibilityState==="visible")t()},1e3/30);return()=>window.clearInterval(n)},[e,t,i]),null}',
    'no rendering work while the document is hidden');
  result = replaceExactlyOnce(result,
    "const Gz=`\n  uniform float uTime;",
    "const Gz=__aquaverseMobile()?\"\\n  uniform float uTime;\\n  uniform float uCaustics;\\n  uniform float uLamp;\\n  vec2 hash22(vec2 p) {\\n    vec3 q=fract(vec3(p.xyx)*vec3(0.1031,0.103,0.0973));\\n    q+=dot(q,q.yzx+33.33);\\n    return fract((q.xx+q.yz)*q.zy);\\n  }\\n  float caustics(vec3 world) {\\n    vec2 p=world.xz*1.15;\\n    float d1=sin(p.x*4.8+1.2*sin(p.y*1.7-uTime*0.4));\\n    float d2=sin(p.y*5.3+1.1*cos(p.x*1.4+uTime*0.35));\\n    float web=pow(max(0.0,0.5+0.5*d1*d2),4.0);\\n    return web*0.55*uCaustics*uLamp;\\n  }\\n\":`\n  uniform float uTime;",
    'use fast mobile caustics with same shader interface');
  result = replaceExactlyOnce(result,
    "):u.jsxs(jO,{multisampling:__aquaverseMobile()?0:4,children:[u.jsx(G0e",
    "):__aquaverseMobile()&&!__aquaverseForceEffects()?null:u.jsxs(jO,{multisampling:__aquaverseMobile()?0:4,children:[u.jsx(G0e",
    'skip full-screen expensive postprocess only for mobile High');
  result=replaceExactlyOnce(result,
    'q.frustumCulled=!1,q.userData.clusterIds=f.map(ie=>ie.clusterId),q',
    'q.frustumCulled=__aquaverseMobile(),__aquaverseMobile()&&(q.computeBoundingSphere(),q.boundingSphere&&(q.boundingSphere.radius*=1.4)),q.userData.clusterIds=f.map(ie=>ie.clusterId),q',
    'safe static foliage group bounds');
  result=replaceExactlyOnce(result,"const o_=320,r_=192,y0=2,Sy=new Map,Ml=new Map;","const o_=320,r_=192,y0=1,Sy=new Map,Ml=new Map;","resize Shop thumbnail canvas to 320x192");
  result=replaceExactlyOnce(result,"function sD(t){const e=QNe();if(!e)return null;const n=new ay;n.add(t);const i=JNe(t);return e.render(n,i),e.domElement.toDataURL(\"image/png\")}","let __aqThumbQueue=Promise.resolve();const __aqThumbUrls=new Set;\nif(typeof window!==\"undefined\")window.addEventListener(\"pagehide\",()=>{for(const url of __aqThumbUrls)URL.revokeObjectURL(url);__aqThumbUrls.clear()},{once:true});\nfunction sD(make,dispose=nJ){\n  const job=__aqThumbQueue.catch(()=>null).then(async()=>{\n    await new Promise(resolve=>setTimeout(resolve,0));\n    let model=null;\n    try{\n      const renderer=QNe();if(!renderer)return null;\n      model=await make();if(!model)return null;\n      const scene=new ay;scene.add(model);\n      renderer.render(scene,JNe(model));\n      const blob=await new Promise(resolve=>renderer.domElement.toBlob(resolve,\"image/webp\",.85));\n      if(!blob)return null;\n      const url=URL.createObjectURL(blob);__aqThumbUrls.add(url);return url;\n    }catch(error){console.warn(\"Thumbnail rendering failed\",error);return null}\n    finally{if(model)dispose(model)}\n  });\n  __aqThumbQueue=job.catch(()=>null);\n  return job;\n}","replace synchronous readback with queued toBlob WebP");
  result=replaceExactlyOnce(result,"const l=()=>{try{const c=eLe(t,e),h=c?sD(c):null;c&&nJ(c),h&&Sy.set(i,h),o(h)}catch(c){console.warn(`Không vẽ được ảnh thẻ ${i}`,c),o(null)}};","const l=()=>{sD(()=>eLe(t,e),nJ).then(h=>{h&&Sy.set(i,h),o(h)}).catch(c=>{console.warn(`Không vẽ được ảnh thẻ ${i}`,c),o(null)})};","fish thumbnail async");
  result=replaceExactlyOnce(result,"const o=iLe(t),r=sD(o);nJ(o),r&&Sy.set(n,r),a(r)","sD(()=>iLe(t),nJ).then(r=>{r&&Sy.set(n,r),a(r)}).catch(()=>a(null))","plant thumbnail async");
  result=replaceExactlyOnce(result,"const a=await rLe(t),o=sD(a);return lLe(a),o&&Sy.set(n,o),o","const o=await sD(()=>rLe(t),lLe);return o&&Sy.set(n,o),o","hardscape thumbnail async");
  return result;
}
