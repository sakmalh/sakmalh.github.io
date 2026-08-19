/**
 * Non-WebGL backdrop.
 *
 * Used when the quality tier resolves to `none` (no WebGL, weak GPU,
 * low-end mobile, or prefers-reduced-motion). Keeps the site visually alive
 * at a fraction of the cost — and the three.js bundle is never fetched.
 */

const ACCENT = '0,237,100';

export function initFallback(canvas, { animate = true } = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.classList.add('is-fallback');

  let width = 0;
  let height = 0;
  let nodes = [];
  let count = 0;
  let linkDistance = 150;
  let rafId = null;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Scale the graph to the viewport so phones do far less edge work.
    count = width < 700 ? 32 : width < 1200 ? 55 : 75;
    linkDistance = width < 700 ? 110 : 150;
  }

  function seed() {
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      r: Math.random() * 1.8 + 0.8,
    }));
  }

  function draw(step) {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const d = Math.hypot(dx, dy);
        if (d < linkDistance) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.strokeStyle = `rgba(${ACCENT},${(1 - d / linkDistance) * 0.32})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = `rgba(${ACCENT},0.65)`;
    for (const n of nodes) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();

      if (!step) continue;
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > width) n.vx *= -1;
      if (n.y < 0 || n.y > height) n.vy *= -1;
    }
  }

  function loop() {
    draw(true);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (rafId === null && animate) rafId = requestAnimationFrame(loop);
  }
  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  resize();
  seed();

  if (animate) {
    start();

    window.addEventListener('mousemove', (e) => {
      for (const n of nodes) {
        const dx = e.clientX - n.x;
        const dy = e.clientY - n.y;
        if (Math.hypot(dx, dy) < 110) {
          n.vx += dx * 0.00035;
          n.vy += dy * 0.00035;
          const speed = Math.hypot(n.vx, n.vy);
          if (speed > 2) {
            n.vx /= speed / 2;
            n.vy /= speed / 2;
          }
        }
      }
    }, { passive: true });

    // Never burn battery on a backgrounded tab.
    document.addEventListener('visibilitychange', () => {
      document.hidden ? stop() : start();
    });
  } else {
    draw(false); // one static frame for reduced-motion users
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      seed();
      if (!animate) draw(false);
    }, 150);
  });
}
