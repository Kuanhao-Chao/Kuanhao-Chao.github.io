/**
 * Matrix DNA Rain Easter Egg.
 *
 * Easy and intuitive activation methods:
 * 1. Type "dna", "matrix", "rain", or "helix" anywhere on the page!
 * 2. Classic Konami Code: ↑ ↑ ↓ ↓ ← → ← → B A
 * 3. Click the 🧬 button in the footer or command palette
 * 4. Run `matrix`, `rain`, or `dna` in /terminal
 * 5. Dispatch 'khc:start-dna-rain' custom event
 */

const KONAMI_CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

const KEYWORD_TRIGGERS = ['dna', 'matrix', 'rain', 'helix'];
const DNA_CHARS = ['A', 'C', 'G', 'T', 'U', "5'", "3'", '·', ':', 'AT', 'CG', 'GC', 'TA'];

let isRainActive = false;
let animFrameId: number | null = null;
let konamiSequence: string[] = [];
let charBuffer: string[] = [];
let canvasEl: HTMLCanvasElement | null = null;

function playRetroChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5]; // C major pentatonic
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.06 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.3);
    });
  } catch {
    // Web audio playback is optional
  }
}

export function startDnaRain() {
  if (isRainActive) return;
  isRainActive = true;
  playRetroChime();

  const canvas = document.createElement('canvas');
  canvas.id = 'dna-rain-canvas';
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.zIndex = '999999';
  canvas.style.pointerEvents = 'auto';
  canvas.style.cursor = 'pointer';
  canvas.style.transition = 'opacity 0.35s ease';
  canvas.style.opacity = '0';
  document.body.appendChild(canvas);
  canvasEl = canvas;

  const hint = document.createElement('div');
  hint.id = 'dna-rain-hint';
  hint.textContent = '🧬 DNA MATRIX RAIN • Click or press ESC to exit';
  hint.style.position = 'fixed';
  hint.style.bottom = '1.5rem';
  hint.style.left = '50%';
  hint.style.transform = 'translateX(-50%)';
  hint.style.zIndex = '1000000';
  hint.style.padding = '0.5rem 1rem';
  hint.style.background = 'rgba(0, 20, 15, 0.85)';
  hint.style.border = '1px solid #10b981';
  hint.style.borderRadius = '999px';
  hint.style.color = '#6ee7b7';
  hint.style.fontFamily = 'monospace';
  hint.style.fontSize = '0.85rem';
  hint.style.letterSpacing = '0.05em';
  hint.style.pointerEvents = 'none';
  hint.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.35)';
  document.body.appendChild(hint);

  requestAnimationFrame(() => {
    canvas.style.opacity = '1';
  });

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  const fontSize = 16;
  let columns = Math.floor(width / fontSize);
  let drops: number[] = Array.from({ length: columns }, () => Math.floor(Math.random() * -50));

  function handleResize() {
    if (!canvas) return;
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    columns = Math.floor(width / fontSize);
    drops = Array.from({ length: columns }, () => Math.floor(Math.random() * -50));
  }

  window.addEventListener('resize', handleResize);

  function draw() {
    if (!ctx) return;
    ctx.fillStyle = 'rgba(8, 14, 12, 0.08)';
    ctx.fillRect(0, 0, width, height);

    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    for (let i = 0; i < drops.length; i++) {
      const char = DNA_CHARS[Math.floor(Math.random() * DNA_CHARS.length)];
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      // Leading head character glows bright white / cyan
      if (Math.random() > 0.85) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#6ee7b7';
        ctx.shadowBlur = 10;
      } else {
        ctx.fillStyle = '#10b981';
        ctx.shadowColor = '#059669';
        ctx.shadowBlur = 4;
      }

      ctx.fillText(char, x, y);
      ctx.shadowBlur = 0; // reset shadow for performance

      if (y > height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }

    if (isRainActive) {
      animFrameId = requestAnimationFrame(draw);
    }
  }

  draw();

  function exitRain() {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('keydown', onKeyDown);
    canvas.removeEventListener('click', exitRain);

    canvas.style.opacity = '0';
    if (hint.parentNode) hint.parentNode.removeChild(hint);

    setTimeout(() => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      canvasEl = null;
      isRainActive = false;
    }, 350);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      exitRain();
    }
  }

  canvas.addEventListener('click', exitRain);
  window.addEventListener('keydown', onKeyDown);
}

export function initKonamiListener() {
  if (typeof window === 'undefined') return;

  function onGlobalKeyDown(e: KeyboardEvent) {
    // Ignore if typing in text inputs or textareas or dialogs
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('dialog[open]'))
    ) {
      return;
    }

    // 1. Check quick keyword matching (e.g. typing "dna" or "matrix" or "rain")
    if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
      charBuffer.push(e.key.toLowerCase());
      if (charBuffer.length > 20) charBuffer.shift();

      const typed = charBuffer.join('');
      for (const trigger of KEYWORD_TRIGGERS) {
        if (typed.endsWith(trigger)) {
          charBuffer = [];
          konamiSequence = [];
          startDnaRain();
          return;
        }
      }
    }

    // 2. Check classic Konami code sequence
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const expectedKey = KONAMI_CODE[konamiSequence.length];

    if (key === expectedKey || (expectedKey.length === 1 && key === expectedKey.toLowerCase())) {
      konamiSequence.push(expectedKey);
      if (konamiSequence.length === KONAMI_CODE.length) {
        konamiSequence = [];
        charBuffer = [];
        startDnaRain();
      }
    } else {
      konamiSequence = key === KONAMI_CODE[0] ? [KONAMI_CODE[0]] : [];
    }
  }

  // 3. Listen for clicks on any element with [data-trigger-dna-rain]
  function onGlobalClick(e: MouseEvent) {
    const trigger = (e.target as HTMLElement | null)?.closest('[data-trigger-dna-rain]');
    if (trigger) {
      startDnaRain();
    }
  }

  // 4. Listen for custom event 'khc:start-dna-rain'
  function onCustomEvent() {
    startDnaRain();
  }

  window.addEventListener('keydown', onGlobalKeyDown);
  document.addEventListener('click', onGlobalClick);
  window.addEventListener('khc:start-dna-rain', onCustomEvent);

  return () => {
    window.removeEventListener('keydown', onGlobalKeyDown);
    document.removeEventListener('click', onGlobalClick);
    window.removeEventListener('khc:start-dna-rain', onCustomEvent);
  };
}
