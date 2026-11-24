// @ts-check
// A pixel-art gamepad with labelled callouts, for the controls settings.
// The mapping mirrors pollGamepad in ../input.js; gamepad buttons can't be remapped.

import { keyTextNodes } from './key-text.js';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Callouts: the label's side and row, then the leader line's corners up to
 * the control. Left labels end at x 128, right ones start at x 336. A line's
 * optional third entry is its name in the narrow-screen legend.
 * @type {{ side: 'left' | 'right', y: number, lines: string[][], to: number[] }[]}
 */
const CALLOUTS = [
  { side: 'left', y: 14, lines: [['SELECT', 'MENU']], to: [216, 14, 216, 66] },
  { side: 'left', y: 36, lines: [['LT', 'BRAKE']], to: [164, 36] },
  { side: 'left', y: 80, lines: [['L-STICK', 'LEAN']], to: [165, 80] },
  { side: 'left', y: 106, lines: [['D-PAD ← →', 'LEAN'], ['↑', 'HEADLIGHT', 'D-PAD ↑'], ['↓', 'INTERACT', 'D-PAD ↓']], to: [193, 106] },
  { side: 'right', y: 14, lines: [['START', 'PAUSE']], to: [244, 14, 244, 66] },
  { side: 'right', y: 36, lines: [['RT', 'GAS']], to: [296, 36] },
  { side: 'right', y: 58, lines: [['Y', 'RESTART']], to: [304, 58, 291, 66] },
  { side: 'right', y: 80, lines: [['B', 'TURN AROUND']], to: [304, 80] },
  { side: 'right', y: 102, lines: [['A', 'GAS']], to: [304, 102, 291, 94] },
  { side: 'right', y: 126, lines: [['X', 'BRAKE']], to: [271, 126, 271, 87] },
];

export const GAMEPAD_SUMMARY = 'Gamepad: right trigger or A for gas, left trigger or X for brake, ' +
  'left stick or d-pad left and right to lean, d-pad up for the headlight, d-pad down to interact, ' +
  'B to turn around, Y to restart, Start to pause and Select for the menu.';

/**
 * @param {string} name
 * @param {Record<string, string | number>} attributes
 */
function node(name, attributes = {}) {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

/** A pixel rectangle. */
const block = (/** @type {string} */ part, /** @type {number[]} */ [x, y, width, height]) =>
  node('rect', { class: part, x, y, width, height });

/** A round button or stick, stepped like a pixel circle. */
function round(/** @type {string} */ part, /** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ r) {
  const step = Math.round(r * 0.45);
  const group = node('g', { class: part });
  group.append(
    block('', [cx - r + step, cy - r, 2 * (r - step), 2 * r]),
    block('', [cx - r, cy - r + step, 2 * r, 2 * (r - step)]),
    block('', [cx - r + step / 2, cy - r + step / 2, 2 * r - step, 2 * r - step]),
  );
  return group;
}

/** A face button with its letter. */
function face(/** @type {string} */ letter, /** @type {number} */ cx, /** @type {number} */ cy) {
  const group = round('pad-face pad-face-' + letter.toLowerCase(), cx, cy, 7);
  const label = node('text', { x: cx, y: cy + 0.5, class: 'pad-letter' });
  label.textContent = letter;
  group.append(label);
  return group;
}

/** The diagram, plus a legend that stands in for its callouts on narrow screens. */
export function createGamepadDiagram() {
  const legend = document.createElement('ul');
  legend.className = 'gamepad-legend';
  // The diagram's label already reads out the whole mapping.
  legend.setAttribute('aria-hidden', 'true');
  for (const { lines } of CALLOUTS) {
    for (const [key, action, name = key] of lines) {
      const item = document.createElement('li');
      item.append(...keyTextNodes([{ pad: name }]), action);
      legend.append(item);
    }
  }
  return [drawGamepad(), legend];
}

/** @returns {SVGSVGElement} */
function drawGamepad() {
  const svg = /** @type {SVGSVGElement} */ (node('svg', {
    class: 'gamepad-diagram', viewBox: '0 0 460 172', role: 'img', 'aria-label': GAMEPAD_SUMMARY,
  }));
  const mirror = (/** @type {number[]} */ [x, y, width, height]) => [460 - x - width, y, width, height];
  const trigger = [[164, 30, 36, 16], [168, 26, 28, 4]];
  const bumper = [158, 44, 46, 8];
  const shell = [[152, 50, 156, 76], [146, 56, 168, 64], [142, 62, 176, 52]];
  const grip = [[142, 112, 58, 32], [146, 144, 50, 10], [152, 154, 38, 6]];
  svg.append(
    ...trigger.map(part => block('pad-trigger', part)),
    ...trigger.map(part => block('pad-trigger', mirror(part))),
    block('pad-idle', bumper), block('pad-idle', mirror(bumper)),
    ...shell.map(part => block('pad-shell', part)),
    ...grip.map(part => block('pad-shell', part)),
    ...grip.map(part => block('pad-shell', mirror(part))),
    round('pad-well', 180, 80, 15), round('pad-stick', 180, 80, 10),
    round('pad-well', 254, 108, 13), round('pad-idle', 254, 108, 9),
    block('pad-dpad', [202, 94, 8, 24]), block('pad-dpad', [194, 102, 24, 8]),
    block('pad-small', [212, 67, 8, 6]), block('pad-small', [240, 67, 8, 6]),
    round('pad-well', 230, 60, 5),
    face('Y', 284, 66), face('X', 271, 80), face('B', 297, 80), face('A', 284, 94),
  );
  for (const { side, y, lines, to } of CALLOUTS) {
    const left = side === 'left';
    const start = left ? 132 : 328;
    const points = [start, y, ...to];
    svg.append(node('polyline', { class: 'pad-leader', points: points.join(' ') }));
    const [endX, endY] = points.slice(-2);
    svg.append(block('pad-leader-end', [endX - 1.5, endY - 1.5, 3, 3]));
    lines.forEach(([key, action], index) => {
      const text = node('text', {
        class: 'pad-callout', x: left ? 128 : 336, y: y + index * 16, 'text-anchor': left ? 'end' : 'start',
      });
      const name = node('tspan', { class: 'pad-key' });
      name.textContent = key;
      const what = node('tspan', { class: 'pad-action', dx: 6 });
      what.textContent = action;
      text.append(name, what);
      svg.append(text);
    });
  }
  return svg;
}
