'use strict';

const fs = require('fs');
const { execFile } = require('child_process');
const { sam3InstallStatus } = require('./sam3-installer');

const SAGE_WHEEL_ROOT = 'https://github.com/woct0rdho/SageAttention/releases/download';
const PROBE_SENTINEL = '__MIX_STUDIO_SAGE_ATTENTION__';
// The probe compiles and runs a real CUDA kernel. Cache it long enough that
// routine metadata refreshes do not repeatedly warm Triton on the user's GPU.
const PROBE_TTL_MS = 10 * 60_000;

let cachedProbe = null;
let cachedProbeAt = 0;
let cachedPythonPath = '';

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, {
      cwd: options.cwd,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      signal: options.signal,
      timeout: options.timeoutMs,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else resolve(String(stdout || ''));
    });
  });
}

function numericVersion(value) {
  const match = String(value || '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return match ? match.slice(1).map((part) => Number(part || 0)) : [0, 0, 0];
}

function versionAtLeast(value, target) {
  const left = numericVersion(value);
  const right = numericVersion(target);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
}

function sageWheelForRuntime(snapshot = {}) {
  const torch = numericVersion(snapshot.torchVersion);
  const cuda = numericVersion(snapshot.cudaVersion);
  const torchKey = `${torch[0]}.${torch[1]}.${torch[2]}`;
  const cudaKey = `${cuda[0]}.${cuda[1]}`;
  const cudaTag = { '12.4': 'cu124', '12.6': 'cu126', '12.8': 'cu128', '13.0': 'cu130' }[cudaKey];
  if (!cudaTag) return null;

  let release = '';
  let torchTag = '';
  let abi = 'cp310-abi3';
  if (torch[0] > 2 || (torch[0] === 2 && torch[1] >= 10)) {
    if (!['cu128', 'cu130'].includes(cudaTag)) return null;
    release = 'v2.2.0-windows.post6';
    torchTag = 'torch2.10.0andhigher';
  } else if (torchKey === '2.9.1') {
    if (!['cu128', 'cu130'].includes(cudaTag)) return null;
    release = 'v2.2.0-windows.post6';
    torchTag = 'torch2.9.1';
  } else if (torchKey === '2.9.0') {
    if (!['cu128', 'cu130'].includes(cudaTag)) return null;
    release = 'v2.2.0-windows.post4';
    torchTag = 'torch2.9.0andhigher';
    abi = 'cp39-abi3';
  } else {
    const exact = {
      '2.8.0:cu128': 'torch2.8.0',
      '2.7.1:cu128': 'torch2.7.1',
      '2.6.0:cu126': 'torch2.6.0',
      '2.5.1:cu124': 'torch2.5.1',
    }[`${torchKey}:${cudaTag}`];
    if (!exact) return null;
    release = 'v2.2.0-windows.post3';
    torchTag = exact;
    abi = 'cp39-abi3';
  }
  const filename = `sageattention-2.2.0+${cudaTag}${torchTag}${release.slice(release.lastIndexOf('.'))}-${abi}-win_amd64.whl`;
  return { release, filename, url: `${SAGE_WHEEL_ROOT}/${release}/${filename}` };
}

function tritonPlanForTorch(torchVersion) {
  const [major, minor] = numericVersion(torchVersion);
  if (major > 2 || (major === 2 && minor >= 10)) return { minimum: '3.6', maximum: '3.7', spec: 'triton-windows>=3.6,<3.7' };
  if (major === 2 && minor === 9) return { minimum: '3.5', maximum: '3.6', spec: 'triton-windows>=3.5,<3.6' };
  if (major === 2 && minor === 8) return { minimum: '3.4', maximum: '3.5', spec: 'triton-windows>=3.4,<3.5' };
  if (major === 2 && minor === 7) return { minimum: '3.3', maximum: '3.4', spec: 'triton-windows>=3.3,<3.4' };
  if (major === 2 && minor >= 5) return { minimum: '3.2', maximum: '3.3', spec: 'triton-windows>=3.2,<3.3' };
  return null;
}

function sageAttentionInstallPlan(snapshot = {}) {
  if (snapshot.platform !== 'win32') {
    return { installable: false, reason: 'Automatic SageAttention setup is currently available for Windows NVIDIA installations.' };
  }
  if (!snapshot.cudaAvailable || !snapshot.cudaVersion) {
    return { installable: false, reason: 'SageAttention needs an NVIDIA CUDA build of PyTorch.' };
  }
  const capability = Array.isArray(snapshot.computeCapability) ? snapshot.computeCapability : [0, 0];
  if (Number(capability[0]) * 10 + Number(capability[1]) < 80) {
    return { installable: false, reason: 'The reviewed SageAttention route needs an NVIDIA Ampere-generation GPU or newer.' };
  }
  if (!versionAtLeast(snapshot.pythonVersion, '3.10')) {
    return { installable: false, reason: 'The reviewed SageAttention wheels need Python 3.10 or newer.' };
  }
  const wheel = sageWheelForRuntime(snapshot);
  const triton = tritonPlanForTorch(snapshot.torchVersion);
  if (!wheel || !triton) {
    return {
      installable: false,
      reason: `No reviewed SageAttention wheel matches PyTorch ${snapshot.torchVersion || 'unknown'} with CUDA ${snapshot.cudaVersion || 'unknown'}.`,
    };
  }
  if (snapshot.pythonHeadersReady === false) {
    return {
      installable: false,
      reason: 'This embedded Python is missing its include and libs folders, which Triton needs to compile attention kernels.',
    };
  }
  return { installable: true, wheel, triton };
}

const PROBE_SCRIPT = String.raw`
import importlib.metadata, json, os, platform, sys, sysconfig

def distribution_version(name):
    try:
        return importlib.metadata.version(name)
    except Exception:
        return ""

result = {
    "platform": "win32" if sys.platform == "win32" else sys.platform,
    "pythonVersion": platform.python_version(),
    "torchVersion": "",
    "cudaVersion": "",
    "cudaAvailable": False,
    "computeCapability": [0, 0],
    "deviceName": "",
    "tritonImport": False,
    "tritonVersion": distribution_version("triton-windows") or distribution_version("triton"),
    "tritonDistribution": "triton-windows" if distribution_version("triton-windows") else ("triton" if distribution_version("triton") else ""),
    "sageImport": False,
    "sageKernelReady": False,
    "sageVersion": distribution_version("sageattention"),
    "errors": [],
}
try:
    import torch
    result["torchVersion"] = str(torch.__version__)
    result["cudaVersion"] = str(torch.version.cuda or "")
    result["cudaAvailable"] = bool(torch.cuda.is_available())
    if result["cudaAvailable"]:
        result["computeCapability"] = list(torch.cuda.get_device_capability())
        result["deviceName"] = str(torch.cuda.get_device_name(0))
except Exception as error:
    result["errors"].append("torch: " + repr(error))
try:
    import triton
    result["tritonImport"] = True
except Exception as error:
    result["errors"].append("triton: " + repr(error))
try:
    from sageattention import sageattn
    result["sageImport"] = callable(sageattn)
    if result["sageImport"] and result["cudaAvailable"]:
        q = torch.randn((1, 64, 8, 128), device="cuda", dtype=torch.float16)
        out = sageattn(q, q, q, is_causal=False, tensor_layout="NHD")
        torch.cuda.synchronize()
        result["sageKernelReady"] = tuple(out.shape) == tuple(q.shape) and bool(torch.isfinite(out).all().item())
except Exception as error:
    result["errors"].append("sageattention: " + repr(error))
include_path = sysconfig.get_paths().get("include", "")
prefixes = [sys.prefix, sys.base_prefix]
result["pythonHeadersReady"] = bool(include_path and os.path.isdir(include_path) and any(os.path.isdir(os.path.join(prefix, "libs")) for prefix in prefixes)) if sys.platform == "win32" else True
print("${PROBE_SENTINEL}" + json.dumps(result, separators=(",", ":")))
`;

function parseProbeOutput(value) {
  const line = String(value || '').split(/\r?\n/).find((entry) => entry.startsWith(PROBE_SENTINEL));
  if (!line) throw new Error('The ComfyUI Python environment did not return a SageAttention compatibility report.');
  return JSON.parse(line.slice(PROBE_SENTINEL.length));
}

function publicProbe(snapshot, plan, status = {}) {
  const tritonCompatible = snapshot.tritonImport === true && (!plan.triton || (
    versionAtLeast(snapshot.tritonVersion, plan.triton.minimum)
    && !versionAtLeast(snapshot.tritonVersion, plan.triton.maximum)
  ));
  const ready = snapshot.sageImport === true && snapshot.sageKernelReady === true
    && snapshot.tritonImport === true && tritonCompatible;
  let reason = '';
  if (!ready) {
    if (!plan.installable) reason = plan.reason;
    else if (!snapshot.tritonImport) reason = 'Triton is not ready in the ComfyUI Python environment.';
    else if (!tritonCompatible) reason = `Triton ${snapshot.tritonVersion || 'unknown'} does not match PyTorch ${snapshot.torchVersion || 'unknown'}.`;
    else if (!snapshot.sageImport) reason = 'The matching SageAttention wheel is not installed in the ComfyUI Python environment.';
    else if (!snapshot.sageKernelReady) reason = 'SageAttention imported, but its CUDA kernel did not run successfully on this GPU.';
  }
  return {
    ready,
    installable: ready || plan.installable === true,
    reason,
    pythonReady: !!status.pythonPath,
    torchVersion: snapshot.torchVersion || '',
    cudaVersion: snapshot.cudaVersion || '',
    pythonVersion: snapshot.pythonVersion || '',
    deviceName: snapshot.deviceName || '',
    computeCapability: snapshot.computeCapability || [0, 0],
    sageVersion: snapshot.sageVersion || '',
    kernelReady: snapshot.sageKernelReady === true,
    tritonVersion: snapshot.tritonVersion || '',
    tritonDistribution: snapshot.tritonDistribution || '',
    tritonCompatible,
  };
}

async function probeSageAttention(runtime, options = {}) {
  const status = options.status || sam3InstallStatus(runtime, options);
  const pythonPath = String(status.pythonPath || '');
  if (!pythonPath || !(options.existsSync || fs.existsSync)(pythonPath)) {
    return {
      ready: false,
      installable: false,
      pythonReady: false,
      reason: 'Choose the local ComfyUI folder so Mix Studio can verify its Python environment.',
    };
  }
  const now = Date.now();
  if (!options.force && cachedProbe && cachedPythonPath === pythonPath && now - cachedProbeAt < PROBE_TTL_MS) {
    return cachedProbe;
  }
  try {
    const output = await (options.run || run)(pythonPath, ['-c', PROBE_SCRIPT], {
      cwd: status.basePath,
      signal: options.signal,
      timeoutMs: 120_000,
    });
    const snapshot = parseProbeOutput(output);
    const plan = sageAttentionInstallPlan(snapshot);
    cachedProbe = publicProbe(snapshot, plan, status);
  } catch (error) {
    cachedProbe = {
      ready: false,
      installable: false,
      pythonReady: true,
      reason: `Mix Studio could not verify SageAttention in ComfyUI Python: ${String(error.message || error)}`,
    };
  }
  cachedPythonPath = pythonPath;
  cachedProbeAt = now;
  return cachedProbe;
}

function sageInstallError(message, code = 'sage_attention_install_failed') {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function installSageAttention(runtime, report = () => {}, options = {}) {
  const status = options.status || sam3InstallStatus(runtime, options);
  if (!status.canInstall || !status.pythonPath) {
    throw sageInstallError(status.reason || 'Mix Studio could not find the ComfyUI Python environment.', 'dependency_path_missing');
  }
  const runCommand = options.run || run;
  const output = await runCommand(status.pythonPath, ['-c', PROBE_SCRIPT], {
    cwd: status.basePath,
    signal: options.signal,
    timeoutMs: 120_000,
  });
  const snapshot = parseProbeOutput(output);
  const plan = sageAttentionInstallPlan(snapshot);
  const initialProbe = publicProbe(snapshot, plan, status);
  if (initialProbe.ready) {
    cachedProbe = initialProbe;
    cachedProbeAt = Date.now();
    cachedPythonPath = status.pythonPath;
    report('already-present', 'SageAttention is already ready in ComfyUI Python');
    return cachedProbe;
  }
  if (!plan.installable) throw sageInstallError(plan.reason, 'sage_attention_unsupported_runtime');
  if (!snapshot.tritonImport || !initialProbe.tritonCompatible) {
    if (snapshot.tritonDistribution === 'triton') {
      throw sageInstallError(
        'An incompatible Linux Triton distribution is installed in this Windows ComfyUI environment. Remove that package manually before installing triton-windows.',
        'sage_attention_triton_conflict'
      );
    }
    report('installing-python-package', `Installing ${plan.triton.spec} without changing PyTorch`);
    await runCommand(status.pythonPath, [
      '-m', 'pip', 'install', '--no-deps', '--upgrade', plan.triton.spec,
    ], { cwd: status.basePath, signal: options.signal });
  }
  report('installing-python-package', `Installing the reviewed SageAttention wheel for PyTorch ${snapshot.torchVersion} and CUDA ${snapshot.cudaVersion}`);
  await runCommand(status.pythonPath, [
    '-m', 'pip', 'install', '--no-deps', '--upgrade', plan.wheel.url,
  ], { cwd: status.basePath, signal: options.signal });
  cachedProbe = null;
  const verified = await probeSageAttention(runtime, Object.assign({}, options, { status, force: true }));
  if (!verified.ready) {
    throw sageInstallError(verified.reason || 'SageAttention installed but did not import successfully in ComfyUI Python.');
  }
  report('python-package-ready', `SageAttention ${verified.sageVersion || ''} is ready`);
  return verified;
}

module.exports = {
  PROBE_SENTINEL,
  installSageAttention,
  numericVersion,
  parseProbeOutput,
  probeSageAttention,
  sageAttentionInstallPlan,
  sageWheelForRuntime,
  tritonPlanForTorch,
  versionAtLeast,
};
