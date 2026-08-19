function runCounter(el) {
  const target = parseInt(el.dataset.val, 10);
  const suffix = el.dataset.sfx || '';
  const duration = 1800;
  const start = performance.now();

  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

export function initCounters(delay = 600) {
  const els = document.querySelectorAll('[data-val]');
  if (!els.length) return;
  setTimeout(() => els.forEach(runCounter), delay);
}
