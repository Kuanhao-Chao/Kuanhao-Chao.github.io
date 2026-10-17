/** A legal-input route witness. Reads state and steers; never writes position,
 * health, camera, course, or win state. Also runs unchanged inside a browser.
 * Precise automated play demonstrates reachability, not human difficulty. */
/**
 * @param {{api?:{state:()=>import('../../src/lib/floorDescent').GameState,
 * input:(i:import('../../src/lib/floorDescent').Input)=>void,
 * forecast:(s:import('../../src/lib/floorDescent').GameState,i:import('../../src/lib/floorDescent').Input,ticks:number)=>import('../../src/lib/floorDescent').GameState},maxSteps?:number}} [options]
 */
export function driveFloorDescent({ api: supplied, maxSteps = 42000 } = {}) {
  const api = supplied ?? window.__floorDescent;
  let lastStanding = -999,
    exit = 1,
    targetId = -1;
  for (let i = 0; i < maxSteps; i++) {
    const s = api.state(),
      p = s.player;
    if (s.status !== 'playing')
      return {
        status: s.status,
        floor: s.floor,
        seconds: s.time,
        health: p.health,
        cause: s.cause,
        steps: i,
      };
    const current = s.platforms.find((f) => f.id === p.standing);
    if (
      p.y - s.camera < 300 ||
      p.y - s.camera > 450 ||
      (p.vy > 450 && p.y - s.camera > 350) ||
      current?.kind === 'spring'
    ) {
      // Bounded look-ahead over legal steering actions. The score prefers a
      // comfortable screen height and strongly rejects health loss or death.
      let beam = [{ state: s, first: 0, score: 0 }];
      for (let depth = 0; depth < 20; depth++) {
        const candidates = [];
        for (const node of beam)
          for (const steer of [-1, 0, 1]) {
            const next = api.forecast(node.state, { steer }, 12),
              y = next.player.y - next.camera;
            const score =
              (next.status === 'over' ? -1e6 : 0) +
              (next.status === 'won' ? 1e6 : 0) +
              next.player.health * 1000 -
              Math.abs(y - 400) * 1.5 -
              Math.max(0, 130 - y) * 8 -
              Math.max(0, y - 450) * 25 -
              Math.max(0, next.player.vy - 300) * 0.1 +
              (next.player.standing !== null ? 20 : 0);
            candidates.push({ state: next, first: depth === 0 ? steer : node.first, score });
          }
        const seen = new Set();
        beam = candidates
          .sort((a, b) => b.score - a.score)
          .filter((n) => {
            const p = n.state.player,
              key = `${Math.round(p.x / 12)}:${Math.round((p.y - n.state.camera) / 18)}:${p.standing}:${Math.round(p.vx / 100)}:${Math.round(p.vy / 200)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 24);
      }
      const steer = beam[0].first;
      for (let j = 0; j < 12; j++) api.input({ steer });
      i += 11;
      continue;
    }
    if (current && current.id !== lastStanding) {
      lastStanding = current.id;
      const next = s.platforms.find(
        (f) => f.row === current.row + 1 && f.kind !== 'spikes' && !f.broken
      );
      targetId = next?.id ?? -1;
      exit =
        next && Math.abs(next.x + next.width / 2 - (current.x + current.width / 2)) > 10
          ? Math.sign(next.x + next.width / 2 - (current.x + current.width / 2))
          : p.x < 210
            ? -1
            : 1;
    }
    let aim = p.x;
    if (current) {
      if (p.y - s.camera > 410 && !['crumble', 'spring'].includes(current.kind))
        aim = current.x + current.width / 2;
      else {
        api.input({ steer: exit });
        continue;
      }
    } else {
      const launch = s.platforms.find((f) => f.id === lastStanding && f.kind === 'spring');
      if (launch && p.y <= launch.y && p.x > launch.x - 18 && p.x < launch.x + launch.width + 18) {
        api.input({ steer: exit });
        continue;
      }
      let next = s.platforms.find((f) => f.id === targetId && !f.broken && f.y >= p.y - 2);
      if (!next) next = s.platforms.find((f) => f.y > p.y + 2 && !f.broken && f.kind !== 'spikes');
      if (next) aim = Math.max(next.x + 17, Math.min(next.x + next.width - 17, p.x));
    }
    const desired = Math.max(-250, Math.min(250, (aim - p.x) * 12));
    api.input({
      steer:
        Math.abs(aim - p.x) < 2 && Math.abs(p.vx) < 15
          ? 0
          : Math.max(-1, Math.min(1, (desired - p.vx) / 50)),
    });
  }
  const s = api.state();
  return {
    status: s.status,
    floor: s.floor,
    seconds: s.time,
    health: s.player.health,
    cause: s.cause,
    steps: maxSteps,
  };
}
