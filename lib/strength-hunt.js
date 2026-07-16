'use strict';

const zlib = require('node:zlib');

const HUNT_STEP = 0.2;
const HUNT_MAX = 2;
const MAX_HUNT_LORAS = 2;

function roundStrength(value) {
  return Math.round(Number(value) * 10) / 10;
}

function strengthValues({ includeZero = false } = {}) {
  const values = [];
  if (includeZero) values.push(0);
  for (let value = HUNT_STEP; value <= HUNT_MAX + 0.001; value += HUNT_STEP) {
    values.push(roundStrength(value));
  }
  return values;
}

function huntLoras(loras) {
  return (Array.isArray(loras) ? loras : [])
    .filter((lora) => lora && lora.name && lora.on !== false && lora.strengthHunt === true);
}

function loraDisplayName(name) {
  return String(name || 'LoRA').replace(/\.safetensors$/i, '').split(/[\\/]/).pop() || 'LoRA';
}

function applyVariantStrengths(loras, axes, strengths) {
  const byName = new Map(axes.map((axis, index) => [axis.name, strengths[index]]));
  return (Array.isArray(loras) ? loras : []).map((lora) => {
    const next = Object.assign({}, lora);
    if (!byName.has(next.name)) return next;
    const strength = byName.get(next.name);
    next.strength = strength;
    next.on = strength > 0;
    delete next.strengthHunt;
    return next;
  });
}

function buildStrengthHuntPlan(loras, options = {}) {
  const axes = huntLoras(loras);
  if (!axes.length) return null;
  if (axes.length > MAX_HUNT_LORAS) throw new Error('Strength Hunt supports up to two LoRAs at a time');
  if (new Set(axes.map((lora) => lora.name)).size !== axes.length) {
    throw new Error('Choose each Strength Hunt LoRA only once');
  }
  const id = String(options.id || '').trim();
  const variants = [];
  if (axes.length === 1) {
    for (const strength of strengthValues()) {
      variants.push({
        index: variants.length,
        row: 0,
        column: variants.length,
        strengths: [strength],
        label: `${loraDisplayName(axes[0].name)} ${strength.toFixed(1)}`,
        loras: applyVariantStrengths(loras, axes, [strength]),
      });
    }
  } else {
    const values = strengthValues({ includeZero: true });
    values.forEach((rowStrength, row) => {
      values.forEach((columnStrength, column) => {
        variants.push({
          index: variants.length,
          row,
          column,
          strengths: [columnStrength, rowStrength],
          label: `${loraDisplayName(axes[0].name)} ${columnStrength.toFixed(1)} / ${loraDisplayName(axes[1].name)} ${rowStrength.toFixed(1)}`,
          loras: applyVariantStrengths(loras, axes, [columnStrength, rowStrength]),
        });
      });
    });
  }
  return {
    id,
    axes: axes.map((lora) => ({ name: lora.name, label: loraDisplayName(lora.name) })),
    columns: axes.length === 1 ? variants.length : 11,
    rows: axes.length === 1 ? 1 : 11,
    variants,
  };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}

