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
