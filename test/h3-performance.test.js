'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CUDA_13_MIN_DRIVER,
  cuda13Recommendation,
  h3PerformanceReport,
  optimizedH3Models,
} = require('../lib/h3-performance');

test('recognizes the optimized official H3 model route', () => {
  assert.deepEqual(optimizedH3Models({
    h3Unet: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
    h3RefUnet: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
    h3Clip: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  }), {
    int8ConvRot: true,
    nvfp4TextEncoder: true,
    frameModel: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
    referenceModel: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
    textEncoder: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  });
});

test('recommends CUDA 13 only when the NVIDIA driver meets the official floor', () => {
  assert.equal(CUDA_13_MIN_DRIVER, '580.0');
  const recommendation = cuda13Recommendation(
    { vendor: 'nvidia', driver: '596.36' },
    { pythonReady: true, cudaVersion: '12.8' },
  );
  assert.equal(recommendation.state, 'recommended');
  assert.equal(recommendation.driverReady, true);
  assert.match(recommendation.detail, /Driver 596\.36 supports CUDA 13/);

  const oldDriver = cuda13Recommendation(
    { vendor: 'nvidia', driver: '572.83' },
    { pythonReady: true, cudaVersion: '12.8' },
  );
  assert.equal(oldDriver.state, 'driver-update');
});

test('reports active CUDA 13 and all scoped H3 accelerations without promising a multiplier', () => {
  const report = h3PerformanceReport({
    hardware: { gpu: { devices: [{ vendor: 'nvidia', driver: '596.36', name: 'RTX PRO 6000' }] } },
    runtime: {
      pythonReady: true,
      torchVersion: '2.11.0+cu130',
      cudaVersion: '13.0',
      deviceName: 'RTX PRO 6000',
      computeCapability: [12, 0],
      ready: true,
      sageVersion: '2.2.0',
    },
    models: {
      h3Unet: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
      h3RefUnet: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
      h3Clip: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
    },
  });
  assert.equal(report.cuda13.state, 'active');
  assert.equal(report.h3.int8ConvRot, true);
  assert.equal(report.h3.nvfp4TextEncoder, true);
  assert.equal(report.h3.sageAttention, true);
  assert.doesNotMatch(report.cuda13.detail, /\d+x/i);
});
