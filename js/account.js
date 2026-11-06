// Online riders: passkey sign-up and login against /api/account, and the
// cloud copy of the savegame. Passkeys live in the OS keychain or password
// manager, so clearing site data never logs a rider out for good.
import { NAME_HINT } from './rider-name.js';
import { legacyRider } from './cosmetics.js';

const API = '/api/account/';
const SAVE_SYNC_DELAY_MS = 1500;

export class AccountError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

export const passkeysSupported = () => typeof window !== 'undefined' && window.isSecureContext
  && typeof window.PublicKeyCredential === 'function' && Boolean(navigator.credentials?.create);

// --- base64url <-> bytes (WebAuthn JSON uses base64url for every binary field)

const fromB64url = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const toB64url = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function call(action, body, { method = 'POST', token = null } = {}) {
  let res;
  try {
    res = await fetch(API + action, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch (_) {
    throw new AccountError('offline');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AccountError(data.error || 'server error', res.status);
  return data;
}

function passkeyError(error) {
  if (error instanceof AccountError) return error;
  // NotAllowedError covers both "cancelled" and "timed out" by design.
  if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') return new AccountError('cancelled');
  if (error?.name === 'InvalidStateError') return new AccountError('passkey exists');
  return new AccountError('passkey failed');
}

async function createPasskey(options) {
  const credential = /** @type {any} */ (await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: fromB64url(options.challenge),
      user: { ...options.user, id: fromB64url(options.user.id) },
      excludeCredentials: (options.excludeCredentials ?? []).map(item => ({ ...item, id: fromB64url(item.id) })),
    },
  }));
  const { response } = credential;
  return {
    id: credential.id,
    rawId: toB64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
    response: {
      clientDataJSON: toB64url(response.clientDataJSON),
      attestationObject: toB64url(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
  };
}

async function usePasskey(options) {
  const credential = /** @type {any} */ (await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: fromB64url(options.challenge),
      allowCredentials: (options.allowCredentials ?? []).map(item => ({ ...item, id: fromB64url(item.id) })),
    },
  }));
  const { response } = credential;
  return {
    id: credential.id,
    rawId: toB64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
    response: {
      clientDataJSON: toB64url(response.clientDataJSON),
      authenticatorData: toB64url(response.authenticatorData),
      signature: toB64url(response.signature),
      userHandle: response.userHandle ? toB64url(response.userHandle) : undefined,
    },
  };
}

/**
 * Claims `name` and creates a passkey for it.
 * @param {string} name
 * @param {import('./cosmetics.js').Look} look
 * @returns {Promise<{ token: string, player: { id: string, name: string, rider: string, look?: object } }>}
 */
export async function registerRider(name, look) {
  if (!passkeysSupported()) throw new AccountError('unsupported');
  try {
    const { options, state } = await call('register-options', { name });
    const response = await createPasskey(options);
    return await call('register', { state, response, look, rider: legacyRider(look) });
  } catch (error) {
    throw passkeyError(error);
  }
}

/**
 * Signs in with any passkey this site owns.
 * @returns {Promise<{ token: string, player: { id: string, name: string, rider: string, look?: object }, save: object | null, runs: { trail: string, ghost: object }[] }>}
 */
export async function loginRider() {
  if (!passkeysSupported()) throw new AccountError('unsupported');
  try {
    const { options, state } = await call('login-options', {});
    const response = await usePasskey(options);
    return await call('login', { state, response });
  } catch (error) {
    throw passkeyError(error);
  }
}

/**
 * Removes the signed-in rider from the server for good: name, cloud save,
 * passkeys and world-board runs. The rider confirms with their passkey.
 * @param {string} token
 */
export async function deleteRider(token) {
  if (!passkeysSupported()) throw new AccountError('unsupported');
  try {
    const { options, state } = await call('login-options', {});
    const response = await usePasskey(options);
    await call('delete', { state, response }, { token });
  } catch (error) {
    throw passkeyError(error);
  }
}

/** A short message for the player. */
export function accountErrorText(error) {
  switch (error?.message) {
    case 'wrong passkey': return 'That passkey belongs to another rider. Confirm with this rider’s passkey.';
    case 'not signed in': return 'This rider is signed out. Log in first, then try again.';
    case 'name taken': return 'That name is taken. If it’s yours, log in with your passkey instead.';
    case 'name not allowed': return 'That name isn’t allowed. Please pick another.';
    case 'invalid name': return NAME_HINT + '.';
    case 'cancelled': return 'Passkey cancelled.';
    case 'passkey exists': return 'This device already has a passkey for that rider. Log in instead.';
    case 'unknown passkey': return 'That passkey isn’t linked to a rider here. Create a new online rider instead.';
    case 'unsupported': return 'This browser doesn’t support passkeys. You can still play offline.';
    case 'offline': return 'Couldn’t reach the server. Check your connection, or play offline.';
    case 'online accounts are not configured': return 'Online riders aren’t available right now. You can still play offline.';
    case 'expired, try again': return 'That took too long. Please try again.';
    default: return 'Something went wrong. Please try again.';
  }
}

