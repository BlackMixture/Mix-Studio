/* Experimental 3D mode: shares the existing input, result and library columns. */
let splatStatus = null;
let splatSource = null;
let splatSourceUrl = '';
let splatSelection = null;
let splatSubmitting = false;
let splatRefreshing = false;
let splatView = 'video';
let splatWasActive = false;
let splatProfileId = null;
const splatDesktop = matchMedia('(min-width:1180px)');
function splatModeActive() { return state.view === 'create' && state.createMode === 'splat' && experimentalFeaturesEnabled(); }
function splatMessage(text) { const message = $('#splatProgressText'); message.textContent = text; message.hidden = !text; }
function renderSplatWorkspace() {
  const active = splatModeActive();
  const profileId = state.profile?.id || null;
  if (splatProfileId !== profileId) {
    splatProfileId = profileId; splatSelection = null; splatSource = null; splatStatus = null;
    $('#splatLibraryViewerSheet').classList.remove('show'); $('#splatLibraryViewerFrame').removeAttribute('src');
    $('#splatViewerFrame').removeAttribute('src'); $('#splatOrbitVideo').removeAttribute('src'); $('#splatPhotoPreview').removeAttribute('src'); $('#splatPhotoPreview').hidden = true; $('#splatPhotoLabel').textContent = 'Choose image'; $('#splatPhotoIcon').hidden = false;
    if (splatSourceUrl) URL.revokeObjectURL(splatSourceUrl); splatSourceUrl = '';
  }
  $('#splatInputs').hidden = !active;
  $('#splatResult').hidden = !active;
  if (!active) { $('#splatViewerFrame').removeAttribute('src'); $('#splatOrbitVideo').pause(); }
  const resultParent = splatDesktop.matches ? $('#desktopStage') : $('#view-create');
  if ($('#splatResult').parentElement !== resultParent) resultParent.insertBefore($('#splatResult'), splatDesktop.matches ? resultParent.firstChild : null);
  if (active && !splatWasActive) void refreshSplats();
  window.mixSplatBusy = !!splatStatus?.busy;
  if (active || splatWasActive) $('#generateBtn').disabled = active && (splatSubmitting || window.mixSplatBusy);
  splatWasActive = active;
  if (active) $('#genLbl').textContent = splatSubmitting ? 'Preparing…' : window.mixSplatBusy ? 'Creating 3D…' : 'Generate 3D';
}
splatDesktop.addEventListener('change', renderSplatWorkspace);
function setSplatSource(value, preview, label) {
  if (splatSourceUrl) URL.revokeObjectURL(splatSourceUrl);
  splatSource = value; splatSourceUrl = preview.startsWith('blob:') ? preview : '';
  $('#splatPhotoPreview').hidden = !preview;
  $('#splatPhotoIcon').hidden = !!preview;
  if (preview) $('#splatPhotoPreview').src = preview;
  $('#splatPhotoLabel').textContent = label;
  splatMessage('');
}
async function selectSplatPhoto(item) {
  try {
    const response = await fetch('/images/' + item.file);
    if (!response.ok) throw new Error('This image is no longer available.');
    const blob = await response.blob();
    setSplatSource({ type:'photo', file:blob, name:'Library photo.png' }, '/images/' + item.file, 'Change photo');
  } catch(error) { splatMessage(error.message); }
}
function selectSplatVideo(item, video) {
  setSplatSource({ type:'video', itemId:item.id, videoId:video.id }, '/images/' + item.file, 'Orbit video selected');
}
function showSplatRecord(record, preserveView = false) {
  const previous = splatSelection;
  splatSelection = record;
  if (record.fromPhoto && !splatSource) setSplatSource({ type: 'photo-url', url: `/api/splats/${record.id}/photo`, name: record.title + '.png' }, `/api/splats/${record.id}/photo`, 'Change photo');
  if (!preserveView || (previous?.status !== 'complete' && record.status === 'complete')) splatView = record.status === 'complete' ? '3d' : 'video';
  $('#splatResultTitle').textContent = record.title || 'Photo to 3D';
  $('#splatResultStatus').textContent = record.status === 'complete' ? `${record.count.toLocaleString()} splats` : record.status === 'working' ? 'Creating' : record.status;
  splatMessage(['working', 'failed', 'interrupted'].includes(record.status) ? record.stage : '');
  $('#splatShowVideo').disabled = !record.videoUrl;
  $('#splatShow3D').disabled = record.status !== 'complete';
  const video=$('#splatOrbitVideo');
  if (record.videoUrl && video.getAttribute('src') !== record.videoUrl) video.src=record.videoUrl;
  renderSplatResult();
}
function renderSplatResult() {
  const record=splatSelection;
  const hasVideo=!!record?.videoUrl;
  const has3d=record?.status==='complete';
  const show3d=splatView==='3d' && has3d;
  $('#splatExpand').hidden = !show3d;
  $('#splatResultSwitch').hidden = !hasVideo && !has3d;
  $('#splatResultSwitch').dataset.selected=show3d?'3d':'video';
  $('#splatShowVideo').classList.toggle('active',!show3d);
  $('#splatShow3D').classList.toggle('active',show3d);
  $('#splatShowVideo').setAttribute('aria-pressed', String(!show3d));
  $('#splatShow3D').setAttribute('aria-pressed', String(show3d));
  $('#splatOrbitVideo').hidden=show3d || !hasVideo;
  if(show3d) $('#splatOrbitVideo').pause();
  const frame=$('#splatViewerFrame');
  frame.hidden=!show3d;
  const url=has3d?'/splats.html?id='+encodeURIComponent(record.id):'';
  const inlineVisible = show3d && splatModeActive() && !$('#splatLibraryViewerSheet').classList.contains('show');
  if(inlineVisible && frame.getAttribute('src')!==url) frame.src=url;
  if(!inlineVisible) frame.removeAttribute('src');
  $('#splatResultEmpty').hidden=show3d || hasVideo;
}
async function refreshSplats() {
  if(splatRefreshing)return;splatRefreshing=true;
  try {
    const profileId = state.profile?.id;
    const nextStatus = await api('/api/splats');
    if (profileId !== state.profile?.id) return;
    splatStatus = nextStatus;
    const selected=splatStatus.records.find((record)=>record.id===splatSelection?.id);
    if(selected)showSplatRecord(selected,true);
    else if(splatSelection) { splatSelection = null; $('#splatViewerFrame').removeAttribute('src'); $('#splatOrbitVideo').removeAttribute('src'); renderSplatResult(); }
    if(!splatSelection && splatStatus.records[0])showSplatRecord(splatStatus.records[0]);
    const tools=splatStatus.tools;
    $('#splatSetupCard').hidden = tools.ready || !experimentalFeaturesEnabled();
    $('#splatSetupStatus').textContent=splatStatus.installing?splatStatus.installMessage:tools.ready?'3D tools ready · processing stays on this computer.':splatStatus.installMessage || `Needed: ${[!tools.colmap && 'COLMAP',!tools.brush && 'Brush',!tools.ffmpeg && 'FFmpeg'].filter(Boolean).join(', ')}`;
    $('#splatSetupInstall').hidden=!splatStatus.canInstall || tools.ready;
    $('#splatSetupInstall').disabled=splatStatus.installing || splatStatus.busy;
    renderSplatWorkspace();
  } catch(error){splatMessage(error.message);} finally{splatRefreshing=false;}
}
async function generateSplat() {
  if(splatSubmitting)return;
  if(!splatSource){splatMessage('Add a photo first.');$('#splatPhotoPick').focus();return;}
  if(!splatStatus?.tools.ready){splatMessage('Install 3D tools in Preferences → Experimental Features before generating.');return;}
  if(splatStatus.busy || splatStatus.installing){splatMessage('Wait for the active 3D creation to finish.');return;}
  splatSubmitting=true;renderSplatWorkspace();splatMessage('Preparing your scene…');
  try{
    const suffix='?quality='+($('#splatQualityToggle').getAttribute('aria-checked')==='true'?'quality':'preview');
    if (splatSource.type === 'photo-url') {
      const response = await fetch(splatSource.url);
      if (!response.ok) throw new Error('The source photo is no longer available.');
      splatSource = { type: 'photo', file: await response.blob(), name: splatSource.name };
    }
    let endpoint='/api/splats/create';let body;let headers;
    if(splatSource.file){endpoint=splatSource.type==='photo'?'/api/splats/photo':'/api/splats/video';body=splatSource.file;headers={'x-filename':encodeURIComponent(splatSource.name || splatSource.file.name || 'Photo.png')};}
    else {body=JSON.stringify(splatSource);headers={'Content-Type':'application/json'};}
    const record=await api(endpoint+suffix,{method:'POST',headers,body});
    showSplatRecord(record);await refreshSplats();
  }catch(error){splatMessage(error.message);}finally{splatSubmitting=false;renderSplatWorkspace();}
}
$('#splatPhotoPick').onclick=()=>$('#splatPhotoInput').click();
$('#splatPhotoInput').onchange=(event)=>{const file=event.target.files[0];if(!file)return;if(file.size>32*1024*1024){splatMessage('Choose a photo smaller than 32 MB.');return;}setSplatSource({type:'photo',file,name:file.name},URL.createObjectURL(file),'Change photo');};
$('#splatQualityToggle').onclick=()=>{const next=$('#splatQualityToggle').getAttribute('aria-checked')!=='true';$('#splatQualityToggle').setAttribute('aria-checked',String(next));$('#splatQualityLabel').textContent=next?'Quality':'Balance';$('#splatQualityHint').textContent=next?'More detail · longer generation':'Faster generation';};
$('#splatSetupInstall').onclick=async()=>{try{$('#splatSetupInstall').disabled=true;await api('/api/splats/install',{method:'POST'});await refreshSplats();}catch(error){splatMessage(error.message);}};
$('#splatShowVideo').onclick=()=>{splatView='video';renderSplatResult();};
$('#splatExpand').onclick=()=>{if(splatSelection?.status==='complete')openLibrarySplat(splatSelection);};
$('#splatShow3D').onclick=()=>{splatView='3d';renderSplatResult();};
setInterval(()=>{if(splatModeActive() && !document.hidden)void refreshSplats();},3500);
renderSplatWorkspace();

