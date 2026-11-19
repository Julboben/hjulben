// Runs `node --check` on every script so a syntax error in browser-only code
// (which the Node tests never import) still fails CI.
import { execFileSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './lib/trails.mjs';

const files = globSync(['js/**/*.{js,mjs}', 'scripts/**/*.{js,mjs}', 'sw.js'], { cwd: repoRoot }).map(file => join(repoRoot, file));

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failed++;
    console.error(error.stderr?.toString() || error.message);
  }
}
if (failed) {
  console.error(`${failed} of ${files.length} files failed the syntax check.`);
  process.exit(1);
}
console.log(`Syntax check passed (${files.length} files).`);
