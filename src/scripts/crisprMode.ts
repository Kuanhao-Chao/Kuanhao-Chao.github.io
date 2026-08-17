/**
 * CRISPR-Cas9 Molecular Scissors Easter Egg.
 *
 * Allows visitors to target and cleave DOM elements using a Cas9-gRNA molecular cursor,
 * featuring realistic Web Audio synthesized shears, double-strand break (DSB) staggered
 * fragment physics, PAM sequence overlays, and an animated DNA ligase repair mechanism.
 */

let isCrisprActive = false;
let cutCount = 0;
const cutElements = new Map<HTMLElement, { originalTransform: string; originalTransition: string; originalClip: string; parent: HTMLElement }>();
let hudEl: HTMLElement | null = null;
let hoverTarget: HTMLElement | null = null;
let targetOverlay: HTMLElement | null = null;

// Dual-tone Web Audio acoustic scissor snip sound
function playCrisprSnipSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;

    // High frequency mechanical transient
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(3200, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);

    oscGain.gain.setValueAtTime(0.2, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);

    // Filtered noise burst for acoustic snip texture
    const bufferSize = ctx.sampleRate * 0.035;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.Q.setValueAtTime(3, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.18, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.04);
  } catch {
    // Audio is non-blocking
  }
}

function playLigaseChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const notes = [440, 554.37, 659.25, 880]; // A Major ligase reconnection chime
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);

      gain.gain.setValueAtTime(0.001, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.05 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.05 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.4);
    });
  } catch {
    // Audio is non-blocking
  }
}

function createTargetOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = 'crispr-target-overlay';
  overlay.style.position = 'fixed';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '999990';
  overlay.style.border = '1.5px dashed var(--color-accent, #2e6e5e)';
  overlay.style.borderRadius = '6px';
  overlay.style.transition = 'all 0.08s ease-out';
  overlay.style.display = 'none';
  overlay.style.boxShadow = '0 0 12px color-mix(in srgb, var(--color-accent, #2e6e5e) 40%, transparent)';

  const tag = document.createElement('div');
  tag.id = 'crispr-pam-tag';
  tag.style.position = 'absolute';
  tag.style.top = '-20px';
  tag.style.right = '0';
  tag.style.background = 'var(--color-accent, #2e6e5e)';
  tag.style.color = '#ffffff';
  tag.style.fontFamily = 'monospace';
  tag.style.fontSize = '10px';
  tag.style.fontWeight = 'bold';
  tag.style.padding = '2px 6px';
  tag.style.borderRadius = '3px';
  tag.style.whiteSpace = 'nowrap';
  tag.textContent = 'PAM: NGG · ✂️ Click to Cleave';
  overlay.appendChild(tag);

  document.body.appendChild(overlay);
  return overlay;
}

function createHud(): HTMLElement {
  const hud = document.createElement('div');
  hud.id = 'crispr-hud';
  hud.style.position = 'fixed';
  hud.style.bottom = '24px';
  hud.style.left = '50%';
  hud.style.transform = 'translateX(-50%)';
  hud.style.zIndex = '999995';
  hud.style.display = 'flex';
  hud.style.alignItems = 'center';
  hud.style.gap = '10px';
  hud.style.padding = '8px 16px';
  hud.style.background = 'color-mix(in srgb, var(--color-surface, #f2f2ee) 92%, #000 8%)';
  hud.style.border = '1px solid var(--color-rule, rgba(0,0,0,0.15))';
  hud.style.borderRadius = '999px';
  hud.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
  hud.style.backdropFilter = 'blur(10px)';
  hud.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  hud.style.fontSize = '13px';
  hud.style.color = 'var(--color-ink, #202020)';

  const countBadge = document.createElement('span');
  countBadge.id = 'crispr-count-badge';
  countBadge.style.fontWeight = '600';
  countBadge.style.color = 'var(--color-accent, #2e6e5e)';
  countBadge.textContent = '✂️ CRISPR Cas9 Active (0 DSBs)';
  hud.appendChild(countBadge);

  const ligaseBtn = document.createElement('button');
  ligaseBtn.type = 'button';
  ligaseBtn.style.background = 'var(--color-accent, #2e6e5e)';
  ligaseBtn.style.color = '#ffffff';
  ligaseBtn.style.border = 'none';
  ligaseBtn.style.borderRadius = '999px';
  ligaseBtn.style.padding = '4px 12px';
  ligaseBtn.style.fontWeight = '600';
  ligaseBtn.style.fontSize = '12px';
  ligaseBtn.style.cursor = 'pointer';
  ligaseBtn.textContent = '🧬 Ligase Repair All';
  ligaseBtn.addEventListener('click', repairAllCuts);
  hud.appendChild(ligaseBtn);

  const exitBtn = document.createElement('button');
  exitBtn.type = 'button';
  exitBtn.style.background = 'transparent';
  exitBtn.style.border = '1px solid var(--color-rule, rgba(0,0,0,0.2))';
  exitBtn.style.color = 'var(--color-muted, #707070)';
  exitBtn.style.borderRadius = '999px';
  exitBtn.style.padding = '4px 8px';
  exitBtn.style.fontSize = '12px';
  exitBtn.style.cursor = 'pointer';
  exitBtn.textContent = '✕ Exit (ESC)';
  exitBtn.addEventListener('click', stopCrisprMode);
  hud.appendChild(exitBtn);

  document.body.appendChild(hud);
  return hud;
}

