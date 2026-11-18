const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { deflateSync } = require('node:zlib');

// A self-contained, offline raster renderer. All drawing and PNG encoding use
// Node's standard library so the same input always produces the same bytes.
const W = 1024;
const H = 1024;
const pixels = Buffer.alloc(W * H * 3);
const ink = [12, 22, 34];
const paper = [243, 240, 229];

function rect(x, y, w, h, c) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let p = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++, p += 3) {
      pixels[p] = c[0]; pixels[p + 1] = c[1]; pixels[p + 2] = c[2];
    }
  }
}

function circle(cx, cy, r, c) {
  const rr = r * r;
  for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(H, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(W, Math.ceil(cx + r)); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= rr) {
        const p = (y * W + x) * 3;
        pixels[p] = c[0]; pixels[p + 1] = c[1]; pixels[p + 2] = c[2];
      }
    }
  }
}

function line(x0, y0, x1, y1, c, thick = 3) {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    circle(x0, y0, thick, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

const glyphs = {
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  A: ['01110','10001','10001','11111','10001','10001','10001'], B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01111','10000','10000','10000','10000','10000','01111'], D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'], F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01111','10000','10000','10111','10001','10001','01111'], H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'], J: ['00111','00010','00010','00010','10010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'], L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'], N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'], P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'], R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'], T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'], V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','10101','01010'], X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'], Z: ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'], '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'], '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'], '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'], '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'], '9': ['01110','10001','10001','01111','00001','00001','01110'],
  ',': ['00000','00000','00000','00000','00110','00110','00100'], '.': ['00000','00000','00000','00000','00000','00110','00110'],
  ':': ['00000','00110','00110','00000','00110','00110','00000'], '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '>': ['10000','01000','00100','00010','00100','01000','10000'], '&': ['01100','10010','10100','01000','10101','10010','01101'],
  '/': ['00001','00010','00010','00100','01000','01000','10000'],
};

function text(str, x, y, scale, c) {
  let cursor = x;
  for (const raw of str.toUpperCase()) {
    const glyph = glyphs[raw] ?? glyphs[' '];
    for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
      if (glyph[gy][gx] === '1') rect(cursor + gx * scale, y + gy * scale, scale, scale, c);
    }
    cursor += 6 * scale;
  }
  return cursor;
}

function fit(str, x, y, maxWidth, maxScale, c) {
  const scale = Math.max(1, Math.min(maxScale, Math.floor(maxWidth / (str.length * 6))));
  text(str, x, y, scale, c);
}

function panel(x, y, n, label, accent) {
  rect(x, y, 456, 330, [27, 42, 57]);
  rect(x, y, 456, 8, accent);
  circle(x + 33, y + 34, 19, accent);
  text(n, x + 21, y + 27, 2, ink);
  text(label, x + 64, y + 25, 2, [181, 197, 206]);
}

function iconManila(x, y, a) {
  circle(x + 76, y + 73, 53, [39, 64, 78]);
  circle(x + 76, y + 73, 42, [78, 126, 139]);
  circle(x + 76, y + 73, 30, [39, 64, 78]);
  line(x + 32, y + 73, x + 120, y + 73, [168, 204, 200], 1);
  line(x + 76, y + 31, x + 76, y + 115, [168, 204, 200], 1);
  const pts = [[x+57,y+47],[x+95,y+48],[x+56,y+97],[x+96,y+96]];
  for (const [px,py] of pts) circle(px, py, 7, a);
  line(pts[0][0],pts[0][1],pts[1][0],pts[1][1],a,2);
  line(pts[1][0],pts[1][1],pts[3][0],pts[3][1],a,2);
  line(pts[3][0],pts[3][1],pts[2][0],pts[2][1],a,2);
  line(pts[2][0],pts[2][1],pts[0][0],pts[0][1],a,2);
  text('MANILA', x + 44, y + 140, 3, a);
}

function iconBridge(x, y, a) {
  rect(x + 14, y + 39, 126, 75, [39, 64, 78]);
  rect(x + 68, y + 50, 17, 56, a);
  line(x + 12, y + 54, x + 45, y + 54, paper, 2);
  line(x + 102, y + 54, x + 144, y + 54, paper, 2);
  line(x + 13, y + 55, x + 46, y + 79, paper, 2);
  line(x + 100, y + 79, x + 145, y + 55, paper, 2);
  line(x + 13, y + 55, x + 13, y + 117, [131, 152, 161], 2);
  line(x + 145, y + 55, x + 145, y + 117, [131, 152, 161], 2);
  rect(x + 10, y + 116, 140, 5, paper);
  rect(x + 68, y + 116, 18, 5, ink);
  line(x + 76, y + 115, x + 76, y + 91, a, 3);
  circle(x + 76, y + 85, 5, a);
  text('KERCH', x + 46, y + 145, 3, a);
}

