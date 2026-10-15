/** DOM-free geometry shared by the simulation and WebGL presentation. Y is up; positions are feet. */
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Ray, Triangle, Vector3 } from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { Octree } from 'three/addons/math/Octree.js';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export type Surface = 'floor' | 'wall' | 'deck' | 'ramp' | 'cover' | 'glass';
export interface Solid {
  id: string;
  kind: 'box' | 'ramp';
  position: Vec3;
  size: Vec3;
  surface: Surface;
  walkable?: boolean;
  rotation?: number;
}
export interface NavNode extends Vec3 {
  id: number;
  links: number[];
}
export interface WorldShape {
  solids: Solid[];
}
export interface DynamicBox {
  id: number;
  position: Vec3;
  size: Vec3;
}
export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const scale = (a: Vec3, n: number): Vec3 => v3(a.x * n, a.y * n, a.z * n);
export const subtract = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export function unit(a: Vec3): Vec3 {
  return scale(a, 1 / (Math.hypot(a.x, a.y, a.z) || 1));
}
export function direction(yaw: number, pitch = 0): Vec3 {
  return v3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

/** The exact same triangles are fed to the renderer and the collision Octree. */
export function solidGeometry(s: Solid): BufferGeometry {
  let geometry: BufferGeometry;
  if (s.kind === 'box') geometry = new BoxGeometry(s.size.x, s.size.y, s.size.z);
  else {
    const w = s.size.x / 2,
      l = s.size.z / 2,
      h = s.size.y;
    const points = [
      [-w, 0, l],
      [w, 0, l],
      [w, h, -l],
      [-w, h, -l],
      [-w, 0, -l],
      [w, 0, -l],
    ];
    const indices = [0, 1, 2, 0, 2, 3, 0, 4, 5, 0, 5, 1, 3, 2, 5, 3, 5, 4, 0, 3, 4, 1, 5, 2];
    geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        indices.flatMap((i) => points[i]),
        3
      )
    );
    // Box stair treads and wedge ramps must share attributes when the renderer batches them.
    geometry.setAttribute(
      'uv',
      new Float32BufferAttribute(
        indices.flatMap((i) => [(points[i][0] + w) / (2 * w), (points[i][2] + l) / (2 * l)]),
        2
      )
    );
    geometry.computeVertexNormals();
  }
  if (s.rotation) geometry.rotateY(s.rotation);
  geometry.translate(s.position.x, s.position.y, s.position.z);
  return geometry;
}

export interface CompiledWorld {
  tree: Octree;
  nodes: NavNode[];
}
const worlds = new WeakMap<WorldShape, CompiledWorld>();
export function compileWorld(shape: WorldShape): CompiledWorld {
  const existing = worlds.get(shape);
  if (existing) return existing;
  const tree = new Octree();
  for (const solid of shape.solids) {
    const geometry = solidGeometry(solid);
    const positions = geometry.getAttribute('position');
    const index = geometry.index;
    const count = index?.count ?? positions.count;
    for (let i = 0; i < count; i += 3) {
      const vertex = (j: number) =>
        new Vector3().fromBufferAttribute(positions, index ? index.getX(j) : j);
      tree.addTriangle(new Triangle(vertex(i), vertex(i + 1), vertex(i + 2)));
    }
    geometry.dispose();
  }
  tree.build();
  const world: CompiledWorld = { tree, nodes: [] };
  worlds.set(shape, world);
  world.nodes = buildNavigation(shape, world);
  return world;
}

export function makeCapsule(feet: Vec3, height = 1.75, radius = 0.3): Capsule {
  return new Capsule(
    new Vector3(feet.x, feet.y + radius, feet.z),
    new Vector3(feet.x, feet.y + height - radius, feet.z),
    radius
  );
}

/** Nearest solid hit. Dynamic doors/crates use the same box extents as their meshes. */
export function rayDistance(
  world: CompiledWorld,
  origin: Vec3,
  dir: Vec3,
  max = 100,
  boxes: readonly DynamicBox[] = []
): number {
  const hit = world.tree.rayIntersect(
    new Ray(new Vector3(origin.x, origin.y, origin.z), new Vector3(dir.x, dir.y, dir.z))
  );
  let result = hit ? Math.min(max, hit.distance) : max;
  for (const box of boxes) result = Math.min(result, rayBox(origin, dir, box, max));
  return result;
}

export function rayBox(
  origin: Vec3,
  dir: Vec3,
  box: Pick<DynamicBox, 'position' | 'size'>,
  max = 100
): number {
  let near = 0,
    far = max;
  for (const axis of ['x', 'y', 'z'] as const) {
    const lo = box.position[axis] - box.size[axis] / 2;
    const hi = box.position[axis] + box.size[axis] / 2;
    if (Math.abs(dir[axis]) < 1e-9) {
      if (origin[axis] < lo || origin[axis] > hi) return max;
    } else {
      const a = (lo - origin[axis]) / dir[axis],
        b = (hi - origin[axis]) / dir[axis];
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (far < near) return max;
    }
  }
  return near <= max ? near : max;
}

