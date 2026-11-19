import { watch } from 'node:fs';
import path from 'node:path';
import { generateTrailCatalog } from './generate-trail-catalog.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const directories = ['official', 'bonus', 'custom'].map(source => path.join(projectRoot, 'trails', source));
let timer = null;

await generateTrailCatalog();
for (const directory of directories) {
  watch(directory, (_event, filename) => {
    if (!filename?.endsWith('.json')) return;
    clearTimeout(timer);
    timer = setTimeout(() => generateTrailCatalog().catch(error => console.error(error.message)), 80);
  });
}
console.log('Watching trails/official, trails/bonus and trails/custom for JSON changes.');
