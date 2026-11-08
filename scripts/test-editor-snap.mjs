import { gridSpacing, lockDirection, snapAxis, snapToAngleAndGrid } from '../js/editor/snap.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
  if (!ok) failures++;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const onGrid = (value, spacing) => near(value / spacing, Math.round(value / spacing), 1e-9);
const degrees = (from, to) => Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;

check('the grid matches the one the editor draws', gridSpacing(1) === 50 && gridSpacing(.5) === 100);
check('the grid gets finer when zoomed right in', gridSpacing(2) === 25 && gridSpacing(6) === 10);

// Without an anchor a point snaps to the nearest grid intersection.
{
  const s = snapToAngleAndGrid({ x: 123, y: -78 }, [], 50);
  check('no anchor: nearest grid intersection', s.x === 100 && s.y === -100 && s.anchor === null);
}

// Horizontal and vertical stay perfectly straight.
{
  const anchor = { x: 13, y: 27 };
  const h = snapToAngleAndGrid({ x: 171, y: 31 }, [anchor], 50);
  check('near-horizontal locks to 0 degrees', h.y === anchor.y && onGrid(h.x, 50) && h.angle === 0, `(${h.x}, ${h.y})`);
  const v = snapToAngleAndGrid({ x: 16, y: -140 }, [anchor], 50);
  check('near-vertical locks to -90 degrees', v.x === anchor.x && onGrid(v.y, 50) && v.angle === -90, `(${v.x}, ${v.y})`);
}

// A 45 degree drag from a grid point lands on a grid intersection.
{
  const s = snapToAngleAndGrid({ x: 152, y: 141 }, [{ x: 0, y: 0 }], 50);
  check('diagonal lands on the grid', near(s.x, 150) && near(s.y, 150) && near(s.angle, 45) && near(s.length, Math.hypot(150, 150)));
}

// Any snapped result is on a multiple of the angle step and on a grid line.
{
  let bad = 0, count = 0;
  for (let x = -400; x <= 400; x += 23) for (let y = -400; y <= 400; y += 29) {
    const anchor = { x: 17.5, y: -8.25 };
    if (Math.hypot(x - anchor.x, y - anchor.y) < 30) continue;
    count++;
    const s = snapToAngleAndGrid({ x, y }, [anchor], 50);
    const angle = degrees(anchor, s);
    const stepped = near(angle / 15, Math.round(angle / 15), 1e-6);
    if (!stepped || !(onGrid(s.x, 50) || onGrid(s.y, 50)) || s.length <= 0) bad++;
  }
  check('every result is on a 15 degree ray and a grid line', bad === 0, `(${bad} of ${count} bad)`);
}

// It never folds back through the anchor, nor collapses onto it.
{
  const anchor = { x: 10, y: 0 };
  const s = snapToAngleAndGrid({ x: 20, y: 1 }, [anchor], 50);
  check('a tiny drag still moves away from the anchor', s.x > anchor.x && s.length > 0, `(${s.x})`);
  const back = snapToAngleAndGrid({ x: 0, y: 1 }, [anchor], 50);
  check('and in the direction of the pointer', back.x < anchor.x, `(${back.x})`);
}

// With two anchors the nearer result wins.
{
  const s = snapToAngleAndGrid({ x: 500, y: 20 }, [{ x: 0, y: 0 }, { x: 500, y: 400 }], 50);
  check('the anchor giving the nearest result is used', s.anchor.x === 0 && s.y === 0 && s.x === 500);
}

// The pointer sitting exactly on an anchor is harmless.
{
  const s = snapToAngleAndGrid({ x: 5, y: 5 }, [{ x: 5, y: 5 }], 50);
  check('pointer on the anchor falls back to the grid', s.x === 0 && s.y === 0 && s.anchor === null);
}

// A move snaps a line onto another thing's line when it comes close enough.
{
  const s = snapAxis(-197, [313, 353, 393], [113, 163, 213], 6, 50);
  check('a moving edge lands on a nearby edge', s.delta === -200 && s.at === 113 && !s.grid, `(${s.delta})`);
  const far = snapAxis(-170, [313, 353, 393], [113, 163, 213], 6, 50);
  check('too far from anything, it moves as asked', far.delta === -170 && far.at === null, `(${far.delta})`);
}

// Things win over the grid, even when the grid is nearer.
{
  const s = snapAxis(0, [148], [153], 6, 50);
  check('another thing wins over a nearer grid line', s.at === 153 && s.delta === 5, `(${s.at})`);
  const grid = snapAxis(0, [148], [], 6, 50);
  check('with nothing else close, the grid line', grid.at === 150 && grid.grid, `(${grid.at})`);
}

// Of the moving lines, the one nearest a target decides.
{
  const s = snapAxis(0, [10, 47], [12, 48], 6, 0);
  check('the nearest pair snaps', s.at === 48 && s.delta === 1, `(${s.at})`);
}

// Shift locks a move to across, up and down, or 45 degrees.
{
  const level = lockDirection(200, 15);
  check('mostly sideways stays level', level.dx === 200 && level.dy === 0 && level.angle === 0, `(${level.dx}, ${level.dy})`);
  const up = lockDirection(-8, -120);
  check('mostly upwards goes straight up', up.dx === 0 && up.dy === -120 && up.angle === -90, `(${up.dx}, ${up.dy})`);
  const diagonal = lockDirection(90, -110);
  check('near 45 degrees moves as far each way', diagonal.dx === 100 && diagonal.dy === -100 && diagonal.angle === -45, `(${diagonal.dx}, ${diagonal.dy})`);
}

console.log(failures ? `\n${failures} failing` : '\nEditor snap tests passed.');
process.exit(failures ? 1 : 0);