export function visible(
  world: CompiledWorld,
  a: Vec3,
  b: Vec3,
  boxes: readonly DynamicBox[] = []
): boolean {
  const d = distance(a, b);
  return d < 0.001 || rayDistance(world, a, unit(subtract(b, a)), d, boxes) >= d - 0.025;
}

/** Resolve a capsule against static triangles and upright dynamic boxes without DOM or GPU state. */
export function resolveBody(
  world: CompiledWorld,
  feet: Vec3,
  velocity: Vec3,
  height = 1.75,
  radius = 0.3,
  boxes: readonly DynamicBox[] = []
): { position: Vec3; grounded: boolean } {
  const capsule = makeCapsule(feet, height, radius);
  let grounded = false;
  for (let i = 0; i < 5; i++) {
    const hit = world.tree.capsuleIntersect(capsule);
    if (!hit || hit.depth < 1e-7) break;
    if (hit.normal.y > Math.SQRT1_2) grounded = true;
    const into = hit.normal.x * velocity.x + hit.normal.y * velocity.y + hit.normal.z * velocity.z;
    if (into < 0) {
      velocity.x -= hit.normal.x * into;
      velocity.y -= hit.normal.y * into;
      velocity.z -= hit.normal.z * into;
    }
    capsule.translate(hit.normal.multiplyScalar(hit.depth + 1e-5));
  }
  const result = v3(capsule.start.x, capsule.start.y - radius, capsule.start.z);
  for (const box of boxes) {
    const bottom = box.position.y - box.size.y / 2,
      top = box.position.y + box.size.y / 2;
    if (result.y + height <= bottom || result.y >= top) continue;
    const cx = Math.max(
      box.position.x - box.size.x / 2,
      Math.min(box.position.x + box.size.x / 2, result.x)
    );
    const cz = Math.max(
      box.position.z - box.size.z / 2,
      Math.min(box.position.z + box.size.z / 2, result.z)
    );
    const dx = result.x - cx,
      dz = result.z - cz,
      d = Math.hypot(dx, dz);
    if (d >= radius) continue;
    if (feet.y >= top - 0.12 && velocity.y <= 0) {
      result.y = top;
      velocity.y = 0;
      grounded = true;
      continue;
    }
    if (d > 1e-6) {
      result.x += (dx / d) * (radius - d + 1e-5);
      result.z += (dz / d) * (radius - d + 1e-5);
      const into = (velocity.x * dx) / d + (velocity.z * dz) / d;
      if (into < 0) {
        velocity.x -= (dx / d) * into;
        velocity.z -= (dz / d) * into;
      }
    } else {
      const edges = [
        { axis: 'x' as const, value: box.position.x - box.size.x / 2 - radius },
        { axis: 'x' as const, value: box.position.x + box.size.x / 2 + radius },
        { axis: 'z' as const, value: box.position.z - box.size.z / 2 - radius },
        { axis: 'z' as const, value: box.position.z + box.size.z / 2 + radius },
      ].sort((a, b) => Math.abs(result[a.axis] - a.value) - Math.abs(result[b.axis] - b.value));
      result[edges[0].axis] = edges[0].value;
      velocity[edges[0].axis] = 0;
    }
  }
  return { position: result, grounded };
}

/** A modest step-up is allowed only with headroom, horizontal clearance, and floor support. */
export function moveBody(
  world: CompiledWorld,
  from: Vec3,
  velocity: Vec3,
  dt: number,
  grounded: boolean,
  boxes: readonly DynamicBox[] = []
) {
  const original = { ...velocity },
    wanted = add(from, scale(velocity, dt));
  const result = resolveBody(world, wanted, velocity, 1.75, 0.3, boxes);
  if (
    !grounded ||
    original.y > 0 ||
    Math.hypot(result.position.x - wanted.x, result.position.z - wanted.z) < 0.002
  )
    return result;
  const raised = add(wanted, v3(0, 0.26, 0)),
    trialVelocity = { ...original, y: 0 };
  const trial = resolveBody(world, raised, trialVelocity, 1.75, 0.3, boxes);
  if (
    trial.position.y < raised.y - 0.01 ||
    Math.hypot(trial.position.x - wanted.x, trial.position.z - wanted.z) > 0.002
  )
    return result;
  const down = rayDistance(world, add(trial.position, v3(0, 0.03, 0)), v3(0, -1, 0), 0.38, boxes);
  if (down >= 0.38) return result;
  trial.position.y += 0.03 - down + 0.001;
  velocity.x = original.x;
  velocity.z = original.z;
  velocity.y = 0;
  return { position: trial.position, grounded: true };
}

