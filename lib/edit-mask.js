'use strict';

const EDIT_MASK_ENGINES = new Set(['klein4', 'klein9', 'qwen', 'krea2']);
const SAM3_MASK_CLASSES = [
  'LoadImage',
  'LoadSAM3Model',
  'SAM3Grounding',
  'SAM3Segmentation',
  'SAM3CreatePoint',
  'SAM3CombinePoints',
  'MaskToImage',
  'SaveImage',
];

function supportsEditMask(engine) {
  return EDIT_MASK_ENGINES.has(String(engine || ''));
}

function appendEditMaskNodes(graph, options = {}) {
  const prefix = String(options.prefix || 'edit_mask');
  const maskImageName = String(options.maskImageName || '').trim();
  if (!graph || !maskImageName || !Array.isArray(options.samples)) return null;

  const loadKey = `${prefix}_load`;
  const channelKey = `${prefix}_channel`;
  const growKey = `${prefix}_grow`;
  const latentKey = `${prefix}_latent`;
  graph[loadKey] = { class_type: 'LoadImage', inputs: { image: maskImageName } };
  graph[channelKey] = { class_type: 'ImageToMask', inputs: { image: [loadKey, 0], channel: 'red' } };
  graph[growKey] = {
    class_type: 'GrowMask',
    inputs: { mask: [channelKey, 0], expand: Number(options.expand) || 6, tapered_corners: true },
  };
  graph[latentKey] = {
    class_type: 'SetLatentNoiseMask',
    inputs: { samples: options.samples, mask: [growKey, 0] },
  };
  return { latent: [latentKey, 0], mask: [growKey, 0] };
}

function appendEditMaskComposite(graph, options = {}) {
  if (!graph || !Array.isArray(options.original) || !Array.isArray(options.generated) || !Array.isArray(options.mask)) return null;
  const key = String(options.key || 'edit_mask_composite');
  graph[key] = {
    class_type: 'ImageCompositeMasked',
    inputs: {
      destination: options.original,
      source: options.generated,
      x: 0,
      y: 0,
      resize_source: true,
      mask: options.mask,
    },
  };
  return [key, 0];
}

function normalizeMaskPoints(points) {
  return (Array.isArray(points) ? points : []).slice(0, 10).map((point) => ({
    x: Math.max(0, Math.min(1, Number(point && point.x) || 0)),
    y: Math.max(0, Math.min(1, Number(point && point.y) || 0)),
    foreground: !point || point.foreground !== false,
  }));
}

function appendPointGroup(graph, prefix, points) {
  if (!points.length) return null;
  const keys = points.map((point, index) => {
    const key = `${prefix}_${index + 1}`;
    graph[key] = {
      class_type: 'SAM3CreatePoint',
      inputs: { x: point.x, y: point.y, is_foreground: point.foreground },
    };
    return key;
  });
  const combineKey = `${prefix}_combine`;
  graph[combineKey] = {
    class_type: 'SAM3CombinePoints',
    inputs: Object.fromEntries(keys.map((key, index) => [`point_${index + 1}`, [key, 0]])),
  };
  return [combineKey, 0];
}

/** Build a transient SAM3 graph that saves a white-on-black mask only. */
function buildSam3MaskGraph(options = {}) {
  const imageName = String(options.imageName || '').trim();
  const prompt = String(options.prompt || '').trim();
  const points = normalizeMaskPoints(options.points);
  if (!imageName) throw new Error('A source image is required');
  if (!prompt && !points.length) throw new Error('Describe an object or tap the image');

  const graph = {
    source: { class_type: 'LoadImage', inputs: { image: imageName } },
    sam3_model: { class_type: 'LoadSAM3Model', inputs: { precision: 'auto', compile: false } },
  };
  let mask;
  if (prompt) {
    graph.sam3_ground = {
      class_type: 'SAM3Grounding',
      inputs: {
        sam3_model_config: ['sam3_model', 0],
        image: ['source', 0],
        confidence_threshold: 0.2,
        text_prompt: prompt,
        max_detections: 12,
      },
    };
    mask = ['sam3_ground', 0];
  } else {
    const positive = appendPointGroup(graph, 'sam3_positive', points.filter((point) => point.foreground));
    const negative = appendPointGroup(graph, 'sam3_negative', points.filter((point) => !point.foreground));
    graph.sam3_segment = {
      class_type: 'SAM3Segmentation',
      inputs: Object.assign({
        sam3_model_config: ['sam3_model', 0],
        image: ['source', 0],
        refinement_iterations: 1,
        use_multimask: true,
        output_best_mask: true,
      }, positive ? { positive_points: positive } : {}, negative ? { negative_points: negative } : {}),
    };
    mask = ['sam3_segment', 0];
  }
  graph.mask_image = { class_type: 'MaskToImage', inputs: { mask } };
  graph.save_mask = {
    class_type: 'SaveImage',
    inputs: { images: ['mask_image', 0], filename_prefix: 'mixbox_sam3_mask' },
  };
  return graph;
}

module.exports = {
  EDIT_MASK_ENGINES,
  SAM3_MASK_CLASSES,
  supportsEditMask,
  appendEditMaskNodes,
  appendEditMaskComposite,
  buildSam3MaskGraph,
  normalizeMaskPoints,
};
