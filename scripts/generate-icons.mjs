// Builds css/icons.css, plus the favicon and app icons from the `logo` icon,
// from the pixel art in icons/pixel-icons.mjs.
//
//   node scripts/generate-icons.mjs          rewrite the outputs if needed
//   node scripts/generate-icons.mjs --check  fail if any is out of date (CI)
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import icons from '../icons/pixel-icons.mjs';

const check = process.argv.includes('--check');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = join(root, 'css', 'icons.css');

function fail(message) {
  console.error(`icons: ${message}`);
  process.exit(1);
}

/** @returns {string[]} the rows of a grid, with the indentation removed */
function parseGrid(name, text) {
  const rows = text.split('\n').map(row => row.trim()).filter(Boolean);
  if (!rows.length) fail(`"${name}" is empty`);
  if (rows.some(row => row.length !== rows[0].length)) fail(`"${name}" has rows of different lengths`);
  return rows;
}

const mirror = rows => rows.map(row => [...row].reverse().join(''));
const rotate = rows => [...rows[0]].map((_, x) => rows.map(row => row[x]).reverse().join(''));

const resolved = new Map();
function resolve(name) {
  if (resolved.has(name)) return resolved.get(name);
  const entry = icons[name];
  if (!entry) fail(`unknown icon "${name}"`);
  let icon;
  if (typeof entry === 'string') icon = { rows: parseGrid(name, entry), palette: {} };
  else if (entry.grid) icon = { rows: parseGrid(name, entry.grid), palette: entry.palette || {} };
  else if (entry.mirror) {
    const source = resolve(entry.mirror);
    icon = { ...source, rows: mirror(source.rows) };
  } else if (entry.rotate) {
    const source = resolve(entry.rotate);
    let rows = source.rows;
    for (let turn = 0; turn < (entry.turns ?? 1); turn++) rows = rotate(rows);
    icon = { ...source, rows };
  } else fail(`"${name}" needs a grid, mirror or rotate`);
  for (const char of new Set(icon.rows.join(''))) {
    if (char !== '.' && char !== '#' && !(char in icon.palette)) fail(`"${name}" uses "${char}", which is not in its palette`);
  }
  if (icon.rows.join('').includes('#') && Object.keys(icon.palette).length) {
    fail(`"${name}" mixes # with palette colours; give every pixel a palette colour`);
  }
  resolved.set(name, icon);
  return icon;
}

/** One path per colour, one rectangle per horizontal run of pixels. */
function svgPaths({ rows, palette }) {
  const runs = new Map();
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const char = row[x];
      let end = x + 1;
      while (row[end] === char) end++;
      if (char !== '.') runs.set(char, (runs.get(char) || '') + `M${x} ${y}h${end - x}v1H${x}z`);
      x = end;
    }
  });
  return [...runs].map(([char, d]) => `<path${palette[char] ? ` fill='${palette[char]}'` : ''} d='${d}'/>`).join('');
}

function svg(icon) {
  const { rows } = icon;
  const markup = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${rows[0].length} ${rows.length}' shape-rendering='crispEdges'>${svgPaths(icon)}</svg>`;
  return `url("data:image/svg+xml,${markup.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23')}")`;
}

const names = Object.keys(icons);
const urls = names.map(name => `    --icon-${name}: ${svg(resolve(name))};`);
const rules = names.map(name => {
  const { rows, palette } = resolve(name);
  const selector = `[data-icon="${name}"],\n[data-icon-before="${name}"]::before,\n[data-icon-after="${name}"]::after`;
  // Colour icons are drawn as they are; the rest are masks filled with the text colour.
  const colour = Object.keys(palette).length
    ? '\n    background: var(--icon) center / 100% 100% no-repeat;\n    mask: none;'
    : '';
  return `${selector} {\n    --icon: var(--icon-${name});\n    --icon-w: ${rows[0].length};\n    --icon-h: ${rows.length};${colour}\n}`;
});

