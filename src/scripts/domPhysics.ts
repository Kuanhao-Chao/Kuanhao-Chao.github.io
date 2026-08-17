/**
 * Zero-Gravity DOM Physics Sandbox Easter Egg.
 *
 * Detaches visible cards, headings, and tags into a 2D rigid-body Verlet physics
 * simulation with momentum, drag-and-throw inertia, collision elasticity,
 * gravitational singularity pull, and seamless spring-return grid restoration.
 */

interface PhysicsBody {
  el: HTMLElement;
  origLeft: number;
  origTop: number;
  origTransform: string;
  origPosition: string;
  origZIndex: string;
  origWidth: number;
  origHeight: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  vAngle: number;
  mass: number;
  width: number;
  height: number;
  isDragging: boolean;
}

let isZeroGActive = false;
let animFrameId: number | null = null;
let bodies: PhysicsBody[] = [];
let hudEl: HTMLElement | null = null;
let isMouseDown = false;
let mouseX = 0;
let mouseY = 0;
let draggedBody: PhysicsBody | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let lastDragX = 0;
let lastDragY = 0;
let lastDragTime = 0;

function createZeroGHud(): HTMLElement {
  const hud = document.createElement('div');
  hud.id = 'zerog-hud';
  hud.style.position = 'fixed';
  hud.style.bottom = '24px';
  hud.style.left = '50%';
  hud.style.transform = 'translateX(-50%)';
  hud.style.zIndex = '999999';
  hud.style.display = 'flex';
  hud.style.alignItems = 'center';
  hud.style.gap = '12px';
  hud.style.padding = '8px 18px';
  hud.style.background = 'color-mix(in srgb, var(--color-surface, #f2f2ee) 90%, #000 10%)';
  hud.style.border = '1px solid var(--color-rule, rgba(0,0,0,0.15))';
  hud.style.borderRadius = '999px';
  hud.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
  hud.style.backdropFilter = 'blur(10px)';
  hud.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  hud.style.fontSize = '13px';
  hud.style.color = 'var(--color-ink, #202020)';

  const label = document.createElement('span');
  label.style.fontWeight = '600';
  label.style.color = 'var(--color-accent, #2e6e5e)';
  label.textContent = '🌌 Zero-Gravity Physics Active · Drag or Throw Anything!';
  hud.appendChild(label);

  const restoreBtn = document.createElement('button');
  restoreBtn.type = 'button';
  restoreBtn.style.background = 'var(--color-accent, #2e6e5e)';
  restoreBtn.style.color = '#ffffff';
  restoreBtn.style.border = 'none';
  restoreBtn.style.borderRadius = '999px';
  restoreBtn.style.padding = '5px 14px';
  restoreBtn.style.fontWeight = '600';
  restoreBtn.style.fontSize = '12px';
  restoreBtn.style.cursor = 'pointer';
  restoreBtn.textContent = '🧲 Restore Gravity (ESC)';
  restoreBtn.addEventListener('click', stopZeroGravity);
  hud.appendChild(restoreBtn);

  document.body.appendChild(hud);
  return hud;
}

