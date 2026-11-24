// Copies the files the live site serves into a folder for Netlify to publish,
// so the docs, scripts and tests in the repo stay off the web. The deploy and
// Netlify's pull request previews publish `dist/`.
//
//   node scripts/build-site.mjs [folder]    default: dist
import { join, resolve } from 'node:path';
import { buildSite } from './lib/site-files.mjs';
import { repoRoot } from './lib/trails.mjs';

const out = resolve(process.argv[2] ?? join(repoRoot, 'dist'));
console.log(`Site: ${buildSite(out)} files in ${out}`);