const css = `/* Generated from icons/pixel-icons.mjs by scripts/generate-icons.mjs; do not edit.
   Icons: ${names.join(', ')}. */
:root {
${urls.join('\n')}
}
[data-icon],
[data-icon-before]::before,
[data-icon-after]::after {
    display: inline-block;
    flex: none;
    width: calc(var(--icon-w) * var(--px, 2px));
    height: calc(var(--icon-h) * var(--px, 2px));
    vertical-align: middle;
    background: currentColor;
    mask: var(--icon) center / 100% 100% no-repeat;
}
[data-icon-before]::before {
    content: "";
    margin: -0.15em 0.6em 0 0;
}
[data-icon-after]::after {
    content: "";
    margin: -0.15em 0 0 0.6em;
}
${rules.join('\n')}
`;

// --- Favicon and app icons, drawn from the logo -----------------------------
const logo = resolve('logo');
const logoSize = logo.rows[0].length;
const appBackground = '#111c20';

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logoSize} ${logo.rows.length}" shape-rendering="crispEdges">
  <title>Hjulben</title>
  ${svgPaths(logo).replaceAll("'", '"')}
</svg>
`;

// Maskable icons are cropped to a circle of 80% of their width, so pad the logo by 10% on each side.
const maskPad = logoSize / 8;
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logoSize + maskPad * 2} ${logoSize + maskPad * 2}" shape-rendering="crispEdges">
  <title>Hjulben</title>
  <rect width="100%" height="100%" fill="${appBackground}"/>
  <g transform="translate(${maskPad} ${maskPad})">${svgPaths(logo).replaceAll("'", '"')}</g>
</svg>
`;

/**
 * RGB pixels of the logo, scaled up by whole pixels and centred on the app
 * background. Maskable icons are cropped to a circle of 80% of their width, so
 * their logo takes less of the square.
 */
function appIconPixels(size, logoShare = 0.9) {
  const scale = Math.floor((size * logoShare) / logoSize);
  const offset = Math.floor((size - logoSize * scale) / 2);
  const hex = colour => [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16));
  const background = hex(appBackground);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    for (let x = 0; x < size; x++) {
      const char = logo.rows[Math.floor((y - offset) / scale)]?.[Math.floor((x - offset) / scale)];
      const inside = x >= offset && y >= offset && char && char !== '.';
      raw.set(inside ? hex(logo.palette[char]) : background, row + 1 + x * 3);
    }
  }
  return raw;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return ~crc >>> 0;
}
function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function png(size, raw) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
/** The decoded pixels of a PNG this script wrote, so --check doesn't depend on the zlib version. */
function pngPixels(file) {
  const parts = [];
  for (let at = 8; at < file.length;) {
    const length = file.readUInt32BE(at);
    if (file.toString('latin1', at + 4, at + 8) === 'IDAT') parts.push(file.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  return inflateSync(Buffer.concat(parts));
}

// The PNG app icons: iOS's touch icon, and the sizes installers want
// alongside the SVGs in manifest.webmanifest.
const pngIcon = (path, size, logoShare) => {
  const pixels = appIconPixels(size, logoShare);
  return { path, content: png(size, pixels), pixels };
};

const outputs = [
  { path: 'css/icons.css', content: css, label: `${names.length} icons` },
  { path: 'icons/icon.svg', content: faviconSvg },
  { path: 'icons/icon-maskable.svg', content: maskableSvg },
  pngIcon('icons/apple-touch-icon.png', 180),
  pngIcon('icons/icon-192.png', 192),
  pngIcon('icons/icon-512.png', 512),
  pngIcon('icons/icon-maskable-192.png', 192, 0.6),
  pngIcon('icons/icon-maskable-512.png', 512, 0.6),
];

let stale = false;
for (const { path, content, pixels, label } of outputs) {
  const file = join(root, path);
  let current = null;
  try { current = readFileSync(file); } catch {}
  const upToDate = current !== null && (pixels
    ? (() => { try { return pngPixels(current).equals(pixels); } catch { return false; } })()
    : current.toString('utf8').replaceAll('\r\n', '\n') === content);
  const suffix = label ? `, ${label}` : '';
  if (upToDate) { console.log(`${path}: up to date${suffix}`); continue; }
  if (check) { console.error(`icons: ${path} is out of date. Run \`npm run icons\` and commit the result.`); stale = true; continue; }
  writeFileSync(file, content);
  console.log(`${path}: updated${suffix}`);
}
if (stale) process.exit(1);
