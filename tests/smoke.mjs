// Smoke test for the "Match me" site.
// Builds are served by `vite preview`; this script spawns it, runs the checks
// against the real built output, and exits non-zero on any failure.
//
//   npm run build && npm test

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PORT = 4174;
const URL = process.env.SITE_URL || `http://localhost:${PORT}/`;
const OUT = process.env.SHOTS || './tests/shots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

// ── serve the built site unless SITE_URL points elsewhere ──────────────────
let server = null;
if (!process.env.SITE_URL) {
  if (!fs.existsSync('./dist/index.html')) {
    console.error('dist/index.html not found — run `npm run build` first.');
    process.exit(1);
  }
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  // Wait for the port to accept connections.
  const deadline = Date.now() + 15000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try {
      await fetch(URL);
      up = true;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!up) {
    console.error('vite preview did not come up on ' + URL);
    server.kill();
    process.exit(1);
  }
}

async function newCtx(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/favicon/i.test(t)) errors.push(t);
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return { ctx, page, errors };
}

const browser = await chromium.launch({ channel: 'chrome' });

// ── 1. content: everything a recruiter needs, present and correct ──────────
{
  const { ctx, page, errors } = await newCtx(browser);
  await page.goto(URL, { waitUntil: 'networkidle' });

  check('title names Akmal', /Akmal Hameed/.test(await page.title()));
  check('h1 is the name', (await page.locator('h1').first().textContent()).trim() === 'Akmal Hameed');
  check('open-to-roles status visible', await page.locator('.bar-status', { hasText: 'open to roles' }).isVisible());
  check('"right now" card visible', await page.locator('.rnow').isVisible());

  // Every in-page nav link must resolve to a real section id.
  const navTargets = await page.$$eval('.bar-nav a', (as) => as.map((a) => a.getAttribute('href')));
  const missing = [];
  for (const href of navTargets) {
    if (!(await page.locator(href).count())) missing.push(href);
  }
  check('all nav links resolve', navTargets.length >= 4 && missing.length === 0, missing.join(', ') || `${navTargets.length} links`);

  for (const id of ['experience', 'education', 'skills', 'work', 'contact']) {
    check(`section #${id} exists`, (await page.locator(`#${id}`).count()) === 1);
  }

  check('four facts in the strip', (await page.locator('.fact').count()) === 4);
  const years = (await page.locator('[data-years]').textContent()).trim();
  check('years of experience computed', /^\d+\+ yrs$/.test(years) && parseInt(years) >= 4, years);
  check('three roles listed', (await page.locator('.role').count()) === 3);
  const durs = await page.$$eval('.role [data-dur]', (els) => els.map((e) => e.textContent.trim()));
  check('role durations rendered', durs.length === 3 && durs.every((d) => /\d+ (yrs?|mo)/.test(d)), durs.join(', '));
  check('two education entries', (await page.locator('.edu').count()) === 2);
  check('First Class Honours shown', await page.locator('.edu', { hasText: 'First Class Honours' }).isVisible());
  check('fourteen work cards', (await page.locator('.card').count()) === 14);

  // No skill chip may claim a skill that no piece of work backs up.
  const counts = await page.$$eval('.chips button .n', (els) => els.map((e) => Number(e.textContent)));
  check('every skill has evidence', counts.length >= 20 && counts.every((n) => n > 0), `${counts.length} chips`);

  check('mailto link present', (await page.locator('a[href^="mailto:s.hameedakmal"]').count()) >= 1);
  check('phone link present', (await page.locator('a[href^="tel:"]').count()) >= 1);
  const cv = await page.$$eval('a[href$=".pdf"]', (as) => as.map((a) => a.hasAttribute('download')));
  check('résumé download links (bar, card, footer)', cv.length >= 3 && cv.every(Boolean), `${cv.length} links`);
  const pdf = await page.request.get(URL + 'Akmal_Hameed.pdf');
  check('résumé PDF is served', pdf.status() === 200 && /pdf/.test(pdf.headers()['content-type'] || ''), `HTTP ${pdf.status()}`);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: `${OUT}/desktop.png`, fullPage: false });
  await ctx.close();
}

// ── 2. readability: type size, line length, no sideways scrolling ──────────
{
  const { ctx, page } = await newCtx(browser);
  await page.goto(URL, { waitUntil: 'networkidle' });

  const fontSize = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  check('body text ≥ 16px', fontSize >= 16, `${fontSize}px`);

  const measure = await page.evaluate(() => {
    const p = document.querySelector('.lede');
    return { width: p.getBoundingClientRect().width, fontSize: parseFloat(getComputedStyle(p).fontSize) };
  });
  // ~45–95 chars per line is the readable band; ch ≈ 0.5em for this stack.
  const chars = measure.width / (measure.fontSize * 0.5);
  check('measure in readable band', chars > 45 && chars < 110, `≈${Math.round(chars)} chars/line`);

  const overflowDesktop = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow @1440', overflowDesktop <= 0, `${overflowDesktop}px`);
  await ctx.close();
}

// ── 3. mobile ──────────────────────────────────────────────────────────────
{
  const { ctx, page, errors } = await newCtx(browser, { viewport: { width: 375, height: 812 } });
  await page.goto(URL, { waitUntil: 'networkidle' });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow @375', overflow <= 0, `${overflow}px`);
  check('résumé button visible on mobile', await page.locator('.bar-cv').isVisible());
  check('no console errors on mobile', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: `${OUT}/mobile.png`, fullPage: false });
  await ctx.close();
}

// ── 3b. skill filter highlights the right work ─────────────────────────────
{
  const { ctx, page } = await newCtx(browser);
  await page.goto(URL, { waitUntil: 'networkidle' });

  const chip = page.locator('.chips button[data-s="LangGraph"]');
  const expected = Number(await chip.locator('.n').textContent());
  await chip.click();
  check('chip becomes pressed', (await chip.getAttribute('aria-pressed')) === 'true');
  const hits = await page.locator('.card.hit').count();
  const dims = await page.locator('.card.dim').count();
  check('filter highlights matching cards', hits === expected && hits > 0, `${hits} hit, expected ${expected}`);
  check('filter dims the rest', hits + dims === 14, `${dims} dimmed`);
  check('status names the skill', /LangGraph/.test(await page.locator('#status').textContent()));
  await page.locator('#clear').click();
  check('show all clears the filter', (await page.locator('.card.dim').count()) === 0);
  await ctx.close();
}

// ── 4. dark on any OS theme (the design is dark-only) ─────────────────────────────────────────────────────────
{
  const { ctx, page } = await newCtx(browser, { colorScheme: 'light' });
  await page.goto(URL, { waitUntil: 'networkidle' });

  const { bg, ink } = await page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    ink: getComputedStyle(document.body).color,
  }));
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+/g).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  check('dark: background is dark', lum(bg) < 0.2, bg);
  check('dark: text is light', lum(ink) > 0.7, ink);
  await page.screenshot({ path: `${OUT}/desktop-dark-os.png`, fullPage: false });
  await ctx.close();
}

// ── 5. copy button works ───────────────────────────────────────────────────
{
  const { ctx, page } = await newCtx(browser);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL.replace(/\/$/, '') });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.locator('.copy-btn').first().click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  check('copy button copies email', copied === 's.hameedakmal@gmail.com', copied);
  await ctx.close();
}

await browser.close();
if (server) server.kill();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
