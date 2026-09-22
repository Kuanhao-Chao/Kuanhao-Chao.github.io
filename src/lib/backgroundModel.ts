/** Pure preferences and mathematics shared by the ambient scenes and their demos. */
export type BackgroundScene = 'cells' | 'flow' | 'landscape' | 'off';
export type BackgroundMotion = 'ambient' | 'calm' | 'paused';
export interface BackgroundPreference {
  scene: BackgroundScene;
  motion: BackgroundMotion;
}
export const BACKGROUND_KEY = 'khc-background-v1';
export const SCENES = ['cells', 'flow', 'landscape', 'off'] as const;
export const MOTIONS = ['ambient', 'calm', 'paused'] as const;

export function resolveBackground(raw: string | null, legacy: string | null): BackgroundPreference {
  try {
    const value = JSON.parse(raw || 'null');
    if (value && SCENES.includes(value.scene) && MOTIONS.includes(value.motion)) {
      return { scene: value.scene, motion: value.motion };
    }
  } catch {
    /* Invalid or old storage falls back to the legacy preference. */
  }
  return {
    scene: legacy === 'off' ? 'off' : 'cells',
    motion: legacy === 'calm' ? 'calm' : 'ambient',
  };
}

export function backgroundRouteAllowed(path: string): boolean {
  return !/^\/(?:lab|games|nn-lab|shorkie-lab|algorithms|terminal|chromatin|sonic-genome)(?:\/|$)/.test(
    path
  );
}

export interface Point {
  x: number;
  y: number;
}
export function landscapeLoss({ x, y }: Point): number {
  return 0.25 * (x * x - 1) ** 2 + 0.5 * (y - 0.35 * x) ** 2;
}
export function landscapeGradient({ x, y }: Point): Point {
  return { x: x * (x * x - 1) - 0.35 * (y - 0.35 * x), y: y - 0.35 * x };
}
export interface Trajectory {
  point: Point;
  velocity: Point;
  path: Point[];
  momentum: boolean;
  status: 'running' | 'converged' | 'diverged' | 'outside plot';
  iterations: number;
}
export function createTrajectory(start: Point, momentum = false): Trajectory {
  return {
    point: { ...start },
    velocity: { x: 0, y: 0 },
    path: [{ ...start }],
    momentum,
    status: 'running',
    iterations: 0,
  };
}
export function stepTrajectory(t: Trajectory, rate: number): void {
  if (t.status !== 'running') return;
  const g = landscapeGradient(t.point);
  const beta = t.momentum ? 0.85 : 0;
  const velocity = { x: beta * t.velocity.x + g.x, y: beta * t.velocity.y + g.y };
  const next = { x: t.point.x - rate * velocity.x, y: t.point.y - rate * velocity.y };
  t.iterations++;
  if (!Number.isFinite(next.x + next.y)) {
    t.status = 'diverged';
    return;
  }
  if (Math.abs(next.x) > 2 || Math.abs(next.y) > 2) {
    t.status = 'outside plot';
    return;
  }
  t.velocity = velocity;
  t.point = next;
  t.path.push({ ...next });
  if (t.path.length > 700) t.path.shift();
  if (Math.hypot(g.x, g.y) < 0.001 && Math.hypot(velocity.x, velocity.y) < 0.004)
    t.status = 'converged';
}

export function seededBackgroundRandom(seed = 721): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Curl of a smooth, seeded Fourier streamfunction: (∂ψ/∂y, −∂ψ/∂x). */
export function flowVelocity(x: number, y: number, time: number): Point {
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < 4; i++) {
    const angle = [0.3, 1.7, 2.6, -0.9][i];
    const kx = Math.cos(angle) * (1 + i * 0.4);
    const ky = Math.sin(angle) * (1 + i * 0.4);
    const phase = x * kx + y * ky + time * (0.035 + i * 0.012) + i * 2.17;
    const amplitude = 0.65 / (1 + i * 0.7);
    vx += amplitude * ky * Math.cos(phase);
    vy -= amplitude * kx * Math.cos(phase);
  }
  return { x: vx + 0.17, y: vy + 0.11 };
}

/** Contour segments, computed once per landscape; ambiguous saddle cells split deterministically. */
export function landscapeContours(resolution = 90): Array<{ level: number; a: Point; b: Point }> {
  const levels = [0.025, 0.07, 0.14, 0.24, 0.38, 0.58, 0.85, 1.2, 1.65, 2.2, 2.9, 3.7, 4.6, 5.7];
  const result: Array<{ level: number; a: Point; b: Point }> = [];
  const step = 4 / resolution;
  for (let iy = 0; iy < resolution; iy++)
    for (let ix = 0; ix < resolution; ix++) {
      const x = -2 + ix * step;
      const y = -2 + iy * step;
      const corners = [
        { x, y },
        { x: x + step, y },
        { x: x + step, y: y + step },
        { x, y: y + step },
      ];
      const values = corners.map(landscapeLoss);
      for (const level of levels) {
        const hits: Point[] = [];
        for (let edge = 0; edge < 4; edge++) {
          const next = (edge + 1) % 4;
          if (values[edge] < level === values[next] < level) continue;
          const weight = (level - values[edge]) / (values[next] - values[edge]);
          hits.push({
            x: corners[edge].x + weight * (corners[next].x - corners[edge].x),
            y: corners[edge].y + weight * (corners[next].y - corners[edge].y),
          });
        }
        for (let i = 0; i + 1 < hits.length; i += 2)
          result.push({ level, a: hits[i], b: hits[i + 1] });
      }
    }
  return result;
}
