/** A legal-input completion witness, not a claim about human difficulty or balance.
 * The same interface drives the pure engine and the real browser controller.
 * No position, health, enemy, objective, progress, or win-state writes are permitted.
 */
/**
 * @typedef {{state:()=>import('../../src/lib/proofreader').GameState,
 * target:()=>{position:import('../../src/lib/proofreader').Vec3,label:string},
 * route:(to:import('../../src/lib/proofreader').Vec3)=>import('../../src/lib/proofreader').Vec3[],
 * visible:(a:import('../../src/lib/proofreader').Vec3,b:import('../../src/lib/proofreader').Vec3)=>boolean,
 * turn:(yaw:number,pitch:number)=>void,setInput:(input:Partial<import('../../src/lib/proofreader').StepInput>)=>void,
 * interact:()=>boolean,tick:(frames:number)=>void}} ProofInputApi
 * @param {{api?:ProofInputApi,maxIterations?:number,frames?:number}} [options]
 */
export function driveProofreader3D({ api: supplied, maxIterations = 12000, frames = 12 } = {}) {
  const api = supplied ?? window.__proofreader;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const wrap = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  let route = [],
    lastGoal = null,
    lastRoute = -10,
    stuck = 0,
    lastPosition = null;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const s = api.state(),
      p = s.player;
    if (s.status !== 'playing')
      return {
        status: s.status,
        time: s.runTime,
        health: p.health,
        kills: s.kills,
        score: s.score,
        iteration,
        objectives: s.mission.objectives,
        triggered: s.mission.triggered,
        retries: s.retries,
      };
    const eye = { ...p.position, y: p.position.y + 1.58 };
    const center = (e) => ({
      ...e.position,
      y: e.position.y + (e.kind === 'guardian' ? 1.7 : e.kind === 'flyer' ? 0.35 : 0.8),
    });
    const targets = s.enemies
      .filter(
        (e) =>
          e.alive &&
          (e.kind !== 'guardian' || s.mission.objectives.includes(e.phase + 1)) &&
          dist(center(e), eye) < 42 &&
          api.visible(eye, center(e))
      )
      .sort((a, b) => dist(center(a), eye) - dist(center(b), eye));
    const target = targets[0];
    let goal = api.target().position;
    if (p.magazines.carbine + p.reserves.carbine < 16)
      goal = s.level.terminals.reduce((a, b) =>
        dist(a, p.position) < dist(b, p.position) ? a : b
      );
    if (!lastGoal || dist(lastGoal, goal) > 2 || s.time - lastRoute > 1.2 || stuck > 12) {
      route = api.route(goal);
      lastGoal = { ...goal };
      lastRoute = s.time;
    }
    while (
      route.length &&
      Math.hypot(route[0].x - p.position.x, route[0].z - p.position.z) < 0.62 &&
      Math.abs(route[0].y - p.position.y) < 0.8
    )
      route.shift();
    const waypoint = route[0] ?? goal;
    let dx = waypoint.x - p.position.x,
      dz = waypoint.z - p.position.z;
    const n = Math.hypot(dx, dz);
    if (n > 0.2) {
      dx /= n;
      dz /= n;
    } else {
      dx = 0;
      dz = 0;
    }
    if (target) {
      const d = dist(center(target), eye);
      // Prefer ranged cover positions, then resume navigation after the encounter.
      if (d > 4 && d < 38) {
        dx = 0;
        dz = 0;
      }
      const danger = s.projectiles.find((q) => q.hostile && dist(q.position, eye) < 3);
      if (
        danger ||
        d < 3.3 ||
        (target.kind === 'charger' && (target.attacking || target.chargeFor > 0))
      ) {
        const a = Math.atan2(target.position.x - p.position.x, -(target.position.z - p.position.z));
        dx = -Math.sin(a) + (danger ? Math.cos(a) * 0.7 : 0);
        dz = Math.cos(a) + (danger ? Math.sin(a) * 0.7 : 0);
      }
    }
    const aim = target ? center(target) : { ...waypoint, y: p.position.y + 1.58 };
    const ax = aim.x - eye.x,
      ay = aim.y - eye.y,
      az = aim.z - eye.z;
    const yaw = Math.atan2(ax, -az),
      pitch = Math.atan2(ay, Math.hypot(ax, az));
    api.turn(wrap(yaw - p.yaw), pitch - p.pitch);
    const f = dx * Math.sin(yaw) - dz * Math.cos(yaw),
      r = dx * Math.cos(yaw) + dz * Math.sin(yaw);
    api.setInput({
      forward: f,
      strafe: r,
      turn: 0,
      look: 0,
      fire: Boolean(target),
      reload: p.magazines.carbine === 0,
      interact: false,
      jump: false,
      sprint: !target,
    });
    if (s.context) api.interact();
    api.tick(frames);
    const next = api.state().player.position;
    if (lastPosition && dist(lastPosition, next) < 0.015 && Math.hypot(dx, dz) > 0.2) stuck++;
    else stuck = 0;
    if (stuck > 35) {
      // A legal short jump can recover an accidental lip without granting movement.
      api.setInput({ jump: true });
      api.tick(18);
      api.setInput({ jump: false });
      stuck = 0;
      lastRoute = -10;
    }
    lastPosition = { ...next };
  }
  const s = api.state();
  return {
    status: s.status,
    time: s.runTime,
    health: s.player.health,
    kills: s.kills,
    score: s.score,
    position: s.player.position,
    target: api.target(),
    route: route.slice(0, 3),
    enemies: s.enemies.map((e) => ({
      kind: e.kind,
      position: e.position,
      hp: e.hp,
      phase: e.phase,
    })),
    objectives: s.mission.objectives,
    triggered: s.mission.triggered,
    error: 'Witness iteration budget exhausted',
  };
}