// --- Cloud save ---------------------------------------------------------------

const pendingSaves = new Map();   // token -> { timer, save }
const lastSent = new Map();       // token -> payload JSON, so retries don't rewrite an unchanged save
const sending = new Map();        // token -> uploads in flight

/** Fired on window when the server no longer accepts a rider's session, with `{ playerId }`. */
export const SIGNED_OUT_EVENT = 'hjulben:signed-out';
/** Fired on window with `{ playerId, token }` when the server sent a fresh session token. */
export const SESSION_RENEWED_EVENT = 'hjulben:session-renewed';

const signal = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }));

/** Passes on a fresh token the server sent with a reply, if any. */
export function noteRenewal(playerId, data) {
  if (typeof data?.token === 'string' && typeof window !== 'undefined') signal(SESSION_RENEWED_EVENT, { playerId, token: data.token });
}

function sendSave(save, keepalive = false) {
  const token = save.token;
  if (!token) return;
  // Exactly the fields the server keeps (sanitizeSave in account.mjs).
  const { look, lookUpdatedAt, ghost, ghostUpdatedAt, rider, createdAt, trail, unlocked, bestTimes, achievements, stats, nisse } = save;
  const body = JSON.stringify({ save: { look, lookUpdatedAt, ghost, ghostUpdatedAt, rider, createdAt, trail, unlocked, bestTimes, achievements, stats, nisse } });
  if (lastSent.get(token) === body) return;
  lastSent.set(token, body);
  sending.set(token, (sending.get(token) ?? 0) + 1);
  const done = () => {
    const left = (sending.get(token) ?? 1) - 1;
    if (left > 0) sending.set(token, left); else sending.delete(token);
  };
  fetch(API + 'save', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body,
    keepalive,
  }).then(async res => {
    if (res.ok) { noteRenewal(save.playerId, await res.json().catch(() => null)); return; }
    lastSent.delete(token);
    if (res.status === 401) signal(SIGNED_OUT_EVENT, { playerId: save.playerId });
  }, () => lastSent.delete(token)).finally(done);
}

/** Whether this device has a change for the rider that the server doesn't have yet. */
const unsent = token => pendingSaves.has(token) || sending.has(token);

/** Resolves once nothing is waiting to go up for `token`, or after `limit` ms. */
function settled(token, limit = 10_000) {
  return new Promise(resolve => {
    const started = Date.now();
    const check = () => (!unsent(token) || Date.now() - started > limit ? resolve() : setTimeout(check, 250));
    check();
  });
}

/**
 * The rider's cloud save and look, as last saved from any device. Null when
 * offline. An upload pending or in flight from this device goes first, so
 * what comes back already includes it (the server merges saves).
 * @returns {Promise<{ player: { id: string, name: string, rider: string, look?: object }, save: object | null } | { signedOut: true } | null>}
 */
export async function fetchCloudSave(token, playerId = null) {
  if (!token || typeof window === 'undefined') return null;
  if (unsent(token)) await settled(token);
  let res;
  try {
    res = await fetch(API + 'save', {
      headers: { authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(8000),
    });
  } catch (_) {
    return null;
  }
  if (res.status === 401) return { signedOut: true };
  if (!res.ok || unsent(token)) return null;
  const data = await res.json().catch(() => null);
  if (!data?.player) return null;
  noteRenewal(playerId ?? data.player.id, data);
  // The server may now hold another device's save, so the next upload must go out even if it matches our last one.
  lastSent.delete(token);
  return data;
}

/** Uploads the savegame shortly after it last changed. Fails quietly; the next change retries. */
export function queueSaveSync(save) {
  if (!save?.token || typeof window === 'undefined') return;
  clearTimeout(pendingSaves.get(save.token)?.timer);
  const timer = setTimeout(() => {
    pendingSaves.delete(save.token);
    sendSave(save);
  }, SAVE_SYNC_DELAY_MS);
  pendingSaves.set(save.token, { timer, save });
}

if (typeof window !== 'undefined') {
  // Closing the tab right after a run must not lose it.
  window.addEventListener('pagehide', () => {
    for (const { timer, save } of pendingSaves.values()) {
      clearTimeout(timer);
      sendSave(save, true);
    }
    pendingSaves.clear();
  });
}
