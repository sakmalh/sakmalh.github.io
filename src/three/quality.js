/**
 * Device capability tiering.
 *
 * Resolved BEFORE three.js is imported so a `none` tier never pays the
 * download cost of the 3D bundle at all.
 */

// Counts are deliberately modest: panels are opaque plates read at 1:1, so a
// denser field buys little and costs frames.
export const TIERS = {
  high: {
    name: 'high',
    particles: 60000,
    graphNodes: 70,
    graphEdges: 190,
    pulses: 90,
    dprCap: 2,
    antialias: true,
  },
  medium: {
    name: 'medium',
    particles: 24000,
    graphNodes: 45,
    graphEdges: 120,
    pulses: 50,
    dprCap: 1.5,
    antialias: false,
  },
  low: {
    name: 'low',
    particles: 6000,
    graphNodes: 24,
    graphEdges: 60,
    pulses: 18,
    dprCap: 1,
    antialias: false,
  },
};

export const TIER_ORDER = ['high', 'medium', 'low'];

/** Substrings of GPU renderer strings that reliably indicate a weak device. */
const WEAK_GPU = [
  'swiftshader', 'llvmpipe', 'software', 'basic render',
  'mali-4', 'mali-t6', 'mali-t7', 'mali-t8',
  'adreno (tm) 3', 'adreno (tm) 4', 'adreno (tm) 5',
  'powervr sgx', 'powervr rogue g6', 'videocore',
  'intel(r) hd graphics 3', 'intel(r) hd graphics 4',
];

function probeWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    const gl = gl2 || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return null;

    let renderer = '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
    }

    const info = {
      webgl2: !!gl2,
      renderer,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0,
      weakGPU: WEAK_GPU.some((needle) => renderer.includes(needle)),
    };

    // Release the probe context immediately — contexts are a scarce resource.
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();

    return info;
  } catch {
    return null;
  }
}

/**
 * The world docks panels at 1:1, so text is never scaled down — but a station
 * still has to *fit*, and below this the responsive fit factor bottoms out and
 * multi-panel stations stop being usable. Smaller screens get the plain
 * document, which is a genuinely good phone experience.
 */
export const WORLD_MIN_WIDTH = 720;
export const WORLD_MIN_HEIGHT = 520;

export function supportsWorldLayout() {
  return window.innerWidth >= WORLD_MIN_WIDTH && window.innerHeight >= WORLD_MIN_HEIGHT;
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * @returns {{tier: string, settings: object|null, reason: string, gpu: object|null}}
 */
export function detectTier() {
  // Manual override for inspecting a specific tier: ?tier=high|medium|low|none
  const override = new URLSearchParams(window.location.search).get('tier');
  if (override === 'none') {
    return { tier: 'none', settings: null, reason: 'override', gpu: null };
  }
  if (override && TIERS[override]) {
    return { tier: override, settings: TIERS[override], reason: 'override', gpu: null };
  }

  if (prefersReducedMotion()) {
    return { tier: 'none', settings: null, reason: 'prefers-reduced-motion', gpu: null };
  }

  const gpu = probeWebGL();
  if (!gpu) {
    return { tier: 'none', settings: null, reason: 'no-webgl', gpu: null };
  }
  if (gpu.weakGPU || gpu.maxTextureSize < 2048) {
    return { tier: 'none', settings: null, reason: 'weak-gpu', gpu };
  }

  const cores = navigator.hardwareConcurrency || 2;
  const memory = navigator.deviceMemory || 4;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 500;
  const mobile = coarse && narrow;

  // Low-end mobile: enough to run WebGL, not enough to run a scene.
  if (mobile && (cores <= 4 || memory <= 2)) {
    return { tier: 'none', settings: null, reason: 'low-end-mobile', gpu };
  }

  let tier;
  if (!gpu.webgl2 || cores <= 2 || memory <= 2) tier = 'low';
  else if (mobile || cores <= 4 || memory <= 4) tier = 'medium';
  else tier = 'high';

  return { tier, settings: TIERS[tier], reason: `cores=${cores} mem=${memory} mobile=${mobile}`, gpu };
}

/**
 * Rolling FPS watchdog. Static capability checks cannot predict thermal
 * throttling or an unknown low-end Android, so we also measure reality and
 * step down a tier when the frame budget is genuinely being missed.
 */
export class FpsWatchdog {
  constructor({ onDowngrade, threshold = 40, sustainedMs = 1200 } = {}) {
    this.onDowngrade = onDowngrade;
    this.threshold = threshold;
    this.sustainedMs = sustainedMs;
    this.samples = [];
    this.badSince = null;
    this.enabled = true;
    // Ignore the first moments — shader compile and buffer upload are not
    // steady state.
    this.startedAt = performance.now();
  }

  tick(delta) {
    if (!this.enabled || delta <= 0) return;
    const now = performance.now();
    if (now - this.startedAt < 800) return;

    this.samples.push(1 / delta);
    if (this.samples.length > 60) this.samples.shift();
    // Deliberately few samples: on a device running at 10fps, waiting for 30
    // would mean 3s of stutter before we even start the sustained timer.
    if (this.samples.length < 12) return;

    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;

    if (avg < this.threshold) {
      if (this.badSince === null) this.badSince = now;
      else if (now - this.badSince > this.sustainedMs) {
        this.enabled = false; // one downgrade per instance — hysteresis
        this.onDowngrade?.(avg);
      }
    } else {
      this.badSince = null;
    }
  }

  /** Re-arm after a downgrade so a still-struggling device can drop again. */
  rearm() {
    this.samples.length = 0;
    this.badSince = null;
    this.startedAt = performance.now();
    this.enabled = true;
  }
}
