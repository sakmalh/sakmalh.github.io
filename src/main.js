import './style.css';

// All content is in index.html; this script only adds the skill filter, the
// copy-email button, and keeps the experience figures current.

// ── experience figures, computed so they never go stale ────────────────────
const parse = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1); };
const months = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
const dur = (m) => {
  const y = Math.floor(m / 12), r = m % 12;
  return [y ? `${y} ${y > 1 ? 'yrs' : 'yr'}` : '', r ? `${r} mo` : ''].filter(Boolean).join(' ') || '0 mo';
};
const now = new Date();
const START = parse('2022-09');
const years = Math.floor(months(START, now) / 12);
const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

document.querySelector('[data-years]').textContent = `${years}+ yrs`;
document.querySelector('[data-years-text]').textContent = `${WORDS[years] ?? years} years`;
for (const role of document.querySelectorAll('.role')) {
  const end = role.dataset.end ? parse(role.dataset.end) : now;
  role.querySelector('[data-dur]').textContent = dur(months(parse(role.dataset.start), end));
}

// ── skill filter: each chip lights up the work where it was used ───────────
const cards = [...document.querySelectorAll('.card')];
const chips = [...document.querySelectorAll('.chips button')];
const status = document.getElementById('status');
const skillsOf = (card) => card.dataset.skills.split('|');

for (const card of cards) {
  const tags = document.createElement('div');
  tags.className = 'tags';
  tags.innerHTML = skillsOf(card).map((s) => `<span>${s}</span>`).join('');
  card.appendChild(tags);
}
for (const chip of chips) {
  const n = cards.filter((c) => skillsOf(c).includes(chip.dataset.s)).length;
  chip.insertAdjacentHTML('beforeend', `<span class="n">${n}</span>`);
  chip.setAttribute('aria-pressed', 'false');
}

let selected = null;
function render() {
  for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.dataset.s === selected));
  let hits = 0;
  for (const card of cards) {
    const hit = !!selected && skillsOf(card).includes(selected);
    if (hit) hits++;
    card.classList.toggle('hit', hit);
    card.classList.toggle('dim', !!selected && !hit);
    for (const tag of card.querySelectorAll('.tags span')) tag.classList.toggle('on', tag.textContent === selected);
  }
  status.innerHTML = selected
    ? `<b>${selected}</b>: used in ${hits} of ${cards.length} pieces of work. <button type="button" id="clear">Show all</button>`
    : 'Showing everything. Tap a skill to highlight where I used it.';
  document.getElementById('clear')?.addEventListener('click', () => { selected = null; render(); });
}
for (const chip of chips) {
  chip.addEventListener('click', () => {
    selected = selected === chip.dataset.s ? null : chip.dataset.s;
    render();
  });
}
render();

// ── copy email ─────────────────────────────────────────────────────────────
for (const btn of document.querySelectorAll('.copy-btn')) {
  const label = btn.textContent;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'Copied';
      btn.classList.add('copied');
    } catch {
      // Clipboard unavailable (permissions, http): show the address instead.
      btn.textContent = btn.dataset.copy;
    }
    setTimeout(() => { btn.textContent = label; btn.classList.remove('copied'); }, 1800);
  });
}
