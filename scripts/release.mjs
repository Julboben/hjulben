// Release helper used by the GitHub workflows (and runnable locally).
//
//   node scripts/release.mjs prepare <patch|minor|major> [--dry-run]
//       Bumps the version, writes release notes for everything since the last
//       v* tag into CHANGELOG.md, and regenerates js/version.js, js/changelog.js
//       and sw.js. --dry-run only prints the notes.
//   node scripts/release.mjs notes [version]
//       Prints a release's notes from CHANGELOG.md.
//
// Notes come from merged PRs and commits. A PR or commit description can pin
// its own lines, which are used as written instead of being summarised:
//   Changelog: Added a desert trail.
//   Changelog: fixed: The camera no longer jumps at the start.
//   Changelog: heads up: The leaderboard has been reset.
//   Changelog: none          (leave this PR out of the notes)
// A long note may wrap onto the following lines (see pinnedChanges).
// Everything else is summarised into player-facing notes by Copilot CLI
// (`copilot -p`), signed in locally or through COPILOT_GITHUB_TOKEN in Actions.
// RELEASE_NOTES_MODEL picks a model. If Copilot is unavailable, the raw commit
// subjects are used, to be tidied up in the release PR. GITHUB_TOKEN (or
// `gh auth token` locally) is used to read PR descriptions.
import { execFile, execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from './lib/trails.mjs';
import {
  CHANGE_TYPES, pinnedChanges, readChangelog, writeChangelog, validateChangelog, releaseMarkdown, compareVersions
} from './lib/changelog.mjs';

// Commits that never matter to players.
const NOISE = /^(release v\d|merge (branch|remote-tracking)|update sw(\.js)?$|sw$|npm run |update replays|rerun replays)/i;

const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
const fail = message => { console.error(message); process.exit(1); };

function lastTag() {
  try { return git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD'); } catch { return null; }
}

function bump(version, kind) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  fail(`Unknown bump "${kind}". Use patch, minor or major.`);
}

function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}

function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = git('remote', 'get-url', 'origin');
  return url.match(/github\.com[:/](.+?)(\.git)?$/)?.[1] ?? '';
}

async function fetchPullRequest(number, token, repo) {
  if (!token || !repo) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${number}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
    });
    if (!res.ok) return null;
    const pr = await res.json();
    return { number, title: pr.title, body: pr.body || '', branch: pr.head?.ref || '' };
  } catch { return null; }
}

