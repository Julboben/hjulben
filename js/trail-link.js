// @ts-check
import { normalizeTrail, validateTrail } from './trail-schema.js';

// Share links: a whole trail packed into the URL hash (index.html#trail=1.<data>),
// so a custom trail can be passed around with no server storage. The data is
// the trail's JSON, deflated and base64url-encoded. The hash never reaches the
// server, so link previews can't show the trail; short links would need a
// server (see the roadmap in README.md).

const HASH_KEY = 'trail';
// Bumped if the packing changes, so old links still open.
const FORMAT = '1';
// A Discord message holds 2000 characters; leave room for a few words.
export const DISCORD_LINK_LENGTH = 1900;
// Inflating stops past this, so a crafted link can't exhaust memory, and
// packing refuses a trail whose JSON is bigger, as its link could never open.
export const MAX_JSON_BYTES = 1 << 20;

/** @param {Uint8Array} bytes */
function toBase64Url(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} text */
function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('the link is damaged');
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

/** @param {BlobPart} bytes */
async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** @param {BlobPart} bytes */
async function inflate(bytes) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_JSON_BYTES) {
      reader.cancel().catch(() => {});
      throw new Error('the trail is too big');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}

/** The packed trail for a link's hash, `1.<data>`. */
export async function encodeTrailLink(trail) {
  const json = new TextEncoder().encode(JSON.stringify(trail));
  if (json.length > MAX_JSON_BYTES) throw new Error('the trail is too big for a link');
  const bytes = await deflate(json);
  return `${FORMAT}.${toBase64Url(bytes)}`;
}

/** The trail JSON packed by encodeTrailLink, not yet normalized or validated. */
export async function decodeTrailLink(packed) {
  const [format, data] = String(packed).split('.', 2);
  if (format !== FORMAT || !data) throw new Error('the link is from a newer version of the game, or damaged');
  let json;
  try {
    json = await inflate(fromBase64Url(data));
  } catch (error) {
    throw error.message === 'the trail is too big' ? error : new Error('the link is damaged');
  }
  try {
    return JSON.parse(json);
  } catch (_) {
    throw new Error('the link is damaged');
  }
}

/** The packed trail in a URL hash, or null when it has none. */
export function trailLinkFromHash(hash) {
  return new URLSearchParams(String(hash || '').replace(/^#/, '')).get(HASH_KEY);
}

/** A link that opens the trail in the game at `base` (the game's URL). */
export async function trailShareUrl(trail, base) {
  const url = new URL(base);
  url.search = '';
  url.hash = `${HASH_KEY}=${await encodeTrailLink(trail)}`;
  return url.href;
}

/**
 * The trail a page's URL hash shares, normalized and checked like an imported
 * file; null without one. Rejects with a message fit for the player.
 */
export async function readSharedTrail(hash) {
  const packed = trailLinkFromHash(hash);
  if (packed === null) return null;
  const trail = normalizeTrail(await decodeTrailLink(packed));
  const errors = validateTrail(trail).filter(message => message.type === 'error');
  if (errors.length) throw new Error(errors[0].text);
  return trail;
}
