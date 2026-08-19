/**
 * Akmal's local time, live.
 *
 * A recruiter deciding whether to reach out wants to know what timezone they'd
 * be coordinating with. Showing the actual current time answers that better
 * than the string "EST" does — and it quietly proves the page is alive.
 */
const TIMEZONE = 'America/New_York';

const timeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const zoneFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  timeZoneName: 'short',
});

/** e.g. "14:02 EST" — the abbreviation follows daylight saving on its own. */
function render() {
  const zone = zoneFormat.formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName')?.value ?? 'ET';
  return `${timeFormat.format(new Date())} ${zone}`;
}

export function initClock() {
  const el = document.getElementById('local-time');
  if (!el) return;

  const tick = () => {
    el.textContent = render();
    el.dateTime = new Date().toISOString();
  };

  tick();
  // Aligning to the next minute keeps the clock from lagging by up to 30s.
  const msToNextMinute = 60000 - (Date.now() % 60000);
  setTimeout(() => {
    tick();
    setInterval(tick, 60000);
  }, msToNextMinute);
}
