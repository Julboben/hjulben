// @ts-check
// In-game DOM: HUD pills, toast, pause screen and the results screen.
import { $, timeText, runTimeText, deltaText } from "../state.js";
import { MEDALS, normalizeAuthor } from "../trail-schema.js";
import { keyTextNodes, keyTextWords } from "./key-text.js";

/**
 * @param {{ onDismiss?: () => void, onCard?: (card: { opens: string }) => void }} [hooks]
 *   onDismiss: the results were closed by the browser (a second Escape, or a
 *   phone's back gesture) rather than by the game; without it they are simply
 *   shown again. onCard: an achievement or gear card came on screen.
 */
export function createOverlay({ onDismiss, onCard } = {}) {
  const dialog = /** @type {HTMLDialogElement} */ ($("overlay"));
  const toasts = /** @type {HTMLElement} */ (document.querySelector(".toast-stack"));
  const toastHome = /** @type {HTMLElement} */ (toasts.parentElement);
  const toastNext = toasts.nextSibling;
  // The menu button, which stays usable over the results as over the pause screen.
  const actions = /** @type {HTMLElement} */ (document.querySelector(".game-actions"));
  const actionsHome = /** @type {HTMLElement} */ (actions.parentElement);
  const actionsNext = actions.nextSibling;
  // Escape opens the menu (handled by the game), never just the dialog.
  dialog.addEventListener("cancel", (event) => event.preventDefault());
  // Browsers honour that once; a close request after it closes the dialog
  // anyway, which would leave the game on its results with nothing on screen.
  let wantOpen = false;
  dialog.addEventListener("close", () => {
    if (!wantOpen) return;
    if (onDismiss) { wantOpen = false; onDismiss(); return; }
    requestAnimationFrame(() => { if (wantOpen && !dialog.open) dialog.showModal(); });
  });

  /**
   * The modal sits in the top layer and makes the rest of the page inert;
   * toasts move in with it to stay visible, and the menu button to stay
   * usable, pinned to the game's corner (see .overlay > .game-actions).
   */
  function openDialog() {
    wantOpen = true;
    if (!dialog.open) dialog.showModal();
    pinToGame(dialog);
    dialog.append(toasts, actions);
    raiseAchievement();
  }

  function closeDialog() {
    wantOpen = false;
    if (dialog.open) dialog.close();
    if (toasts.parentElement !== toastHome) toastHome.insertBefore(toasts, toastNext);
    if (actions.parentElement !== actionsHome) actionsHome.insertBefore(actions, actionsNext);
  }

  /** The top layer is the whole window, so what sits on it is pinned to the game's corner. */
  function pinToGame(/** @type {HTMLElement} */ element) {
    const game = $("game").getBoundingClientRect();
    element.style.setProperty("--game-top", game.top + "px");
    element.style.setProperty("--game-right", window.innerWidth - game.right + "px");
  }
  window.addEventListener("resize", () => { if (dialog.open) pinToGame(dialog); });

  // A phone turned sideways (see .turn-upright) shows its screen as a modal
  // dialog, so it sits on the top layer above the results and any popover.
  // The game pauses the ride on the same media query.
  const turnUpright = /** @type {HTMLDialogElement} */ ($("turn-upright"));
  const sideways = window.matchMedia("(orientation: landscape) and (pointer: coarse) and (max-height: 500px)");
  function syncSideways() {
    if (sideways.matches) { if (!turnUpright.open) turnUpright.showModal(); }
    else if (turnUpright.open) turnUpright.close();
  }
  // Escape or a back gesture can't dismiss it: only turning the phone back does.
  turnUpright.addEventListener("cancel", (event) => event.preventDefault());
  turnUpright.addEventListener("close", () => requestAnimationFrame(syncSideways));
  sideways.addEventListener("change", syncSideways);
  syncSideways();


  /** @type {{ gold: number, silver: number, bronze: number } | null} */
  let medalTimes = null;
  let shownMedal = "";
  let lastTimer = "",
    toastUntil = 0,
    splitUntil = 0,
    achievementUntil = 0;
  /** @type {{ label: string, name: string, blurb: string, icon: string, opens: string }[]} cards waiting for their turn on screen */
  const achievementQueue = [];

  /**
   * @param {{ gold: number, silver: number, bronze: number } | null} [medals]
   *   the trail's medal times; the HUD shows the best one still in reach
   */
  function setTrail(name, marker, total, medals = null) {
    medalTimes = medals;
    shownMedal = "";
    $("scene-label").textContent = name.toUpperCase();
    $("scene-label").dataset.trailNumber = marker;
    setApples(0, total);
    $("toast").classList.remove("visible");
    toastUntil = 0;
    splitUntil = 0;
    syncTimerDetail();
    lastTimer = "";
  }

  /** Marks the HUD while a recorded run plays back; null clears it. */
  function setReplay(name) {
    const label = $("replay-label");
    label.hidden = !name;
    label.textContent = name ? "Replay · " + name : "";
  }

  function setApples(collected, total) {
    $("apple-count").textContent = collected + " / " + total;
  }

  function setTimer(seconds) {
    const text = timeText(seconds);
    if (text !== lastTimer) {
      $("timer").textContent = text;
      lastTimer = text;
    }
    setMedalTarget(seconds);
  }

  function setMedalTarget(seconds) {
    const medal = medalTimes ? MEDALS.find((name) => seconds <= medalTimes[name]) ?? "none" : "none";
    if (medal === shownMedal) return;
    shownMedal = medal;
    if (medal !== "none") {
      const target = $("medal-target");
      const time = timeText(medalTimes[medal]);
      target.dataset.medal = medal;
      target.textContent = time;
      target.setAttribute("aria-label", medal + " medal time " + time);
    }
    syncTimerDetail();
  }

  /**
   * The slot after the timer holds one thing: a fresh split against the ghost,
   * otherwise the next medal in reach. It hides when there is neither.
   */
  function syncTimerDetail() {
    const splitting = splitUntil > 0;
    $("split").hidden = !splitting;
    $("medal-target").hidden = splitting || shownMedal === "none";
    $("timer-detail").hidden = !splitting && shownMedal === "none";
  }

  /**
   * @param {import("./key-text.js").KeyText} message
   * @param {string} [icon] a pixel icon shown after the message
   */
  function toast(message, duration = 2600, icon) {
    $("toast").replaceChildren(...keyTextNodes(message));
    if (icon) $("toast").dataset.iconAfter = icon;
    else delete $("toast").dataset.iconAfter;
    toastUntil =
      duration === Infinity ? Infinity : performance.now() + duration;
    $("toast").classList.add("visible");
  }

  function clearToast() {
    $("toast").classList.remove("visible");
    toastUntil = 0;
  }

  const popover = $("achievement-popover");

  /**
   * Announces an earned achievement on its own card, a popover on the top
   * layer, so it shows over the ride, the results and the menu alike and never
   * hides the game's own messages. Several in a row take turns.
   * @param {{ name: string, blurb: import("./key-text.js").KeyText, icon: string }} earned
   */
  function achievement(earned) {
    queueCard({ ...earned, label: "ACHIEVEMENT UNLOCKED", opens: "achievements" });
  }

  /**
   * Announces a rider item won for the Garage, on the same card.
   * @param {{ name: string, blurb: string, icon: string }} item see gearCard in cosmetics.js
   */
  function gear(item) {
    queueCard({ ...item, label: "NEW GEAR", opens: "garage" });
  }

  function queueCard(card) {
    achievementQueue.push(card);
    if (!achievementUntil) nextAchievement(performance.now());
  }

  function nextAchievement(now) {
    const earned = achievementQueue.shift();
    if (earned === undefined) {
      if (popover.matches(":popover-open")) popover.hidePopover();
      achievementUntil = 0;
      return;
    }
    // Which menu view the card opens when tapped there: see game.js.
    popover.dataset.opens = earned.opens;
    $("achievement-popover-label").textContent = earned.label;
    $("achievement-popover-icon").dataset.icon = earned.icon;
    $("achievement-popover-name").textContent = earned.name;
    $("achievement-popover-blurb").replaceChildren(...keyTextNodes(earned.blurb));
    // Shown again for each one, so it slides in again.
    if (popover.matches(":popover-open")) popover.hidePopover();
    placeAchievement();
    popover.showPopover();
    achievementUntil = now + 4000;
    onCard?.(earned);
    announce((earned.opens === "garage" ? "New gear: " : "Achievement earned: ") + earned.name + ". " + keyTextWords(earned.blurb));
  }

  const placeAchievement = () => pinToGame(popover);

  /** A modal opened after the card goes above it on the top layer; this lifts the card back up. */
  function raiseAchievement() {
    if (!popover.matches(":popover-open")) return;
    popover.hidePopover();
    popover.showPopover();
  }

  /** Split against the ghost at an apple: negative is ahead. */
  function split(delta) {
    const split = $("split");
    split.textContent = deltaText(delta);
    split.classList.toggle("ahead", delta <= 0);
    split.classList.toggle("behind", delta > 0);
    splitUntil = performance.now() + 2500;
    syncTimerDetail();
  }

  function tick(now) {
    if (toastUntil && now > toastUntil) clearToast();
    if (achievementUntil && now > achievementUntil) nextAchievement(now);
    if (splitUntil && now > splitUntil) {
      splitUntil = 0;
      syncTimerDetail();
    }
  }

  function announce(text) {
    $("announcer").textContent = text;
  }

  function setDirection(facing) {
    const left = $("left-control"),
      right = $("right-control");
    const facingRight = facing > 0;
    /** @type {HTMLElement} */ (left.querySelector(".caption")).textContent =
      facingRight ? "LEAN BACK" : "LEAN FWD";
    /** @type {HTMLElement} */ (right.querySelector(".caption")).textContent =
      facingRight ? "LEAN FWD" : "LEAN BACK";
    left.setAttribute(
      "aria-label",
      (facingRight ? "Lean back" : "Lean forward") + ", left arrow",
    );
    right.setAttribute(
      "aria-label",
      (facingRight ? "Lean forward" : "Lean back") + ", right arrow",
    );
  }

  /** @param {import("./key-text.js").KeyText} [hint] how to resume */
  function showPause(visible, hint = "") {
    $("pause-overlay").hidden = !visible;
    if (!visible) return;
    $("pause-hint").replaceChildren(...keyTextNodes(hint));
    announce("Paused. " + keyTextWords(hint));
  }

  function hide() {
    closeDialog();
    $("pause-overlay").hidden = true;
  }

  /** Shows the results modal again without recomputing it. */
  function reopen() {
    openDialog();
  }

  /**
   * @param {{
   *   official: boolean, bonus?: boolean, time: number, previousBest: number | null, rank: number | null,
   *   worldPending?: boolean,
   *   medals?: { gold: number, silver: number, bronze: number }, medal: string | null,
   *   apples: number, primaryLabel: string, author?: string,
   *   keys: { confirm: string, restart: string }
   * }} result keys: the badges on the buttons, "" for none
   */
  function showResults(result) {
    const { time, previousBest, rank, medals, medal } = result;
    resultsId++;
    localRank = rank;
    const record = previousBest === null || time < previousBest;
    shownBest = record ? null : previousBest;
    $("overlay-badge").textContent = result.official
      ? "TRAIL COMPLETED"
      : result.bonus
        ? "BONUS TRAIL COMPLETED"
        : "CUSTOM TRAIL COMPLETED";
    const sideNote = result.official
      ? ""
      : (result.bonus ? "Bonus" : "Custom") +
        " trails do not affect career progression.";
    $("overlay-title").textContent =
      record && previousBest !== null ? "New Best!" : "Goal Reached!";
    const author = normalizeAuthor(result.author);
    $("results-credit").textContent = author ? "TRAIL BY " + author.toUpperCase() : "";
    $("results-credit").hidden = !author;
    $("results").hidden = false;
    $("results-time").textContent = runTimeText(time);
    const delta = $("results-delta");
    delta.textContent =
      previousBest === null ? "FIRST FINISH" : deltaText(time - previousBest);
    delta.className =
      "results-delta " +
      (previousBest === null ? "" : time <= previousBest ? "ahead" : "behind");
    // A world rank replaces the local one once the server has timed the run.
    if (result.worldPending) showRank("WORLD", "…");
    else showLocalRank();
    // Keeps the rival line's room while the world rank loads, so nothing jumps.
    $("results-rival").textContent = "";
    $("results-rival").hidden = !result.worldPending;
    $("race-rival").hidden = true;
    $("results").dataset.world = result.worldPending ? "loading" : "";
    // One ladder: the medal won is filled in, the others show their target times.
    const targets = medals
      ? MEDALS.map((name) => {
          const item = document.createElement("li");
          item.textContent = name.toUpperCase() + " " + timeText(medals[name]);
          item.classList.toggle("reached", time <= medals[name]);
          if (name === medal) {
            item.dataset.medal = name;
            item.setAttribute("aria-current", "true");
          }
          return item;
        })
      : [];
    $("results-medals").replaceChildren(...targets);
    const next =
      medals && !medal
        ? medals.bronze
        : medals && medal !== "gold"
          ? medals[MEDALS[MEDALS.indexOf(medal) - 1]]
          : null;
    $("overlay-description").textContent = next
      ? "Shave " +
        (Math.ceil((time - next) * 10 - 1e-9) / 10).toFixed(1) +
        "s for the next medal." +
        (sideNote ? " " + sideNote : "")
      : sideNote;
    $("overlay-description").hidden = !$("overlay-description").textContent;
    $("primary-label").textContent = result.primaryLabel;
    $("primary-key").textContent = result.keys.confirm;
    $("primary-key").hidden = !result.keys.confirm;
    $("retry-key").textContent = result.keys.restart;
    $("retry-key").hidden = !result.keys.restart;
    $("pause-overlay").hidden = true;
    openDialog();
    announce(
      "Trail complete in " +
        runTimeText(time) +
        ". All " +
        result.apples +
        " apples collected." +
        (record ? " New best time." : "") +
        (rank && !result.worldPending ? " Leaderboard rank " + rank + "." : "") +
        (medal ? " " + medal + " medal." : "") +
        (author ? " Trail by " + author + "." : ""),
    );
  }

  /** Bumped by every results screen, so a late world rank can't land on the next one. */
  let resultsId = 0;
  /** @type {number | null} */
  let localRank = null;
  /** The player's best when this run didn't beat it, since the rank is that best's. @type {number | null} */
  let shownBest = null;

  /**
   * "LOCAL RANK #1" after a new best, or "YOUR BEST 0:09.500 · LOCAL #1" after a
   * slower run, so the rank reads as the best's and not this run's.
   * @param {string} scope "LOCAL" or "WORLD"
   * @param {string} rank "#1", or "" when there is none
   */
  function showRank(scope, rank) {
    const best = shownBest !== null;
    $("results-best").hidden = !best;
    $("results-best-time").hidden = !best;
    $("results-best-time").textContent = best ? runTimeText(/** @type {number} */ (shownBest)) : "";
    $("results-rank-sep").hidden = !best || !rank;
    $("results-rank-label").textContent = !rank ? "" : best ? scope : scope + " RANK";
    $("results-rank").textContent = rank;
    $("results-rank").parentElement.hidden = !best && !rank;
  }

  // Play-test runs and runs off the local top ten have no rank to show.
  const showLocalRank = () => showRank("LOCAL", localRank ? "#" + localRank : "");

  /** The id of the results screen on show, for showWorldStanding. */
  const currentResults = () => resultsId;

  /**
   * @typedef {{ rank: number, total: number, best: number,
   *   ahead?: { name: string, time: number, replay: boolean } | null,
   *   behind?: { name: string, time: number } | null }} WorldStanding
   */

  /**
   * "0.420s TO PASS FREJA", or the leader's margin, from the player's best,
   * or a cheer when the player is alone at the top.
   * @param {WorldStanding} standing
   */
  function rivalText({ rank, best, ahead, behind }) {
    const gap = (/** @type {number} */ other) => Math.abs(other - best).toFixed(3) + "s";
    const name = (/** @type {string} */ value) => value.toUpperCase();
    if (ahead) return gap(ahead.time) + " TO PASS " + name(ahead.name);
    if (rank === 1 && behind) {
      return behind.time === best
        ? "TIED WITH " + name(behind.name) + " FOR #1"
        : "LEADING " + name(behind.name) + " BY " + gap(behind.time);
    }
    // First on the board, with nobody yet to lead.
    if (rank === 1) return "FIRST PLACE IN THE WORLD!";
    return "";
  }

  /**
   * Swaps the local rank for the world one once the server has timed the run,
   * or back to the local rank when it couldn't (`standing` null). Returns
   * false when the player has already left that results screen.
   * @param {number} id from currentResults() when the results were shown
   * @param {WorldStanding | null} standing
   * @param {string | null} [race] the rider the Race button offers, or none
   */
  function showWorldStanding(id, standing, race = null) {
    if (id !== resultsId) return false;
    $("results").dataset.world = "";
    if (!standing) {
      showLocalRank();
      $("results-rival").hidden = true;
      return dialog.open;
    }
    // The server's best is the one the world rank belongs to.
    if (shownBest !== null) shownBest = standing.best;
    showRank("WORLD", "#" + standing.rank + " / " + standing.total);
    const rival = rivalText(standing);
    $("results-rival").textContent = rival;
    $("race-rival-name").textContent = race ?? "";
    $("race-rival").hidden = !race;
    announce("World rank " + standing.rank + " of " + standing.total + "." + (rival ? " " + rival.replace(/[^!]$/, "$&.") : ""));
    return dialog.open;
  }

  return {
    setTrail,
    setReplay,
    setApples,
    setTimer,
    toast,
    clearToast,
    achievement,
    gear,
    split,
    tick,
    announce,
    setDirection,
    showPause,
    hide,
    reopen,
    showResults,
    currentResults,
    showWorldStanding,
  };
}
