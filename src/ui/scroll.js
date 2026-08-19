import Lenis from 'lenis';
import { STATION_COUNT, stationIndexForAnchor } from '../three/world/layout.js';

/**
 * Scroll store, in two modes.
 *
 * `world`    — content has left the document flow and lives in 3D. A tall
 *              empty track supplies the scroll distance, and progress is
 *              simply how far down it you are. Native scroll is preserved
 *              (keyboard, trackpad, screen readers all still work) — Lenis
 *              only smooths it.
 *
 * `document` — the fallback. Content is a normal page again, so progress is
 *              derived from *section space* (sectionIndex + localProgress)
 *              rather than raw document height, which keeps it meaningful
 *              across sections of very different heights.
 */

/** The real <section> elements, used only in document (fallback) mode. */
const DOCUMENT_SECTIONS = ['hero', 'about', 'experience', 'projects', 'skills', 'contact'];

const state = {
  progress: 0,
  index: 0,
  local: 0,
  velocity: 0,
};

const subscribers = new Set();
let mode = 'document';
let sections = [];
let spaceAtTop = 0;
let spaceAtBottom = 1;
let lenis = null;

export function getScrollState() {
  return state;
}

export function onScroll(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function maxScroll() {
  return Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
}

function measure() {
  if (mode === 'world') return;

  sections = DOCUMENT_SECTIONS.map((id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { id, top: rect.top + window.scrollY, height: Math.max(rect.height, 1) };
  }).filter(Boolean);

  if (!sections.length) return;

  spaceAtTop = rawSectionSpace(0);
  spaceAtBottom = rawSectionSpace(maxScroll());
  if (spaceAtBottom - spaceAtTop < 0.001) spaceAtBottom = spaceAtTop + 1;
}

function rawSectionSpace(scrollY) {
  if (!sections.length) return 0;
  const reference = scrollY + window.innerHeight * 0.5;

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (reference < s.top + s.height || i === sections.length - 1) {
      return i + Math.min(Math.max((reference - s.top) / s.height, 0), 1);
    }
  }
  return sections.length - 1;
}

/** Index of the station whose dwell this progress is closest to. */
function nearestStation(progress) {
  if (!stationOffsets) {
    return Math.min(Math.floor(progress * (STATION_COUNT - 1)), STATION_COUNT - 1);
  }
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < stationOffsets.length; i++) {
    const d = Math.abs(stationOffsets[i] - progress);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function update(scrollY, velocity) {
  let progress;

  if (mode === 'world') {
    progress = scrollY / maxScroll();
  } else {
    const raw = rawSectionSpace(scrollY);
    progress = (raw - spaceAtTop) / (spaceAtBottom - spaceAtTop);
  }

  progress = Math.min(Math.max(progress, 0), 1);

  state.progress = progress;
  state.index = nearestStation(progress);
  state.local = 0;
  state.velocity = velocity;

  subscribers.forEach((fn) => fn(state));
}

/**
 * Progress of each station along the journey, published by the camera rig.
 * Stations are no longer evenly spaced in scroll — one that has to pan gets a
 * longer dwell — so these come from the rig rather than from an index ratio.
 */
let stationOffsets = null;

export function setStationOffsets(offsets) {
  stationOffsets = offsets;
}

/**
 * Tell the scroll layer the document height changed.
 *
 * Lenis caches the scroll limit, so after the camera rig rewrites the track
 * height a `scrollTo` past the OLD limit is silently clamped — which landed the
 * camera a whole station short of wherever it was sent.
 */
export function refreshScrollLimits() {
  lenis?.resize();
  measure();
  update(window.scrollY, 0);
}

/** Scroll offset that parks the camera at a given station. */
export function scrollOffsetForStation(index) {
  const clamped = Math.min(Math.max(index, 0), STATION_COUNT - 1);
  const fraction = stationOffsets
    ? stationOffsets[clamped]
    : clamped / Math.max(STATION_COUNT - 1, 1);
  return fraction * maxScroll();
}

export function goToStation(index, { immediate = false } = {}) {
  const y = scrollOffsetForStation(index);
  // Lenis wants `immediate: true` to jump — a zero duration still eases.
  if (lenis) lenis.scrollTo(y, immediate ? { immediate: true } : { duration: 1.8 });
  else window.scrollTo({ top: y, behavior: immediate ? 'auto' : 'smooth' });
}

function bindAnchors() {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    if (a.dataset.worldBound) return;
    a.dataset.worldBound = '1';

    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);

      if (mode === 'world') {
        const index = stationIndexForAnchor(id);
        if (index === -1) return;
        e.preventDefault();
        goToStation(index);
        return;
      }

      const target = document.getElementById(id);
      if (!target || !lenis) return;
      e.preventDefault();
      lenis.scrollTo(target, { duration: 1.4 });
    });
  });
}

export function initScroll({ smooth = true, worldMode = false } = {}) {
  mode = worldMode ? 'world' : 'document';
  measure();

  if (smooth && !lenis) {
    document.documentElement.style.scrollBehavior = 'auto';

    lenis = new Lenis({
      lerp: 0.085,
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: false,
    });

    lenis.on('scroll', ({ scroll, velocity }) => update(scroll, velocity));

    const raf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  } else if (!smooth) {
    let last = window.scrollY;
    const onNativeScroll = () => {
      const y = window.scrollY;
      update(y, y - last);
      last = y;
    };
    window.addEventListener('scroll', onNativeScroll, { passive: true });
  }

  bindAnchors();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      measure();
      update(window.scrollY, 0);
    }, 150);
  });

  update(window.scrollY, 0);
  return state;
}

/** Switch to document mode after the 3D world bails out. */
export function switchToDocumentMode() {
  mode = 'document';
  measure();
  update(window.scrollY, 0);
}
