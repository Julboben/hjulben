// First, so it listens for a new release while the trails load.
import './update-prompt.js';
import { startGame } from './game.js';
import { readSharedTrail, trailLinkFromHash } from './trail-link.js';
import { saveSharedTrail } from './trails.js';

// A share link (#trail=…) rides its trail straight away and keeps it under
// Custom Trails.
let shared = null;
try {
  const trail = await readSharedTrail(window.location.hash);
  if (trail) shared = { entry: saveSharedTrail(trail) };
} catch (error) {
  shared = { error };
}
// So a reload doesn't open the trail again, and the address bar stays short.
if (shared) history.replaceState(null, '', window.location.pathname + window.location.search);

startGame({ shared });

// A share link opened in a tab that already has the game only changes the hash.
window.addEventListener('hashchange', () => {
  if (trailLinkFromHash(window.location.hash) !== null) window.location.reload();
});
