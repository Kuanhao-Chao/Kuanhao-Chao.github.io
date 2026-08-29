/**
 * The network as volume: every stage a slab whose face is its real positions x channels, laid out
 * along a depth axis so the U-Net's contraction and re-expansion is something you can see round.
 *
 * The layout is pure and tested (`flowSlabs` in src/lib/shorkieModel.ts); this file only turns it
 * into geometry. That is the same split `/chromatin/` uses, and the reason its index arithmetic
 * could be tested without a GL context.
 *
 * Four things `/chromatin/` learned the hard way and this follows rather than rediscovers:
 *   - lighting is set from the measured background luminance, because the site ships six themes and
 *     hardcoding a light and a dark rig leaves four wrong;
 *   - a persisted element must be re-acquired, so mounting is idempotent and disposal is complete;
 *   - reduced motion means no idle rotation at all, not a slower one;
 *   - `setColorAt` multiplies into the material colour, so anything tinted per instance needs a
 *     white material. Nothing here uses instancing, but the same trap applies to the slab tint.
 */

import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  Vector3,
  Box3,
  WebGLRenderer,
  type Texture,
} from 'three';
import { flowSlabs, type FlowSlab } from '../lib/shorkieModel';
import { prefersReducedMotion } from './motion';

export interface Flow3dController {
  /** Whether the idle rotation is still running; false once the reader has taken the wheel. */
  spinning(): boolean;
  /** Hand rotation back to the idle animation after a drag has stopped it. */
  resumeSpin(): void;
  /** Paint a stage's face from its activation map. */
  setFace(id: string, rgba: Uint8ClampedArray, width: number, height: number): void;
  /** Highlight the stages carrying a traced region; pass null to clear. */
  setTrace(weights: Map<string, number> | null): void;
  select(id: string | null): void;
  onSelect(fn: (id: string | null) => void): void;
  /** Told when the idle rotation stops or restarts, so the page can offer to resume it. */
  onSpinChange(fn: (on: boolean) => void): void;
  resize(): void;
  destroy(): void;
}

const SLABS = flowSlabs();

/** Perceived luminance of the canvas background, for choosing the light rig. */
function backgroundLuminance(el: HTMLElement): number {
  let node: HTMLElement | null = el;
  while (node) {
    const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(node).backgroundColor);
    if (m) {
      const [r, g, b, a] = m[1].split(',').map((v) => Number.parseFloat(v));
      if (a === undefined || a > 0.5) return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }
    node = node.parentElement;
  }
  return 1;
}