/** Everything merged since `since`: PRs, loose commits and pinned lines. */
async function collectChanges(since, token) {
  const repo = repoSlug();
  const log = git('log', '--format=%H%x1f%P%x1f%s%x1f%b%x1e', `${since}..HEAD`);
  const entries = log.split('\x1e').map(entry => entry.trim()).filter(Boolean).map(entry => {
    const [sha, parents, subject, body] = entry.split('\x1f');
    return { sha, parents: parents.split(' '), subject, body: body || '' };
  });

  const pulls = [];
  const covered = new Set();
  const pinned = [];
  for (const entry of entries) {
    const number = entry.subject.match(/^Merge pull request #(\d+)/)?.[1] ?? entry.subject.match(/\(#(\d+)\)$/)?.[1];
    if (!number) continue;
    const pr = await fetchPullRequest(number, token, repo) ?? { number, title: entry.subject, body: entry.body, branch: '' };
    if (pr.branch.startsWith('release/')) { covered.add(entry.sha); continue; }
    const { changes, skip } = pinnedChanges(pr.body);
    // Commits brought in by a merge belong to its PR.
    const own = entry.parents.length > 1 ? git('rev-list', `${entry.parents[0]}..${entry.parents[1]}`).split('\n').filter(Boolean) : [];
    if (skip || changes.length) {
      own.forEach(sha => covered.add(sha));
      covered.add(entry.sha);
      pinned.push(...changes);
      continue;
    }
    pulls.push({ number: pr.number, title: pr.title, body: pr.body.slice(0, 1500), commits: own });
  }

  const commits = [];
  for (const entry of entries) {
    if (covered.has(entry.sha) || entry.parents.length > 1 || NOISE.test(entry.subject)) continue;
    const { changes, skip } = pinnedChanges(entry.body);
    if (skip) continue;
    if (changes.length) { pinned.push(...changes); continue; }
    const files = git('show', '--name-only', '--format=', entry.sha).split('\n').filter(Boolean);
    commits.push({ sha: entry.sha, subject: entry.subject, body: entry.body.slice(0, 600), files: files.slice(0, 12) });
  }
  // A PR's commits are listed under it rather than on their own.
  const inPulls = new Set(pulls.flatMap(pr => pr.commits));
  const prCommits = new Map(commits.filter(c => inPulls.has(c.sha)).map(c => [c.sha, c]));
  return {
    pinned,
    pulls: pulls.map(pr => ({ ...pr, commits: pr.commits.map(sha => prCommits.get(sha)).filter(Boolean) })),
    commits: commits.filter(c => !inPulls.has(c.sha))
  };
}

function describeChanges({ pinned, pulls, commits }) {
  const commitLine = c => `- ${c.subject}${c.body ? ` — ${c.body.replace(/\s+/g, ' ')}` : ''} [files: ${c.files.join(', ')}]`;
  const parts = [];
  if (pinned.length) parts.push('PINNED NOTES (include each one, keep the wording, only choose a type when it is missing):\n' + pinned.map(p => `- ${p.type ? `[${p.type}] ` : ''}${p.text}`).join('\n'));
  for (const pr of pulls) parts.push(`PULL REQUEST #${pr.number}: ${pr.title}\n${pr.body}\nCommits:\n${pr.commits.map(commitLine).join('\n')}`);
  if (commits.length) parts.push('COMMITS:\n' + commits.map(commitLine).join('\n'));
  return parts.join('\n\n');
}

/** Runs Copilot CLI in programmatic mode, with no tools, and returns its reply. */
function askCopilot(prompt) {
  const args = ['-p', prompt, '-s', '--no-ask-user', '--no-custom-instructions', '--available-tools=', '--disable-builtin-mcps', '--no-color'];
  if (process.env.RELEASE_NOTES_MODEL) args.push('--model', process.env.RELEASE_NOTES_MODEL);
  return new Promise((resolve, reject) => {
    execFile('copilot', args, { cwd: tmpdir(), maxBuffer: 4 * 1024 * 1024, timeout: 5 * 60 * 1000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(error.code === 'ENOENT' ? 'Copilot CLI is not installed' : (stderr || error.message).trim().slice(0, 300)));
      else resolve(stdout);
    });
  });
}

async function writeNotesWithAI(changes, previous) {
  const system = [
    'You write the player-facing patch notes for Hjulben, a 2D physics-based trials motorbike browser game with online leaderboards, ghosts, rider customisation and a trail editor.',
    'Turn the developer changes into short notes for players. Rules:',
    '- Only include changes a player or trail creator would notice. Leave out refactors, tests, CI, docs, build scripts, caches and service-worker updates.',
    '- Merge related commits into one note. Prefer fewer, meaningful notes (usually 2 to 8).',
    '- Plain, friendly sentences ending with a full stop. No commit hashes, PR numbers, file names or code names.',
    '- Prefix trail editor changes with "Editor: ".',
    '- type is "new" for new features or content, "improved" for changes to existing things, "fixed" for bug fixes.',
    '- type is "heads-up" only for things players must know about, such as a leaderboard reset, lost saves or progress, or something they need to do. Most releases have none.',
    '- Include every pinned note, except that a fixed or improved note about something that is new in this same release goes into that thing\'s new note, or is left out: players never saw the earlier version.',
    '- Do not invent details that are not supported by the changes.',
    'Reply with JSON only, without a code fence: {"changes":[{"type":"heads-up|new|improved|fixed","text":"..."}]}'
  ].join('\n');
  const example = previous ? `Style example, the previous release's notes:\n${JSON.stringify(previous.changes.slice(0, 6), null, 1)}\n\n` : '';
  const reply = await askCopilot(`${system}\n\n${example}Changes in this release:\n\n${describeChanges(changes)}`);
  const json = reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1);
  const parsed = JSON.parse(json);
  const notes = (parsed.changes || [])
    .filter(c => CHANGE_TYPES.includes(c?.type) && typeof c.text === 'string' && c.text.trim())
    .map(c => ({ type: c.type, text: c.text.trim() }));
  if (!notes.length) throw new Error('GitHub Models returned no notes.');
  return notes;
}

