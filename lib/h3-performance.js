'use strict';

// NVIDIA's CUDA 13.x minor-version compatibility floor. PyTorch carries the
// runtime used by ComfyUI, so this is a readiness check, not a system-toolkit check.
const CUDA_13_MIN_DRIVER = '580.0';

function numericVersion(value) {
  const match = String(value || '').match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return match ? match.slice(1).map((part) => Number(part || 0)) : [0, 0, 0];
}

function compareVersions(leftValue, rightValue) {
  const left = numericVersion(leftValue);
  const right = numericVersion(rightValue);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

function optimizedH3Models(models = {}) {
  const frameModel = String(models.h3Unet || '');
  const referenceModel = String(models.h3RefUnet || '');
  const textEncoder = String(models.h3Clip || '');
  return {
    int8ConvRot: /int8[_-]?convrot/i.test(frameModel) && /int8[_-]?convrot/i.test(referenceModel),
    nvfp4TextEncoder: /nvfp4/i.test(textEncoder),
    frameModel,
    referenceModel,
    textEncoder,
  };
}

function cuda13Recommendation(gpu = {}, runtime = {}) {
  const vendor = String(gpu.vendor || '').toLowerCase();
  const driver = String(gpu.driver || '');
  const cudaVersion = String(runtime.cudaVersion || '');
  const cudaMajor = numericVersion(cudaVersion)[0];
  const driverKnown = numericVersion(driver)[0] > 0;
  const driverReady = vendor === 'nvidia' && driverKnown
    ? compareVersions(driver, CUDA_13_MIN_DRIVER) >= 0
    : false;

  if (vendor && vendor !== 'nvidia') {
    return {
      state: 'not-applicable',
      driverReady: false,
      title: 'CUDA 13 does not apply to this GPU',
      detail: 'Mix Studio will keep using the acceleration backend reported by ComfyUI.',
    };
  }
  if (!runtime.pythonReady) {
    return {
      state: 'unavailable',
      driverReady,
      title: 'Connect the local ComfyUI folder',
      detail: 'Mix Studio needs ComfyUI Python access to report the PyTorch and CUDA runtime used for generation.',
    };
  }
  if (cudaMajor >= 13) {
    return {
      state: 'active',
      driverReady: true,
      title: `CUDA ${cudaVersion} is active`,
      detail: 'H3 is using a CUDA 13 PyTorch runtime. Actual speedup still depends on the GPU, resolution, and enabled H3 optimizations.',
    };
  }
  if (!cudaVersion) {
    return {
      state: 'unavailable',
      driverReady,
      title: 'CUDA runtime was not detected',
      detail: runtime.reason || 'Verify that ComfyUI is using an NVIDIA build of PyTorch.',
    };
  }
  if (!driverKnown) {
    return {
      state: 'check-driver',
      driverReady: false,
      title: `ComfyUI is using CUDA ${cudaVersion}`,
      detail: 'Mix Studio could not read the NVIDIA driver version. CUDA 13 requires driver 580 or newer.',
    };
  }
  if (!driverReady) {
    return {
      state: 'driver-update',
      driverReady: false,
      title: `Driver ${driver} is below the CUDA 13 requirement`,
      detail: `Keep the current runtime until the NVIDIA driver is updated to ${CUDA_13_MIN_DRIVER} or newer.`,
    };
  }
  return {
    state: 'recommended',
    driverReady: true,
    title: 'CUDA 13 runtime available',
    detail: `Driver ${driver} supports CUDA 13, while ComfyUI currently uses CUDA ${cudaVersion}. Update through ComfyUI's supported maintenance path; the system CUDA toolkit does not need to change.`,
  };
}

function h3PerformanceReport({ hardware = {}, runtime = {}, models = {} } = {}) {
  const gpu = Array.isArray(hardware?.gpu?.devices) ? (hardware.gpu.devices[0] || {}) : {};
  const optimizedModels = optimizedH3Models(models);
  const cuda13 = cuda13Recommendation(gpu, runtime);
  return {
    runtime: {
      pythonReady: runtime.pythonReady === true,
      pythonVersion: String(runtime.pythonVersion || ''),
      torchVersion: String(runtime.torchVersion || ''),
      cudaVersion: String(runtime.cudaVersion || ''),
      deviceName: String(runtime.deviceName || gpu.name || ''),
      computeCapability: Array.isArray(runtime.computeCapability) ? runtime.computeCapability : [0, 0],
    },
    cuda13,
    h3: {
      int8ConvRot: optimizedModels.int8ConvRot,
      nvfp4TextEncoder: optimizedModels.nvfp4TextEncoder,
      sageAttention: runtime.ready === true,
      sageVersion: String(runtime.sageVersion || ''),
      sageReason: runtime.ready === true ? '' : String(runtime.reason || ''),
    },
  };
}

module.exports = {
  CUDA_13_MIN_DRIVER,
  compareVersions,
  cuda13Recommendation,
  h3PerformanceReport,
  numericVersion,
  optimizedH3Models,
};
