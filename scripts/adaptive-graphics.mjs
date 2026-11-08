/**
 * Aqualator High "sharp first" mobile adaptation.
 * Original assets and the source JS under public/ are not modified.
 * Applied only to the content-fingerprinted dist/ JS output.
 * Build fails closed if a minified source anchor differs.
 */
export function createInteractionGovernor({
  max = 2, min = 1.55, windowMs = 1200, slowBelow = 25, dragThreshold = 10
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
    },
    pointerMove(x, y) {
      if (!pointer || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      if (Math.hypot(x - pointer.x, y - pointer.y) >= dragThreshold) dragging = true;
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

function replaceExactlyOnce(source, before, after, reason) {
  const index = source.indexOf(before);
  if (index < 0 || source.indexOf(before, index + before.length) !== -1)
    throw new Error('High Adaptive sharp-first patch anchor missing or ambiguous: ' + reason);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

const browserRuntime = `
const __aquaverseMakeInteractionGovernor = ${createInteractionGovernor.toString()};
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
  const renderer=zi(s=>s.gl),setDpr=zi(s=>s.setDpr);
  const full=__aquaverseInitialDpr();
  const governor=B.useMemo(()=>__aquaverseMakeInteractionGovernor({max:full,min:Math.min(full,1.55)}),[full]);
  B.useEffect(()=>{
    setDpr(full);
    const canvas=renderer.domElement;
    if(!canvas)return;
    let restore=0;
    const onDown=e=>{
      if(e.isPrimary===false)return;
      if(restore)cancelAnimationFrame(restore);
      governor.pointerDown(e.clientX,e.clientY);
      // A new gesture always begins from full-resolution High.
      setDpr(governor.getDpr());
    };
    const onMove=e=>{
      if(e.isPrimary===false)return;
      const next=governor.pointerMove(e.clientX,e.clientY);
      if(next!==null)setDpr(next);
    };
    const onUp=()=>{
      const next=governor.pointerUp();
      if(next!==null)restore=requestAnimationFrame(()=>{restore=0;setDpr(next)});
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
  },[renderer,setDpr,full,governor]);
  On(()=>{
    if(typeof document!=="undefined"&&document.visibilityState!=="visible")return;
    const next=governor.sample(performance.now());
    if(next!==null)setDpr(next);
  });
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
    'function F4e(){const t=zi(n=>n.invalidate),e=F(n=>n.ambient);return B.useEffect(()=>{if(!e)return;const n=window.setInterval(()=>t(),1e3/30);return()=>window.clearInterval(n)},[e,t]),null}',
    'function F4e(){const t=zi(n=>n.invalidate),e=F(n=>n.ambient);return B.useEffect(()=>{if(!e)return;const n=window.setInterval(()=>{if(document.visibilityState==="visible")t()},1e3/30);return()=>window.clearInterval(n)},[e,t]),null}',
    'no rendering work while the document is hidden');
  return result;
}
