# Hjulben – Push Notifications Plan

A plan for sending notifications to a rider's phone or computer while the game is closed, with the Push API. It builds on the notification bell: the bell keeps showing everything, and a push only brings a rider back for news that happened while they were away. Once it is built, this plan can go.

---

## When to build it

Push only pays off when there is news worth sending while the game is closed. Today that is a lost world record, which reaches only the riders who hold one. Build this when at least one of these is true:

- Players ask to hear about lost records straight away, not the next time they open the game.
- We want to tell riders when a new version is out with new trails. This reaches every rider who turns push on, so it is the strongest reason.
- New news arrives that happens while the game is closed, such as friends or weekly challenges.

## Goals

- [ ] Push **"World record lost"** to the rider who lost it, on every device where they turned push on.
- [ ] Push **"New version"** to everyone who turned it on, once per release.
- [ ] Ask at the right moment: once, right after a rider first takes a world record. Keep an on/off switch in Settings.
- [ ] Tapping a push opens the game where the bell's entry would go: that trail's world board, or the changelog.
- [ ] A push and the bell never disagree: the bell still gets its notice from the server, and opening a push marks that entry read.

## Non-goals

- Pushing what happens while playing: achievements, gear, nisse finds and bonus trails. The game already shows them on screen, and the bell keeps them.
- Pushes for riders who aren't signed in online. A push has to reach a known rider.
- Pushes in a Safari tab on iPhone. iOS only allows push for sites added to the Home Screen (iOS 16.4 or later).
- Marketing pushes or anything a rider didn't turn on.

---

## 1. What gets pushed

| Kind | Sent when | Goes to | Text | Opens |
|---|---|---|---|---|
| `record-lost` | A run takes a world record from another rider (where `leaderboard.mjs` already writes the bell's notice) | The rider who lost it | **World record lost** · "Speedy beat your time on Windmill Hill: 0:41.204 against your 0:42.870." | That trail's world board |
| `version` | The Release workflow has deployed a new version | Everyone with `version` turned on | **Hjulben v0.7.0 is out** · the first line of its changelog | The changelog |

- **Replaced, not stacked:** each push carries a `tag` (in the notification) and a `Topic` (for the push service). A record lost again on the same trail replaces the push that's already there, or one still waiting to be delivered, just like the bell keeps one entry per trail.
- **Expiry:** record pushes expire after 1 day if the device is off (`TTL`), so a stale record doesn't arrive a week later. Version pushes expire after 3 days.
- **Spam guard:** at most a few `record-lost` pushes per rider per day (see Open questions). The bell still shows everything past the limit.

## 2. Asking to turn it on

The browser only lets a site ask for permission after a tap, and a rider who says no can't easily be asked again. So we ask once, when it makes sense, and explain first.

- **The offer:** on the results screen, under **FIRST PLACE IN THE WORLD!**, the first time a rider takes a world record on this device:
  > Want to know if someone beats it?  **[ NOTIFY ME ]**  **[ NOT NOW ]**

  **NOTIFY ME** asks the browser and turns on both kinds. **NOT NOW** hides the offer on this device for good. The offer is skipped when push isn't supported, the rider isn't signed in online, the browser already says no, or on iPhone outside the Home Screen.
- **Settings → General → NOTIFICATIONS:** two switches, **World records** and **New versions**, for the active rider on this device. If the browser has blocked notifications, the switches are disabled and a line says how to allow them. On iPhone outside the Home Screen, the line says to add Hjulben to the Home Screen first.
- This is new UI on the results screen and in Settings, so show the design before building it.

## 3. Game (`js/push.js`, new)

- `pushSupport()` returns `'ok'`, `'needs-home-screen'` (iPhone in Safari), `'blocked'` or `'unsupported'`.
- `enablePush(kinds)`: must run in the tap. It asks permission, then calls `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` with the public key from `GET /api/account/push`, then `POST`s the subscription and kinds.
- `disablePush()`: `DELETE`s this rider's row for this device, and unsubscribes the browser only when no rider on this device still uses it.
- **One subscription, several riders:** a browser has a single push subscription, but each rider turns push on separately. The server keeps one row per rider and subscription. Deleting a rider (`deleteSave`) and logging out both remove that rider's row.
- **Opening from a push:** the service worker opens `./?open=leaderboard&trail=<id>&notice=<id>` (or `?open=changelog`). The menu reads this once at start, goes there the way `openNotification` does, marks that bell entry read, and removes the query from the address bar.

## 4. Service worker (`sw.js`)

The handlers go after `fetch`. The generator only rewrites `CACHE` and `CORE`, so hand-written handlers there stay.

```js
self.addEventListener('push', event => {
  const push = event.data?.json();
  if (!push) return;
  event.waitUntil(self.registration.showNotification(push.title, {
    body: push.body, tag: push.tag, icon: './icons/icon-192.png', data: { url: push.url },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  // Focus an open game and send it there, or start one at the push's address.
  event.waitUntil(/* clients.matchAll → client.navigate(url).then(focus) or clients.openWindow(url) */);
});
```

- **When the game is open and visible:** still show the push. Also send the open page a message so the bell fetches the notice at once.
- **Subscription changes:** browsers can renew a subscription (`pushsubscriptionchange`). Handle that event too: subscribe again and `POST` the new subscription with the old endpoint, so the server swaps them.

## 5. Server

**Table** (`netlify/lib/db.mjs`):

```sql
create table if not exists push_subscriptions (
  id bigint generated always as identity constraint push_subscriptions_pkey primary key,
  player_id uuid not null constraint push_subscriptions_player_fkey references players(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  kinds text[] not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_player_endpoint_key unique (player_id, endpoint));
create index if not exists push_subscriptions_kinds_idx on push_subscriptions using gin (kinds);
```

**Routes** (in `account.mjs`, all needing a session like the notifications route):

- `GET /api/account/push`: `{ key, kinds }`, the public VAPID key and this device's kinds for the rider (sent with `?endpoint=`).
- `POST /api/account/push`: `{ subscription, kinds, replaces? }` adds or updates the row. `replaces` is an old endpoint, for `pushsubscriptionchange`. Endpoints must be `https`, and at most a handful of devices per rider are kept (the oldest goes).
- `DELETE /api/account/push?endpoint=`: removes the row.

**Sending** (`netlify/lib/push.mjs`, new, with the `web-push` package):

- `sendPush(rows, payload, { ttl, topic })` sends to each row with `webpush.sendNotification`, a few at a time. A `404` or `410` from the push service means the subscription is gone, so its row is deleted. Other errors are logged and dropped, never retried.
- **Lost records:** `leaderboard.mjs` sends right after it writes the bell's notice. It passes the send to Netlify's `context.waitUntil`, so the rider who set the new record gets their result without waiting for it. The payload includes the notice's id, so a tap can mark it read.
- **Topic:** a push service takes at most 32 URL-safe characters, so the topic is a short hash of the trail id, not the id itself.
- **Without keys** (the dev server, deploy previews with none set), `GET /api/account/push` returns no key. The game then hides the offer and the Settings section, and nothing is sent.

**New versions:** `scripts/send-version-push.mjs` runs in `release.yml` after the deploy succeeds. It reads the new version and the first changelog line, and sends to every row with `version`. It runs from the workflow with secrets, so no public endpoint can trigger a broadcast. If it fails, the release still stands: it logs and exits without failing the job.

## 6. Keys and setup

1. `npx web-push generate-vapid-keys` makes the key pair.
2. In Netlify, set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`mailto:` an address players can write to). Set the same three, plus `DATABASE_URL`, as GitHub Actions secrets for the version push.
3. Never change the keys once riders have subscribed: every existing subscription is tied to the public key and would stop working. Write this down in CONTRIBUTING's one-time setup.