// The splat is another media selection in the shared gallery preview.
let splatViewerSceneId = null;
let splatViewerRefinementId = null;
function resetLibrarySplat() {
  $('#splatLibraryViewerFrame').hidden = true;
  $('#splatLibraryViewerFrame').removeAttribute('src');
  splatViewerSceneId = null;
  splatViewerRefinementId = null;
}
function openLibrarySplat(scene, item) {
  const source = item || state.items.find(entry => entry.id === scene.sourceItemId || entry.splats?.some(splat => splat.id === scene.id));
  if (!source) { toast('This scene’s gallery item is unavailable.', true); return; }
  openLightbox(source.id, 'splat:' + scene.id);
}
function mountLibrarySplat(scene, item) {
  $('#splatViewerFrame').removeAttribute('src');
  $('#splatOrbitVideo').pause();
  $('#lbVideo').pause();
  $('#lbVideo').hidden = true;
  $('#lbVideo').removeAttribute('src');
  $('#lbImg').hidden = true;
  $('#lbCompareBtn').hidden = true;
  splatViewerSceneId = scene.id;
  const frame = $('#splatLibraryViewerFrame');
  frame.hidden = false;
  frame.src = '/splats.html?id=' + scene.id;
  $('#lbMeta').innerHTML = `<b>3D scene:</b> ${escapeHtml(scene.title || '3D')}<br><span id="splatViewerDetails"></span><span id="splatViewerStatus" role="status" aria-live="polite"></span>`;
  const actions = $('#lbActions');
  actions.replaceChildren();
  const make = (id, icon, label, handler, menu = false) => {
    const button = document.createElement('button');
    button.id = id;
    button.className = 'action-btn icon-only result-action-icon' + (menu ? ' menu-trigger' : '');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    if (menu) { button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false'); }
    button.innerHTML = actionIconMarkup(icon) + `<span class="result-action-label">${label}</span>`;
    button.onclick = handler;
    actions.append(button);
    return button;
  };
  make('splatProcess', 'result-process', 'Process', openSplatProcessMenu, true).disabled = true;
  make('splatMove', 'result-move', 'Move', () => openMoveSheet(item));
  make('splatDocument', 'documentation', 'Documentation', documentLibrarySplat).disabled = true;
  make('splatSave', 'result-save', 'Save', () => {
    const link = document.createElement('a');
    link.href = `/api/splats/${splatViewerSceneId}/file?download=1`;
    link.download = 'scene.ply'; link.click();
  });
  void refreshSplatViewer();
}

async function refreshSplatViewer() {
  const id = splatViewerSceneId;
  if (!id) return;
  try {
    const status = await api('/api/splats');
    if (id !== splatViewerSceneId) return;
    const record = status.records.find(record => record.id === id);
    const refinement = status.records.find(record => record.id === splatViewerRefinementId);
    $('#splatViewerDetails').textContent = record ? `${Number(record.count || 0).toLocaleString()} splats · ${Number(record.trainingSteps || 0).toLocaleString()} training steps` : '';
    $('#splatProcess').disabled = !record?.canRefine || status.busy;
    $('#splatDocument').disabled = !record?.sourceItemId || !$('#splatLibraryViewerFrame').contentWindow?.mixSplatDocumentation;
    if (refinement?.status === 'complete') {
      splatViewerSceneId = refinement.id; splatViewerRefinementId = null;
      $('#splatLibraryViewerFrame').src = '/splats.html?id=' + refinement.id;
      state.currentMedia = { type: 'splat', id: refinement.id };
      await refreshGallery(true);
      if (splatViewerSceneId !== refinement.id) return;
      openLightbox(refinement.sourceItemId, 'splat:' + refinement.id);
      $('#splatViewerStatus').textContent = 'Refined version ready. Original kept in Library.';
    } else if (refinement) $('#splatViewerStatus').textContent = refinement.stage;
    else if (record && !record.canRefine) $('#splatViewerStatus').textContent = 'Original training data is needed to refine this scene.';
  } catch (error) { if (id === splatViewerSceneId) $('#splatViewerStatus').textContent = error.message; }
}
function openSplatProcessMenu() {
  const id = splatViewerSceneId;
  openActionMenu($('#splatProcess'), [5000, 10000].map(extraSteps => ({
    label: `Train ${extraSteps.toLocaleString()} more steps`,
    detail: 'Save a new version from this scene', icon: 'process',
    action: async () => {
      $('#splatProcess').disabled = true;
      try {
        const record = await api(`/api/splats/${id}/refine`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extraSteps }) });
        if (id !== splatViewerSceneId) return;
        splatViewerRefinementId = record.id;
        $('#splatViewerStatus').textContent = record.stage;
        await refreshSplatViewer();
      } catch (error) { if (id === splatViewerSceneId) { $('#splatViewerStatus').textContent = error.message; await refreshSplatViewer(); } }
    },
  })), { menuTitle: 'Further training', scope: 'splat-process' });
};
setInterval(() => { if (splatViewerSceneId && !document.hidden) void refreshSplatViewer(); }, 3500);

async function documentLibrarySplat() {
  try {
    const id = splatViewerSceneId;
    const status = await api('/api/splats');
    const record = status.records.find(record => record.id === id);
    if (!record || id !== splatViewerSceneId) return;
    await refreshGallery(true);
    if (id !== splatViewerSceneId) return;
    const item = state.items.find(item => item.id === record.sourceItemId);
    const video = item?.videos?.find(video => video.id === record.videoId);
    const renderer = $('#splatLibraryViewerFrame').contentWindow?.mixSplatDocumentation;
    if (!video || !renderer) throw new Error('Wait for the scene and its orbit video to load.');
    await saveDocumentationVideo(item, { ...video, info: { ...video.info, splatDocumentation: true, splatCount: record.count, trainingSteps: record.trainingSteps } }, {
      splatRenderer: renderer,
      inputs: [
        { type:'image', label:'Source photo', accent:'#a58aff', src:record.fromPhoto ? `/api/splats/${record.id}/photo` : '/images/' + item.file },
        { type:'video', label:'Generated orbit', accent:'#7b9fff', src:'/videos/' + video.file, startAt:0, duration:0 },
      ],
    });
  } catch (error) { if ($('#splatViewerStatus')) $('#splatViewerStatus').textContent = error.message; }
};
