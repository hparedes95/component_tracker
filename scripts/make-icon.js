// Genera build/icon.png (512x512) y build/icon.ico (256x256) sin dependencias:
// dibuja el icono píxel a píxel y lo codifica como PNG con zlib.
// Ejecutar con: node scripts/make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 512;

function makePixels(size) {
  const px = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const scale = size / 512;

  const set = (x, y, r, g, b, a = 255) => {
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };

  // Fondo: degradado diagonal violeta -> azul con esquinas redondeadas
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size);
      const r = Math.round(124 + (90 - 124) * t);
      const g = Math.round(108 + (139 - 108) * t);
      const b = 240;
      // Esquinas redondeadas
      const cx = Math.max(radius - x, x - (size - 1 - radius), 0);
      const cy = Math.max(radius - y, y - (size - 1 - radius), 0);
      if (cx > 0 && cy > 0 && Math.hypot(cx, cy) > radius) continue; // alfa 0
      set(x, y, r, g, b);
    }
  }

  // Barras blancas ascendentes (gráfica de precios)
  const bars = [
    { x: 110, h: 120 },
    { x: 210, h: 190 },
    { x: 310, h: 270 }
  ];
  const barW = 70, baseY = 400;
  for (const bar of bars) {
    const x0 = Math.round(bar.x * scale), x1 = Math.round((bar.x + barW) * scale);
    const y0 = Math.round((baseY - bar.h) * scale), y1 = Math.round(baseY * scale);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) set(x, y, 255, 255, 255);
    }
  }

  // Flecha ascendente (línea gruesa de (100,300) a (390,120) + punta)
  const drawThickLine = (ax, ay, bx, by, w) => {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * scale) * 2;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = Math.round((ax + (bx - ax) * t) * scale);
      const cy = Math.round((ay + (by - ay) * t) * scale);
      const hw = Math.round((w / 2) * scale);
      for (let dy = -hw; dy <= hw; dy++) {
        for (let dx = -hw; dx <= hw; dx++) {
          const X = cx + dx, Y = cy + dy;
          if (X >= 0 && X < size && Y >= 0 && Y < size && dx * dx + dy * dy <= hw * hw) {
            set(X, Y, 24, 28, 40);
          }
        }
      }
    }
  };
  drawThickLine(100, 310, 390, 130, 26);
  drawThickLine(390, 130, 310, 135, 26);
  drawThickLine(390, 130, 385, 210, 26);

  return px;
}

// ---- Codificador PNG mínimo ----
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // profundidad de bits
  ihdr[9] = 6;  // RGBA
  // Datos: cada fila precedida por el byte de filtro 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ICO moderno: cabecera ICO con un PNG de 256x256 incrustado
function encodeIco(png256) {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0);  // reservado
  header.writeUInt16LE(1, 2);  // tipo icono
  header.writeUInt16LE(1, 4);  // 1 imagen
  header[6] = 0;               // 0 = 256px
  header[7] = 0;
  header[8] = 0;               // sin paleta
  header.writeUInt16LE(1, 10); // planos
  header.writeUInt16LE(32, 12);// bits por píxel
  header.writeUInt32LE(png256.length, 14);
  header.writeUInt32LE(22, 18); // offset de los datos
  return Buffer.concat([header, png256]);
}

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'icon.png'), encodePng(makePixels(S), S));
fs.writeFileSync(path.join(outDir, 'icon.ico'), encodeIco(encodePng(makePixels(256), 256)));
console.log('Iconos generados en build/');