## 7. Tests

- **`test-online.mjs`, Push section:** a local stand-in push service (an HTTP server on a free port) is used as a subscription's endpoint. It checks that turning push on and off for a rider works; that a lost record sends one push, to the right rider, with `TTL`, `Topic` and a VAPID `Authorization` header; and that the payload decrypts with the test's own client keys to the expected title, body, tag and address. It also checks that no push is sent for kinds the rider turned off, that a `410` deletes the row, and that the same endpoint for two riders makes two rows.
- **`send-version-push.mjs`:** the same stand-in, with a few subscriptions with and without `version`.
- **Game side:** a fast test for reading the `?open=` address, and for `pushSupport()` with stubbed `navigator` and `Notification`.
- **By hand, on real devices** (a headless browser can't receive real pushes): Chrome on Android, desktop Chrome, Firefox and Safari, and an iPhone with the game on the Home Screen. Cover taking and losing a record between two riders, tapping a push with the game closed and with it open, turning it off, and deleting the rider.

## 8. Docs

- README: in the online section, what push sends, how to turn it on, the iPhone Home Screen note, and what the server keeps (one row per rider and device, deleted when the rider or the subscription goes).
- CONTRIBUTING: `push.js` and `netlify/lib/push.mjs` in the project structure, the keys in one-time setup, and the version push in Releasing.

## 9. Order of work

1. Keys, the table, the routes and `push.mjs`, with the online tests and the stand-in push service.
2. `sw.js` handlers and the `?open=` address.
3. `js/push.js`, then the design for the results-screen offer and the Settings section, then build both.
4. Sending from `leaderboard.mjs` with `waitUntil`.
5. `send-version-push.mjs` and its step in `release.yml`.
6. Docs, then the checks by hand on real devices.

About a day of work, plus the device checks.

## Open questions

- **Spam guard:** how many record pushes per rider per day? A rider holding records on busy trails could otherwise get many. Three a day is a starting point.
- **Version pushes for every release, or only some?** A patch that only fixes things may not be worth a push. One option is to send only for `minor` and `major` releases, or only when the changelog has a `new:` line.
- **Push on by default for version news once a rider turns on records?** The plan turns on both from the offer. Ask whether that is fair, or whether the offer should be about records only.

## Changelog lines (for when it ships)

```
Changelog: new: Online riders can get a notification on their phone or computer when another rider beats their world record, even with the game closed. Turn it on when you take a world record, or in Settings.
Changelog: new: Get a notification when a new version of Hjulben is out. Turn it on in Settings.
```
