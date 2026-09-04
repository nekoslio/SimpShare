/**
 * SimpShare 扩展图标生成（无第三方依赖）
 * 手写 PNG 编码（zlib + CRC32），绘制 M3 紫色圆角方块 + 白色 share 图形，
 * 4x 超采样抗锯齿。运行：node tools/make-icons.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- PNG 编码 ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 图形 ---------- */

const BG = [211, 227, 253];  // Material 3 浅蓝 primary-container #D3E3FD
const FG = [4, 30, 73];      // Material 3 on-primary-container #041E49

function sdRoundRect(px, py, cx, cy, half, r) {
  const qx = Math.abs(px - cx) - half + r;
  const qy = Math.abs(py - cy) - half + r;
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

function sdSegment(px, py, ax, ay, bx, by, r) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

// Material Icons "share"：三个节点 + 两条连线
const NODES = [[0.685, 0.27], [0.315, 0.5], [0.685, 0.73]];
const LINKS = [[0, 1], [1, 2]];
const NODE_R = 0.072;
const LINE_R = 0.028;

function glyphSD(px, py) {
  let d = Infinity;
  for (const [nx, ny] of NODES) d = Math.min(d, sdCircle(px, py, nx, ny, NODE_R));
  for (const [a, b] of LINKS) {
    d = Math.min(d, sdSegment(px, py, NODES[a][0], NODES[a][1], NODES[b][0], NODES[b][1], LINE_R));
  }
  return d;
}

function renderIcon(size) {
  const SS = 4;
  const W = size * SS;
  const acc = Buffer.alloc(size * size * 4);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const px = (x + 0.5) / W, py = (y + 0.5) / W;
      const sdBg = sdRoundRect(px, py, 0.5, 0.5, 0.5, 0.24);
      const covBg = Math.min(1, Math.max(0, 0.5 - sdBg * W));
      if (covBg <= 0) continue;
      const sdFg = glyphSD(px, py);
      const covFg = Math.min(1, Math.max(0, 0.5 - sdFg * W));
      const a = covBg * 255;
      const r = BG[0] + (FG[0] - BG[0]) * covFg;
      const g = BG[1] + (FG[1] - BG[1]) * covFg;
      const b = BG[2] + (FG[2] - BG[2]) * covFg;
      const oi = (((y / SS) | 0) * size + ((x / SS) | 0)) * 4;
      // 降采样累加
      acc[oi] += r / SS / SS;
      acc[oi + 1] += g / SS / SS;
      acc[oi + 2] += b / SS / SS;
      acc[oi + 3] += a / SS / SS;
    }
  }
  return acc;
}

const outDir = path.join(__dirname, '..', 'src', 'assets', 'icons');
for (const size of [16, 32, 48, 128]) {
  const rgba = renderIcon(size);
  const png = encodePNG(size, size, rgba);
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, png);
  console.log('written', file, png.length, 'bytes');
}
