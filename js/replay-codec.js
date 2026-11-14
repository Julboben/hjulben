// @ts-check
// Run-length encoding for per-step ride inputs. A minute of riding is 7200
// steps but usually only a few hundred distinct runs of held input.

/** @typedef {import('./types.js').RideInput} RideInput */

/**
 * A respawn at the last flag reached is a step of its own, with a sixth
 * column, so runs without one encode as they always have.
 * @param {RideInput[]} inputs
 * @returns {number[][]} rows of [count, facing, leanInput, accelerating, braking], plus 1 for a respawn
 */
export function encodeInputs(inputs) {
  const rows = [];
  let last = null;
  for (const input of inputs) {
    const row = [1, input.facing < 0 ? -1 : 1, Math.round((Number(input.leanInput) || 0) * 100) / 100, input.accelerating ? 1 : 0, input.braking ? 1 : 0];
    if (input.respawn) {
      rows.push([...row, 1]);
      last = null;
    } else if (last && last[1] === row[1] && last[2] === row[2] && last[3] === row[3] && last[4] === row[4]) last[0]++;
    else rows.push(last = row);
  }
  return rows;
}

/** @returns {RideInput[]} */
export function decodeInputs(rows) {
  const inputs = [];
  for (const [count, facing, leanInput, accelerating, braking, respawn] of rows || []) {
    const input = { facing, leanInput, accelerating: Boolean(accelerating), braking: Boolean(braking) };
    if (respawn) inputs.push({ ...input, respawn: true });
    else for (let index = 0; index < count; index++) inputs.push(input);
  }
  return inputs;
}
