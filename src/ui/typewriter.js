const ROLES = [
  'agentic systems engineer',
  'backend, where it actually runs',
  'LangGraph · MongoDB · AWS',
  'retrieval that stays sub-second',
  'Linux, Python, and long uptimes',
  'Queens, New York',
];

export function initTypewriter(el = document.getElementById('tw')) {
  if (!el) return;

  let roleIndex = 0;
  let charIndex = 0;
  let deleting = false;

  function tick() {
    const current = ROLES[roleIndex];
    if (!deleting) {
      el.textContent = current.slice(0, ++charIndex);
      if (charIndex === current.length) {
        deleting = true;
        setTimeout(tick, 2200);
        return;
      }
      setTimeout(tick, 82);
    } else {
      el.textContent = current.slice(0, --charIndex);
      if (charIndex === 0) {
        deleting = false;
        roleIndex = (roleIndex + 1) % ROLES.length;
        setTimeout(tick, 380);
        return;
      }
      setTimeout(tick, 38);
    }
  }

  tick();
}
