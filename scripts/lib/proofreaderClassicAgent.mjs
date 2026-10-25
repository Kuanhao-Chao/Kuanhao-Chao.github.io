/** Legal-input completion witness for the preserved v2 campaign. No state edits or forced wins.
 * This demonstrates reachability/completion, not a claim about human difficulty.
 * Self-contained so Playwright can serialize it into the page.
 */
export function driveProofreaderClassic() {
  const api = window.__proofreaderClassic;
  const directions = [
    ['right', 1, 0],
    ['down', 0, 1],
    ['left', -1, 0],
    ['up', 0, -1],
  ];
  const wrapAngle = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  function path(start, goal, width, height, blocked, wrap = false) {
    const queue = [{ x: start.x, y: start.y, first: null }];
    const seen = new Set([`${start.x},${start.y}`]);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      if (p.x === goal.x && p.y === goal.y) return p.first;
      for (const [dir, dx, dy] of directions) {
        let x = p.x + dx;
        let y = p.y + dy;
        if (wrap) {
          x = (x + width) % width;
          y = (y + height) % height;
        }
        const key = `${x},${y}`;
        if (x < 0 || y < 0 || x >= width || y >= height || seen.has(key) || blocked.has(key))
          continue;
        seen.add(key);
        queue.push({ x, y, first: p.first ?? { x, y, dir } });
      }
    }
    return null;
  }
  function los(map, a, b) {
    const n = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 0.12);
    for (let i = 1; i < n; i++)
      if (
        map[Math.floor(a.y + ((b.y - a.y) * i) / n)]?.[Math.floor(a.x + ((b.x - a.x) * i) / n)] !==
        0
      )
        return false;
    return true;
  }
  for (let iteration = 0; iteration < 16000 && api.state().status === 'playing'; iteration++) {
    const s = api.state();
    const player = s.player;
    const blocked = new Set();
    s.map.forEach((row, y) =>
      row.forEach((cell, x) => {
        if (cell) blocked.add(`${x},${y}`);
      })
    );
    const live = s.enemies.filter((e) => e.alive);
    const visible = live.filter(
      (e) => Math.hypot(e.x - player.x, e.y - player.y) < 13 && los(s.map, player, e)
    );
    const target = visible
      .filter((e) => !e.boss || s.time % 6 >= 3.5)
      .sort(
        (a, b) =>
          Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y)
      )[0];
    const closest = live.sort(
      (a, b) =>
        Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y)
    )[0];
    const supply = s.pickups
      .filter((p) => p.kind === 'ammo')
      .sort(
        (a, b) =>
          Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y)
      )[0];
    const goal = s.exit.open
      ? s.exit
      : player.ammo < 5 && supply
        ? supply
        : (closest ?? s.relays.find((r) => !r.active) ?? s.exit);
    let dx = 0;
    let dy = 0;
    const distance = closest ? Math.hypot(closest.x - player.x, closest.y - player.y) : Infinity;
    if (closest && visible.includes(closest) && distance < 5 && player.ammo >= 5) {
      const angle = Math.atan2(closest.y - player.y, closest.x - player.x);
      const sign = Math.floor(s.time / 3) % 2 ? 1 : -1;
      dx = -Math.sin(angle) * sign;
      dy = Math.cos(angle) * sign;
      if (distance < 2.1) {
        dx -= Math.cos(angle);
        dy -= Math.sin(angle);
      }
      if (s.map[Math.floor(player.y + dy * 0.5)]?.[Math.floor(player.x + dx * 0.5)] !== 0) {
        dx *= -1;
        dy *= -1;
      }
    } else {
      const next = path(
        { x: Math.floor(player.x), y: Math.floor(player.y) },
        { x: Math.floor(goal.x), y: Math.floor(goal.y) },
        s.cols,
        s.rows,
        blocked
      );
      const waypoint = next ? { x: next.x + 0.5, y: next.y + 0.5 } : goal;
      dx = waypoint.x - player.x;
      dy = waypoint.y - player.y;
      const n = Math.hypot(dx, dy);
      if (n > 0.05) {
        dx /= n;
        dy /= n;
      } else {
        dx = 0;
        dy = 0;
      }
    }
    const aim = target ? Math.atan2(target.y - player.y, target.x - player.x) : Math.atan2(dy, dx);
    api.turn(wrapAngle(aim - player.angle));
    api.setInput({
      forward: dx * Math.cos(aim) + dy * Math.sin(aim),
      strafe: -dx * Math.sin(aim) + dy * Math.cos(aim),
      turn: 0,
      fire: Boolean(target),
      pulse: false,
    });
    api.tick(4);
  }
  const s = api.state();
  api.setInput({ forward: 0, strafe: 0, turn: 0, fire: false, pulse: false });
  return {
    status: s.status,
    score: s.score,
    time: s.time,
    health: s.player.health,
    kills: s.kills,
    wave: s.wave,
    relays: s.relays.map((r) => r.active),
    exit: s.exit.open,
  };
}