function mergeStrengthHuntGraphs(graphs) {
  const merged = {};
  const signatures = new Map();
  let nextId = 0;
  (Array.isArray(graphs) ? graphs : []).forEach((source, variantIndex) => {
    const graph = source && source.graph ? source.graph : source;
    const resolved = new Map();
    const visiting = new Set();
    const visit = (sourceId) => {
      const key = String(sourceId);
      if (resolved.has(key)) return resolved.get(key);
      if (visiting.has(key)) throw new Error(`Strength Hunt graph contains a cycle at ${key}`);
      const node = graph[key];
      if (!node) return key;
      visiting.add(key);
      const rewrite = (value) => {
        if (Array.isArray(value) && value.length === 2 && Object.prototype.hasOwnProperty.call(graph, String(value[0]))) {
          return [visit(value[0]), value[1]];
        }
        if (Array.isArray(value)) return value.map(rewrite);
        if (value && typeof value === 'object') {
          return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, rewrite(child)]));
        }
        return value;
      };
      const rewritten = rewrite(node);
      if (rewritten.class_type === 'SaveImage' && rewritten.inputs) {
        rewritten.inputs.filename_prefix = `KreaStudio/strength_hunt_${String(variantIndex).padStart(3, '0')}`;
      }
      const sideEffect = ['SaveImage', 'SaveVideo', 'PreviewImage', 'PreviewAny'].includes(rewritten.class_type);
      const signature = sideEffect ? '' : stable(rewritten);
      let mergedId = signature && signatures.get(signature);
      if (!mergedId) {
        mergedId = `hunt_${nextId++}`;
        merged[mergedId] = rewritten;
        if (signature) signatures.set(signature, mergedId);
      }
      visiting.delete(key);
      resolved.set(key, mergedId);
      return mergedId;
    };
    Object.keys(graph || {}).forEach(visit);
  });
  return merged;
}

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = crcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function encodeRgbaPng(width, height, pixels) {
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const output = y * (width * 4 + 1);
    scanlines[output] = 0;
    pixels.copy(scanlines, output + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
}

function decodePng(buffer) {
  const signature = buffer.subarray(0, 8);
  if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Strength Hunt output is not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!width || !height || bitDepth !== 8 || !channels || interlace !== 0) {
    throw new Error('Strength Hunt documentation supports non-interlaced 8-bit PNG outputs');
  }
  const packed = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const raw = Buffer.alloc(height * stride);
  let input = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[input++];
    const row = y * stride;
    const previous = row - stride;
    for (let x = 0; x < stride; x += 1) {
      const encoded = packed[input++];
      const left = x >= channels ? raw[row + x - channels] : 0;
      const above = y ? raw[previous + x] : 0;
      const upperLeft = y && x >= channels ? raw[previous + x - channels] : 0;
      let value = encoded;
      if (filter === 1) value += left;
      else if (filter === 2) value += above;
      else if (filter === 3) value += Math.floor((left + above) / 2);
      else if (filter === 4) value += paeth(left, above, upperLeft);
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
      raw[row + x] = value & 0xff;
    }
  }
  const pixels = Buffer.alloc(width * height * 4);
  for (let index = 0, output = 0; index < raw.length; index += channels, output += 4) {
    if (colorType === 6) {
      pixels[output] = raw[index]; pixels[output + 1] = raw[index + 1]; pixels[output + 2] = raw[index + 2]; pixels[output + 3] = raw[index + 3];
    } else if (colorType === 2) {
      pixels[output] = raw[index]; pixels[output + 1] = raw[index + 1]; pixels[output + 2] = raw[index + 2]; pixels[output + 3] = 255;
    } else {
      pixels[output] = raw[index]; pixels[output + 1] = raw[index]; pixels[output + 2] = raw[index]; pixels[output + 3] = colorType === 4 ? raw[index + 1] : 255;
    }
  }
  return { width, height, pixels };
}

const FONT = {
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  '?': ['01110','10001','00001','00010','00100','00000','00100'],
  '.': ['00000','00000','00000','00000','00000','00110','00110'],
  ',': ['00000','00000','00000','00000','00110','00110','00100'],
  ':': ['00000','00110','00110','00000','00110','00110','00000'],
  '/': ['00001','00010','00100','01000','10000','00000','00000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'],
  '_': ['00000','00000','00000','00000','00000','00000','11111'],
  '(': ['00010','00100','01000','01000','01000','00100','00010'],
  ')': ['01000','00100','00010','00010','00010','00100','01000'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
  A: ['01110','10001','10001','11111','10001','10001','10001'], B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01110','10001','10000','10000','10000','10001','01110'], D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'], F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01110','10001','10000','10111','10001','10001','01110'], H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['01110','00100','00100','00100','00100','00100','01110'], J: ['00111','00010','00010','00010','10010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'], L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'], N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'], P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'], R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'], T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'], V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','11011','10001'], X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'], Z: ['11111','00001','00010','00100','01000','10000','11111'],
};

function fill(pixels, width, height, color) {
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2]; pixels[offset + 3] = color[3] ?? 255;
  }
}

function rectangle(pixels, width, height, x, y, w, h, color) {
  const x0 = Math.max(0, Math.floor(x)); const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width, Math.ceil(x + w)); const y1 = Math.min(height, Math.ceil(y + h));
  for (let py = y0; py < y1; py += 1) for (let px = x0; px < x1; px += 1) {
    const offset = (py * width + px) * 4;
    pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2]; pixels[offset + 3] = color[3] ?? 255;
  }
}

function drawText(pixels, width, height, text, x, y, options = {}) {
  const scale = Math.max(1, Math.floor(options.scale || 2));
  const color = options.color || [240, 242, 247, 255];
  let cursor = x;
  for (const raw of String(text || '').toUpperCase()) {
    const glyph = FONT[raw] || FONT['?'];
    glyph.forEach((row, gy) => [...row].forEach((bit, gx) => {
      if (bit === '1') rectangle(pixels, width, height, cursor + gx * scale, y + gy * scale, scale, scale, color);
    }));
    cursor += 6 * scale;
  }
  return cursor;
}