function onMouseMove(e: MouseEvent) {
  if (!isCrisprActive) return;

  const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
  if (!target || target.closest('#crispr-hud') || target.closest('#crispr-target-overlay') || target === document.body || target === document.documentElement) {
    if (targetOverlay) targetOverlay.style.display = 'none';
    hoverTarget = null;
    return;
  }

  // Find nearest meaningful block element
  const cuttable = target.closest<HTMLElement>('p, h1, h2, h3, h4, li, a, img, .card, .home-algo, .home-tool, .home-news-card, button');
  if (cuttable && !cutElements.has(cuttable)) {
    hoverTarget = cuttable;
    const rect = cuttable.getBoundingClientRect();
    if (targetOverlay) {
      targetOverlay.style.display = 'block';
      targetOverlay.style.top = `${rect.top}px`;
      targetOverlay.style.left = `${rect.left}px`;
      targetOverlay.style.width = `${rect.width}px`;
      targetOverlay.style.height = `${rect.height}px`;
    }
  } else {
    if (targetOverlay) targetOverlay.style.display = 'none';
    hoverTarget = null;
  }
}

function onClick(e: MouseEvent) {
  if (!isCrisprActive || !hoverTarget) return;

  const el = hoverTarget;
  if (el.closest('#crispr-hud') || cutElements.has(el)) return;

  e.preventDefault();
  e.stopPropagation();

  cutCount += 1;
  playCrisprSnipSound();

  // Save original styles
  cutElements.set(el, {
    originalTransform: el.style.transform,
    originalTransition: el.style.transition,
    originalClip: el.style.clipPath,
    parent: el.parentElement as HTMLElement,
  });

  const rot = (Math.random() * 6 - 3).toFixed(1);
  const shiftY = (Math.random() * 8 + 4).toFixed(1);
  const shiftX = (Math.random() * 6 - 3).toFixed(1);

  el.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), clip-path 0.4s ease';
  el.style.clipPath = 'polygon(0 0, 100% 0, 100% 48%, 0 52%)';
  el.style.transform = `translate(${shiftX}px, ${shiftY}px) rotate(${rot}deg)`;
  el.style.filter = 'drop-shadow(0 4px 12px rgba(46,110,94,0.3))';

  // Update HUD
  const countBadge = document.getElementById('crispr-count-badge');
  if (countBadge) {
    countBadge.textContent = `✂️ CRISPR Cas9 Active (${cutCount} DSBs Cleaved)`;
  }

  if (targetOverlay) targetOverlay.style.display = 'none';
  hoverTarget = null;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isCrisprActive) {
    stopCrisprMode();
  }
}

export function startCrisprMode() {
  if (isCrisprActive) return;
  isCrisprActive = true;
  cutCount = 0;

  document.body.classList.add('crispr-mode-active');
  targetOverlay = createTargetOverlay();
  hudEl = createHud();

  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKeyDown);
}

export function repairAllCuts() {
  if (cutElements.size === 0) return;

  playLigaseChime();

  cutElements.forEach((orig, el) => {
    // Flash phosphodiester reconnection
    el.style.transition = 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
    el.style.clipPath = orig.originalClip || 'none';
    el.style.transform = orig.originalTransform || 'none';
    el.style.filter = 'drop-shadow(0 0 16px var(--color-accent, #2e6e5e))';

    setTimeout(() => {
      el.style.transition = orig.originalTransition;
      el.style.filter = 'none';
    }, 550);
  });

  cutElements.clear();
  cutCount = 0;

  const countBadge = document.getElementById('crispr-count-badge');
  if (countBadge) {
    countBadge.textContent = '🧬 Genome Re-ligated (0 cuts)';
  }
}

export function stopCrisprMode() {
  if (!isCrisprActive) return;
  isCrisprActive = false;

  repairAllCuts();

  document.body.classList.remove('crispr-mode-active');
  if (targetOverlay) {
    targetOverlay.remove();
    targetOverlay = null;
  }
  if (hudEl) {
    hudEl.remove();
    hudEl = null;
  }

  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('click', onClick, true);
  window.removeEventListener('keydown', onKeyDown);
}