function fallbackNotes({ pinned, pulls, commits }) {
  return [
    ...pinned.map(p => ({ type: p.type || 'improved', text: p.text })),
    ...pulls.map(pr => ({ type: 'improved', text: pr.title })),
    ...commits.map(c => ({ type: /^fix/i.test(c.subject) ? 'fixed' : /^add/i.test(c.subject) ? 'new' : 'improved', text: c.subject.replace(/\.?$/, '.') }))
  ];
}

/** Grouped as heads up, new, improved, fixed, with editor changes last in each group. */
const sortNotes = notes => notes
  .map((note, i) => ({ note, i }))
  .sort((a, b) => (CHANGE_TYPES.indexOf(a.note.type) - CHANGE_TYPES.indexOf(b.note.type))
    || (/^editor:/i.test(a.note.text) - /^editor:/i.test(b.note.text)) || a.i - b.i)
  .map(({ note }) => note);

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function setPackageVersion(version) {
  for (const file of ['package.json', 'package-lock.json']) {
    const path = join(repoRoot, file);
    let data;
    try { data = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
    data.version = version;
    if (data.packages?.['']) data.packages[''].version = version;
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  }
}

async function prepare(kind, dryRun) {
  const { version: current } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const version = bump(current, kind);
  const tag = lastTag();
  if (!tag) fail(`No v* tag found. Tag the commit that is live now first, for example: git tag v${current} <commit> && git push origin v${current}`);
  if (!git('rev-list', `${tag}..HEAD`)) fail(`Nothing to release: no commits since ${tag}.`);

  const token = githubToken();
  const changes = await collectChanges(tag, token);
  const changelog = readChangelog();
  if (changelog.errors.length) fail(changelog.errors.join('\n'));
  const previous = changelog.releases.find(r => r.version !== version);
  let notes, ai = true;
  if (!changes.pinned.length && !changes.pulls.length && !changes.commits.length) {
    notes = [{ type: 'improved', text: 'Small fixes and improvements.' }];
  } else {
    try {
      notes = await writeNotesWithAI(changes, previous);
    } catch (error) {
      console.warn(`Could not write notes with AI (${error.message}). Using the raw commit list instead; edit it before releasing.`);
      notes = fallbackNotes(changes); ai = false;
    }
  }
  const release = { version, date: new Date().toISOString().slice(0, 10), changes: sortNotes(notes) };
  console.log(`v${current} → v${version} (changes since ${tag})\n\n${releaseMarkdown(release)}`);
  if (dryRun) return;

  changelog.releases = [release, ...changelog.releases.filter(r => compareVersions(r.version, version) < 0)];
  const errors = validateChangelog(changelog);
  if (errors.length) fail(errors.join('\n'));
  writeChangelog(changelog);
  setPackageVersion(version);
  execFileSync(process.execPath, [join(repoRoot, 'scripts', 'generate-sw-core.mjs')], { stdio: 'inherit' });
  output('version', version);
  output('ai', String(ai));
}

function notes(version) {
  const wanted = version || JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;
  const release = readChangelog().releases.find(r => r.version === wanted.replace(/^v/, ''));
  if (!release) fail(`CHANGELOG.md has no release ${wanted}.`);
  console.log(releaseMarkdown(release));
}

const [command, arg] = process.argv.slice(2);
if (command === 'prepare') await prepare(arg, process.argv.includes('--dry-run'));
else if (command === 'notes') notes(arg);
else fail('Usage: node scripts/release.mjs prepare <patch|minor|major> [--dry-run] | notes [version]');
