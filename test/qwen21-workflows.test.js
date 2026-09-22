'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildQwen21Graph, qwen21VariantSettings, recommendedQwen21Variant, qwen21Compatibility, QWEN21_CLASSES } = require('../lib/qwen21-workflows');
const { dependencyModelPlan } = require('../lib/dependency-installer');
const settings = qwen21VariantSettings('balanced');
const params = { mode: 't2i', prompt: 'A sign saying Mix Studio', width: 1024, height: 1024, steps: 25, cfg: 1, seed: 42, batch: 1 };
test('Qwen 2.1 follows the official generation graph and uses its own VAE and encoder', () => {
  const g = buildQwen21Graph(params, settings);
  assert.equal(g.clip.inputs.type, 'qwen_image');
  assert.equal(g.text.class_type, 'TextEncodeQwenImage21');
  assert.equal(g.vae.inputs.vae_name, 'qwen_image_2.1_vae_bf16.safetensors');
  assert.deepEqual(g.sampler.inputs.negative, ['text', 1]);
  assert.equal(g.sampler.inputs.scheduler, 'simple');
  assert.equal(g.sampler.inputs.steps, 25);
  assert.equal(g.latent.class_type, 'EmptyLatentImage');
  assert.ok(!Object.values(g).some(n => /AuraFlow|CFGNorm|Lightning/.test(n.class_type)));
});
test('editing keeps ordered flat autogrow references and the encoder-sized latent', () => {
  const g = buildQwen21Graph({...params, mode: 'edit', batch: 2}, settings, ['first.png', 'second.png']);
  assert.deepEqual(g.text.inputs['images.image_1'], ['image1', 0]);
  assert.deepEqual(g.text.inputs['images.image_2'], ['image2', 0]);
  assert.deepEqual(g.batch.inputs.samples, ['text', 2]);
  assert.deepEqual(g.sampler.inputs.latent_image, ['batch', 0]);
  assert.equal(g.text.inputs.resolution, 1024);
  assert.equal(g.sampler.inputs.denoise, 1);
});
test('custom edit size resizes the source and keeps canvas alignment', () => {
  const g = buildQwen21Graph({...params, mode:'edit', editAspectOverride:true, width:999, height:751}, settings, ['first.png']);
  assert.equal(g.resize.inputs.width, 992);
  assert.equal(g.resize.inputs.height, 736);
  assert.equal(g.text.inputs.resolution, 0);
  assert.deepEqual(g.sampler.inputs.latent_image, ['text', 2]);
});
test('Qwen rejects unsupported tools and missing edit references', () => {
  assert.throws(() => buildQwen21Graph({...params,mode:'edit'},settings), /input image/);
  for (const option of [{maskImageName:'mask.png'}, {editOutpaint:true}, {regions:[{}]}, {imageGuideMode:'depth'}]) {
    assert.throws(() => buildQwen21Graph({...params,...option},settings), /whole-image/);
  }
});
test('Qwen download recommendations respect hardware and explicit precision', () => {
  assert.equal(recommendedQwen21Variant({gpuVendor:'nvidia',vramGb:8}), 'compact');
  assert.equal(recommendedQwen21Variant({gpuVendor:'nvidia',vramGb:24}), 'balanced');
  assert.equal(recommendedQwen21Variant({gpuVendor:'apple',vramGb:64}), 'bf16');
  for (const [variant,encoder] of [['compact','w4a8'],['balanced','int8_convrot'],['bf16','bf16']]) {
    const plan = dependencyModelPlan(['qwen21'],{}, {modelVariants:{qwen21:variant}});
    assert.equal(plan.assets.length,3);
    assert.match(plan.effectiveSettings.qwen21Clip, new RegExp(encoder));
    for (const a of plan.assets) assert.ok(a[2].endsWith(plan.effectiveSettings[a[0]]));
  }
  assert.equal(dependencyModelPlan(['qwen21'],{}, {gpuVendor:'nvidia',vramGb:24}).effectiveSettings.qwen21ModelVariant, 'balanced');
});
test('Qwen capability check rejects an older ComfyUI instead of guessing from filenames', () => {
  assert.equal(qwen21Compatibility({}).supported,false);
  assert.equal(qwen21Compatibility(Object.fromEntries(QWEN21_CLASSES.map(c=>[c,{}]))).supported,true);
});
test('long-running Smart plans remain retrievable while their prompt job is tracked', () => {
  const s=fs.readFileSync(require.resolve('../server.js'),'utf8');
  const block=s.slice(s.indexOf('const smartPlanRequests = new Map();'),s.indexOf('function smartPlanRequestStatus('));
  const context=vm.createContext({jobs:new Map([['prompt1',{}]])});
  vm.runInContext(block+`\nsmartPlanRequests.set('test', {status:'planning',promptId:'prompt1',createdAt:1000,updatedAt:1000}); pruneSmartPlanRequests(1000+121*60000); globalThis.retained=smartPlanRequests.has('test'); jobs.delete('prompt1'); pruneSmartPlanRequests(1000+121*60000); globalThis.cleaned=!smartPlanRequests.has('test');`,context);
  assert.equal(context.retained,true);
  assert.equal(context.cleaned,true);
});
test('Qwen converts composer references to native image tags without changing unrelated numbers', () => {
  const g = buildQwen21Graph({...params,mode:'edit',prompt:'Use image 2 on @image-1; keep <image1> and image 3.'},settings,['one.png','two.png']);
  assert.equal(g.text.inputs.prompt,'Use <image2> on <image1>; keep <image1> and image 3.');
});
test('Qwen sampling restoration preserves shared seed and batch without overwriting Krea tuning', () => {
  const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
  const start=source.indexOf('function captureGenerationTuning(');
  const end=source.indexOf('function resetGenerationControl(',start);
  const controls=Object.fromEntries(['stepsInput','cfgInput','batchInput','seedInput','negativePromptInput'].map(k=>['#'+k,{value:''}]));
  Object.assign(controls['#stepsInput'],{value:40}); controls['#cfgInput'].value=1;controls['#batchInput'].value=2;controls['#seedInput'].value='42';
  const state={view:'create',generationTuning:{create:{steps:12,cfg:2,batch:1,seed:''}}};
  const context=vm.createContext({state,$:key=>controls[key],usingQwen21:()=>true,generationTuningMode:()=> 'create',normalizeGenerationTuning:(_,v)=>v,renderNegativePromptControl(){},renderVideoStepControl(){},renderKrea2Mode(){},renderQwen21Sampling(){controls['#stepsInput'].value=40;controls['#cfgInput'].value=1;}});
  vm.runInContext(source.slice(start,end)+'\ncaptureGenerationTuning();restoreGenerationTuning();',context);
  assert.equal(state.generationTuning.create.steps,12); assert.equal(state.generationTuning.create.cfg,2);
  assert.equal(state.generationTuning.create.batch,2); assert.equal(state.generationTuning.create.seed,'42');
  assert.equal(controls['#stepsInput'].value,40);
});
test('Qwen quality toggle updates sampling and follows Create and Edit settings', () => {
  const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8').replace(/\r\n/g, '\n');
  const controls = Object.fromEntries(['qwen21SamplingPanel', 'kreaModelPanel', 'editAspectControl', 'qwen21QualityToggle', 'qwen21QualityLabel', 'qwen21QualitySummary', 'stepsInput', 'cfgInput'].map(id => ['#' + id, {
    setAttribute(key, value) { this[key] = value; },
    addEventListener(event, handler) { this[event] = handler; },
    after(panel) { panel.previousElementSibling = this; },
  }]));
  const state = {view: 'create', qwen21Steps: 25, qwen21Cfg: 2.5};
  let saved = 0;
  const context = vm.createContext({state, $: id => controls[id], usingQwen21: () => true, saveForm() { saved++; }});
  const render = source.slice(source.indexOf('function renderQwen21Sampling()'), source.indexOf("$('#imageModelHeader').addEventListener"));
  const start = source.indexOf("$('#qwen21QualityToggle').addEventListener");
  const handler = source.slice(start, source.indexOf('\n\nfunction setEditModelExpanded', start));
  vm.runInContext(render + handler + '\nrenderQwen21Sampling();', context);
  const toggle = controls['#qwen21QualityToggle'];
  assert.equal(toggle['aria-checked'], 'false');
  assert.equal(controls['#qwen21QualityLabel'].textContent, 'Balance');
  assert.equal(controls['#qwen21SamplingPanel'].previousElementSibling, controls['#kreaModelPanel']);
  toggle.click();
  assert.equal(state.qwen21Steps, 40);
  assert.equal(controls['#stepsInput'].value, 40);
  assert.equal(controls['#cfgInput'].value, 2.5);
  assert.equal(controls['#cfgInput'].disabled, false);
  assert.equal(toggle['aria-checked'], 'true');
  assert.equal(controls['#qwen21QualityLabel'].textContent, 'Quality');
  state.view = 'edit';
  vm.runInContext('renderQwen21Sampling();', context);
  assert.equal(controls['#qwen21SamplingPanel'].previousElementSibling, controls['#editAspectControl']);
  assert.equal(state.qwen21Steps, 40);
  toggle.click();
  assert.equal(state.qwen21Steps, 25);
  assert.equal(saved, 2);
});

