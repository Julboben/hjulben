// @ts-check
// The notification log behind the menu's bell: what the game announced to a
// rider (achievements, gear, nisse finds, bonus trails), what happened while
// they were away (a world record taken from them, see the notifications
// endpoint in netlify/functions/account.mjs), and new versions of the game.
// Each entry is kept as it was shown, so it reads the same after the catalog
// changes. The log lives on this device; see loadNotifications in storage.js.
import { loadNotifications, saveNotifications } from './storage.js';

/** Fired on window when the log changed, so the bell can count again. */
export const NOTIFICATIONS_EVENT = 'hjulben:notifications';

// Enough to look back over a good while of play without the log growing for ever.
const MAX_ITEMS = 60;

/**
 * Where tapping an entry goes: a menu view, or a trail's world board.
 * @typedef {{ view: 'achievements' | 'garage' | 'trails' | 'changelog' } | { view: 'leaderboard', trail: string }} NotificationTarget
 */
/**
 * @typedef {{
 *   key: string,
 *   playerId: string | null,
 *   label: string,
 *   title: string,
 *   text: import('./ui/key-text.js').KeyText,
 *   icon: string,
 *   opens: NotificationTarget,
 *   at: number,
 *   read: boolean,
 * }} Notification
 *   `key` names what the entry is about, so the same news is never listed
 *   twice; `playerId` is the rider it belongs to, or null for news for
 *   everyone on the device.
 */

const announce = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT));
};

/**
 * Adds an entry, unread and at the top. One with the same key is replaced,
 * so news that changes (a record taken again) shows only its latest.
 * @param {Omit<Notification, 'at' | 'read'> & { at?: number }} entry
 */
export function notify(entry) {
  const log = loadNotifications();
  const item = { ...entry, at: entry.at ?? Date.now(), read: false };
  const items = [item, ...log.items.filter(other => other.key !== item.key)]
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_ITEMS);
  saveNotifications({ ...log, items });
  announce();
}

/** Whether the log has an entry with this key, read or not. */
export const hasNotification = key => loadNotifications().items.some(item => item.key === key);

/**
 * The entries a rider sees, newest first: their own and the device's.
 * @param {string | null} playerId
 * @returns {Notification[]}
 */
export const notificationsFor = playerId =>
  /** @type {Notification[]} */ (loadNotifications().items.filter(item => item.playerId === null || item.playerId === playerId));

export const unreadCount = playerId => notificationsFor(playerId).filter(item => !item.read).length;

/**
 * Marks entries as read: every one the rider sees, or those with the given keys.
 * @param {string | null} playerId
 * @param {string[]} [keys]
 */
export function markRead(playerId, keys) {
  const log = loadNotifications();
  const reads = item => (item.playerId === null || item.playerId === playerId) && (!keys || keys.includes(item.key));
  if (!log.items.some(item => !item.read && reads(item))) return;
  saveNotifications({ ...log, items: log.items.map(item => (!item.read && reads(item) ? { ...item, read: true } : item)) });
  announce();
}

/** The id of the last notice this device took from the server for a rider, or 0. */
export const lastNoticeId = playerId => Number(loadNotifications().after[playerId]) || 0;

export function setLastNoticeId(playerId, id) {
  const log = loadNotifications();
  if (lastNoticeId(playerId) >= id) return;
  saveNotifications({ ...log, after: { ...log.after, [playerId]: id } });
}
