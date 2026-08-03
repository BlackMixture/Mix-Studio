'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PROBE_SENTINEL,
  installSageAttention,
  parseProbeOutput,
  sageAttentionInstallPlan,
  sageWheelForRuntime,
  tritonPlanForTorch,
} = require('../lib/sage-attention');

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
    sageImport: false,
    sageKernelReady: false,
    sageVersion: '',
    errors: [],
  }, overrides);
}

function probeOutput(value) {
  return `startup log\n${PROBE_SENTINEL}${JSON.stringify(value)}\n`;
}

test('SageAttention selects reviewed Windows wheels for the exact Torch and CUDA runtime', () => {
  assert.deepEqual(sageWheelForRuntime(snapshot()), {
    release: 'v2.2.0-windows.post6',
    filename: 'sageattention-2.2.0+cu130torch2.9.1.post6-cp310-abi3-win_amd64.whl',
    url: 'https://github.com/woct0rdho/SageAttention/releases/download/v2.2.0-windows.post6/sageattention-2.2.0+cu130torch2.9.1.post6-cp310-abi3-win_amd64.whl',
  });
  assert.match(sageWheelForRuntime(snapshot({ torchVersion: '2.10.0+cu128', cudaVersion: '12.8' })).filename, /cu128torch2\.10\.0andhigher/);
  assert.equal(sageWheelForRuntime(snapshot({ torchVersion: '2.9.1+cu126', cudaVersion: '12.6' })), null);
});

test('SageAttention install planning rejects unreviewed or unsuitable runtimes', () => {
  assert.equal(sageAttentionInstallPlan(snapshot()).installable, true);
  assert.match(sageAttentionInstallPlan(snapshot({ computeCapability: [7, 5] })).reason, /Ampere/);
  assert.match(sageAttentionInstallPlan(snapshot({ platform: 'darwin' })).reason, /Windows NVIDIA/);
  assert.match(sageAttentionInstallPlan(snapshot({ pythonHeadersReady: false })).reason, /include and libs/);
  assert.deepEqual(tritonPlanForTorch('2.9.1+cu130'), {
    minimum: '3.5', maximum: '3.6', spec: 'triton-windows>=3.5,<3.6',
  });
});

test('SageAttention probe output ignores unrelated Python startup logging', () => {
  assert.deepEqual(parseProbeOutput(probeOutput(snapshot())), snapshot());
  assert.throws(() => parseProbeOutput('ordinary output'), /did not return/);
});

test('SageAttention installer never permits dependency resolution to replace PyTorch', async () => {
  const calls = [];
  const initial = snapshot();
  const ready = snapshot({
    tritonImport: true,
    tritonVersion: '3.5.0.post26',
    tritonDistribution: 'triton-windows',
    sageImport: true,
    sageKernelReady: true,
    sageVersion: '2.2.0',
  });
  const run = async (_executable, args) => {
    calls.push(args);
    if (args[0] === '-c') return probeOutput(calls.filter((entry) => entry[0] === '-c').length > 1 ? ready : initial);
    return '';
  };
  const result = await installSageAttention({}, () => {}, {
    status: { canInstall: true, pythonPath: 'C:\\ComfyUI\\python.exe', basePath: 'C:\\ComfyUI' },
    existsSync: () => true,
    run,
  });
  assert.equal(result.ready, true);
  const installs = calls.filter((args) => args[0] === '-m' && args[1] === 'pip');
  assert.equal(installs.length, 2);
  installs.forEach((args) => assert.ok(args.includes('--no-deps')));
  assert.ok(installs.some((args) => args.includes('triton-windows>=3.5,<3.6')));
  assert.ok(installs.some((args) => args.some((arg) => /sageattention-2\.2\.0/.test(arg))));
  assert.equal(installs.some((args) => args.some((arg) => /^torch(?:$|[<>=])/.test(arg))), false);
});
