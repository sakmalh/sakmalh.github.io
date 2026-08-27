// Smoke test for the README-style site.
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
  check('open-to-roles badge visible', await page.locator('.badge', { hasText: 'open to roles' }).isVisible());
  check('badges present', (await page.locator('.badge').count()) >= 4);

  // Every TOC link must resolve to a real section id.
  const tocTargets = await page.$$eval('.toc a', (as) => as.map((a) => a.getAttribute('href')));
  const missing = [];
  for (const href of tocTargets) {
    if (!(await page.locator(href).count())) missing.push(href);
  }
  check('all TOC links resolve', tocTargets.length >= 6 && missing.length === 0, missing.join(', ') || `${tocTargets.length} links`);

  for (const id of ['about', 'systems', 'experience', 'projects', 'skills', 'education', 'contact']) {
    check(`section #${id} exists`, (await page.locator(`#${id}`).count()) === 1);
  }

  check('two system diagrams render', (await page.locator('pre.diagram').count()) === 2);
  check('three roles listed', (await page.locator('#experience ~ h3, h3#swe, h3#junior-swe, h3#intern').count()) >= 3);
  check('six projects listed', (await page.locator('.tags').count()) === 6);
  check('skills table has 5 areas', (await page.locator('tbody tr').count()) === 5);

  check('mailto link present', (await page.locator('a[href^="mailto:s.hameedakmal"]').count()) >= 1);
  check('phone link present', (await page.locator('a[href^="tel:"]').count()) >= 1);
  const resumeLinks = await page.locator('a[href$=".pdf"]').count();
  check('résumé links present', resumeLinks >= 2, `${resumeLinks} links`);
  const pdfStatus = (await page.request.get(URL + 'Akmal_Hameed.pdf')).status();
  check('résumé PDF is served', pdfStatus === 200, `HTTP ${pdfStatus}`);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: `${OUT}/desktop-light.png`, fullPage: false });
  await ctx.close();
}

// ── 2. readability: type size, no sideways scrolling ───────────────────────
{
  const { ctx, page } = await newCtx(browser);
  await page.goto(URL, { waitUntil: 'networkidle' });

  const fontSize = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  check('body text ≥ 16px', fontSize >= 16, `${fontSize}px`);

  const measure = await page.evaluate(() => {
    const p = document.querySelector('.markdown-body > p');
    return { width: p.getBoundingClientRect().width, fontSize: parseFloat(getComputedStyle(p).fontSize) };
  });
  // ~65–95 chars per line is the readable band; ch ≈ 0.5em for this stack.
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
  check('résumé button visible on mobile', await page.locator('.gh-btn-primary').isVisible());
  check('no console errors on mobile', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: `${OUT}/mobile-light.png`, fullPage: false });
  await ctx.close();
}

// ── 4. dark scheme ─────────────────────────────────────────────────────────
{
  const { ctx, page } = await newCtx(browser, { colorScheme: 'dark' });
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
  await page.screenshot({ path: `${OUT}/desktop-dark.png`, fullPage: false });
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
