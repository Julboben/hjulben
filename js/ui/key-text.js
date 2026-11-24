// @ts-check
// Text that names keys, such as ["Press ", { key: "R" }, " to retry"]: shown
// with each key in a <kbd> badge, and read out as plain words. Gamepad
// buttons, { pad: "A" }, get a chip coloured like the button, as in the
// gamepad diagram.

/** A key, or a gamepad button. @typedef {{ key: string } | { pad: string }} KeyPart */
/** @typedef {string | (string | KeyPart)[]} KeyText */

/**
 * The text's nodes, for replaceChildren.
 * @param {KeyText} text
 * @returns {(string | HTMLElement)[]}
 */
export function keyTextNodes(text) {
  return [text].flat().map(part => {
    if (typeof part === 'string') return part;
    if ('pad' in part) {
      const chip = document.createElement('span');
      chip.className = 'gamepad-chip';
      if (/^[ABXY]$/.test(part.pad)) chip.dataset.face = part.pad.toLowerCase();
      chip.textContent = part.pad;
      return chip;
    }
    const badge = document.createElement('kbd');
    badge.textContent = part.key;
    return badge;
  });
}

/**
 * The text as words, for announcements and labels.
 * @param {KeyText} text
 */
export function keyTextWords(text) {
  return [text].flat().map(part => typeof part === 'string' ? part : 'pad' in part ? part.pad : part.key).join('');
}

/**
 * Keys as alternatives: [{ key: "P" }, " or ", { key: "Esc" }].
 * @param {KeyPart[]} keys
 * @returns {(string | KeyPart)[]}
 */
export function keyChoices(keys) {
  return keys.flatMap((key, index) => index ? [' or ', key] : [key]);
}