function iconHealth(x, y, a) {
  circle(x + 77, y + 78, 48, [39, 64, 78]);
  circle(x + 77, y + 78, 31, [214, 102, 92]);
  circle(x + 77, y + 78, 19, [245, 171, 123]);
  for (const [dx,dy] of [[0,-57],[40,-40],[58,0],[40,40],[0,58],[-40,40],[-58,0],[-40,-40]]) {
    line(x + 77 + dx * .68, y + 78 + dy * .68, x + 77 + dx, y + 78 + dy, a, 3);
    circle(x + 77 + dx, y + 78 + dy, 5, a);
  }
  rect(x + 69, y + 63, 16, 45, paper);
  rect(x + 54, y + 78, 46, 15, paper);
  text('HEALTH', x + 37, y + 145, 3, a);
}

function iconBoat(x, y, a) {
  circle(x + 75, y + 76, 59, [39, 64, 78]);
  line(x + 18, y + 99, x + 135, y + 99, [94, 164, 181], 2);
  line(x + 28, y + 114, x + 119, y + 114, [94, 164, 181], 2);
  line(x + 30, y + 83, x + 119, y + 83, paper, 2);
  line(x + 30, y + 84, x + 45, y + 105, paper, 3);
  line(x + 45, y + 105, x + 106, y + 105, paper, 3);
  line(x + 106, y + 105, x + 119, y + 84, paper, 3);
  line(x + 72, y + 83, x + 72, y + 43, a, 2);
  line(x + 72, y + 46, x + 48, y + 78, a, 2);
  line(x + 74, y + 47, x + 96, y + 78, a, 2);
  text('ATLANTIC', x + 25, y + 145, 3, a);
}

rect(0, 0, W, H, ink);
rect(36, 34, 952, 5, [61, 203, 185]);
text('WORLD DESK  /  TUESDAY, 17 NOVEMBER 2026', 46, 60, 3, [61, 203, 185]);
text('A DAY IN FOUR', 44, 99, 7, paper);
text('NEWS SIGNALS', 44, 152, 7, paper);
text('DIPLOMACY  •  WAR  •  HEALTH  •  MIGRATION', 49, 212, 2, [174, 190, 198]);

const cards = [
  { x: 40, y: 256, n: '01', label: 'ASIA  /  DIPLOMACY', color: [61,203,185], title: 'QUAD MEETS IN MANILA', lines: ['TRUMP MET INDIA, JAPAN &', 'AUSTRALIA LEADERS IN THE', 'PHILIPPINES.'], icon: iconManila },
  { x: 528, y: 256, n: '02', label: 'EUROPE  /  WAR', color: [245,171,123], title: 'KERCH BRIDGE STRUCK', lines: ['UKRAINE SAID ITS STRIKE', 'DAMAGED A ROAD SPAN LINKING', 'RUSSIA AND CRIMEA.'], icon: iconBridge },
  { x: 40, y: 610, n: '03', label: 'AMERICAS  /  HEALTH', color: [231,115,105], title: 'MEASLES STATUS LOST', lines: ['PAHO REMOVED ELIMINATION', 'STATUS FROM THE U.S., MEXICO', '& BOLIVIA.'], icon: iconHealth },
  { x: 528, y: 610, n: '04', label: 'AFRICA TO EUROPE', color: [116,190,224], title: 'MIGRANT ARRIVALS SURGE', lines: ['SPAIN: OVER 11,000 MIGRANTS', 'REACHED CANARY ISLANDS IN', 'FIRST HALF OF NOVEMBER.'], icon: iconBoat },
];

for (const card of cards) {
  panel(card.x, card.y, card.n, card.label, card.color);
  card.icon(card.x + 155, card.y + 45, card.color);
  fit(card.title, card.x + 22, card.y + 224, 412, 4, paper);
  for (let i = 0; i < card.lines.length; i++) text(card.lines[i], card.x + 22, card.y + 270 + i * 22, 2, [201, 212, 216]);
}

rect(40, 956, 944, 2, [61, 203, 185]);
text('FOUR DATED DEVELOPMENTS  /  SOURCES: AP, REUTERS, PAHO', 48, 972, 2, [174, 190, 198]);

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
}

const rows = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) pixels.copy(rows, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
const header = Buffer.alloc(13);
header.writeUInt32BE(W, 0); header.writeUInt32BE(H, 4);
header[8] = 8; header[9] = 2; header[10] = 0; header[11] = 0; header[12] = 0;
const png = Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]);
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
