import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/responsive.css';
import './styles/systems.css';
import './styles/backdrop.css';
import './styles/world.css';

import { initTypewriter } from './ui/typewriter.js';
import { initClock } from './ui/clock.js';
import { initReveal } from './ui/reveal.js';
import { initTerminal, pinTerminal } from './ui/terminal.js';
import { initScroll, switchToDocumentMode, goToStation } from './ui/scroll.js';
import { initRail } from './ui/rail.js';
import { initFallback } from './ui/fallback.js';
import { detectTier, prefersReducedMotion, supportsWorldLayout } from './three/quality.js';

const root = document.documentElement;
const backdrop = document.getElementById('backdrop');

let experience = null;
let unbindRail = null;
let fallbackStarted = false;

function makeCanvas(id) {
  const canvas = document.createElement('canvas');
  canvas.id = id;
  canvas.setAttribute('aria-hidden', 'true');
  backdrop.appendChild(canvas);
  return canvas;
}

function reveal() {
  requestAnimationFrame(() => backdrop.classList.add('ready'));
}

/**
 * Return the page to being a plain scrolling document and drop in the 2D
 * backdrop. Reachable from a cold start (unsupported device) or mid-session
 * (context loss, or a device that turns out not to cope).
 */
function startFallback({ reduced = false, wasWorld = false } = {}) {
  if (fallbackStarted) return;
  fallbackStarted = true;

  if (wasWorld) {
    // Experience.destroy() has already handed the panel elements back.
    root.classList.remove('world-3d');
    unbindRail?.();
    switchToDocumentMode();
    initReveal();
  }

  // A canvas that has held a WebGL context can never return a 2D one.
  backdrop.querySelectorAll('canvas').forEach((c) => c.remove());
  initFallback(makeCanvas('bg-2d'), { animate: !reduced });
  root.dataset.quality = 'none';
  reveal();
}

async function boot() {
  const reduced = prefersReducedMotion();
  const { tier, settings, reason } = detectTier();

  // Two independent gates: the device has to be able to *render* the world
  // (tier), and the viewport has to be big enough to *read* it.
  const tooSmall = !supportsWorldLayout();
  const worldMode = tier !== 'none' && !tooSmall;

  // The mode is decided — and the class applied — before any UI initialises.
  // world.css changes panel sizing, so anything that measures or scrolls its
  // own content (the terminal log) must run against the final styles.
  root.dataset.quality = worldMode ? tier : 'none';
  if (worldMode) root.classList.add('world-3d');

  initTypewriter();
  initClock();
  initTerminal();

  if (!worldMode) {
    const why = tier === 'none' ? reason : `viewport ${window.innerWidth}x${window.innerHeight} too small`;
    console.info(`[world] 3D disabled (${why}) — plain document + 2D backdrop`);
    initScroll({ smooth: false, worldMode: false });
    initReveal();
    startFallback({ reduced });
    return;
  }

  initScroll({ smooth: true, worldMode: true });

  try {
    // Panel heights are measured from real layout, so the webfonts have to be
    // resolved first — measuring against a fallback face mislays every panel.
    if (document.fonts?.ready) await document.fonts.ready;

    const { Experience } = await import('./three/Experience.js');
    experience = new Experience(makeCanvas('bg-3d'), {
      tier,
      settings,
      stageContainer: document.body,
      onFallback: () => {
        experience = null;
        startFallback({ wasWorld: true });
      },
    });

    unbindRail = initRail();
    // The stage re-parented the terminal, which reset its log scroll.
    pinTerminal();
    console.info(`[world] tier=${tier} (${reason})`);
    reveal();
  } catch (error) {
    console.error('[world] failed to build, falling back to document', error);
    root.classList.remove('world-3d');
    switchToDocumentMode();
    initReveal();
    startFallback({ reduced });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

window.__site = {
  get experience() {
    return experience;
  },
  // Programmatic navigation must go through Lenis — calling window.scrollTo
  // directly fights it and leaves the camera stranded mid-flight.
  goToStation,
  forceFallback: () => {
    const wasWorld = !!experience;
    experience?.destroy();
    experience = null;
    startFallback({ wasWorld });
  },
};
