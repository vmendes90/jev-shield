import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPng(width, height, drawFn) {
  // RGBA buffer
  const rowSize = width * 4;
  const rawData = Buffer.alloc(height * (rowSize + 1));

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (rowSize + 1);
    rawData[rowOffset] = 0; // Filter byte 0 (None)

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const color = drawFn(x, y, width, height);
      rawData[pixelOffset] = color[0];     // R
      rawData[pixelOffset + 1] = color[1]; // G
      rawData[pixelOffset + 2] = color[2]; // B
      rawData[pixelOffset + 3] = color[3]; // A
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // Color type (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const full = Buffer.concat([typeBuf, data]);
    const crc = crc32(full);
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Shield shape drawer
function drawShield(x, y, w, h) {
  // Normalize coords to -1..1
  const nx = (x / w) * 2 - 1;
  const ny = (y / h) * 2 - 1;

  // Simple shield outline condition:
  // Top is flat with slight curve, bottom tapers to a point
  const insideTop = ny >= -0.8 && ny <= 0.2 && Math.abs(nx) <= 0.75;
  const insideBottom = ny > 0.2 && ny <= 0.85 && Math.abs(nx) <= 0.75 * (1 - (ny - 0.2) / 0.65);

  if (insideTop || insideBottom) {
    // Check if inner white accent
    const innerTop = ny >= -0.6 && ny <= 0.1 && Math.abs(nx) <= 0.5;
    const innerBottom = ny > 0.1 && ny <= 0.65 && Math.abs(nx) <= 0.5 * (1 - (ny - 0.1) / 0.55);

    if ((innerTop || innerBottom) && Math.abs(nx) < 0.15) {
      return [255, 255, 255, 255]; // White core
    }

    // Gradient blue
    const b = Math.floor(210 + 35 * (1 - Math.abs(nx)));
    return [2, 132, 199, 255]; // Primary blue #0284c7
  }

  return [0, 0, 0, 0]; // Transparent
}

const iconsDir = path.resolve('public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach((size) => {
  const pngBuf = createPng(size, size, drawShield);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), pngBuf);
  console.log(`Generated icon-${size}.png`);
});
