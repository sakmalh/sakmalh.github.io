import './style.css';

// All content is in index.html. This script builds the chapter rail, keeps
// the experience figures current, wires the copy-email button, and — once the
// text is on screen — loads the 3D scene if the browser can run it.

const chapters = [...document.querySelectorAll('.chap')];

// ── experience figures, computed so they never go stale ────────────────────
const parse = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1); };
const months = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
const dur = (m) => {
  const y = Math.floor(m / 12), r = m % 12;
  return [y ? `${y} ${y > 1 ? 'yrs' : 'yr'}` : '', r ? `${r} mo` : ''].filter(Boolean).join(' ') || '0 mo';
};
const now = new Date();
const years = Math.floor(months(parse('2022-09'), now) / 12);
for (const el of document.querySelectorAll('[data-years]')) el.textContent = `${years}+ years`;
for (const role of document.querySelectorAll('.role')) {
  const end = role.dataset.end ? parse(role.dataset.end) : now;
  role.querySelector('[data-dur]').textContent = dur(months(parse(role.dataset.start), end));
}

// ── chapter rail ───────────────────────────────────────────────────────────
const rail = document.getElementById('rail');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const railLinks = chapters.map((s) => {
  const a = document.createElement('a');
  a.href = '#' + s.id;
  a.style.setProperty('--c', s.dataset.c);
  a.innerHTML = `<span>${s.dataset.name}</span><i></i>`;
  a.setAttribute('aria-label', s.dataset.name);
  rail.appendChild(a);
  return a;
});
const seen = new Map();
const io = new IntersectionObserver((entries) => {
  for (const e of entries) seen.set(e.target, e.intersectionRatio);
  let best = null, ratio = 0;
  for (const [el, r] of seen) if (r > ratio) { ratio = r; best = el; }
  railLinks.forEach((a, i) => {
    const on = chapters[i] === best;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  });
}, { threshold: [0, 0.25, 0.5, 0.75, 1] });
chapters.forEach((c) => io.observe(c));

// ── copy email ─────────────────────────────────────────────────────────────
for (const btn of document.querySelectorAll('.copy-btn')) {
  const label = btn.textContent;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'Copied';
    } catch {
      // Clipboard unavailable (permissions, http): show the address instead.
      btn.textContent = btn.dataset.copy;
    }
    setTimeout(() => { btn.textContent = label; }, 1800);
  });
}

// ── 3D scene, loaded after the text has rendered ───────────────────────────
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
const saveData = navigator.connection?.saveData;
if (webglOK() && !saveData) {
  const go = () => import('./story.js')
    .then(({ startStory }) => {
      startStory({
        canvas: document.getElementById('scene'),
        labelsEl: document.getElementById('labels'),
        chapters,
        reduced,
      });
      document.body.classList.add('has-3d');
    })
    .catch((err) => {
      console.warn('[3d] scene unavailable, showing the plain page', err);
      document.body.classList.add('no-3d');
    });
  if (document.readyState === 'complete') requestAnimationFrame(go);
  else addEventListener('load', () => requestAnimationFrame(go), { once: true });
} else {
  document.body.classList.add('no-3d');
}
