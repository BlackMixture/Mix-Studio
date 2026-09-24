import { Viewer, SceneFormat } from '/vendor/splats/gaussian-splats-3d.module.js';
import { Vector2, Vector3 } from 'three';
const el = (id) => document.getElementById(id);
let viewer, record, center, up = -1, picking = false, limit = true, range = 1;
const key = () => 'mix-splat-view-' + record.id;
const radius = () => record.radius * range;
function save() { try { localStorage.setItem(key(), JSON.stringify({ center:center.toArray(), up, limit, range })); } catch {} }
function applyRange() {
  if (!viewer) return;
  const uniforms = viewer.splatMesh.material.uniforms;
  uniforms.mixClipCenter.value.copy(center);
  uniforms.mixClipRadius.value = limit ? radius() : 1e30;
  el('splatRangeValue').textContent = limit ? `${Math.round(range * 100)}%` : 'All';
  el('splatLimit').setAttribute('aria-checked', String(limit));
  el('splatRange').disabled = !limit;
  viewer.forceRenderNextFrame(); save();
}
function reset() {
  if (!viewer) return;
  viewer.transitioningCameraTarget = false;
  viewer.camera.up.set(0,up,0);
  viewer.camera.position.copy(center).add(new Vector3(0,-radius()*.15,-radius()*1.8));
  viewer.controls.target.copy(center); viewer.controls.update(); viewer.forceRenderNextFrame();
}
function pickMode(next) {
  picking=next; el('splatCenter').setAttribute('aria-pressed',String(next));
  el('splatViewer').classList.toggle('picking-center',next);
  el('splatHelp').textContent=next?'Click or tap the subject to set the orbit center. Escape cancels.':'Drag to orbit · Right-drag to pan · Scroll or pinch to zoom';
}
el('splatReset').onclick=reset;
el('splatCenter').onclick=()=>pickMode(!picking);
el('splatOptions').onclick=()=>{const panel=el('splatViewOptions');panel.hidden=!panel.hidden;el('splatOptions').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)el('splatLimit').focus();};
document.addEventListener('pointerdown',event=>{if(!el('splatViewOptions').contains(event.target) && !el('splatOptions').contains(event.target)){el('splatViewOptions').hidden=true;el('splatOptions').setAttribute('aria-expanded','false');el('splatOptions').focus();}});
el('splatFlip').onclick=()=>{up *= -1;reset();save();};
el('splatLimit').onclick=()=>{limit=!limit;applyRange();};
el('splatRange').oninput=()=>{range=Number(el('splatRange').value)/100;applyRange();};
el('splatRestore').onclick=()=>{center.fromArray(record.center);up=-1;range=1;limit=true;el('splatRange').value=100;applyRange();reset();};
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (picking || !el('splatViewOptions').hidden) {
    pickMode(false); el('splatViewOptions').hidden = true;
    el('splatOptions').setAttribute('aria-expanded', 'false'); el('splatOptions').focus();
  } else if (window.frameElement?.id === 'splatLibraryViewerFrame') {
    window.parent.closeLightbox();
  }
});
let down;
el('splatViewer').addEventListener('pointerdown',event=>{down=[event.clientX,event.clientY];});
el('splatViewer').addEventListener('pointerup',event=>{
  if(!picking || !viewer || !down || Math.hypot(event.clientX-down[0],event.clientY-down[1])>6)return;
  const rect=el('splatViewer').getBoundingClientRect(), dimensions=new Vector2(rect.width,rect.height), hits=[];
  viewer.raycaster.setFromCameraAndScreenPosition(viewer.camera,new Vector2(event.clientX-rect.left,event.clientY-rect.top),dimensions);
  viewer.raycaster.intersectSplatMesh(viewer.splatMesh,hits);
  const hit=hits.find(value=>!limit || value.origin.distanceTo(center)<=radius());
  if(!hit){el('splatHelp').textContent='No visible splat there. Tap directly on the subject.';return;}
  center.copy(hit.origin);viewer.transitioningCameraTarget=false;viewer.controls.target.copy(center);viewer.controls.update();
  applyRange();pickMode(false);
});
try {
  const response=await fetch('/api/splats');
  if(!response.ok) throw new Error('Sign in to Mix Studio to view this scene.');
  const data=await response.json();
  record=data.records.find(r=>r.id===new URLSearchParams(location.search).get('id') && r.status==='complete');
  if(!record) throw new Error('This scene is not available in your unlocked Library.');
  center=new Vector3(...record.center);
  try { const saved=JSON.parse(localStorage.getItem(key())); if(saved && Array.isArray(saved.center) && saved.center.length===3 && saved.center.every(Number.isFinite)){center.fromArray(saved.center);up=saved.up===1?1:-1;limit=saved.limit!==false;range=Math.max(.1,Math.min(2,Number(saved.range)||1));} } catch {}
  el('splatRange').value=Math.round(range*100);
  viewer=new Viewer({rootElement:el('splatViewer'),cameraUp:[0,up,0],initialCameraPosition:[center.x,center.y,center.z-radius()*1.8],initialCameraLookAt:center.toArray(),sharedMemoryForWorkers:false,gpuAcceleratedSort:false,sphericalHarmonicsDegree:0});
  await viewer.addSplatScene(`/api/splats/${record.id}/file`,{format:SceneFormat.Ply,showLoadingUI:false,splatAlphaRemovalThreshold:5});
  // View-only radial clipping; leave the PLY and its Gaussian attributes intact.
  const material=viewer.splatMesh.material;
  const marker='vec3 splatCenter = uintBitsToFloat(uvec3(sampledCenterColor.gba));';
  if(!material.vertexShader.includes(marker)) throw new Error('This viewer version does not support range clipping.');
  material.uniforms.mixClipCenter={value:center.clone()};material.uniforms.mixClipRadius={value:1e30};
  material.vertexShader='uniform vec3 mixClipCenter;\nuniform float mixClipRadius;\n'+material.vertexShader.replace(marker,marker+'\n if (distance(splatCenter, mixClipCenter) > mixClipRadius) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }');
  material.needsUpdate=true;
  // Require an intentional Center action instead of changing the pivot on every click.
  viewer.checkForFocalPointChange=()=>{};
  viewer.start(); applyRange(); el('splatNotice').textContent='';
  // The app's documentation exporter records the actual scene, using the current
  // center and visibility range. Restore the user's camera after export/cancel.
  let captureState = null;
  window.mixSplatDocumentation = {
    begin() {
      if (captureState) this.end();
      captureState = { position: viewer.camera.position.clone(), target: viewer.controls.target.clone(), enabled: viewer.controls.enabled };
      viewer.stop(); viewer.controls.enabled = false;
    },
    frame(progress = 0) {
      if (!captureState) throw new Error('Start scene capture before rendering.');
      const offset = captureState.position.clone().sub(captureState.target);
      const angle = Math.max(0, Math.min(1, Number(progress) || 0)) * Math.PI / 3;
      offset.applyAxisAngle(new Vector3(0, up, 0), angle);
      viewer.camera.position.copy(captureState.target).add(offset);
      viewer.camera.lookAt(captureState.target); viewer.camera.updateMatrixWorld();
      viewer.update(); viewer.render();
      return viewer.renderer.domElement;
    },
    end() {
      if (!captureState) return;
      viewer.camera.position.copy(captureState.position);
      viewer.controls.target.copy(captureState.target);
      viewer.controls.enabled = captureState.enabled;
      viewer.controls.update(); captureState = null; viewer.start();
    },
  };

  el('splatDownload').href=`/api/splats/${record.id}/file?download=1`;
  document.querySelectorAll('.splat-toolbar button').forEach(button=>button.disabled=false);
} catch(error){el('splatNotice').textContent=error.message+' The viewer requires WebGL 2.';}