test('Qwen defaults to 40 steps and honors explicit Balance and guidance', () => {
  assert.equal(buildQwen21Graph({...params, steps:undefined},settings).sampler.inputs.steps,40);
  const graph=buildQwen21Graph({...params,steps:25,cfg:2.5,negativePrompt:'extra limbs'},settings);
  assert.equal(graph.sampler.inputs.steps,25);
  assert.equal(graph.sampler.inputs.cfg,2.5);
  assert.equal(graph.text.inputs.negative_prompt,'extra limbs');
});
test('Qwen native sizes and model switching preserve independent resolution choices', () => {
  const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
  const helpers=source.slice(source.indexOf('const QWEN21_NATIVE_MP'),source.indexOf('\nconst ',source.indexOf('function switchImageResolution')));
  const compute=source.slice(source.indexOf('function computeDims()'),source.indexOf('/* Form state is per profile'));
  const state={imageEngine:'krea2',createMode:'image',aspect:'1:1',mp:0.75,width:864,height:864,customDims:false,imageResolutions:{}};
  const context=vm.createContext({state,ASPECTS:[{label:'1:1',ar:1},{label:'16:9',ar:16/9}],round32:v=>Math.round(v/32)*32,h3ResolutionActive:()=>false});
  vm.runInContext(helpers+'\n'+compute+'\nswitchImageResolution("qwen21",96);',context);
  assert.equal(state.width,2048);assert.equal(state.height,2048);
  vm.runInContext('state.aspect="16:9";computeDims();',context);
  assert.equal(state.width,2752);assert.equal(state.height,1536);
  vm.runInContext('switchImageResolution("krea2");',context);
  assert.equal(state.mp,0.75);assert.equal(state.aspect,'1:1');
  vm.runInContext('switchImageResolution("qwen21",96);',context);
  assert.equal(state.width,2752);
  vm.runInContext('switchImageResolution("krea2");delete state.imageResolutions.qwen21;switchImageResolution("qwen21",8);',context);
  assert.equal(state.mp,1);
});

test('Qwen guidance edits persist independently and negative prompting stays available', () => {
  const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
  const controls=Object.fromEntries(['stepsInput','cfgInput','batchInput','seedInput','negativePromptInput'].map(k=>['#'+k,{value:''}]));
  controls['#cfgInput'].value='3';controls['#negativePromptInput'].value='extra fingers';
  const state={view:'create',qwen21Cfg:2.5,generationTuning:{create:{steps:12,cfg:1,batch:1}}};
  const context=vm.createContext({state,$:key=>controls[key],usingQwen21:()=>true,generationTuningMode:()=> 'create',normalizeGenerationTuning:(_,v)=>v});
  const capture=source.slice(source.indexOf('function captureGenerationTuning('),source.indexOf('function restoreGenerationTuning('));
  const negative=source.slice(source.indexOf('function negativePromptAvailability('),source.indexOf('function renderNegativePromptControl('));
  vm.runInContext(capture+negative+'\ncaptureGenerationTuning();globalThis.available=negativePromptAvailability();',context);
  assert.equal(state.qwen21Cfg,3);
  assert.equal(state.generationTuning.create.cfg,1);
  assert.equal(state.generationTuning.create.negativePrompt,'extra fingers');
  assert.equal(context.available.supported,true);
});
