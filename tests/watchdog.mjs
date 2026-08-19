import { chromium } from 'playwright';

// Software rendering (swiftshader) at the forced `high` tier is exactly the
// "device that passes the static checks but cannot actually cope" case the
// watchdog exists for.
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle','--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const transitions = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[3d]')) { transitions.push(t); console.log('  ' + t); }
});

await page.goto((process.env.SITE_URL || 'http://localhost:4174/') + '?tier=high', { waitUntil: 'networkidle' });
console.log('forced tier=high on software rendering; watching for downgrades...');

for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(2000);
  const state = await page.evaluate(() => ({
    quality: document.documentElement.dataset.quality,
    has3d: !!document.getElementById('bg-3d'),
    has2d: !!document.getElementById('bg-2d'),
    particles: window.__site.experience?.world?.settings?.particles ?? null,
  }));
  console.log(`  t=${(i+1)*2}s`, JSON.stringify(state));
  if (state.has2d) break;
}

const downgrades = transitions.filter((t) => t.includes('downgrading') || t.includes('falling back'));
console.log(`\n${downgrades.length} tier transition(s) recorded`);
console.log(downgrades.length > 0 ? 'PASS  watchdog reacts to a device that cannot cope' : 'FAIL  watchdog never fired');
await browser.close();
process.exit(downgrades.length > 0 ? 0 : 1);
