/**
 * 1988 NIH Supercomputer CRT Mode Controller.
 */

let isCrtActive = false;
let currentPhosphor: 'amber' | 'green' = 'amber';
let overlayEl: HTMLElement | null = null;
let hudEl: HTMLElement | null = null;

// Mechanical IBM Model M keyboard switch acoustic synthesizer
function playKeyClickSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1200 + Math.random() * 400, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.025);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  } catch {
    // Audio is non-blocking
  }
}

function playCrtPowerSound(isOn: boolean) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (isOn) {
      // CRT flyback transformer high-pitch whine (15.734 kHz subharmonic)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(3500, now);
      osc.frequency.exponentialRampToValueAtTime(8000, now + 0.15);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    } else {
      // Power off collapse
      osc.type = 'sine';
      osc.frequency.setValueAtTime(6000, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.25);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch {
    // Audio is non-blocking
  }
}

function createCrtHud(): HTMLElement {
  const hud = document.createElement('div');
  hud.id = 'crt-hud';
  hud.style.position = 'fixed';
  hud.style.bottom = '24px';
  hud.style.left = '50%';
  hud.style.transform = 'translateX(-50%)';
  hud.style.zIndex = '999999';
  hud.style.display = 'flex';
  hud.style.alignItems = 'center';
  hud.style.gap = '12px';
  hud.style.padding = '8px 18px';
  hud.style.background = 'rgba(0,0,0,0.85)';
  hud.style.border = `1px solid ${currentPhosphor === 'amber' ? '#ffb000' : '#33ff33'}`;
  hud.style.borderRadius = '999px';
  hud.style.boxShadow = `0 0 20px ${currentPhosphor === 'amber' ? 'rgba(255,176,0,0.4)' : 'rgba(51,255,51,0.4)'}`;
  hud.style.fontFamily = 'monospace';
  hud.style.fontSize = '12px';
  hud.style.color = currentPhosphor === 'amber' ? '#ffb000' : '#33ff33';

  const label = document.createElement('span');
  label.id = 'crt-hud-label';
  label.style.fontWeight = 'bold';
  label.textContent = `📺 1988 NIH Alpha VAX · ${currentPhosphor.toUpperCase()} PHOSPHOR`;
  hud.appendChild(label);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.style.background = 'transparent';
  toggleBtn.style.color = 'inherit';
  toggleBtn.style.border = '1px solid currentColor';
  toggleBtn.style.borderRadius = '999px';
  toggleBtn.style.padding = '4px 12px';
  toggleBtn.style.fontWeight = 'bold';
  toggleBtn.style.fontSize = '11px';
  toggleBtn.style.cursor = 'pointer';
  toggleBtn.textContent = 'Switch Phosphor (P)';
  toggleBtn.addEventListener('click', togglePhosphor);
  hud.appendChild(toggleBtn);

  const exitBtn = document.createElement('button');
  exitBtn.type = 'button';
  exitBtn.style.background = 'transparent';
  exitBtn.style.color = 'inherit';
  exitBtn.style.border = '1px solid currentColor';
  exitBtn.style.borderRadius = '999px';
  exitBtn.style.padding = '4px 10px';
  exitBtn.style.fontWeight = 'bold';
  exitBtn.style.fontSize = '11px';
  exitBtn.style.cursor = 'pointer';
  exitBtn.textContent = 'Power Off (ESC)';
  exitBtn.addEventListener('click', stopCrtMode);
  hud.appendChild(exitBtn);

  document.body.appendChild(hud);
  return hud;
}

function onGlobalKeyDown(e: KeyboardEvent) {
  if (!isCrtActive) return;

  if (e.key === 'Escape') {
    stopCrtMode();
    return;
  }

  if (e.key === 'p' || e.key === 'P') {
    if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      togglePhosphor();
      return;
    }
  }

  // Play mechanical keyboard click sound
  playKeyClickSound();
}

export function startCrtMode(phosphor: 'amber' | 'green' = 'amber') {
  if (isCrtActive && currentPhosphor === phosphor) return;

  isCrtActive = true;
  currentPhosphor = phosphor;

  playCrtPowerSound(true);

  document.documentElement.dataset.crtMode = currentPhosphor;

  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.id = 'crt-screen-overlay';
    document.body.appendChild(overlayEl);
  }

  if (hudEl) {
    hudEl.remove();
  }
  hudEl = createCrtHud();

  window.addEventListener('keydown', onGlobalKeyDown);
}

export function togglePhosphor() {
  if (!isCrtActive) {
    startCrtMode('amber');
    return;
  }
  startCrtMode(currentPhosphor === 'amber' ? 'green' : 'amber');
}

export function stopCrtMode() {
  if (!isCrtActive) return;
  isCrtActive = false;

  playCrtPowerSound(false);

  delete document.documentElement.dataset.crtMode;

  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }

  if (hudEl) {
    hudEl.remove();
    hudEl = null;
  }

  window.removeEventListener('keydown', onGlobalKeyDown);
}
