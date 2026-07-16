'use strict';

function isGgufModel(name) {
  return /\.gguf$/i.test(String(name || '').trim());
}

function diffusionModelLoader(name) {
  const unetName = String(name || '').trim();
  if (isGgufModel(unetName)) {
    return { class_type: 'UnetLoaderGGUF', inputs: { unet_name: unetName } };
  }
  return { class_type: 'UNETLoader', inputs: { unet_name: unetName, weight_dtype: 'default' } };
}

function diffusionModelInput(name) {
  return isGgufModel(name)
    ? { className: 'UnetLoaderGGUF', field: 'unet_name' }
    : { className: 'UNETLoader', field: 'unet_name' };
}

module.exports = { diffusionModelInput, diffusionModelLoader, isGgufModel };
