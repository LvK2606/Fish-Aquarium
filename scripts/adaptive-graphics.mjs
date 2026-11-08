// Production-safe High Adaptive patch for the mirrored, verified Aqualator bundle.
// Applied ONLY to dist/ after the immutable source hash verification succeeds.
// All anchors are strict: if the upstream bundle changes, fail instead of
// silently shipping an unoptimized or partially modified build.

export function createAdaptiveGovernor({
  max = 1.5, min = 1, windowMs = 1400, slowBelow = 44, fastAbove = 56,
} = {}) {
  const ceiling = Math.max(1, Number.isFinite(max) ? max : 1.5);
  const floor = Math.max(1, Math.min(ceiling, Number.isFinite(min) ? min : 1));
  let dpr = ceiling;
  let lastFrame = null;
  let start = null;
  let frames = 0;
  let slowWindows = 0;
  let fastWindows = 0;
  let cooldown = 0;

  return {
    getDpr() { return dpr; },
    sample(now) {
      if (!Number.isFinite(now)) return null;
      // Don't interpret background-tab pauses, camera resets or GC stalls
      // as sustained low FPS; resume with a fresh measurement window.
      if (lastFrame !== null && (now - lastFrame > 600 || now < lastFrame)) {
        start = now;
        frames = 0;
        slowWindows = 0;
        fastWindows = 0;
        cooldown = 0;
      }
      lastFrame = now;
      if (start === null) start = now;
      frames++;
      const elapsed = now - start;
      if (elapsed < windowMs) return null;
      const fps = frames * 1000 / Math.max(1, elapsed);
      start = now;
      frames = 0;
      if (cooldown > 0) {
        cooldown--;
        return null;
      }
      if (fps < slowBelow) {
        slowWindows++;
        fastWindows = 0;
      } else if (fps > fastAbove) {
        fastWindows++;
        slowWindows = 0;
      } else {
        slowWindows = 0;
        fastWindows = 0;
      }
      if (slowWindows >= 2 && dpr > floor + 0.02) {
        dpr = Math.max(floor, Math.round((dpr - 0.15) * 100) / 100);
        slowWindows = 0;
        cooldown = 1;
        return dpr;
      }
      if (fastWindows >= 4 && dpr < ceiling - 0.02) {
        dpr = Math.min(ceiling, Math.round((dpr + 0.1) * 100) / 100);
        fastWindows = 0;
        cooldown = 1;
        return dpr;
      }
      return null;
    },
  };
}

