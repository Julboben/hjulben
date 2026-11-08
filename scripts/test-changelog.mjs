// Checks CHANGELOG.md: parseable, newest first, and notes for the version in
// package.json, so a release can't ship without them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './lib/trails.mjs';
import {
  readChangelog, parseChangelog, changeType, pinnedChanges, formatChangelog, validateChangelog, releaseMarkdown, compareVersions, plainText
} from './lib/changelog.mjs';

const changelog = readChangelog();
const errors = validateChangelog(changelog);
assert.deepEqual(errors, [], `CHANGELOG.md is invalid:\n${errors.join('\n')}`);

const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
assert.equal(changelog.releases[0]?.version, version,
  `CHANGELOG.md's newest release should be ${version} (package.json). Prepare releases with the "Prepare release" workflow or \`node scripts/release.mjs prepare\`.`);

const sample = [
  '# Changelog', '', 'Intro text.', '',
  '## 1.1.0 — 2026-02-01', '', '### Fixed', '- C.', '### New', '- A spread', '  over two lines.', '- B.', '',
  '## 1.0.0 - 2026-01-01', '### Improved', '* D.', '### heads-up', '- E.', ''
].join('\r\n');
const parsed = parseChangelog(sample);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.intro, '# Changelog\n\nIntro text.\n');
assert.deepEqual(parsed.releases.map(r => [r.version, r.date, r.changes.map(c => `${c.type}:${c.text}`)]), [
  ['1.1.0', '2026-02-01', ['fixed:C.', 'new:A spread over two lines.', 'new:B.']],
  ['1.0.0', '2026-01-01', ['improved:D.', 'heads-up:E.']]
]);
assert.deepEqual(parseChangelog(formatChangelog(parsed)).releases.map(r => r.changes.length), [3, 2]);
assert.equal(releaseMarkdown(parsed.releases[0]), '### New\n- A spread over two lines.\n- B.\n\n### Fixed\n- C.');
assert.equal(releaseMarkdown(parsed.releases[1]), '### Heads up\n- E.\n\n### Improved\n- D.');
assert.deepEqual(['Heads up', 'heads-up', 'HEADSUP', 'Fixed', 'Other'].map(changeType), ['heads-up', 'heads-up', 'heads-up', 'fixed', null]);

const broken = parseChangelog('## 1.0 today\n- loose\n## 1.0.0 — 2026-01-01\n### Other\nstray text\n');
assert.equal(broken.errors.length, 3);
assert.equal(validateChangelog({ errors: [], releases: [
  { version: '1.0.0', date: '2026-01-01', changes: [{ type: 'new', text: 'A' }] },
  { version: '1.0.0', date: '2026-01-01', changes: [] }
] }).length, 2);

assert.ok(compareVersions('0.10.0', '0.9.9') > 0);
assert.equal(plainText('**Bold**, _soft_, `code` and [a link](https://x.y) in snake_case.'), 'Bold, soft, code and a link in snake_case.');

// Pinned notes in a commit or PR description, wrapped over lines or not.
{
  const pinned = text => pinnedChanges(text);
  assert.deepEqual(pinned('Subject\n\nChangelog: fixed: The camera no longer jumps.'),
    { changes: [{ type: 'fixed', text: 'The camera no longer jumps.' }], skip: false });
  assert.deepEqual(pinned([
    'Body text.', '',
    'Changelog: improved: In the editor, anything you drag snaps to the',
    'edges of other things nearby.',
    'Changelog: new: A mini map.',
    'Changelog: Untyped note that',
    '  wraps with an indent.',
    '',
    'A paragraph after a blank line is not part of it.',
    'Signed-off-by: Someone <a@b.c>',
  ].join('\n')).changes, [
    { type: 'improved', text: 'In the editor, anything you drag snaps to the edges of other things nearby.' },
    { type: 'new', text: 'A mini map.' },
    { type: null, text: 'Untyped note that wraps with an indent.' },
  ]);
  // A trailer, list item or heading right after a note starts something else.
  assert.deepEqual(pinned('Changelog: fixed: One.\nCo-authored-by: X <x@y.z>').changes, [{ type: 'fixed', text: 'One.' }]);
  assert.deepEqual(pinned('- Changelog: new: One.\n- Changelog: new: Two.\n## Notes').changes,
    [{ type: 'new', text: 'One.' }, { type: 'new', text: 'Two.' }]);
  // A quoted note wraps inside the quote.
  assert.deepEqual(pinned('> Changelog: fixed: A long\n> quoted note.').changes, [{ type: 'fixed', text: 'A long quoted note.' }]);
  // `none` leaves the description out, even with text straight after it.
  assert.deepEqual(pinned('Changelog: none\nOnly tests changed.'), { changes: [], skip: true });
  assert.deepEqual(pinned('Changelog: none'), { changes: [], skip: true });
  // Notes in HTML comments, such as a PR template's example, don't count.
  assert.deepEqual(pinned('<!--\nChangelog: fixed: Example.\n-->\nNo notes.'), { changes: [], skip: false });
}

console.log(`Changelog test passed (${changelog.releases.length} releases, latest ${version}).`);