export function createFlow3d(canvas: HTMLCanvasElement, host: HTMLElement): Flow3dController {
  const scene = new Scene();
  // Orthographic, deliberately. The whole claim of this view is that a slab's size IS the tensor's
  // shape -- so a perspective camera would make a far slab small for a reason that has nothing to
  // do with its channel count, which is the same lie a bar chart tells from a non-zero baseline.
  // Depth still reads, from the diagonal layout and the shading.
  const camera = new OrthographicCamera(-1, 1, 1, -1, -200, 400);
  const gl = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const root = new Group();
  scene.add(root);
  const ambient = new AmbientLight(0xffffff, 1);
  const key = new DirectionalLight(0xffffff, 1);
  key.position.set(2, 3, 4);
  scene.add(ambient, key);

  const css = (name: string, fallback: string) =>
    getComputedStyle(host).getPropertyValue(name).trim() || fallback;
  const groupColour = (): Record<string, string> => ({
    encoder: css('--vp-accent', '#3976a8'),
    bottleneck: css('--vp-orf', '#6f62a8'),
    decoder: css('--vp-track', '#2f8069'),
  });

  const DEPTH = 13;
  // The slabs are at most 1 unit across the face and 13 long, which reads as a thin ribbon. Scaling
  // the face up is what makes the U-Net waist legible as volume rather than as a row of dashes.
  const FACE = 2.8;
  const meshes = new Map<string, {
    mesh: Mesh; slab: FlowSlab; face: MeshStandardMaterial; edge: MeshStandardMaterial; texture: Texture | null;
  }>();
  const geometry = new BoxGeometry(1, 1, 1);

  for (const slab of SLABS) {
    // A white face material: the activation texture multiplies into it, so a coloured one would
    // tint the data a second time. The four thin edges take the group colour instead -- painting
    // the face is what loses encoder / bottleneck / decoder, and the rim is where it can live
    // without competing with the signal.
    const face = new MeshStandardMaterial({
      color: 0xffffff, roughness: 0.78, metalness: 0.0, transparent: true, opacity: 1,
    });
    const edge = new MeshStandardMaterial({
      color: 0xffffff, roughness: 0.6, metalness: 0.0, transparent: true, opacity: 1,
    });
    // BoxGeometry's six groups are +X, -X, +Y, -Y, +Z, -Z, and the box is thin in X -- so groups
    // 0 and 1 are the large positions x channels faces and the rest are the rim.
    const mesh = new Mesh(geometry, [face, face, edge, edge, edge, edge]);
    mesh.scale.set(slab.thickness * DEPTH * 0.6, slab.height * FACE, slab.width * FACE);
    mesh.position.set((slab.z - 0.5) * DEPTH, 0, 0);
    mesh.userData.id = slab.id;
    root.add(mesh);
    meshes.set(slab.id, { mesh, slab, face, edge, texture: null });
  }

  let selected: string | null = null;
  let selectFn: ((id: string | null) => void) | null = null;
  let spinFn: ((on: boolean) => void) | null = null;
  let raf = 0;
  let spin = 0;
  let dragging = false;
  let yaw = -0.55;
  let pitch = 0.28;
  let lastX = 0;
  let lastY = 0;
  // Auto-rotation is the default, and the first drag ends it. Continuing to advance `spin` under
  // the pointer means the model keeps turning while it is being aimed, so it never settles where
  // the reader put it -- the drag and the idle animation fight for the same axis.
  let userTookOver = false;

  function applyTheme(): void {
    const lum = backgroundLuminance(canvas.parentElement ?? host);
    // Measured, not guessed: a dark theme needs more ambient and a softer key or the slabs read as
    // silhouettes; a light one needs the opposite.
    ambient.intensity = lum > 0.5 ? 0.62 : 0.92;
    key.intensity = lum > 0.5 ? 0.72 : 0.5;
    const colours = groupColour();
    for (const { slab, face, edge, texture } of meshes.values()) {
      const tint = new Color(colours[slab.group]);
      // Before a locus is loaded there is nothing to draw on the face, so it takes the group
      // colour outright rather than rendering as a blank white card.
      face.color = texture ? new Color(0xffffff) : tint.clone();
      edge.color = tint;
      face.needsUpdate = true;
      edge.needsUpdate = true;
    }
  }

  function layout(): void {
    const w = canvas.clientWidth || 900;
    const h = Math.max(260, Math.min(420, Math.round(w * 0.34)));
    canvas.style.height = `${h}px`;
    gl.setSize(w, h, false);
    camera.userData.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // Reused across frames: allocating four vectors sixty times a second is pure garbage.
  const fitBox = new Box3();
  const fitSize = new Vector3();
  const fitCentre = new Vector3();
  const viewDir = new Vector3(0.26, 0.30, 1).normalize();
  const corner = new Vector3();

  function frame(): void {
    root.rotation.y = yaw + spin;
    root.rotation.x = pitch;
    // Fit the camera to what is actually on screen this frame. A fixed distance cannot work: the
    // row idles through a full rotation, so its projected width swings between DEPTH and almost
    // nothing, and any constant chosen for one yaw runs the far end off the edge at another.
    root.updateMatrixWorld(true);
    fitBox.setFromObject(root);
    fitBox.getCenter(fitCentre);
    fitBox.getSize(fitSize);
    camera.position.copy(fitCentre).addScaledVector(viewDir, fitSize.length() + 20);
    camera.lookAt(fitCentre);
    camera.updateMatrixWorld(true);

    // Fit exactly, in camera space, over every slab's own eight corners -- not the scene bounding
    // box's, whose corners sit outside the object and would leave the row floating in margin.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const { mesh } of meshes.values()) {
      for (let i = 0; i < 8; i += 1) {
        corner
          .set(i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5)
          .applyMatrix4(mesh.matrixWorld)
          .applyMatrix4(camera.matrixWorldInverse);
        if (corner.x < minX) minX = corner.x;
        if (corner.x > maxX) maxX = corner.x;
        if (corner.y < minY) minY = corner.y;
        if (corner.y > maxY) maxY = corner.y;
      }
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    let hw = Math.max((maxX - minX) / 2, 1e-3) * 1.04;
    let hh = Math.max((maxY - minY) / 2, 1e-3) * 1.08;
    // Grow whichever half-extent is the slack one, so the content is never squashed to the canvas
    // aspect -- an anisotropic scale here would distort the shapes the view exists to report.
    if (hw / hh < camera.userData.aspect) hw = hh * camera.userData.aspect;
    else hh = hw / camera.userData.aspect;
    camera.left = cx - hw;
    camera.right = cx + hw;
    camera.top = cy + hh;
    camera.bottom = cy - hh;
    camera.updateProjectionMatrix();
    gl.render(scene, camera);
  }

  function tick(): void {
    if (!prefersReducedMotion() && !userTookOver) spin += 0.0016;
    frame();
    raf = requestAnimationFrame(tick);
  }

  const onPointerDown = (ev: PointerEvent) => {
    dragging = true;
    lastX = ev.clientX;
    lastY = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: PointerEvent) => {
    if (!dragging) return;
    if (!userTookOver) {
      // Fold the idle rotation into `yaw` before latching, so the model does not jump back to
      // where the animation started the moment the reader grabs it.
      yaw += spin;
      spin = 0;
      userTookOver = true;
      spinFn?.(false);
    }
    yaw += (ev.clientX - lastX) * 0.006;
    pitch = Math.max(-0.9, Math.min(0.9, pitch + (ev.clientY - lastY) * 0.004));
    lastX = ev.clientX;
    lastY = ev.clientY;
    frame();
  };
  const onPointerUp = (ev: PointerEvent) => {
    if (dragging && Math.abs(ev.clientX - lastX) < 3) {
      // A click, not a drag: pick the slab nearest the pointer along the depth axis. A real ray
      // cast would be exact, but the slabs are ordered and evenly spaced, so this is enough and
      // cannot return null the way a strict hit test can.
      const box = canvas.getBoundingClientRect();
      const frac = (ev.clientX - box.left) / box.width;
      const i = Math.min(SLABS.length - 1, Math.max(0, Math.round(frac * (SLABS.length - 1))));
      selected = SLABS[i].id;
      selectFn?.(selected);
    }
    dragging = false;
  };
  const onResize = () => {
    layout();
    frame();
  };
  const onTheme = () => {
    applyTheme();
    frame();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  window.addEventListener('resize', onResize);
  document.addEventListener('khc:theme-change', onTheme);

  layout();
  applyTheme();
  raf = requestAnimationFrame(tick);

  return {
    setFace(id, rgba, width, height) {
      const entry = meshes.get(id);
      if (!entry) return;
      const cv = document.createElement('canvas');
      cv.width = width;
      cv.height = height;
      const cx = cv.getContext('2d');
      if (!cx) return;
      const img = cx.createImageData(width, height);
      img.data.set(rgba);
      cx.putImageData(img, 0, 0);
      entry.texture?.dispose();
      const tex = new CanvasTexture(cv);
      entry.texture = tex;
      entry.face.map = tex;
      entry.face.color = new Color(0xffffff);   // the texture carries the colour; do not tint twice
      entry.face.needsUpdate = true;
      frame();
    },
    setTrace(weights) {
      for (const [id, { face, edge }] of meshes) {
        const w = weights?.get(id);
        // A stage with no entry is a stage with no relevance DATA, which is not the same as a
        // stage with no relevance -- leave it undimmed rather than at the floor.
        const o = !weights || w === undefined ? 1 : 0.2 + 0.8 * w;
        face.opacity = o;
        edge.opacity = o;
      }
      frame();
    },
    select(id) {
      selected = id;
      for (const [sid, { mesh }] of meshes) {
        mesh.scale.x = SLABS.find((s) => s.id === sid)!.thickness * DEPTH * (sid === id ? 2.2 : 0.6);
      }
      frame();
    },
    onSelect(fn) {
      selectFn = fn;
    },
    spinning() {
      return !userTookOver && !prefersReducedMotion();
    },
    resumeSpin() {
      userTookOver = false;
      spinFn?.(true);
      frame();
    },
    onSpinChange(fn: (on: boolean) => void) {
      spinFn = fn;
    },
    resize: onResize,
    destroy() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('khc:theme-change', onTheme);
      for (const { face, edge, texture } of meshes.values()) {
        texture?.dispose();
        face.dispose();
        edge.dispose();
      }
      geometry.dispose();
      meshes.clear();
      // Release the GL context; without this a client-side navigation leaks one per visit.
      gl.dispose();
      gl.forceContextLoss();
    },
  };
}

export { SLABS as FLOW_SLABS };