function replaceExactlyOnce(source, before, after, reason) {
  const first = source.indexOf(before);
  if (first === -1 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error('High Adaptive patch anchor missing or ambiguous: ' + reason);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const browserRuntime = `
const __aquaverseCreateGovernor = ${createAdaptiveGovernor.toString()};
function __aquaverseMobile(){
  if(typeof window==="undefined")return false;
  try{
    const coarse=window.matchMedia&&window.matchMedia("(pointer: coarse)").matches;
    const ua=typeof navigator!=="undefined"?navigator.userAgent:"";
    return Boolean(coarse||/Android|iPhone|iPad|Mobile/i.test(ua));
  }catch{return false}
}
function __aquaverseInitialDpr(){
  return Math.max(1,Math.min(1.5,typeof window==="undefined"?1.5:window.devicePixelRatio||1));
}
function __AquaverseAdaptiveDpr(){
  const setDpr=zi(state=>state.setDpr);
  const ceiling=__aquaverseInitialDpr();
  const governor=B.useMemo(()=>__aquaverseCreateGovernor({max:ceiling,min:1}),[ceiling]);
  B.useEffect(()=>{setDpr(ceiling)},[ceiling,setDpr]);
  On(()=>{
    if(typeof document!=="undefined"&&document.visibilityState!=="visible")return;
    const next=governor.sample(performance.now());
    if(next!==null)setDpr(next);
  });
  return null;
}
// View-dependent plant instance LOD: full near-side leaves, fewer leaves on
// the far side of dense clusters. Keeps all species, meshes, textures and
// picking IDs; recalculates only after meaningful camera orbit changes.
function __aquaverseFarLeaves(leaves,sector){
  if(leaves.length<72)return leaves;
  const angle=sector*Math.PI/4,dx=Math.sin(angle),dz=Math.cos(angle);
  const far=item=>(item.position[0]*dx+item.position[2]*dz)<-.03;
  const counts=new Map();
  for(const leaf of leaves)if(far(leaf))counts.set(leaf.clusterId,(counts.get(leaf.clusterId)||0)+1);
  const seen=new Map(),kept=[];
  for(const leaf of leaves){
    if(!far(leaf)||(counts.get(leaf.clusterId)||0)<18){kept.push(leaf);continue}
    const index=seen.get(leaf.clusterId)||0;
    seen.set(leaf.clusterId,index+1);
    if(index%4!==3)kept.push(leaf);
  }
  return kept;
}
`;

export function patchAquariumBundle(source) {
  if (typeof source !== 'string' || source.length < 100000) {
    throw new Error('Expected complete, verified Aqualator JavaScript bundle');
  }
  let result = replaceExactlyOnce(
    source,
    'function U4e({parked:t=!1})',
    browserRuntime + 'function U4e({parked:t=!1})',
    'WebGL tank renderer',
  );
  result = replaceExactlyOnce(
    result,
    'dpr:i?1:[1,2],frameloop:t?',
    'dpr:i?1:__aquaverseMobile()?__aquaverseInitialDpr():[1,2],frameloop:t?',
    'High mode render resolution',
  );
  result = replaceExactlyOnce(
    result,
    'children:[u.jsx("color",{attach:"background",args:["#0b0f24"]}),u.jsx(z4e,{})',
    'children:[u.jsx("color",{attach:"background",args:["#0b0f24"]}),!i&&__aquaverseMobile()&&u.jsx(__AquaverseAdaptiveDpr,{}),u.jsx(z4e,{})',
    'Adaptive controller inside Canvas',
  );
  result = replaceExactlyOnce(
    result,
    'd=Qa(x=>x.quality==="low"),f=B.useMemo(()=>d?V5e(h):h,[h,d]),p=B.useMemo',
    'd=Qa(x=>x.quality==="low"),__mobile=__aquaverseMobile(),__camera=zi(x=>x.camera),[__sector,__setSector]=B.useState(()=>Math.round(Math.atan2(__camera.position.x,__camera.position.z)*4/Math.PI)),__lodPoll=B.useRef(0),f=B.useMemo(()=>d?V5e(h):__mobile?__aquaverseFarLeaves(h,__sector):h,[h,d,__mobile,__sector]),p=B.useMemo',
    'Far-side vegetation density LOD',
  );
  result = replaceExactlyOnce(
    result,
    'v.tick(k,a)});const b=x=>',
    'v.tick(k,a);if(__mobile&&!d&&performance.now()-__lodPoll.current>1300){__lodPoll.current=performance.now();const sector=Math.round(Math.atan2(x.camera.position.x,x.camera.position.z)*4/Math.PI);__setSector(old=>old===sector?old:sector)}});const b=x=>',
    'LOD camera orbit updates',
  );
  result = replaceExactlyOnce(
    result,
    'multisampling:4,children:[u.jsx(G0e,{mipmapBlur:!0,luminanceThreshold:.92,luminanceSmoothing:.3,intensity:.6,radius:.8})',
    'multisampling:__aquaverseMobile()?0:2,children:[u.jsx(G0e,{mipmapBlur:!0,luminanceThreshold:.92,luminanceSmoothing:.3,intensity:.6,radius:.8,levels:__aquaverseMobile()?5:8,resolutionScale:__aquaverseMobile()?.35:.5})',
    'High mode Bloom and MSAA budget',
  );
  return result;
}
