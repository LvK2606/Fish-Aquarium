/**
 * Aqualator High "sharp first" mobile adaptation.
 * Original assets and the source JS under public/ are not modified.
 * Applied only to the content-fingerprinted dist/ JS output.
 * Build fails closed if a minified source anchor differs.
 */
export function createInteractionGovernor({
  max = 2, min = 1.55, windowMs = 450, slowBelow = 41, dragThreshold = 10
} = {}) {
  const ceiling = Math.max(1, Math.min(2, Number.isFinite(max) ? max : 2));
  const floor = Math.max(1, Math.min(ceiling, Number.isFinite(min) ? min : 1.55));
  let dpr = ceiling;
  let start = null, last = null, frames = 0, fps = null;
  let pointer = null, dragging = false;

  return {
    getDpr() { return dpr; },
    getFps() { return fps; },
    isDragging() { return dragging; },
    sample(now) {
      if (!Number.isFinite(now)) return null;
      // A 30 Hz on-demand scene is intentional. Never downscale just because
      // idle renders arrive at 30 Hz; only act during a slow, real gesture.
      if (last !== null && (now - last > 800 || now <= last)) {
        start = now;
        frames = 0;
        fps = null;
      }
      last = now;
      if (start === null) start = now;
      frames++;
      const elapsed = now - start;
      if (elapsed >= windowMs) {
        fps = frames * 1000 / Math.max(1, elapsed);
        start = now;
        frames = 0;
      }
      if (dragging && fps !== null && fps < slowBelow && dpr > floor) {
        dpr = floor;
        return dpr;
      }
      return null;
    },
    pointerDown(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      pointer = { x, y };
      dragging = false;
      lastFrame = null; start = null; frames = 0; fps = null;
    },
    pointerMove(x, y) {
      if (!pointer || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      if (Math.hypot(x - pointer.x, y - pointer.y) >= dragThreshold && !dragging) {
        dragging = true; lastFrame = null; start = null; frames = 0; fps = null;
      }
      if (dragging && fps !== null && fps < slowBelow && dpr > floor) {
        dpr = floor;
        return dpr;
      }
      return null;
    },
    pointerUp() {
      pointer = null;
      dragging = false;
      if (dpr !== ceiling) {
        dpr = ceiling;
        return ceiling;
      }
      return null;
    }
  };
}


export function createRenderCadence({ idleHz = 30, activeHz = 60 } = {}) {
  let last = -Infinity;
  return {
    reset() { last = -Infinity; },
    shouldRender(now, active) {
      if (!Number.isFinite(now)) return false;
      const hz = active ? activeHz : idleHz;
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
function __aquaverseInitialDpr(){
  // Match the original game's full-res High DPR (up to 2x), never 1.5x.
  return Math.max(1,Math.min(2,typeof window==="undefined"?2:window.devicePixelRatio||1));
}
function __AquaverseSharpInteraction(){
  const renderer=zi(s=>s.gl),setDpr=zi(s=>s.setDpr),invalidate=zi(s=>s.invalidate);
  const full=__aquaverseInitialDpr();
  const governor=B.useMemo(()=>__aquaverseMakeInteractionGovernor({max:full,min:Math.min(full,1.55)}),[full]);
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
    const onUp=()=>{
      const next=governor.pointerUp();
      if(next!==null)restore=requestAnimationFrame(()=>{restore=0;setDpr(next);invalidate()});
    };
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
  // Request only 30 frames/sec in idle High, but prioritize touch at 60 Hz.
  // On-demand mode can still draw extra frames when app state invalidates.
  B.useEffect(()=>{
    const cadence=__aquaverseMakeRenderCadence({idleHz:30,activeHz:60});
    let raf=0;
    const frame=now=>{
      if(document.visibilityState==="visible"){
        if(cadence.shouldRender(now,governor.isDragging()))invalidate();
      }else cadence.reset();
      raf=requestAnimationFrame(frame);
    };
    raf=requestAnimationFrame(frame);
    return()=>cancelAnimationFrame(raf);
  },[invalidate,governor]);
  On(()=>{
    if(typeof document!=="undefined"&&document.visibilityState!=="visible")return;
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
      const info=renderer.info.render,rate=governor.getFps();
      panel.textContent="High Sharp | DPR "+renderer.getPixelRatio().toFixed(2)+
        " | FPS "+(rate===null?"--":Math.round(rate))+
        " | calls "+info.calls+" | triangles "+info.triangles+
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
  return result;
}
