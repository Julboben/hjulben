// Signed tokens, request helpers and passkey (WebAuthn) relying-party settings.
import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_DAYS = 180;
// A session used this close to expiring gets a fresh token with the reply,
// so a rider who keeps playing is never signed out.
const RENEW_WITHIN_DAYS = 30;
const CHALLENGE_SECONDS = 300;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

/** Runs a handler, turning HttpErrors into JSON responses and anything else into a 500. */
export async function respond(handler) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: 'server error' }, 500);
  }
}

export async function readBody(req, maxBytes) {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too large');
  try {
    const body = JSON.parse(text);
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch (_) {}
  throw new HttpError(400, 'bad json');
}

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new HttpError(503, 'online accounts are not configured');
  return value;
}

const b64url = buffer => Buffer.from(buffer).toString('base64url');
const mac = text => createHmac('sha256', secret()).update(text).digest();

/** HMAC-signed, expiring JSON. Nothing is stored, so tokens cost no database writes. */
export function sign(payload, seconds) {
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + seconds }));
  return body + '.' + b64url(mac(body));
}

/** @returns {any} the payload, or null if the token is forged, expired or of another type */
export function unsign(token, type) {
  const [body, signature, extra] = String(token ?? '').split('.');
  if (!body || !signature || extra !== undefined) return null;
  const expected = mac(body);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.type === type && payload.exp > Date.now() / 1000 ? payload : null;
  } catch (_) {
    return null;
  }
}

export const sessionToken = playerId => sign({ type: 'session', player: playerId }, SESSION_DAYS * 86400);
export const challengeToken = payload => sign(payload, CHALLENGE_SECONDS);

/** The signed-in session, from `Authorization: Bearer <token>`: its player id and expiry. */
export function requireSession(req) {
  const header = req.headers.get('authorization') ?? '';
  const payload = header.startsWith('Bearer ') ? unsign(header.slice(7), 'session') : null;
  if (!payload) throw new HttpError(401, 'not signed in');
  return { player: payload.player, exp: payload.exp };
}

/** The signed-in player's id, from `Authorization: Bearer <token>`. */
export const requirePlayer = req => requireSession(req).player;

/**
 * The signed-in player's id, or null, for a request anyone may make: a
 * missing or stale token only leaves out what is personal.
 */
export function optionalPlayer(req) {
  try {
    return requirePlayer(req);
  } catch (_) {
    return null;
  }
}

/** A fresh token for a session that is about to expire, or null while it has time left. */
export function renewedToken(session) {
  return session.exp - Date.now() / 1000 < RENEW_WITHIN_DAYS * 86400 ? sessionToken(session.player) : null;
}

/**
 * Passkeys belong to RP_ID (default julben.dk), so they keep working on any
 * of its subdomains. Other hosts (deploy previews, localhost) get passkeys of
 * their own.
 */
export function relyingParty(req) {
  const origin = req.headers.get('origin') ?? '';
  let url;
  try { url = new URL(origin); } catch (_) { throw new HttpError(400, 'bad origin'); }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.hostname !== new URL(req.url).hostname || (url.protocol !== 'https:' && !local)) {
    throw new HttpError(400, 'bad origin');
  }
  const configured = (process.env.RP_ID || 'julben.dk').toLowerCase();
  const shared = url.hostname === configured || url.hostname.endsWith('.' + configured);
  return { rpID: shared ? configured : url.hostname, origin: url.origin };
}