function surfaceHeight(s: Solid, x: number, z: number): number | null {
  const angle = -(s.rotation ?? 0),
    dx = x - s.position.x,
    dz = z - s.position.z;
  const lx = dx * Math.cos(angle) + dz * Math.sin(angle);
  const lz = -dx * Math.sin(angle) + dz * Math.cos(angle);
  if (Math.abs(lx) > s.size.x / 2 + 0.02 || Math.abs(lz) > s.size.z / 2 + 0.02) return null;
  return s.kind === 'ramp'
    ? s.position.y + (0.5 - lz / s.size.z) * s.size.y
    : s.position.y + s.size.y / 2;
}

function buildNavigation(shape: WorldShape, world: CompiledWorld): NavNode[] {
  const nodes: NavNode[] = [];
  const supported = (point: Vec3) =>
    [
      [0, 0],
      [0.34, 0],
      [-0.34, 0],
      [0, 0.34],
      [0, -0.34],
    ].every(([dx, dz]) =>
      shape.solids.some((s) => {
        if (!s.walkable) return false;
        const height = surfaceHeight(s, point.x + dx, point.z + dz);
        // Includes the navigation clearance offset and the foot radius at slope transitions.
        return height !== null && Math.abs(point.y - height) < 0.4;
      })
    );
  for (let x = -18; x <= 18; x += 2)
    for (let z = -20; z <= 20; z += 2) {
      const heights = new Set<number>();
      for (const solid of shape.solids) {
        if (!solid.walkable) continue;
        const y = surfaceHeight(solid, x, z);
        if (y === null || heights.has(Math.round(y * 100))) continue;
        heights.add(Math.round(y * 100));
        const point = v3(x, y + 0.08, z);
        // Triangle contact alone cannot detect a capsule completely enclosed by a box.
        const occupied = shape.solids.some(
          (s) =>
            s.kind === 'box' &&
            point.y < s.position.y + s.size.y / 2 - 0.04 &&
            point.y + 1.75 > s.position.y - s.size.y / 2 + 0.04 &&
            Math.abs(x - s.position.x) < s.size.x / 2 + 0.29 &&
            Math.abs(z - s.position.z) < s.size.z / 2 + 0.29
        );
        if (occupied) continue;
        if (!supported(point)) continue;
        const hit = world.tree.capsuleIntersect(makeCapsule(point));
        if (!hit || hit.depth < 0.055) nodes.push({ ...point, id: nodes.length, links: [] });
      }
    }
  const buckets = new Map<string, NavNode[]>();
  for (const node of nodes) {
    const key = `${node.x},${node.z}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(node);
    buckets.set(key, bucket);
  }
  for (const node of nodes)
    for (let dx = -2; dx <= 2; dx += 2)
      for (let dz = -2; dz <= 2; dz += 2) {
        if (!dx && !dz) continue;
        for (const other of buckets.get(`${node.x + dx},${node.z + dz}`) ?? []) {
          if (Math.abs(other.y - node.y) > 1.25) continue;
          if (!visible(world, add(node, v3(0, 0.9, 0)), add(other, v3(0, 0.9, 0)))) continue;
          if (![0.25, 0.5, 0.75].every((t) => supported(add(scale(node, 1 - t), scale(other, t)))))
            continue;
          const horizontal = unit(v3(other.z - node.z, 0, node.x - other.x));
          const clear = [-0.31, 0, 0.31].every((offset) =>
            [0.35, 1.4].every((height) =>
              visible(
                world,
                add(node, add(scale(horizontal, offset), v3(0, height, 0))),
                add(other, add(scale(horizontal, offset), v3(0, height, 0)))
              )
            )
          );
          if (clear) node.links.push(other.id);
        }
      }
  return nodes;
}

export function findWorldPath(
  world: CompiledWorld,
  from: Vec3,
  to: Vec3,
  boxes: readonly DynamicBox[] = []
): Vec3[] {
  const nodes = world.nodes;
  if (!nodes.length) return [];
  const nearest = (p: Vec3) => nodes.reduce((a, b) => (distance(a, p) < distance(b, p) ? a : b)).id;
  const start = nearest(from),
    goal = nearest(to);
  const open = new Set([start]),
    came = new Map<number, number>(),
    cost = new Map([[start, 0]]);
  while (open.size) {
    let current = -1,
      best = Infinity;
    for (const id of open) {
      const f = cost.get(id)! + distance(nodes[id], nodes[goal]);
      if (f < best) {
        best = f;
        current = id;
      }
    }
    if (current === goal) {
      const route: Vec3[] = [to];
      for (let id = goal; id !== start; id = came.get(id)!)
        route.unshift(v3(nodes[id].x, nodes[id].y, nodes[id].z));
      return route;
    }
    open.delete(current);
    for (const id of nodes[current].links) {
      if (
        boxes.length &&
        !visible(world, add(nodes[current], v3(0, 0.9, 0)), add(nodes[id], v3(0, 0.9, 0)), boxes)
      )
        continue;
      const next = cost.get(current)! + distance(nodes[current], nodes[id]);
      if (next >= (cost.get(id) ?? Infinity)) continue;
      cost.set(id, next);
      came.set(id, current);
      open.add(id);
    }
  }
  return [];
}
