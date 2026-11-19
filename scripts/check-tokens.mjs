// Keeps the page stylesheets on the shared design tokens in css/tokens.css,
// so a colour or font change there reaches every screen. Fails when:
//   - a colour, font size or weight is written out although a token has that value
//   - a var(--name) has no definition (a typo, or a token renamed or removed)
//   - a token is defined but nothing uses it
// One-off values with no token are fine; give them a token once they repeat.
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './lib/trails.mjs';

const pages = ['css/game.css', 'css/editor.css'];
const read = file => readFileSync(join(repoRoot, file), 'utf8');

const css = globSync('css/**/*.css', { cwd: repoRoot });
const js = globSync('js/**/*.{js,mjs}', { cwd: repoRoot });
const sources = [...css, ...js, 'index.html', 'editor.html'].map(file => ({ file, text: read(file) }));

const tokens = new Map();
for (const [, name, value] of read('css/tokens.css').matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
  tokens.set(name, value.trim().toLowerCase());
}
const byValue = (prefix) => {
  const map = new Map();
  for (const [name, value] of tokens) if (name.startsWith(prefix) && !map.has(value)) map.set(value, name);
  return map;
};
const colours = byValue('--color-');
const sizes = byValue('--text-');
const weights = byValue('--weight-');

// Custom properties can also be declared in any stylesheet or set from script.
const defined = new Set(tokens.keys());
for (const { text } of sources) {
  for (const [, name] of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(name);
  for (const [, name] of text.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) defined.add(name);
}

const errors = [];
for (const file of pages) {
  read(file).split('\n').forEach((line, index) => {
    const at = `${file}:${index + 1}`;
    for (const [hex] of line.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
      const token = colours.get(hex.toLowerCase());
      if (token) errors.push(`${at}: ${hex} is var(${token})`);
    }
    for (const [, size] of line.matchAll(/font-size:\s*(\d+px)/g)) {
      const token = sizes.get(size);
      if (token) errors.push(`${at}: ${size} is var(${token})`);
    }
    for (const [, weight] of line.matchAll(/font-weight:\s*(\d+)/g)) {
      errors.push(`${at}: font-weight ${weight}; use ${weights.get(weight) ? `var(${weights.get(weight)})` : 'a --weight- token'}`);
    }
    if (/ui-monospace|system-ui|font-family:\s*["'\w]/.test(line) && !/var\(--font-/.test(line)) {
      errors.push(`${at}: font family written out; use var(--font-ui) or var(--font-display)`);
    }
  });
}

for (const { file, text } of sources) {
  if (!file.endsWith('.css')) continue;
  text.split('\n').forEach((line, index) => {
    // A fallback means the property is meant to be optional.
    for (const [, name, fallback] of line.matchAll(/var\((--[\w-]+)\s*(,)?/g)) {
      if (!fallback && !defined.has(name)) errors.push(`${file}:${index + 1}: var(${name}) is never defined`);
    }
  });
}

// A token is used by var() in a stylesheet, or read from script with getPropertyValue().
const used = sources.map(({ file, text }) => (file === 'css/tokens.css' ? text.replace(/(--[\w-]+)\s*:/g, '') : text)).join('\n');
for (const name of tokens.keys()) {
  if (!used.includes(`var(${name}`) && !used.includes(`getPropertyValue('${name}')`)) errors.push(`css/tokens.css: ${name} is never used`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`${errors.length} design token problem${errors.length === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log(`Design tokens: ${tokens.size} tokens, page stylesheets clean.`);