function wrapText(text, maxChars, maxLines) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) line = candidate;
    else {
      if (line) lines.push(line);
      line = word.slice(0, maxChars);
      if (lines.length >= maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxChars - 3))}...`;
  }
  return lines;
}

function drawScaledImage(canvas, canvasWidth, canvasHeight, image, x, y, width, height) {
  rectangle(canvas, canvasWidth, canvasHeight, x, y, width, height, [22, 23, 27, 255]);
  const scale = Math.min(width / image.width, height / image.height);
  const outWidth = Math.max(1, Math.floor(image.width * scale));
  const outHeight = Math.max(1, Math.floor(image.height * scale));
  const left = Math.floor(x + (width - outWidth) / 2);
  const top = Math.floor(y + (height - outHeight) / 2);
  for (let py = 0; py < outHeight; py += 1) {
    const sy = Math.min(image.height - 1, Math.floor(py / scale));
    for (let px = 0; px < outWidth; px += 1) {
      const sx = Math.min(image.width - 1, Math.floor(px / scale));
      const source = (sy * image.width + sx) * 4;
      const target = ((top + py) * canvasWidth + left + px) * 4;
      image.pixels.copy(canvas, target, source, source + 4);
    }
  }
}

function buildStrengthHuntSheet(images, info = {}) {
  const list = Array.isArray(images) ? images : [];
  if (!list.length) throw new Error('Strength Hunt produced no images for its documentation sheet');
  const columns = Math.max(1, Number(info.columns) || list.length);
  const rows = Math.max(1, Number(info.rows) || Math.ceil(list.length / columns));
  const matrix = rows > 1;
  const tileWidth = matrix ? 180 : 300;
  const decodedFirst = decodePng(list[0].buffer || list[0]);
  const ratio = decodedFirst.height / decodedFirst.width;
  const imageHeight = Math.max(120, Math.round(tileWidth * ratio));
  const labelHeight = matrix ? 34 : 38;
  const gap = matrix ? 8 : 10;
  const margin = 24;
  const headerHeight = 150;
  const width = margin * 2 + columns * tileWidth + Math.max(0, columns - 1) * gap;
  const height = headerHeight + margin + rows * (labelHeight + imageHeight) + Math.max(0, rows - 1) * gap + margin;
  const pixels = Buffer.alloc(width * height * 4);
  fill(pixels, width, height, [10, 11, 14, 255]);
  drawText(pixels, width, height, 'LORA STRENGTH HUNT', margin, 22, { scale: 3, color: [255, 255, 255, 255] });
  const settings = `SEED ${info.seed ?? '-'}  CFG ${info.cfg ?? '-'}  STEPS ${info.steps ?? '-'}  ${info.model || ''}`;
  drawText(pixels, width, height, settings, margin, 54, { scale: 2, color: [171, 184, 210, 255] });
  const axes = Array.isArray(info.axes) ? info.axes : [];
  const axisText = axes.length > 1
    ? `X: ${axes[0].label || axes[0].name}  Y: ${axes[1].label || axes[1].name}`
    : (axes.length ? `LORA: ${axes[0].label || axes[0].name}` : '');
  if (axisText) drawText(pixels, width, height, axisText, margin, 76, { scale: 1, color: [139, 177, 255, 255] });
  wrapText(`PROMPT: ${info.prompt || ''}`, Math.max(24, Math.floor((width - margin * 2) / 12)), 3)
    .forEach((line, index) => drawText(pixels, width, height, line, margin, 92 + index * 17, { scale: 2, color: [222, 225, 232, 255] }));
  list.forEach((entry, index) => {
    const row = Number.isFinite(Number(entry.row)) ? Number(entry.row) : Math.floor(index / columns);
    const column = Number.isFinite(Number(entry.column)) ? Number(entry.column) : index % columns;
    const x = margin + column * (tileWidth + gap);
    const y = headerHeight + margin + row * (labelHeight + imageHeight + gap);
    rectangle(pixels, width, height, x, y, tileWidth, labelHeight + imageHeight, [27, 29, 35, 255]);
    const maxChars = Math.max(8, Math.floor((tileWidth - 12) / 6));
    const strengths = Array.isArray(entry.strengths) ? entry.strengths : [];
    const strengthLabel = strengths.length > 1
      ? `X ${Number(strengths[0]).toFixed(1)} / Y ${Number(strengths[1]).toFixed(1)}`
      : (strengths.length ? `STRENGTH ${Number(strengths[0]).toFixed(1)}` : entry.label);
    const label = String(strengthLabel || '').slice(0, maxChars);
    drawText(pixels, width, height, label, x + 6, y + (matrix ? 10 : 11), { scale: 1, color: [244, 246, 250, 255] });
    const decoded = index === 0 ? decodedFirst : decodePng(entry.buffer || entry);
    drawScaledImage(pixels, width, height, decoded, x, y + labelHeight, tileWidth, imageHeight);
  });
  return { buffer: encodeRgbaPng(width, height, pixels), width, height };
}

module.exports = {
  HUNT_MAX,
  HUNT_STEP,
  MAX_HUNT_LORAS,
  buildStrengthHuntPlan,
  buildStrengthHuntSheet,
  decodePng,
  encodeRgbaPng,
  huntLoras,
  mergeStrengthHuntGraphs,
  strengthValues,
};
