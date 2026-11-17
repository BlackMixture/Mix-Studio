'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SLA_PROBE_SENTINEL,
  h3SlaInstallPlan,
  installH3SlaAttentionRuntime,
  parseSlaProbeOutput,
  publicSlaProbe,
} = require('../lib/h3-sla-attention');

function snapshot(overrides = {}) {
  return Object.assign({
    platform: 'win32',
    pythonVersion: '3.11.9',
    torchVersion: '2.9.1+cu130',
    cudaVersion: '13.0',
    cudaAvailable: true,
    computeCapability: [12, 0],
    deviceName: 'NVIDIA RTX PRO 6000 Blackwell',
    pythonHeadersReady: true,
    tritonImport: false,
    tritonVersion: '',
    tritonDistribution: '',
    errors: [],
  }, overrides);
}

function probeOutput(value) {
  return `startup log\n${SLA_PROBE_SENTINEL}${JSON.stringify(value)}\n`;
}

test('H3 SLA probe output ignores unrelated Python startup logging', () => {
  assert.deepEqual(parseSlaProbeOutput(probeOutput(snapshot())), snapshot());
  assert.throws(() => parseSlaProbeOutput('ordinary output'), /did not return/);
});

test('H3 SLA install planning requires a reviewed Ampere-or-newer CUDA runtime', () => {
  const plan = h3SlaInstallPlan(snapshot());
  assert.equal(plan.installable, true);
  assert.deepEqual(plan.triton, {
    minimum: '3.5', maximum: '3.6', spec: 'triton-windows>=3.5,<3.6',
  });
  assert.match(h3SlaInstallPlan(snapshot({ computeCapability: [7, 5] })).reason, /Ampere/);
  assert.match(h3SlaInstallPlan(snapshot({ cudaAvailable: false })).reason, /CUDA/);
  assert.equal(publicSlaProbe(snapshot({
    platform: 'linux', tritonImport: true, tritonVersion: '3.5.0', tritonDistribution: 'triton',
  }), h3SlaInstallPlan(snapshot({
    platform: 'linux', tritonImport: true, tritonVersion: '3.5.0', tritonDistribution: 'triton',
  })), { pythonPath: '/opt/comfy/python' }).ready, true);
});

test('H3 SLA installer adds only the reviewed Triton runtime and never resolves PyTorch', async () => {
  const calls = [];
  const initial = snapshot();
  const ready = snapshot({
    tritonImport: true,
    tritonVersion: '3.5.0.post26',
    tritonDistribution: 'triton-windows',
  });
  const run = async (_executable, args) => {
    calls.push(args);
    if (args[0] === '-c') return probeOutput(calls.filter((entry) => entry[0] === '-c').length > 1 ? ready : initial);
    return '';
  };
  const result = await installH3SlaAttentionRuntime({}, () => {}, {
    status: { canInstall: true, pythonPath: 'C:\\ComfyUI\\python.exe', basePath: 'C:\\ComfyUI' },
    existsSync: () => true,
    run,
  });
  assert.equal(result.ready, true);
  const installs = calls.filter((args) => args[0] === '-m' && args[1] === 'pip');
  assert.equal(installs.length, 1);
  assert.ok(installs[0].includes('--no-deps'));
  assert.ok(installs[0].includes('triton-windows>=3.5,<3.6'));
  assert.equal(installs[0].some((arg) => /^torch(?:$|[<>=])/.test(arg)), false);
});

test('H3 SLA probe reports inspection state so uninspectable runtimes do not hard-block', async () => {
  const { probeH3SlaAttention } = require('../lib/h3-sla-attention');
  const missingPath = await probeH3SlaAttention({}, {
    status: { pythonPath: '', basePath: 'C:\ComfyUI' },
    existsSync: () => false,
  });
  assert.equal(missingPath.inspected, true);
  assert.equal(missingPath.ready, false);
  assert.match(missingPath.reason, /Choose the local ComfyUI folder/);

  const failedRun = await probeH3SlaAttention({}, {
    status: { pythonPath: 'C:\ComfyUI\python.exe', basePath: 'C:\ComfyUI' },
    existsSync: () => true,
    force: true,
    run: async () => { throw new Error('probe process failed'); },
  });
  assert.equal(failedRun.inspected, false);
  assert.equal(failedRun.ready, false);
  assert.equal(failedRun.pythonReady, true);
  assert.match(failedRun.reason, /could not verify H3 SLA/);

  const inspected = await probeH3SlaAttention({}, {
    status: { pythonPath: 'C:\ComfyUI\python2.exe', basePath: 'C:\ComfyUI' },
    existsSync: () => true,
    force: true,
    run: async () => probeOutput(snapshot()),
  });
  assert.equal(inspected.inspected, true);
  assert.equal(inspected.ready, false);
});
