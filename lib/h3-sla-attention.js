'use strict';

const fs = require('fs');
const { execFile } = require('child_process');
const { sam3InstallStatus } = require('./sam3-installer');
const { tritonPlanForTorch, versionAtLeast } = require('./sage-attention');

const SLA_PROBE_SENTINEL = '__MIX_STUDIO_H3_SLA__';
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

const SLA_PROBE_SCRIPT = String.raw`
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
include_path = sysconfig.get_paths().get("include", "")
prefixes = [sys.prefix, sys.base_prefix]
result["pythonHeadersReady"] = bool(include_path and os.path.isdir(include_path) and any(os.path.isdir(os.path.join(prefix, "libs")) for prefix in prefixes)) if sys.platform == "win32" else True
print("${SLA_PROBE_SENTINEL}" + json.dumps(result, separators=(",", ":")))
`;

function parseSlaProbeOutput(value) {
  const line = String(value || '').split(/\r?\n/).find((entry) => entry.startsWith(SLA_PROBE_SENTINEL));
  if (!line) throw new Error('The ComfyUI Python environment did not return an H3 SLA compatibility report.');
  return JSON.parse(line.slice(SLA_PROBE_SENTINEL.length));
}

function h3SlaInstallPlan(snapshot = {}) {
  if (!snapshot.cudaAvailable || !snapshot.cudaVersion) {
    return { installable: false, reason: 'H3 SLA needs an NVIDIA CUDA build of PyTorch.' };
  }
  const capability = Array.isArray(snapshot.computeCapability) ? snapshot.computeCapability : [0, 0];
  if (Number(capability[0]) * 10 + Number(capability[1]) < 80) {
    return { installable: false, reason: 'The reviewed H3 SLA kernel needs an NVIDIA Ampere-generation GPU or newer.' };
  }
  if (snapshot.platform !== 'win32') {
    return {
      installable: false,
      reason: snapshot.tritonImport
        ? 'H3 SLA can use this existing CUDA Triton runtime, but automatic Triton setup is currently limited to Windows.'
        : 'Automatic H3 SLA Triton setup is currently available for Windows NVIDIA installations.',
    };
  }
  if (!versionAtLeast(snapshot.pythonVersion, '3.10')) {
    return { installable: false, reason: 'The reviewed H3 SLA runtime needs Python 3.10 or newer.' };
  }
  const triton = tritonPlanForTorch(snapshot.torchVersion);
  if (!triton) {
    return {
      installable: false,
      reason: `No reviewed Triton build matches PyTorch ${snapshot.torchVersion || 'unknown'} with CUDA ${snapshot.cudaVersion || 'unknown'}.`,
    };
  }
  if (snapshot.pythonHeadersReady === false) {
    return {
      installable: false,
      reason: 'This embedded Python is missing its include and libs folders, which Triton needs to compile the SLA kernel.',
    };
  }
  return { installable: true, triton };
}

function publicSlaProbe(snapshot, plan, status = {}) {
  const tritonCompatible = snapshot.tritonImport === true && (!plan.triton || (
    versionAtLeast(snapshot.tritonVersion, plan.triton.minimum)
    && !versionAtLeast(snapshot.tritonVersion, plan.triton.maximum)
  ));
  const capability = Array.isArray(snapshot.computeCapability) ? snapshot.computeCapability : [0, 0];
  const gpuReady = snapshot.cudaAvailable === true
    && Number(capability[0]) * 10 + Number(capability[1]) >= 80;
  const ready = gpuReady && snapshot.tritonImport === true && tritonCompatible;
  let reason = '';
  if (!ready) {
    if (!gpuReady) reason = plan.reason || 'H3 SLA needs a compatible NVIDIA CUDA GPU.';
    else if (!snapshot.tritonImport) reason = plan.installable
      ? 'Triton is not installed in the ComfyUI Python environment.'
      : plan.reason;
    else if (!tritonCompatible) reason = plan.installable
      ? `Triton ${snapshot.tritonVersion || 'unknown'} does not match PyTorch ${snapshot.torchVersion || 'unknown'}.`
      : plan.reason;
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
    computeCapability: capability,
    tritonVersion: snapshot.tritonVersion || '',
    tritonDistribution: snapshot.tritonDistribution || '',
    tritonCompatible,
  };
}

async function probeH3SlaAttention(runtime, options = {}) {
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
    const output = await (options.run || run)(pythonPath, ['-c', SLA_PROBE_SCRIPT], {
      cwd: status.basePath,
      signal: options.signal,
      timeoutMs: 120_000,
    });
    const snapshot = parseSlaProbeOutput(output);
    cachedProbe = publicSlaProbe(snapshot, h3SlaInstallPlan(snapshot), status);
  } catch (error) {
    cachedProbe = {
      ready: false,
      installable: false,
      pythonReady: true,
      reason: `Mix Studio could not verify H3 SLA in ComfyUI Python: ${String(error.message || error)}`,
    };
  }
  cachedPythonPath = pythonPath;
  cachedProbeAt = now;
  return cachedProbe;
}

function slaInstallError(message, code = 'h3_sla_install_failed') {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function installH3SlaAttentionRuntime(runtime, report = () => {}, options = {}) {
  const status = options.status || sam3InstallStatus(runtime, options);
  if (!status.canInstall || !status.pythonPath) {
    throw slaInstallError(status.reason || 'Mix Studio could not find the ComfyUI Python environment.', 'dependency_path_missing');
  }
  const runCommand = options.run || run;
  const output = await runCommand(status.pythonPath, ['-c', SLA_PROBE_SCRIPT], {
    cwd: status.basePath,
    signal: options.signal,
    timeoutMs: 120_000,
  });
  const snapshot = parseSlaProbeOutput(output);
  const plan = h3SlaInstallPlan(snapshot);
  const initialProbe = publicSlaProbe(snapshot, plan, status);
  if (initialProbe.ready) {
    cachedProbe = initialProbe;
    cachedProbeAt = Date.now();
    cachedPythonPath = status.pythonPath;
    report('already-present', `Triton ${initialProbe.tritonVersion || ''} is already ready for H3 SLA`);
    return Object.assign({}, initialProbe, { changed: false });
  }
  if (!plan.installable) throw slaInstallError(plan.reason, 'h3_sla_unsupported_runtime');
  if (snapshot.tritonDistribution === 'triton') {
    throw slaInstallError(
      'An incompatible Linux Triton distribution is installed in this Windows ComfyUI environment. Remove it manually before installing triton-windows.',
      'h3_sla_triton_conflict'
    );
  }
  report('installing-python-package', `Installing ${plan.triton.spec} for H3 SLA without changing PyTorch`);
  await runCommand(status.pythonPath, [
    '-m', 'pip', 'install', '--no-deps', '--upgrade', plan.triton.spec,
  ], { cwd: status.basePath, signal: options.signal });
  cachedProbe = null;
  const verified = await probeH3SlaAttention(runtime, Object.assign({}, options, { status, force: true }));
  if (!verified.ready) {
    throw slaInstallError(verified.reason || 'Triton installed but the H3 SLA runtime could not be verified.');
  }
  report('python-package-ready', `Triton ${verified.tritonVersion || ''} is ready for H3 SLA`);
  return Object.assign({}, verified, { changed: true });
}

module.exports = {
  SLA_PROBE_SENTINEL,
  h3SlaInstallPlan,
  installH3SlaAttentionRuntime,
  parseSlaProbeOutput,
  probeH3SlaAttention,
  publicSlaProbe,
};