function physicsLoop() {
  if (!isZeroGActive) return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const restitution = 0.78; // bounce damping
  const airResistance = 0.992;

  for (const b of bodies) {
    if (b.isDragging) continue;

    // Singularity pull toward mouse if held down on empty space
    if (isMouseDown && !draggedBody) {
      const dx = mouseX - (b.x + b.width / 2);
      const dy = mouseY - (b.y + b.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const force = Math.min(2.5, 600 / (dist + 50));
      b.vx += (dx / dist) * force;
      b.vy += (dy / dist) * force;
    }

    // Apply velocities
    b.x += b.vx;
    b.y += b.vy;
    b.angle += b.vAngle;

    // Apply damping
    b.vx *= airResistance;
    b.vy *= airResistance;
    b.vAngle *= 0.985;

    // Wall bounce
    if (b.x < 0) {
      b.x = 0;
      b.vx = -b.vx * restitution;
      b.vAngle += (Math.random() * 0.04 - 0.02);
    } else if (b.x + b.width > w) {
      b.x = w - b.width;
      b.vx = -b.vx * restitution;
      b.vAngle += (Math.random() * 0.04 - 0.02);
    }

    if (b.y < 0) {
      b.y = 0;
      b.vy = -b.vy * restitution;
      b.vAngle += (Math.random() * 0.04 - 0.02);
    } else if (b.y + b.height > h) {
      b.y = h - b.height;
      b.vy = -b.vy * restitution;
      b.vAngle += (Math.random() * 0.04 - 0.02);
    }

    // Apply transform
    b.el.style.transform = `translate(${b.x - b.origLeft}px, ${b.y - b.origTop}px) rotate(${b.angle}rad)`;
  }

  animFrameId = requestAnimationFrame(physicsLoop);
}

function onPointerDown(e: PointerEvent) {
  if (!isZeroGActive) return;
  if ((e.target as HTMLElement | null)?.closest('#zerog-hud')) return;

  isMouseDown = true;
  mouseX = e.clientX;
  mouseY = e.clientY;

  // Check if an element was clicked
  const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('.card, .home-algo, .home-tool, .home-news-card, h1, h2, .algo-card, .btn');
  if (target) {
    const body = bodies.find((b) => b.el === target);
    if (body) {
      draggedBody = body;
      body.isDragging = true;
      dragOffsetX = e.clientX - body.x;
      dragOffsetY = e.clientY - body.y;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
      lastDragTime = performance.now();
      body.el.style.zIndex = '999990';
    }
  }
}

function onPointerMove(e: PointerEvent) {
  if (!isZeroGActive) return;
  mouseX = e.clientX;
  mouseY = e.clientY;

  if (draggedBody) {
    draggedBody.x = e.clientX - dragOffsetX;
    draggedBody.y = e.clientY - dragOffsetY;
    draggedBody.el.style.transform = `translate(${draggedBody.x - draggedBody.origLeft}px, ${draggedBody.y - draggedBody.origTop}px) rotate(${draggedBody.angle}rad)`;

    const now = performance.now();
    const dt = Math.max(1, now - lastDragTime);
    draggedBody.vx = (e.clientX - lastDragX) / (dt * 0.06);
    draggedBody.vy = (e.clientY - lastDragY) / (dt * 0.06);
    lastDragX = e.clientX;
    lastDragY = e.clientY;
    lastDragTime = now;
  }
}

function onPointerUp() {
  if (!isZeroGActive) return;
  isMouseDown = false;

  if (draggedBody) {
    draggedBody.isDragging = false;
    draggedBody.vAngle = (Math.random() * 0.08 - 0.04);
    draggedBody.el.style.zIndex = draggedBody.origZIndex;
    draggedBody = null;
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isZeroGActive) {
    stopZeroGravity();
  }
}

export function startZeroGravity() {
  if (isZeroGActive) return;
  isZeroGActive = true;

  hudEl = createZeroGHud();

  // Collect key elements
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    '.card, .home-algo, .home-tool, .home-news-card, h1, h2, .algo-card, .btn, .wordmark, .tag, .avatar'
  ));

  bodies = [];

  candidates.forEach((el) => {
    if (el.closest('#zerog-hud') || el.closest('#command-palette-dialog')) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight) return;

    const body: PhysicsBody = {
      el,
      origLeft: rect.left,
      origTop: rect.top,
      origTransform: el.style.transform,
      origPosition: el.style.position,
      origZIndex: el.style.zIndex,
      origWidth: rect.width,
      origHeight: rect.height,
      x: rect.left,
      y: rect.top,
      vx: (Math.random() * 3 - 1.5),
      vy: (Math.random() * 3 - 1.5),
      angle: 0,
      vAngle: (Math.random() * 0.03 - 0.015),
      mass: Math.sqrt(rect.width * rect.height) / 10,
      width: rect.width,
      height: rect.height,
      isDragging: false,
    };

    el.style.transition = 'none';
    el.style.boxShadow = '0 12px 32px rgba(0,0,0,0.18)';
    bodies.push(body);
  });

  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);

  animFrameId = requestAnimationFrame(physicsLoop);
}

export function stopZeroGravity() {
  if (!isZeroGActive) return;
  isZeroGActive = false;

  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // Smooth spring return to original layout
  bodies.forEach((b) => {
    b.el.style.transition = 'transform 0.65s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.5s ease';
    b.el.style.transform = b.origTransform || 'none';
    b.el.style.boxShadow = 'none';

    setTimeout(() => {
      b.el.style.transition = '';
      b.el.style.position = b.origPosition;
      b.el.style.zIndex = b.origZIndex;
      b.el.style.transform = b.origTransform;
    }, 700);
  });

  bodies = [];
  draggedBody = null;

  if (hudEl) {
    hudEl.remove();
    hudEl = null;
  }

  window.removeEventListener('pointerdown', onPointerDown);
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('keydown', onKeyDown);
}
