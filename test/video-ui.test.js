'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const promptEnhance = fs.readFileSync(path.join(root, 'lib', 'prompt-enhance.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const H3Resolution = require('../public/h3-resolution');
const { h3Dimensions } = require('../lib/video-workflows');
const regexEscape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('MiniMax H3 resolution picker mirrors the backend S, M, L, and XL canvases', () => {
  const sizes = [0.75, 1, 1.75, H3Resolution.XL_SIZE];
  for (const aspect of [[1, 1], [4, 5], [3, 4], [2, 3], [9, 16], [3, 2], [4, 3], [16, 9], [21, 9]]) {
    const tierPixels = sizes.map((size) => {
      const frontend = H3Resolution.dimensions(...aspect, size);
      const backend = h3Dimensions(...aspect, size);
      assert.deepEqual(frontend, { width: backend.W, height: backend.H });
      assert.equal(frontend.width % 32, 0);
      assert.equal(frontend.height % 32, 0);
      return frontend.width * frontend.height;
    });
    assert.ok(tierPixels[0] < tierPixels[1]);
    assert.ok(tierPixels[1] < tierPixels[2]);
    assert.ok(tierPixels[2] < tierPixels[3]);
  }
  assert.match(html, /data-h3-xl="true"[^>]*hidden>XL</);
  assert.match(html, /id="h3ResolutionWarning"[^>]*data-icon-tooltip-detail="XL uses roughly twice the pixels of L/);
  assert.ok(html.indexOf('/h3-resolution.js') < html.indexOf('/app.js'));
  assert.match(app, /function h3ResolutionActive\(\)[\s\S]*state\.view === 'video' && state\.vidEngine === 'h3'/);
  assert.match(app, /function h3DimensionsForAspect\([\s\S]*H3Resolution\.dimensions\(selected\.ar, 1, h3ResolutionSize\(\)\)/);
  assert.match(app, /function h3ResolutionAspectRatio\(\)[\s\S]*h3MatchSourceActive\(\)[\s\S]*h3MatchReferenceVideoActive\(\)[\s\S]*selectedAspectRatio\(\)/);
  assert.match(app, /function h3CurrentDimensions\(\)[\s\S]*h3ResolutionSize\(\)/);
  assert.match(app, /function computeDims\(\)[\s\S]*h3CurrentDimensions\(\)[\s\S]*state\.width = dimensions\.width;[\s\S]*state\.height = dimensions\.height;/);
  assert.match(app, /\$\('#sizeSeg'\)\.hidden = false;/);
  assert.match(app, /widthInput\.readOnly = h3Resolution;[\s\S]*heightInput\.readOnly = h3Resolution;/);
  assert.match(app, /h3ResolutionSize: state\.vidEngine === 'h3' \? h3ResolutionSize\(\) : undefined/);
  assert.match(app, /h3AspectRatio: state\.vidEngine === 'h3' \? h3ResolutionAspectRatio\(\) : undefined/);
  assert.match(app, /Match frame[\s\S]*state\.vidH3MatchSource = true/);
  assert.match(app, /#resPanel'\)\.hidden = state\.view === 'edit'[\s\S]*isVideo && !!state\.vidRef && state\.vidEngine !== 'h3'/);
  assert.match(app, /width: state\.vidEngine === 'h3'[\s\S]*\? state\.width[\s\S]*height: state\.vidEngine === 'h3'[\s\S]*\? state\.height/);
  assert.match(server, /h3Dimensions\(requestedAspectRatio, 1, body\.h3ResolutionSize\)/);
  assert.match(server, /h3ResolutionSize: engine === 'h3' \? Number\(body\.h3ResolutionSize\)/);
});

test('MiniMax H3 reuse restores the base tier independently from an RTX 4K pass', () => {
  assert.equal(H3Resolution.restoredGenerationSize({
    h3ResolutionSize: 1.75, fourK: true, width: 2688, height: 1536,
  }), 1.75);
  assert.equal(H3Resolution.restoredGenerationSize({
    h3ResolutionSize: 3, fourK: true, width: 3840, height: 2176,
  }), H3Resolution.XL_SIZE);

  // Backward compatibility for gallery videos created before the H3 tier was
  // recorded: compare the original canvas after undoing the 2x RTX pass.
  assert.equal(H3Resolution.restoredGenerationSize({
    fourK: true, width: 2688, height: 1536,
  }), 1.75);
  assert.equal(H3Resolution.restoredGenerationSize({
    fourK: true, width: 3840, height: 2176,
  }), H3Resolution.XL_SIZE);

  assert.match(app, /const reusedH3ResolutionSize = engine === 'h3'[\s\S]*H3Resolution\.restoredGenerationSize\(info, state\.mp\)/);
  assert.match(app, /state\.vidH3Xl = engine === 'h3' && reusedH3ResolutionSize === H3Resolution\.XL_SIZE/);
  assert.match(app, /\$\('#vid4k'\)\.classList\.toggle\('active', !!info\.fourK\)/);
});

test('MiniMax H3 preserves normalized portrait aspect ratios from the picker', () => {
  const frontend = H3Resolution.dimensions(9 / 16, 1, 1);
  const backend = h3Dimensions(9 / 16, 1, 1);
  assert.deepEqual(frontend, { width: 576, height: 1024 });
  assert.deepEqual(backend, { W: 576, H: 1024 });
  assert.equal(frontend.width / frontend.height, 9 / 16);
});

test('MiniMax H3 can match a first frame aspect without using its oversized native pixels', () => {
  const frontend = H3Resolution.dimensions(1184, 1472, 1.75);
  const backend = h3Dimensions(1184, 1472, 1.75);
  assert.deepEqual(frontend, { width: 768, height: 960 });
  assert.deepEqual(backend, { W: 768, H: 960 });
  assert.ok(Math.abs((frontend.width / frontend.height) - (1184 / 1472)) < 0.005);
  assert.match(app, /h3MatchSource: state\.vidEngine === 'h3' && state\.vidH3Mode === 'frames'/);
  assert.match(server, /h3MatchSource: engine === 'h3' && h3Mode === 'frames'/);
});

test('MiniMax H3 Reference mode can match Video 1 aspect and labels video thumbnails', () => {
  assert.match(app, /vidH3MatchReferenceVideo: false/);
  assert.match(app, /function h3ReferenceVideoAspectRatio\(\)/);
  assert.match(app, /<span>Match video<\/span>/);
  assert.match(app, /state\.vidH3MatchReferenceVideo = true/);
  assert.match(app, /h3MatchReferenceVideo: state\.vidEngine === 'h3' && state\.vidH3Mode === 'reference'/);
  assert.match(app, /className = 'h3-reference-aspect'/);
  assert.match(app, /video\.videoWidth/);
  assert.match(css, /\.h3-reference-aspect \{/);
  assert.match(server, /h3MatchReferenceVideo: engine === 'h3' && h3Mode === 'reference'/);
});

test('MiniMax H3 offers verified SageAttention with an explicit standard-attention bypass', () => {
  assert.match(html, /id="vidH3SageToggle"[^>]*role="switch"[^>]*aria-checked="true"/);
  assert.match(html, /id="vidH3SageStatus">Verifying the ComfyUI runtime/);
  assert.match(app, /vidH3SageAttention: true/);
  assert.match(app, /function renderH3SageAttention\(\)/);
  assert.match(app, /sageAttention: state\.vidEngine === 'h3' \? state\.vidH3SageAttention !== false : undefined/);
  assert.match(app, /if \(state\.vidEngine === 'h3' && state\.vidH3SageAttention !== false\) components\.add\('h3sage'\)/);
  assert.match(app, /info\.attentionBackend === 'sageattention' \? 'SageAttention \(verified\)' : 'Standard PyTorch'/);
  assert.match(css, /\.h3-sage-toggle\[data-ready="false"\]\[aria-checked="true"\]/);
  assert.match(server, /const h3SageAttention = engine === 'h3' && body\.sageAttention !== false/);
  assert.match(server, /code: 'h3_sage_attention_unavailable'/);
  assert.match(server, /attentionBackend: engine === 'h3' \? \(opts\.sageAttention \? 'sageattention' : 'standard'\)/);
});

test('MiniMax H3 exposes the shared LoRA stack and sends it to the video workflow', () => {
  assert.doesNotMatch(app, /loraPanel'\)\.closest\('\.panel'\)\.hidden = isVideo && state\.vidEngine === 'h3'/);
  assert.match(app, /function compatibleLoraCategories\(\)[\s\S]{0,180}state\.vidEngine === 'h3'[\s\S]{0,80}\['h3', 'unknown'\]/);
  assert.match(app, /loras: state\.videoLoras,/);
  assert.doesNotMatch(app, /loras: state\.vidEngine === 'h3' \? \[\] : state\.videoLoras/);
  assert.match(app, /function h3ManagedWorkflowLora\(name\)/);
  assert.match(app, /function selectedH3LoraCompatibility\(\)/);
  assert.match(app, /H3 LoRAs use the standard fused QKV model layout and are unavailable with DynTime/);
  assert.match(server, /h3: \['UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoaderModelOnly'/);
  assert.match(server, /let requestedVideoLoras = Array\.isArray\(body\.loras\)/);
  assert.match(server, /code: 'h3_lora_model_incompatible'/);
  assert.match(server, /code: 'h3_managed_lora_duplicate'/);
  assert.match(server, /loras: requestedVideoLoras,/);
  assert.doesNotMatch(server, /loras: engine === 'h3' \? \[\]/);
});

test('Video frame and media inputs use visual source cards', () => {
  assert.match(html, /class="video-input-grid"/);
  for (const id of ['vidAttachBtn', 'vidDriveBtn', 'vidFaceChip', 'vidEndChip', 'vidAudioChip']) {
    assert.match(html, new RegExp(`class="media-input-card[^"]*" id="${id}"`));
  }
  assert.match(css, /\.media-input-card \{[\s\S]*min-height: 132px/);
  assert.match(css, /\.video-input-grid \.media-input-card,[\s\S]*aspect-ratio: 4 \/ 3/);
  assert.match(css, /\.video-input-grid \.media-input-card,[\s\S]*\.video-input-grid \.media-input-filled \{[\s\S]*min-height: 0/);
  assert.match(css, /\.video-input-grid \.media-input-filled\.expanded \{[\s\S]*aspect-ratio: auto/);
  assert.match(css, /@media \(max-width: 360px\) \{[\s\S]*\.video-input-grid \.media-input-card,[\s\S]*min-height: 0/);
  assert.match(css, /\.video-input-grid \.media-input-filled/);
  assert.match(html, /class="audio-input-icon"[^>]*preserveAspectRatio="xMidYMid meet"/);
  assert.match(css, /\.media-input-art > \.audio-input-icon \{[\s\S]*min-width: 32px;[\s\S]*min-height: 32px;/);
});

test('Video trim and frame actions use one minimalist SVG icon language', () => {
  assert.match(html, /id="vidDriveTrimChip"[\s\S]*<svg[\s\S]*<span>Trim<\/span>/);
  assert.match(html, /id="vidDriveFrameChip"[\s\S]*<svg[\s\S]*<span>Use first frame<\/span>/);
  assert.match(html, /id="driveTrimPlay"[^>]*aria-label="Play preview"[\s\S]*<svg/);
  assert.match(html, /id="vidTrimPlay"[^>]*aria-label="Play preview"[\s\S]*<svg/);
  assert.match(html, /id="animTrimPlay"[^>]*aria-label="Play preview"[\s\S]*<svg/);
  assert.match(app, /function setTrimPlaybackIcon\(button, playing\)/);
  assert.match(app, /playing \? TRIM_PAUSE_ICON : TRIM_PLAY_ICON/);
  assert.doesNotMatch(app, /\.textContent = '⏹'/);
  assert.match(css, /\.trim-play \{[\s\S]*background: #090a0d;[\s\S]*color: #fff/);
});

test('SCAIL motion video first frames route to Edit, image guidance, or depth guidance', () => {
  assert.match(app, /async function extractDriveFirstFrame\(\)/);
  assert.match(app, /trimStart:?[\s\S]*motion_first_frame\.png/);
  assert.match(app, /async function useDriveFirstFrame\(destination\)/);
  assert.match(app, /label: 'Edit first frame'[\s\S]*useDriveFirstFrame\('edit'\)/);
  assert.match(app, /label: 'Image guide'[\s\S]*useDriveFirstFrame\('image'\)/);
  assert.match(app, /label: 'Depth guide'[\s\S]*useDriveFirstFrame\('depth'\)/);
  assert.match(app, /setCreateImageGuideAsset\(frame, destination === 'depth' \? 'depth' : 'image'\)/);
});

test('Video inputs keep start and end frames together, followed by Face ID and audio', () => {
  const start = html.indexOf('id="vidAttachBtn"');
  const end = html.indexOf('id="vidEndChip"');
  const face = html.indexOf('id="vidFaceChip"');
  const audio = html.indexOf('id="vidAudioChip"');
  assert.ok(start > -1 && start < end && end < face && face < audio);
});

test('Video model selection sits above the prompt and collapses after choosing', () => {
  const modelAt = html.indexOf('id="vidModelPanel"');
  const promptAt = html.indexOf('id="promptPanel"');
  assert.ok(modelAt > -1 && modelAt < promptAt);
  assert.match(html, /id="vidModelHeader"[^>]*aria-expanded="false"[^>]*aria-controls="vidModelBody"/);
  assert.match(html, /id="vidModelBody" aria-hidden="true" inert/);
  assert.match(html, /id="vidEngineSelected">LTX 2\.3</);
  assert.match(html, /id="vidEngineNote">Cinematic Video</);
  assert.match(html, /id="engineInfoBtn"[^>]*aria-label="Compare model capabilities"/);
  assert.doesNotMatch(html, />Compare model capabilities<\/button>/);
  assert.match(css, /\.video-model-body[\s\S]*grid-template-rows: 0fr/);
  assert.match(css, /\.video-model-panel\.expanded \.video-model-body[\s\S]*grid-template-rows: 1fr/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.video-choice-grid \.chip\[data-engine\] \{[\s\S]*?justify-items: center;[\s\S]*?text-align: center;/);
  assert.match(css, /\.info-btn\.video-model-info \{[\s\S]*width: 34px/);
  assert.match(app, /function setVideoModelExpanded\(open\)/);
  assert.match(app, /setTimeout\(\(\) => setVideoModelExpanded\(false\), 120\)/);
});

test('Video choices lead with model names and keep tasks secondary', () => {
  const choices = [
    ['ltx', 'Cinematic Video', 'LTX 2.3'],
    ['ltx25', 'Next-gen Cinematic Video', 'LTX 2.5'],
    ['ltx-edit', 'Video Editing', 'LTX Edit'],
    ['eros', 'Image Animation', '10Eros DMD'],
    ['wan', 'Complex Motion', 'Wan 2.2'],
    ['scail', 'Motion Transfer', 'SCAIL 2'],
  ];
  for (const [engine, task, model] of choices) {
    assert.match(html, new RegExp(`data-engine="${engine}"[^>]*data-task-label="${regexEscape(task)}"[^>]*data-model-label="${regexEscape(model)}"[^>]*><b>${regexEscape(model)}(?:\\s*<span class="model-status-badge">(?:Experimental|Preview)</span>)?</b><small>${regexEscape(task)}</small>`));
  }
  assert.match(app, /const VIDEO_ENGINE_TASKS = \{[\s\S]*task: 'Cinematic Video', model: 'LTX 2\.3'[\s\S]*task: 'Next-gen Cinematic Video', model: 'LTX 2\.5'[\s\S]*task: 'Motion Transfer', model: 'SCAIL 2'/);
  assert.match(app, /\$\('#vidEngineSelected'\)\.textContent = definition\.model/);
  assert.match(app, /\$\('#vidEngineNote'\)\.textContent = faceMode \? 'Character Performance' : definition\.task/);
});

test('Video model guide provides animated previews and selects the chosen model', () => {
  assert.match(app, /preview: \{ type: 'video', src: '\/guides\/ltx-motorcycle-highway\.mp4' \}/);
  assert.match(app, /preview: \{ type: 'video', src: '\/guides\/ltx-edit-inpaint\.mp4' \}/);
  assert.match(app, /preview: \{ type: 'video', src: '\/guides\/wan-knight-explosion\.mp4' \}/);
  assert.match(app, /preview: \{ type: 'video', src: '\/guides\/scail-hand-fantasy\.mp4' \}/);
  const ltxPreview = path.join(root, 'public', 'guides', 'ltx-motorcycle-highway.mp4');
  assert.ok(fs.existsSync(ltxPreview), 'the LTX 2.3 preview video should be present');
  assert.ok(fs.statSync(ltxPreview).size > 1024, 'the LTX 2.3 preview video should not be empty');
  const wanPreview = path.join(root, 'public', 'guides', 'wan-knight-explosion.mp4');
  assert.ok(fs.existsSync(wanPreview), 'the Wan 2.2 preview video should be present');
  assert.ok(fs.statSync(wanPreview).size > 1024, 'the Wan 2.2 preview video should not be empty');
  assert.match(app, /function createEngineInfoPreview\(definition\)/);
  assert.match(app, /video\.muted = true;[\s\S]*video\.loop = true;[\s\S]*video\.playsInline = true/);
  assert.match(app, /title\.textContent = definition\.model/);
  assert.match(app, /model\.textContent = `\$\{definition\.task\}/);
  assert.match(app, /button\.addEventListener\('click',[\s\S]*choice\.click\(\)/);
  assert.match(css, /\.engine-info-preview-motion i \{[\s\S]*animation: engineMotionPreview/);
});

test('Video model guide pins 10Eros last without rewriting the saved model order', () => {
  const start = app.indexOf('function renderEngineInfoList(kind = \'video\')');
  const end = app.indexOf('\nfunction renderEditModelSummary()', start);
  const renderGuide = app.slice(start, end);

  assert.ok(start > -1 && end > start, 'renderEngineInfoList should remain inspectable');
  assert.match(renderGuide, /const normalizedOrder = normalizeEngineOrder\(order, Object\.keys\(definitions\)\);/);
  assert.match(renderGuide, /const guideOrder = editing\s*\? normalizedOrder\s*:\s*normalizedOrder\.filter\(\(engine\) => engine !== 'eros'\)\.concat\(normalizedOrder\.includes\('eros'\) \? \['eros'\] : \[\]\);/);
  assert.match(renderGuide, /guideOrder\.forEach\(\(engine\) => \{/);
  assert.doesNotMatch(renderGuide, /state\.(?:editEngineOrder|videoEngineOrder|editEngineDefault|videoEngineDefault)\s*=/);
  assert.doesNotMatch(renderGuide, /\b(?:order|normalizedOrder)\.(?:sort|reverse|splice|push|pop|shift|unshift)\(/);
});

test('Model guide uses true black and gives previews more room at desktop and mobile sizes', () => {
  const panelRule = css.match(/\.engine-info-panel\s*\{([^}]*)\}/)?.[1] || '';
  const baseCardRule = css.match(/(?:^|\n)\.engine-info-card\s*\{([^}]*)\}/)?.[1] || '';
  const mobileCardRule = css.match(/@media \(max-width:\s*560px\)\s*\{[\s\S]*?\.engine-info-card\s*\{([^}]*)\}/)?.[1] || '';
  const firstColumn = (rule) => Number(rule.match(/grid-template-columns:\s*(\d+)px/)?.[1] || 0);

  assert.match(panelRule, /background(?:-color)?:\s*#(?:000|000000)\s*;/);
  assert.ok(firstColumn(baseCardRule) >= 160, 'desktop previews should receive at least a 160px column');
  assert.ok(firstColumn(mobileCardRule) >= 120, 'mobile previews should receive at least a 120px column');
  assert.ok(firstColumn(mobileCardRule) < firstColumn(baseCardRule), 'the mobile preview column should remain responsive');
});

test('LTX Edit uses the supplied preview and is consistently marked Experimental', () => {
  const preview = path.join(root, 'public', 'guides', 'ltx-edit-inpaint.mp4');
  assert.ok(fs.existsSync(preview), 'the LTX Edit preview video should be present');
  assert.ok(fs.statSync(preview).size > 1024, 'the LTX Edit preview video should not be empty');

  assert.match(html, /data-engine="ltx-edit"[^>]*data-experimental="true"[^>]*><b>LTX Edit\s*<span class="model-status-badge">Experimental<\/span><\/b><small>Video Editing<\/small>/);
  assert.match(html, /id="vidEngineBadge" hidden>Experimental<\/span>/);
  assert.match(app, /'ltx-edit': \{[\s\S]*?experimental: true,[\s\S]*?preview: \{ type: 'video', src: '\/guides\/ltx-edit-inpaint\.mp4' \}/);
  assert.match(app, /\$\('#vidEngineBadge'\)\.hidden = !definition\.experimental/);
  assert.match(app, /button\.setAttribute\('aria-label', `Use \$\{definition\.model\}\$\{definition\.experimental \? ' \(experimental\)' : ''\} for \$\{definition\.task\}`\)/);
  assert.match(app, /if \(definition\.experimental\) \{[\s\S]*?badge\.className = 'model-status-badge';[\s\S]*?badge\.textContent = 'Experimental';/);
});

test('Video source cards omit redundant aspect and gesture helper copy', () => {
  assert.doesNotMatch(html, /aspect follows image|tap to add|hold frames to move/i);
  assert.doesNotMatch(app, /vidInputsHint/);
});

test('Secondary video controls remain behind an animated accessible disclosure', () => {
  assert.match(html, /id="vidOptsHeader"[^>]*aria-expanded="false"[^>]*aria-controls="vidOptsBody"/);
  assert.match(html, /id="vidOptsBody" aria-hidden="true" inert/);
  assert.match(css, /\.video-options-body \{[\s\S]*grid-template-rows: 0fr/);
  assert.match(css, /\.video-options-panel\.expanded \.video-options-body \{[\s\S]*grid-template-rows: 1fr/);
  assert.match(app, /function setVideoOptionsExpanded\(open\)/);
});

test('Duration is the first video control and Motion Freedom is a separate setting', () => {
  assert.doesNotMatch(html, /id="vidTiming(?:Header|Body|Panel)"/);
  assert.ok(html.indexOf('id="vidDurationField"') < html.indexOf('id="vidSigmaRow"'));
  assert.ok(html.indexOf('id="vidFreeField"') > html.indexOf('id="vidScailAdvancedRow"'));
  assert.match(html, /class="video-number-setting video-duration-primary" id="vidDurationField"/);
  assert.match(html, /class="video-number-setting video-motion-setting" id="vidFreeField"/);
  assert.match(html, /id="vidDur"[^>]*type="range"[^>]*min="1"[^>]*max="20"[^>]*step="0\.1"/);
  assert.match(html, /id="vidDur"[^>]*aria-label="Video duration in seconds"/);
  assert.match(html, /id="vidDurationHint" hidden/);
  assert.match(html, /class="duration-slider-value"[^>]*for="vidDurManual"/);
  assert.match(html, /id="vidDurManual"[^>]*type="number"[^>]*step="0\.1"[^>]*inputmode="decimal"[^>]*aria-label="Enter video duration in seconds"/);
  assert.match(html, /id="vidDurBubble"[^>]*for="vidDur"/);
  assert.match(html, /id="vidDurTicks"/);
  assert.match(html, /id="vidDurMin">1s<\/span><span id="vidDurMax">20s/);
  assert.doesNotMatch(html, /id="vidDurScrub"|id="durationPickerSheet"|id="durationWheel"/);
  assert.match(html, /id="vidFreeScrub"[^>]*role="spinbutton"/);
  assert.match(html, /id="vidFreePrev"/);
  assert.match(html, /id="vidFreeNext"/);
  assert.match(html, /id="motionPickerSheet"/);
  assert.match(html, /id="motionWheel"[^>]*role="listbox"/);
  assert.match(html, /id="motionPickerDone"/);
  assert.doesNotMatch(html, /id="vidFree" type="range"/);
  assert.match(css, /\.video-number-scrubber \{[\s\S]*touch-action: none/);
  assert.match(css, /\.duration-compact-wheel \{/);
  assert.match(css, /\.duration-slider-track \{[\s\S]*border-radius: 999px/);
  assert.match(css, /\.video-duration-primary \{[\s\S]*background: #000/);
  assert.match(html, /class="duration-slider-thumb" aria-hidden="true"/);
  assert.match(css, /\.duration-slider-progress \{[\s\S]*var\(--duration-visual-progress\)[\s\S]*linear-gradient\(to right, #fc575d 0%, #9253f7 100%\)/);
  assert.match(css, /\.duration-slider-value \{[\s\S]*linear-gradient\(#000, #000\) padding-box, linear-gradient\(to right, #fc575d, #9253f7\) border-box/);
  assert.match(css, /\.director-field-grid \.duration-slider-value \{[\s\S]*linear-gradient\(#000,#000\) padding-box,linear-gradient\(to right,#fc575d,#9253f7\) border-box/);
  assert.doesNotMatch(css, /\.duration-slider-progress \{[\s\S]{0,300}box-shadow/);
  assert.match(css, /\.duration-slider-ticks i \{[\s\S]*height: 13px/);
  assert.match(css, /\.duration-slider-ticks i\.minor \{[\s\S]*height: 7px/);
  assert.match(css, /\.duration-slider-shell\.zooming \.duration-slider-ticks i \{[\s\S]*translate: var\(--duration-tick-shift\)/);
  assert.match(css, /\.duration-slider-shell\.fine \.duration-slider-ticks i \{[\s\S]*animation: durationFineTicks/);
  assert.match(css, /\.duration-slider-bubble \{[\s\S]*transition: transform 120ms ease/);
  assert.doesNotMatch(css, /transition: left 120ms ease/);
  assert.match(css, /\.duration-slider-control input\[type="range"\]::\-webkit-slider-thumb \{[\s\S]*height: 26px/);
  assert.match(css, /\.duration-slider-thumb \{[\s\S]*left: clamp\(8px, var\(--duration-visual-progress\)/);
  assert.match(css, /\.duration-slider-shell\.snapping \.duration-slider-thumb,[\s\S]*transition: left 190ms/);
  assert.match(css, /\.duration-slider-value input \{[\s\S]*appearance: textfield;[\s\S]*text-align: right/);
  assert.match(css, /\.duration-wheel \{[\s\S]*scroll-snap-type: y mandatory/);
  assert.doesNotMatch(css, /\.horizontal-duration-wheel|\.duration-horizontal-scrubber/);
  assert.match(app, /function renderVideoDurationSlider\(\)/);
  assert.match(app, /function formatVideoDuration\(value\)/);
  assert.match(app, /function videoDurationTickIncrement\(min, max\)[\s\S]*span > 30\) return 5;[\s\S]*return 1;/);
  assert.match(app, /style\.setProperty\('--duration-visual-progress', `\$\{progress\}%`\)/);
  assert.match(app, /input\.setAttribute\('aria-valuetext', `\$\{displayValue\} second/);
  assert.match(app, /function syncManualVideoDuration\(\)/);
  assert.match(app, /function enterFineVideoDuration\(\)/);
  assert.match(app, /function scheduleVideoDurationFineHold\(event\)[\s\S]*setTimeout\(enterFineVideoDuration, 420\)/);
  assert.match(app, /distance > 8\)[\s\S]*scheduleVideoDurationFineHold\(event\)/);
  assert.match(app, /const fineMin = Number\(\(value - anchor \* windowSize\)\.toFixed\(4\)\)/);
  assert.match(app, /input\.step = 'any'/);
  assert.match(app, /function animateVideoDurationSnap\(\)[\s\S]*Math\.round\(Number\(input\.value\)/);
  assert.match(app, /slider\.classList\.add\('snapping'\)/);
  assert.match(app, /slider\.classList\.add\('returning', 'scale-transition'\)/);
  assert.match(app, /\$\('#vidDurationSlider'\)\.classList\.add\('fine'\)/);
  assert.match(app, /#vidDurManual'\)\.addEventListener\('input', syncManualVideoDuration\)/);
  assert.match(app, /#vidDurManual'\)\.addEventListener\('keydown'/);
  assert.match(app, /function wireVideoScrubber\(buttonId, inputId, onTap\)/);
  assert.match(app, /function renderVideoValueWheel\(inputId, wheelId\)/);
  assert.match(app, /function openMotionPicker\(\)/);
  assert.match(app, /wireVideoScrubber\('vidFreeScrub', 'vidFree', openMotionPicker\)/);
  assert.match(app, /drag\.y - event\.clientY/);
  assert.match(app, /event\.key === 'ArrowUp'/);
  assert.doesNotMatch(app, /openDurationPicker|durationPickerSheet|vidDurScrub/);
});

test('LTX 2.3, LTX 2.5, and MiniMax H3 expose their supported duration limits', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /id="vidDur"[^>]*max="20"/);
  assert.match(html, /id="animDur"[^>]*max="20"/);
  assert.match(app, /function videoDurationMax\(engine\)[\s\S]*engine === 'scail'\) return 60;[\s\S]*cameraMotionReferenceSelected\(\)\) return cameraMotionGuideLimit\(\);[\s\S]*engine === 'ltx' \|\| engine === 'ltx25'\) return 20;[\s\S]*engine === 'h3'\) return h3LongContextActive\(\) \? 120 : 15;[\s\S]*return 15;/);
  assert.match(app, /Math\.min\(Number\(durEl\.max\) \|\| 15, Math\.round\(len\)\)/);
  assert.match(server, /engine === 'ltx'[\s\S]*ltxDurationSeconds\(seconds\)/);
  assert.match(server, /seconds: opts\.seconds/);
});

test('LTX settings avoid duplicate pipeline and playback summaries', () => {
  assert.doesNotMatch(html, /id="vidLtx(?:Generation|Playback)/);
  assert.doesNotMatch(app, /vidLtx(?:Generation|Playback)/);
  assert.match(app, /const ltxFamily = engine === 'ltx' \|\| engine === 'ltx25' \|\| ltxEdit/);
  assert.match(app, /function renderVideoFpsChoices\(\)/);
  assert.match(app, /const baseFps = state\.vidEngine === 'ltx25'[\s\S]{0,160}\? 24[\s\S]{0,160}state\.vidEngine === 'scail'/);
  assert.match(app, /\$\('#vidFpsRow'\)\.hidden = h3 \|\| !\(ltxFamily \|\| wanOrScail\)/);
  assert.match(app, /\$\('#vidScailFpsField'\)\.hidden = !\(isVideo && state\.vidEngine === 'scail'\)/);
  assert.match(app, /\$\{baseFps \* multiplier\} fps · RIFE/);
});

test('LTX requests can pass through the same RIFE interpolation stage as Wan and SCAIL', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /const smooth = \(engine === 'ltx' \|\| engine === 'ltx25' \|\| isLtxEdit \|\| engine === 'wan' \|\| engine === 'scail'\)/);
  assert.match(server, /frameSource = await rifeSmooth\(graph, frameSource, opts\.smooth\);/);
  assert.match(server, /fps: opts\.fps \* \(opts\.smooth > 1 \? opts\.smooth : 1\)/);
});

test('LTX Edit uses a source-video workflow and forces literal edit prompts', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /data-engine="ltx-edit"[^>]*data-task-label="Video Editing"[^>]*data-model-label="LTX Edit"[^>]*data-experimental="true"[^>]*><b>LTX Edit\s*<span class="model-status-badge">Experimental<\/span><\/b><small>Video Editing<\/small>/);
  assert.match(html, /id="setLtxEditLora"/);
  assert.match(app, /'Describe the edit…'/);
  assert.match(app, /'Source video'/);
  assert.match(app, /enhance: ltxEdit \? false : state\.enhance/);
  assert.match(server, /ltxEditLora: 'edit_anything_v1\.1_r256\.safetensors'/);
  assert.match(server, /class_type: 'LTXVAddGuide'/);
  assert.match(server, /guideVideoName: isLtxEdit \? driveVideoName : null/);
  assert.match(server, /const enhance = isLtxEdit \? false : body\.enhance !== false/);
});

test('Video prompt tools stay hidden and structured audio labels survive state changes', () => {
  assert.match(css, /\.prompt-tools\[hidden\]/);
  assert.match(css, /#vidDriveTools\[hidden\]/);
  assert.match(html, /data-audio-title/);
  assert.match(app, /function setAudioChipVisual\(chip, active\)/);
});

test('SCAIL accepts a driving video without a typed motion prompt', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(app, /state\.vidEngine === 'scail' \|\| autoMotionPrompt/);
  assert.match(app, /'Optional — add style or motion direction…'/);
  assert.match(server, /if \(!suppliedMotionPrompt && engine !== 'scail' && !autoMotionRequested\)/);
  assert.match(server, /let motionPrompt = suppliedMotionPrompt \|\| 'preserve the movement from the driving video';/);
});

test('SCAIL leads with motion and reference inputs while retaining optional text conditioning', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(app, /promptPanel\.classList\.toggle\('scail-input-first', scailInputFirst\)/);
  assert.match(app, /scailInputFirst \? 'Creative direction · optional' : 'Prompt'/);
  assert.match(app, /#vidAttachTitle'\)\.textContent = scail \? 'Reference image' : 'First frame'/);
  assert.match(css, /#promptPanel\.scail-input-first > #vidAttachRow \{[\s\S]*order: 0/);
  assert.match(css, /#promptPanel\.scail-input-first #vidDriveBtn,[\s\S]*order: 0/);
  assert.match(css, /#promptPanel\.scail-input-first #vidAttachBtn,[\s\S]*order: 1/);
  assert.match(css, /\.video-input-grid \.media-input-card,[\s\S]*aspect-ratio: 4 \/ 3/);
  assert.match(server, /graph\.pos = \{ class_type: 'CLIPTextEncode', inputs: \{ clip: \['clip', 0\], text: opts\.prompt \} \}/);
});

test('A start-frame action can ask the vision model for a fitting motion prompt', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /class="frame-prompt-action"[^>]*id="vidMotionPromptBtn"[^>]*aria-label="Create a motion prompt from this first frame"/);
  assert.match(html, /id="vidMotionPromptLabel">Motion prompt/);
  assert.match(app, /#vidMotionPromptBtn'\)\.addEventListener\('click'/);
  assert.match(app, /api\('\/api\/motionprompt'/);
  assert.match(app, /imageName: context\.imageName,[\s\S]{0,160}engine: context\.engine,[\s\S]{0,100}seconds: context\.seconds/);
  assert.match(app, /state\.prompts\.video = preparedPrompt/);
  assert.match(app, /label\.textContent = 'Reading frame'/);
  assert.match(css, /\.motion-prompt-row \.frame-prompt-action \{/);
  assert.match(app, /const canSuggestMotion = !editAnything && !scail && !h3ReferenceModeActive\(\) && has/);
  assert.match(app, /#vidMotionPromptRow'\)\.hidden = !canSuggestMotion/);
  assert.match(server, /body\.imageName/);
  assert.match(server, /sharedMotionPrompt\(comfyName/);
  assert.match(server, /if \(!prompt\) \{[\s\S]*sharedMotionPrompt/);
});

test('automatic motion prompting keeps each queued frame and video submission atomic', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /id="vidAutoMotionToggle"[^>]*role="switch"[^>]*aria-checked="false"/);
  assert.match(app, /vidAutoMotionPrompt: false/);
  assert.match(app, /autoMotionPrompt,\s*preparedMotionPrompt: false/);
  assert.match(app, /state\.motionPromptRequestsPending \+= 1/);
  assert.match(app, /Reading frame, then queueing video/);
  assert.match(app, /Promise\.allSettled\(requests\.map/);
  assert.match(app, /preparedMotionPromptCache/);
  assert.match(app, /motionPromptRequest && motionPromptRequest\.key === key/);
  assert.doesNotMatch(app, /function maybeCreateAutomaticMotionPrompt\(\)/);
  assert.doesNotMatch(app, /createMotionPromptFromFirstFrame\(\{ automatic: true \}\)/);
  assert.match(app, /classList\.toggle\('auto-armed', armed\)/);
  assert.match(app, /'Auto motion armed'/);
  assert.match(server, /if \(autoMotionRequested\)/);
  assert.match(app, /&& !h3ReferenceModeActive\(\);/);
  assert.match(server, /sharedMotionPrompt\(comfyName, seed, req\.profile\.id, userMotionPrompt, \{[\s\S]{0,260}engine,[\s\S]{0,80}seconds,[\s\S]{0,100}longContext: h3LongContext,[\s\S]{0,160}hasFirstFrame:[\s\S]{0,100}hasLastFrame:/);
  assert.match(server, /const preparedMotionPrompt = body\.preparedMotionPrompt === true/);
  assert.match(server, /queuePrompt\(graph, \{ profileId, front: true \}\)/);
  assert.match(server, /body\.autoMotionPrompt === true[\s\S]{0,100}!h3ReferenceBacked/);
});

test('Video exposes the shared prompt revision assistant with H3-aware context', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const galleryAnimate = app.slice(app.indexOf("$('#animateGo').addEventListener"), app.indexOf("$('#lbClose').addEventListener"));
  assert.match(html, /id="videoPromptAssistantBtn"[^>]*aria-label="Revise video prompt"/);
  assert.match(app, /#videoPromptAssistantBtn'\)\.addEventListener\('click', openPromptAssistant\)/);
  assert.match(app, /kind: revisionView === 'video' \? 'video' : 'image'/);
  assert.match(app, /h3Mode: revisionH3Mode \|\| undefined/);
  assert.match(app, /endImageName: revisionEndImageName/);
  assert.match(app, /'Add shot beats'/);
  assert.match(app, /#videoPromptTools'\)\.hidden = !isVideo/);
  assert.match(server, /videoRevision[\s\S]*reviseVideoPrompt\(/);
  assert.match(server, /broadcastStatus: false/);
  assert.match(server, /statusText && options\.broadcastStatus !== false/);
  assert.match(server, /scope: 'generation-preflight'/);
  assert.match(app, /d\.jobId === 'pre'[\s\S]{0,160}d\.scope !== 'generation-preflight'[\s\S]{0,100}generationPreflightRequests < 1/);
  assert.match(app, /async function generationApi\([\s\S]{0,260}generationPreflightRequests = Math\.max/);
  assert.doesNotMatch(galleryAnimate, /generationApi\(/);
  assert.match(app, /finally \{[\s\S]{0,520}refreshQueue\(\)\.catch/);
  assert.match(promptEnhance, /Preserve every <Picture n>, <Video n>, and <Audio n>/);
});

test('MiniMax H3 exposes an official-format guide with safe local dialogue formatting', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const localStructure = app.slice(
    app.indexOf('function structureCurrentH3Prompt()'),
    app.indexOf("$('#h3PromptGuideBtn').addEventListener", app.indexOf('function structureCurrentH3Prompt()')),
  );
  assert.match(html, /id="h3PromptGuideBtn"[^>]*aria-label="Open MiniMax H3 prompt guide"[^>]*hidden/);
  assert.match(html, /id="h3PromptGuideSheet"[\s\S]*Optional MiniMax structure[\s\S]*id="h3PromptFormatDialogue"[\s\S]*id="h3PromptStructure"/);
  assert.match(html, /id="h3PromptDialogueLanguage"[\s\S]*<option>Spanish<\/option>/);
  assert.ok(html.indexOf('/h3-prompt-guide.js') < html.indexOf('/app.js'));
  assert.match(app, /const H3PromptGuide = window\.H3PromptGuide/);
  assert.match(app, /function renderH3PromptGuideTrigger\(\)[\s\S]{0,220}h3PromptGuideActive\(\)/);
  assert.match(app, /H3PromptGuide\.formatDialogue\(before,[\s\S]{0,100}language:/);
  assert.match(localStructure, /H3PromptGuide\.structurePrompt\(before, h3PromptGuideContext/);
  assert.doesNotMatch(localStructure, /api\(/);
  assert.doesNotMatch(localStructure, /state\.enhance\s*=/);
  assert.match(html, /Generate with any prompt[\s\S]{0,180}local tools can add the official structure and dialogue tags without an LLM/);
  assert.match(html, /These tools never gate Generate/);
  assert.match(app, /function h3EffectiveDurationSeconds\([\s\S]{0,220}H3PromptGuide\.h3EffectiveDurationSeconds\(value, h3LongContextActive\(\) \? 120 : 15\)/);
  assert.match(app, /seconds: h3EffectiveDurationSeconds\(\)/);
  assert.match(app, /Official structure ready[\s\S]{0,240}effectiveDuration\.toFixed\(2\)\}s output/);
  assert.doesNotMatch(app, /h3StructuredPromptReadyForGeneration/);
  assert.match(app, /h3PromptStructure: state\.h3PromptStructure/);
  assert.match(app, /state\.promptRevisionUndo = \{ before, after: result\.prompt, view: 'video' \}/);
  assert.match(app, /hasFirstFrame: revisionEngine === 'h3' \? revisionHasFirstFrame : undefined/);
  assert.match(app, /hasLastFrame: revisionEngine === 'h3' \? revisionHasLastFrame : undefined/);
  assert.match(app, /allowedReferenceTokens: revisionEngine === 'h3' \? allowedReferenceTokens : undefined/);
  assert.match(app, /allowedReferenceTokens: referenceMode \? h3PromptReferenceEntries\(\)\.map\(\(entry\) => entry\.tag\) : \[\]/);
  assert.doesNotMatch(app, /H3PromptGuide\.auditStructure\(revised,/);
  assert.match(server, /advisoryStructure: true/);
  assert.match(server, /useFallbackOnEmpty: false/);
  assert.match(server, /function h3PromptMaxTokens\(mode\)[\s\S]{0,220}mode === 'reference' \? 1400 : 900/);
  assert.match(server, /const hasFirstFrame = body\.hasFirstFrame === undefined[\s\S]{0,120}revisionMode === 'frames' && !!imageName[\s\S]{0,80}body\.hasFirstFrame === true/);
  assert.match(server, /const hasLastFrame = body\.hasLastFrame === true/);
  assert.match(server, /const allowedReferenceTokens = revisionMode === 'reference'[\s\S]{0,180}h3PromptReferenceTokens/);
  assert.match(server, /frames = h3FramesForSeconds\(seconds\);[\s\S]{0,80}seconds = h3EffectiveDurationSeconds\(seconds\);/);
  assert.match(server, /const seconds = engine === 'h3'[\s\S]{0,260}h3LongContextSegments\(requestedSeconds\)[\s\S]{0,180}h3EffectiveDurationSeconds\(requestedSeconds\)/);
  assert.match(server, /seconds: revisionEngine === 'h3'[\s\S]{0,280}h3LongContextSegments\(body\.seconds\)[\s\S]{0,180}h3EffectiveDurationSeconds\(body\.seconds\)/);
});

test('video prompt enhancement combines the first frame with the initial motion idea', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /function suggestMotionPrompt\(comfyImageName, seed, profileId, userPrompt = '', options = \{\}\)/);
  assert.match(server, /motionPromptEnhanceParts\(userPrompt, options\)/);
  assert.match(promptEnhance, /Preserve its intent and use the image to make it more specific and visually grounded/);
  assert.match(server, /const frameAwareEnhance = !bypass && !faceImageName && !isLtxEdit && engine !== 'h3'/);
  assert.match(server, /frameAwareEnhance && enhance && suppliedMotionPrompt/);
  assert.match(server, /enhance: isLtxLike \? enhance && !refinedMotionPrompt : false/);
});

test('MiniMax H3 enhancement uses a validated duration-aware prompt pass and records the result', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /id="enhanceBtn"[^>]*aria-pressed="true"/);
  assert.match(app, /\$\('#enhanceBtn'\)\.hidden = isVideo && state\.vidEngine === 'ltx-edit'/);
  assert.match(app, /\$\('#enhanceBtn'\)\.hidden = ltxEdit/);
  assert.match(app, /renderVidFace\(\);[\s\S]{0,100}updateVideoPanels\(\);[\s\S]{0,60}renderEnhance\(\);/);
  assert.match(app, /H3 prompt enhance: on · official structure, camera, sound, and exact dialogue/);
  assert.match(app, /enhance: ltxEdit \? false : state\.enhance/);
  assert.match(server, /function enhanceH3Prompt\(userPrompt, seed, options = \{\}\)/);
  assert.match(server, /h3PromptEnhanceParts\(userPrompt, \{[\s\S]{0,180}seconds: h3Options\.seconds,[\s\S]{0,100}mode: h3Options\.mode/);
  assert.match(server, /function sharedH3PromptEnhancement\([\s\S]{0,800}const active = h3PromptFlights\.get\(key\);[\s\S]{0,100}if \(active\) return active/);
  assert.match(server, /validatedH3Prompt\([\s\S]{0,500}validationFeedback/);
  assert.match(server, /engine === 'h3' && enhance && suppliedMotionPrompt && !autoGeneratedMotion/);
  assert.match(server, /const h3PromptImageNames = engine !== 'h3'[\s\S]{0,180}h3ReferenceBacked[\s\S]{0,100}h3References\.images\[0\]\?\.name[\s\S]{0,140}!bypass \? comfyName : null/);
  assert.match(server, /refinedMotionPrompt = cleanEnhancedText\(raw, motionPrompt\);[\s\S]{0,80}prompt = refinedMotionPrompt/);
  assert.match(server, /motionPrompt: recordedMotionPrompt,[\s\S]{0,100}refinedMotionPrompt: recordedRefinedMotionPrompt/);
  assert.doesNotMatch(server, /wanRefined/);
  assert.match(server, /refinedPrompt: completedRefinedMotionPrompt/);
  assert.match(server, /refinedMotionPrompt: completedRefinedMotionPrompt/);
  assert.match(app, /copyableMeta\('Enhanced motion', info\.refinedMotionPrompt\)/);
});

test('Video exposes model-aware step counts and keeps fixed schedules read-only', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /id="advancedStepsHint"/);
  assert.match(html, /id="videoAdvancedNote"[^>]*>CFG follows the selected video model\. Fixed schedules are read-only; MiniMax H3 steps remain adjustable for the selected Turbo adapter\./);
  assert.match(app, /#seedInput'\)\.closest\('\.panel'\)\.hidden = false/);
  assert.match(app, /function videoStepSpecification\(\)/);
  assert.match(app, /#advancedStepsField'\)\.hidden = false/);
  assert.match(app, /h3TurboActive\(\) \? normalizedH3TurboSteps\(\) : normalizedH3Steps\(\)/);
  assert.match(app, /input\.readOnly = !spec\.editable/);
  assert.match(app, /if \(view === 'video'\) return 'video'/);
  assert.match(app, /const batch = Math\.max\(1, Math\.min\(8, Number\(\$\('#batchInput'\)\.value\)/);
  assert.match(server, /Number\.isSafeInteger\(requestedSeed\)/);
  assert.match(server, /const videoSteps = engine === 'h3'/);
  assert.match(server, /steps: opts\.steps/);
});

test('MiniMax H3 Turbo supports Frames and Reference modes with separate audio-safe setup paths', () => {
  assert.match(html, /id="vidH3TurboToggle"[^>]*role="switch"[^>]*aria-checked="false"/);
  assert.match(html, /id="vidH3TurboSummary">6 frames · 6 reference · audio-safe/);
  assert.match(html, /id="vidH3TurboCaution"[^>]*data-icon-tooltip="MiniMax H3 Turbo caution"/);
  assert.match(html, /id="vidH3TurboStrength"[^>]*min="0\.8"[^>]*max="1\.2"[^>]*value="1"/);
  assert.match(html, /<label for="vidH3TurboStrength">Turbo LoRA strength<\/label>/);
  assert.match(html, /id="vidH3TurboStrength"[^>]*aria-describedby="vidH3TurboStrengthHelp vidH3TurboStrengthScale"/);
  const advancedBody = html.slice(html.indexOf('id="advBody"'), html.indexOf('</main>'));
  assert.match(advancedBody, /id="vidH3TurboStrengthField"/);
  assert.ok(html.indexOf('id="vidH3TurboPanel"') < html.indexOf('id="advBody"'));
  assert.ok(html.indexOf('id="advBody"') < html.indexOf('id="vidH3TurboStrengthField"'));
  assert.match(css, /\.h3-turbo-strength-slider::before[\s\S]{0,500}--h3-turbo-progress/);
  assert.match(html, /id="setH3TurboLora"/);
  assert.match(html, /id="setH3RefTurboLora"/);
  assert.match(html, /id="setH3TurboSetup"[\s\S]*value="recommended"[\s\S]*value="lightx8"[\s\S]*value="legacy"/);
  assert.match(app, /vidH3Turbo: false/);
  assert.match(app, /vidH3TurboSteps: 6/);
  assert.match(app, /vidH3RefTurboSteps: 6/);
  assert.match(app, /function normalizedH3TurboSteps\([\s\S]{0,360}Math\.max\(4/);
  assert.match(app, /function h3TurboActive\(\)[\s\S]{0,120}state\.vidH3Turbo === true/);
  assert.match(app, /H3 Reference Turbo · 6-step LightX2V audio-safe setup/);
  assert.match(app, /LightX2V · audio-safe sampler/);
  assert.match(app, /H3 Turbo v4\/600 · 6-step quality default/);
  assert.match(app, /H3 Turbo legacy v1\/850 · original 4-step default/);
  assert.match(app, /const H3_TURBO_SETUPS = Object\.freeze/);
  assert.match(app, /lightx8:[\s\S]{0,220}minimax_h3_fl2v_turbo_8step_v1\.0_comfyui_bf16\.safetensors/);
  assert.match(app, /state\.vidH3TurboSteps = setup\.framesSteps/);
  assert.match(app, /state\.vidH3RefTurboSteps = setup\.referenceSteps/);
  assert.match(app, /6–8 steps recommended/);
  assert.match(app, /native audio-safe sampler/);
  assert.match(app, /if \(h3TurboActive\(\)\) components\.add\(h3ReferenceBackedMode\(\) \? 'h3turbor2v' : 'h3turbo'\)/);
  assert.match(app, /h3Turbo: state\.vidEngine === 'h3' \? h3TurboActive\(\) : undefined/);
  assert.match(server, /const h3Turbo = h3TurboRequested;/);
  assert.doesNotMatch(server, /h3_turbo_reference_unsupported/);
  assert.match(server, /clampInt\(body\.steps, 4, 100, h3TurboDefaultSteps\(settings, selectedMode\)\)/);
  assert.match(server, /h3TurboNativeSampler = minimaxH3NativeAudioSampling\(info\)/);
  assert.match(server, /if \(h3Core\.nativeAudioSampling\)[\s\S]{0,500}h3TurboUsesStandardLoader\(settings, 'frames'\)[\s\S]{0,240}'MiniMaxH3SigmaShift'/);
  assert.match(server, /h3turbo: \['MiniMaxH3TurboLoRA', 'MiniMaxH3TurboSampler'\]/);
  assert.match(server, /h3turbor2v: \['LoraLoaderModelOnly', 'MiniMaxH3SigmaShift', 'MiniMaxH3TurboSampler'\]/);
});

test('MiniMax H3 Frames Turbo defaults new installs to v4 while preserving explicit legacy and manual adapters', () => {
  assert.match(server, /const DEFAULT_H3_TURBO_LORA = H3_TURBO_LORAS\.framesRecommended/);
  assert.match(server, /const SETTINGS_SCHEMA_VERSION = 3/);
  assert.doesNotMatch(server, /stored\.h3TurboLora = DEFAULT_H3_TURBO_LORA/);
  assert.match(server, /keep the original ckpt850 four-step adapter/);
  assert.match(server, /h3TurboDefaultSteps\(settings, selectedMode\)/);
  assert.match(server, /stored\.settingsSchemaVersion = SETTINGS_SCHEMA_VERSION/);
  assert.match(server, /h3TurboLora: engine === 'h3' && opts\.turbo/);
  assert.match(app, /copyableMeta\('Turbo adapter', prettyLora\(String\(info\.h3TurboLora\)\)\)/);
});

test('long H3 Reference Turbo videos advance through five-second jobs and rejoin as one result', () => {
  assert.match(server, /h3TurboReferenceSegments\(frames\)/);
  assert.match(server, /opts\.turboReferenceSegment = h3TurboReferenceChunks\[0\]/);
  assert.match(server, /async function queueNextVideoChunk\(job\)/);
  assert.match(server, /videoChunkSequence\.chunkBuffers\[videoChunkSequence\.index\] = buf/);
  assert.match(server, /await joinVideoChunks\(\{/);
  assert.match(server, /broadcast\('videoChunkStep'/);
  assert.match(app, /if \(result\.sequenceId\) state\.activeJobSequences\.set\(result\.jobId, result\.sequenceId\)/);
  assert.match(app, /es\.addEventListener\('videoChunkStep'/);
  assert.match(app, /const sequenceLabel = wanAnimate2 \? 'Wan Animate 2 clip'/);
});

test('MiniMax H3 Long context allows Turbo with an icon-only quality caution', () => {
  assert.match(html, /id="vidH3LongContextToggle"[^>]*role="switch"[^>]*aria-checked="false"/);
  assert.match(html, /Long context <span class="h3-turbo-preview">Experimental<\/span>/);
  assert.match(app, /vidH3LongContext: false/);
  assert.match(app, /function h3LongContextActive\(\)/);
  assert.doesNotMatch(app, /if \(state\.vidH3LongContext\) \{[\s\S]{0,180}state\.vidH3Turbo = false/);
  assert.match(html, /id="vidH3LongContextCaution"[^>]*data-icon-tooltip-detail="Turbo is allowed/);
  assert.match(app, /caution\.hidden = !turbo/);
  assert.match(app, /if \(h3LongContextActive\(\)\) components\.add\('h3context'\)/);
  assert.match(app, /h3LongContext: state\.vidEngine === 'h3' \? h3LongContextActive\(\) : undefined/);
  assert.match(app, /if \(engine === 'h3'\) return h3LongContextActive\(\) \? 120 : 15/);
  assert.match(server, /h3LongContextSegments\(seconds, \{[\s\S]{0,120}maxGenerationFrames/);
  assert.match(server, /h3LongContextTurboVideo[\s\S]{0,200}h3References\.videos\.length/);
  assert.match(server, /type: 'long-context'/);
  assert.match(server, /MiniMaxH3MotionContextSaveLatent/);
  assert.match(server, /MiniMaxH3MotionContextLoadLatent/);
  assert.match(server, /sequenceKind: videoChunkSequence\.type/);
  assert.doesNotMatch(server, /h3_long_context_turbo_incompatible/);
});

test('First and last frames can be moved or swapped from the visible frame row', () => {
  assert.match(app, /function videoSupportsEndFrame\(\)[\s\S]*state\.vidEngine === 'h3' && state\.vidH3Mode === 'frames'/);
  assert.match(app, /#vidEndChip'\)\.hidden = faceMode \|\| ltxEdit \|\| !!state\.vidEnd/);
  assert.match(html, /id="vidEndThumb"[^>]*data-frame-role="end"[\s\S]*id="vidSwap"[\s\S]*id="vidFaceChip"/);
  assert.match(app, /swap\.hidden = !supportsEnd \|\| \(!hasFirst && !hasLast\)/);
  assert.match(app, /const nextFirst = state\.vidEnd \|\| null;[\s\S]*state\.vidEnd = state\.vidRef \|\| null;[\s\S]*setVideoFirstFrame\(nextFirst\)/);
  assert.match(app, /function wireVideoFrameDrag\(slot, role\)/);
  assert.match(app, /if \(!videoSupportsEndFrame\(\)\) return;/);
  assert.match(app, /if \(event\.pointerType === 'mouse'\) event\.preventDefault\(\)/);
  assert.match(app, /if \(event\.pointerType === 'mouse'\) activate\(\)/);
  assert.match(app, /document\.elementFromPoint\(event\.clientX, event\.clientY\)\?\.closest\('\.video-frame-slot'\)/);
  assert.match(app, /updateVideoPanels\(\);\s*saveForm\(\);\s*toast\(message\);/);
  assert.match(css, /\.video-frame-slot\.frame-drop-target/);
});

test('Gallery Animate routes an image into the full Video tab as either a start or end frame', () => {
  assert.match(html, /id="animateRouteSheet"/);
  assert.match(html, /id="animateRouteStart"/);
  assert.match(html, /id="animateRouteEnd"/);
  assert.match(app, /function openAnimateRouteSheet\(item\)/);
  assert.match(app, /function sendToVideoTab\(item, role = 'start'\)/);
  assert.match(app, /if \(role === 'end'\) state\.vidEnd = frame/);
  assert.match(app, /else setVideoFirstFrame\(frame\)/);
  assert.match(app, /openAnimateRouteSheet\(it\)/);
  assert.match(app, /function galleryImageDestinationActions\(item[\s\S]*label: 'First frame'[^\n]*sendToVideoTab\(item, 'start'\)/);
  assert.match(app, /function galleryImageDestinationActions\(item[\s\S]*label: 'Last frame'[^\n]*sendToVideoTab\(item, 'end'\)/);
  assert.match(app, /const endEngine = \['ltx25', 'ltx', 'h3', 'eros'\]\.find/);
  assert.match(html, /id="animateRouteStart"[\s\S]*<b>First frame<\/b>/);
  assert.match(html, /id="animateRouteEnd"[\s\S]*<b>Last frame<\/b>/);
});

test('MiniMax H3 keeps its frame and reference-backed downloads independent', () => {
  assert.match(html, /data-engine="h3"[^>]*data-feature-engine="video\.h3"[^>]*data-model-label="MiniMax H3"/);
  assert.match(html, /id="vidH3ModeRow"[\s\S]*class="h3-mode-indicator"[\s\S]*data-h3-mode="frames"[\s\S]*data-h3-mode="reference"[\s\S]*data-h3-mode="replace"/);
  assert.match(app, /modeRow\.style\.setProperty\('--h3-mode-index', replaceMode \? '2' : \(referenceMode \? '1' : '0'\)\)/);
  assert.match(css, /\.h3-mode-panel \{[\s\S]*border: 0;[\s\S]*background: transparent;/);
  assert.match(css, /\.h3-mode-indicator \{[\s\S]*transform: translateX\(calc\(var\(--h3-mode-index\) \* 100%\)\);[\s\S]*transition: transform 260ms/);
  assert.doesNotMatch(html, /Reference mode installs its separate Ref2VA model only when you first use it\./);
  assert.doesNotMatch(html, /Text \+ frames does not download that model\./);
  assert.doesNotMatch(html, /id="vidH3ModeCopy"/);
  assert.match(app, /const byEngine = \{ ltx: 'video', ltx25: 'ltx25', h3: 'h3'/);
  assert.match(app, /state\.vidEngine === 'h3' && h3ReferenceBackedMode\(\)\) components\.add\('h3r2v'\)/);
  assert.match(app, /sourceItemId: !h3Reference && state\.vidRef \? state\.vidRef\.srcItemId : undefined/);
  assert.match(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), /!item && body\.sourceItemId && !h3ReferenceBacked/);
  assert.match(app, /h3References: h3Reference \? Object\.fromEntries\(Object\.entries\(h3GenerationReferences\)/);
});

test('MiniMax H3 Replace mode offers a focused local-preset workflow', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /data-h3-mode="replace"[^>]*data-experimental="true"[^>]*aria-label="Replace, experimental"[^>]*hidden>Replace<\/button>/);
  assert.match(html, /id="experimentalFeaturesToggle"[^>]*role="switch"[^>]*aria-checked="false"[\s\S]{0,300}<strong>Experimental Features<\/strong>/);
  assert.match(app, /experimentalFeatures: saved\?\.experimentalFeatures === true/);
  assert.match(app, /if \(!replaceAvailable && state\.vidH3Mode === 'replace'\) state\.vidH3Mode = 'frames'/);
  assert.match(app, /replaceButton\.hidden = !replaceAvailable/);
  assert.match(app, /state\.vidH3Mode = savedH3Mode === 'replace' && !h3ReplaceAvailable\(\) \? 'frames' : savedH3Mode/);
  assert.match(css, /\.h3-mode-row \{[\s\S]*--h3-mode-count: 2;[\s\S]*grid-template-columns: repeat\(var\(--h3-mode-count\), minmax\(0, 1fr\)\)/);
  assert.match(css, /\.h3-mode-row\.has-replace \{ --h3-mode-count: 3; \}/);
  assert.match(html, /id="vidH3ReplacePanel"[\s\S]*id="vidH3ReplaceTarget"[\s\S]*id="vidH3ReplaceVideoBtn"[\s\S]*id="vidH3ReplaceImageBtn"[\s\S]*id="vidH3ReplacePromptBtn"/);
  assert.doesNotMatch(html, /Keep the plate\. Change one identity\. No mask needed\.|<b>Replacement prompt<\/b>/);
  assert.match(app, /function h3ReplacementReferences\(\)[\s\S]*images: state\.vidH3ReplaceImage[\s\S]*videos: state\.vidH3ReplaceVideo/);
  assert.match(app, /H3PromptGuide\.buildReplacementPrompt/);
  assert.match(app, /state\.enhance = false;[\s\S]{0,200}Replacement prompt applied locally/);
  assert.doesNotMatch(app, /Ready to build the replacement prompt locally|no LLM used/);
  assert.match(app, /promptStatus\.hidden = descriptionReady && !presetActive/);
  assert.match(app, /h3ReplaceKind:[\s\S]{0,160}h3ReplaceTarget:/);
  assert.match(server, /\['reference', 'replace'\]\.includes\(body\.h3Mode\)/);
  assert.match(server, /h3Mode === 'replace'[\s\S]{0,400}exactly one master video and one replacement image/);
  assert.match(server, /mode: h3GraphMode/);
  assert.match(css, /\.h3-replace-panel/);
  assert.match(css, /\.h3-replace-inputs/);
  assert.match(css, /\.h3-replace-inputs > \[hidden\] \{ display: none; \}/);
  assert.match(html, /class="[^"]*h3-replace-filled preview-only" id="vidH3ReplaceVideoThumb"[\s\S]*id="vidH3ReplaceVideoExpand"/);
  assert.doesNotMatch(html, /id="vidH3ReplaceVideoThumb"[\s\S]{0,220}<div class="attach-info">/);
  assert.match(css, /\.h3-replace-inputs \.h3-replace-filled \{[\s\S]*overflow: hidden;[\s\S]*contain: inline-size;/);
  assert.match(css, /\.h3-replace-inputs \.h3-replace-filled\.expanded \{[\s\S]*grid-column: 1 \/ -1;[\s\S]*aspect-ratio: auto;/);
  assert.match(app, /toggleInlineVideoPreview\(\$\('#vidH3ReplaceVideoThumb'\), \$\('#vidH3ReplaceVideoPreview'\), \$\('#vidH3ReplaceVideoExpand'\), 'master video'\)/);
});

test('SCAIL motion preview hides metadata while preserving remove and expand controls', () => {
  assert.match(html, /id="vidDriveThumb"[\s\S]*id="vidDriveExpand"[\s\S]*id="vidDriveX"/);
  assert.match(app, /\$\('#vidDriveThumb'\)\.classList\.toggle\('preview-only', scail\)/);
  assert.match(css, /\.video-input-grid \.media-input-filled\.preview-only \.attach-info \{ display: none; \}/);
});

test('MiniMax H3 Reference mode uses progressive media slots and prompt mention cards', () => {
  assert.match(html, /id="vidH3ReferencePanel"[\s\S]*class="edit-reference-add h3-reference-add" id="vidH3AddReference"/);
  assert.match(html, /class="ref-row h3-reference-grid" id="vidH3ReferenceList"/);
  assert.doesNotMatch(html, /Choose an empty <b>\+<\/b> input to upload or browse the Library/);
  assert.doesNotMatch(html, /id="vidH3AddImages"|id="vidH3AddVideo"|id="vidH3AddAudio"/);
  assert.match(app, /function pickH3Reference\(\)[\s\S]{0,240}pickUpload\(accept, addH3Reference, 'Choose H3 reference input'\)/);
  assert.match(app, /function assetPickerKinds\(accept\)[\s\S]{0,240}\['image', 'video', 'audio'\]/);
  assert.match(app, /multiple: options\.multiple === true && assetPickerKind\(accept\) === 'image'/);
  assert.match(app, /#vidH3AddReference'\)\.addEventListener\('click'[\s\S]{0,220}state\.vidH3RefSlots \+= 1/);
  assert.match(app, /function makeH3PromptReferenceToken\(tag\)/);
  assert.match(app, /open\.dataset\.openH3PromptRef = tag/);
  assert.match(app, /function replacePromptH3ReferenceToken\(token, tag\)[\s\S]{0,360}token\.replaceWith\(replacement\)/);
  assert.match(app, /openPromptMentionPicker\(\{ targetToken: h3Token \}\)/);
  assert.match(app, /<(?:\(\?:)?Picture\|Video\|Audio\) \\\\d\+>/);
  assert.match(app, /state\.view === 'edit' \|\| h3ReferenceModeActive\(\)[\s\S]{0,100}event\.data === '@'/);
  assert.match(app, /function renderPromptMentionPicker\(\)[\s\S]{0,760}h3PromptReferenceEntries\(\)/);
  assert.match(app, /Remove empty H3 reference input \$\{slotIndex \+ 1\}/);
  assert.match(app, /state\.vidH3RefSlots = Math\.max\(1, visibleSlots - 1\)/);
  assert.match(app, /state\.vidH3RefSlots = Math\.max\(1, h3ReferenceCount\(\)\);[\s\S]{0,260}renderPromptComposer\(\)/);
  assert.match(app, /function wireH3ReferenceReorder\(slot, entry\)/);
  assert.match(app, /if \(event\.pointerType === 'mouse'\) activate\(\)/);
  assert.match(app, /closest\('#vidH3ReferenceList \.ref-slot\.filled'\)/);
  assert.match(app, /\[assets\[fromIndex\], assets\[targetIndex\]\] = \[assets\[targetIndex\], assets\[fromIndex\]\]/);
  assert.match(app, /renderH3References\(\);\s*renderPromptComposer\(\);\s*refreshH3ReferenceResolution\(\);\s*saveForm\(\);\s*toast\('Reference inputs swapped'\)/);
  assert.match(app, /async function replaceH3Reference\(kind, index, asset\)/);
  assert.match(app, /refs\[kind\]\[index\] = asset/);
  assert.match(app, /prompt kept/);
  assert.match(app, /swap\.className = 'ref-swap'/);
  assert.match(app, /pickH3ReferenceReplacement\(kind, index\)/);
  assert.match(css, /\.h3-reference-grid \.ref-swap/);
  assert.doesNotMatch(app, /h3-reference-name/);
  assert.match(css, /\.h3-reference-grid \.ref-slot/);
  assert.match(css, /\.h3-reference-grid \.ref-slot \.ref-role \{[\s\S]*background: transparent;/);
  assert.match(css, /\.video-input-grid\.h3-frame-inputs \.media-input-filled \.attach-info \{[\s\S]*background: transparent;/);
  assert.match(css, /\.video-input-grid\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.prompt-h3-audio/);
  assert.match(css, /\.prompt-ref-open/);
  assert.match(css, /\.prompt-mention-option\.current/);
  assert.match(css, /\.h3-reference-grid \.ref-slot\.filled \{ cursor: grab;/);
  assert.match(html, /class="sheet centered-dialog-sheet" id="promptMentionSheet"/);
});

test('MiniMax H3 Reference mode offers local multi-style video restyling', () => {
  assert.match(html, /id="vidH3ReferencePanel"[\s\S]*id="vidH3Restyle"[^>]*disabled[^>]*>[\s\S]*?<span>Restyle<\/span>[\s\S]*?<\/button>/);
  assert.match(html, /class="h3-reference-options"[\s\S]*?<span>Image detail<\/span>[\s\S]*?id="vidH3RefSize"/);
  assert.match(html, /id="h3StyleSheet"[\s\S]*data-h3-style="anime-2d"[\s\S]*data-h3-style="live-action"[\s\S]*data-h3-style="feature-3d"[\s\S]*data-h3-style="cel-3d"/);
  assert.match(html, /id="h3StyleCustom"[^>]*maxlength="500"/);
  assert.match(app, /function openH3StylePicker\(\)/);
  assert.match(app, /function applyH3StyleTransferPrompt\(style, label = 'Custom'\)/);
  assert.match(app, /H3PromptGuide\.buildStyleTransferPrompt\(\{/);
  assert.match(app, /style,/);
  assert.match(app, /hasAudio: refs\.videos\[0\]\.hasAudio === true/);
  assert.match(app, /hasStyleImage: usesStyleImage/);
  assert.match(app, /Picture 1 guides the visual treatment/);
  assert.match(app, /#vidH3Restyle'\)\.addEventListener\('click', openH3StylePicker\)/);
  assert.match(app, /#h3StyleGrid \[data-h3-style\]/);
  assert.match(css, /\.h3-style-grid/);
  assert.match(css, /\.h3-reference-head-actions \{[^}]*display: flex;[^}]*align-items: center;/);
  assert.match(css, /\.h3-reference-options \{[\s\S]*?justify-content: space-between;/);
  assert.match(css, /\.h3-reference-size \{[\s\S]*?display: inline-flex;[\s\S]*?border-radius: 9px;/);
});

test('Multiple edit references support hold-and-drag reordering', () => {
  assert.match(app, /function wireRefReorder\(slot, index, maxSlots\)/);
  assert.match(app, /setTimeout\(\(\) => \{/);
  assert.match(app, /\[state\.refs\[drag\.from\], state\.refs\[drag\.target\]\]/);
  assert.match(css, /\.ref-slot\.ref-drop-target/);
});
