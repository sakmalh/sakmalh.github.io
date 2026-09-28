// Smoke test for the scroll-story site.
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

// swiftshader gives headless Chrome a software WebGL so the 3D path runs too.
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

const CHAPTERS = ['intro', 'about', 'ai', 'search', 'team', 'junior', 'intern', 'education', 'projects', 'projects2', 'skills', 'contact'];
// Every résumé item must appear on the page, by its heading.
const RESUME_ITEMS = [
  'AI Interview & Assessment Agent', 'Live Interview Transcription & Validation',
  'Multi-Tenant RAG Candidate Search', 'Stripe Subscription & Billing System',
  'Frontend engineering', 'Engineering quality & mentorship',
  'Microservice standardisation', 'Cloud cost reduction',
  'Test automation & QA', 'Secure API development',
  'AgentTrace', 'DevTools MCP Server', 'AI Resume Search',
  'Agentic-Map', 'HouseDiffusion', 'Assignment Reminder',
  'B.Sc. Computer Science (Top-Up), First Class Honours', 'HND Computer Science, Merit',
];

// ── 1. content: everything a recruiter needs, present and correct ──────────
{
  const { ctx, page, errors } = await newCtx(browser);
  await page.goto(URL, { waitUntil: 'networkidle' });

  check('title names Akmal', /Akmal Hameed/.test(await page.title()));
  check('h1 is the name', (await page.locator('h1').first().textContent()).trim() === 'Akmal Hameed');
  check('open-to-roles status visible', await page.locator('.status', { hasText: 'open to' }).isVisible());

  const ids = await page.$$eval('.chap', (els) => els.map((e) => e.id));
  check('twelve chapters in order', JSON.stringify(ids) === JSON.stringify(CHAPTERS), ids.join(','));
  const railTargets = await page.$$eval('#rail a', (as) => as.map((a) => a.getAttribute('href')));
  const missing = [];
  for (const href of railTargets) if (!(await page.locator(href).count())) missing.push(href);
  check('chapter rail links resolve', railTargets.length === CHAPTERS.length && missing.length === 0, missing.join(', ') || `${railTargets.length} links`);

  const bolds = await page.$$eval('.card li b', (bs) => bs.map((b) => b.textContent.trim()));
  const absent = RESUME_ITEMS.filter((t) => !bolds.some((b) => b === t || b.startsWith(t + ':')));
  check('every résumé item is on the page', absent.length === 0, absent.join(', ') || `${RESUME_ITEMS.length} items`);
  const stacks = await page.locator('.card li em').count();
  check('experience and projects list their stack', stacks >= 16, `${stacks} stack lines`);

  const years = await page.locator('[data-years]').first().textContent();
  check('years of experience computed', /^\d+\+ years$/.test(years) && parseInt(years) >= 4, years);
  const durs = await page.$$eval('.role [data-dur]', (els) => els.map((e) => e.textContent));
  check('role durations rendered', durs.length === 3 && durs.every((d) => /\d+ (yrs?|mo)/.test(d)), durs.join(', '));

  const photo = await page.locator('.me img').evaluate((img) => img.complete && img.naturalWidth);
  check('profile photo loads', photo > 0, `${photo}px wide`);

  check('mailto link present', (await page.locator('a[href^="mailto:s.hameedakmal"]').count()) >= 1);
  check('phone link present', (await page.locator('a[href^="tel:"]').count()) >= 1);
  const cv = await page.$$eval('a[href$="Akmal_Hameed.pdf"]', (as) => as.map((a) => a.hasAttribute('download')));
  check('résumé download links (bar, intro, contact)', cv.length >= 3 && cv.every(Boolean), `${cv.length} links`);
  const pdf = await page.request.get(new globalThis.URL('Akmal_Hameed.pdf', URL).href);
  check('résumé PDF is served', pdf.status() === 200 && /pdf/.test(pdf.headers()['content-type'] || ''), `HTTP ${pdf.status()}`);

  const fontSize = await page.locator('.card ul li span').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check('card body text ≥ 14px', fontSize >= 14, `${fontSize}px`);
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── 2. the 3D scene loads and follows the scroll ───────────────────────────
{
  const { ctx, page, errors } = await newCtx(browser);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.classList.contains('has-3d'), null, { timeout: 15000 }).catch(() => {});
  check('3D scene starts', await page.evaluate(() => document.body.classList.contains('has-3d')));

  // Screenshot the scene alone (text hidden) at every chapter. A flat
  // background compresses to a tiny PNG; a rendered room does not, and the
  // camera moving means consecutive stops look different.
  const scene = {};
  await page.addStyleTag({ content: '.hide-ui main, .hide-ui .top, .hide-ui .rail, .hide-ui #labels { visibility: hidden !important; }' });
  for (const id of CHAPTERS) {
    await page.evaluate((id) => { const s = document.getElementById(id); scrollTo(0, s.offsetTop + s.offsetHeight / 2 - innerHeight / 2); }, id);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${OUT}/story-${id}.png` });
    await page.evaluate(() => document.body.classList.add('hide-ui'));
    scene[id] = await page.screenshot();
    await page.evaluate(() => document.body.classList.remove('hide-ui'));
  }
  const smallest = Math.min(...Object.values(scene).map((b) => b.length));
  check('scene renders a picture at every stop', smallest > 40000, `smallest frame ${Math.round(smallest / 1024)} KB`);
  const same = CHAPTERS.slice(1).filter((id, i) => scene[id].equals(scene[CHAPTERS[i]]));
  check('camera moves between chapters', same.length === 0, same.join(', ') || 'every stop differs');
  const active = await page.$eval('#rail a.on', (a) => a.getAttribute('href')).catch(() => null);
  check('rail marks the current chapter', active === '#contact', String(active));
  const labels = await page.$$eval('.lbl', (els) => els.filter((e) => parseFloat(e.style.opacity) > 0.5).length);
  check('3D labels hide away from their chapter', labels === 0, `${labels} visible on contact`);
  check('no console errors while scrolling', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── 3. no WebGL: the same content as a plain page ──────────────────────────
{
  const { ctx, page, errors } = await newCtx(browser);
  await ctx.addInitScript(() => { HTMLCanvasElement.prototype.getContext = function () { return null; }; });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('no-WebGL falls back to plain page', await page.evaluate(() => document.body.classList.contains('no-3d') && !document.body.classList.contains('has-3d')));
  check('no-WebGL never downloads three.js', !(await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /three-/.test(r.name)))));
  check('no-WebGL still shows every chapter', (await page.locator('.chap .card:visible').count()) === CHAPTERS.length);
  await page.screenshot({ path: `${OUT}/no-webgl.png`, fullPage: true });
  check('no console errors without WebGL', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── 4. layout: desktop and phone ───────────────────────────────────────────
{
  const { ctx, page } = await newCtx(browser);
  await page.goto(URL, { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('no horizontal overflow @1440', overflow <= 0, `${overflow}px`);
  await ctx.close();
}
{
  const { ctx, page, errors } = await newCtx(browser, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('no horizontal overflow @375', overflow <= 0, `${overflow}px`);
  check('résumé button visible on mobile', await page.locator('.top-cv').isVisible());
  for (const id of ['about', 'search', 'projects']) {
    await page.evaluate((id) => { const s = document.getElementById(id); scrollTo(0, s.offsetTop + s.offsetHeight / 2 - innerHeight / 2); }, id);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/mobile-${id}.png` });
  }
  check('no console errors on mobile', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ── 5. reduced motion still works ──────────────────────────────────────────
{
  const { ctx, page, errors } = await newCtx(browser, { reducedMotion: 'reduce' });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.getElementById('ai').scrollIntoView());
  await page.waitForTimeout(800);
  check('reduced motion: scene loads, no errors', errors.length === 0 && (await page.evaluate(() => document.body.classList.contains('has-3d'))), errors.slice(0, 2).join(' | '));
  await ctx.close();
}

// ── 6. dark on any OS theme (the design is dark-only) ──────────────────────
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
  await ctx.close();
}

// ── 7. copy button works ───────────────────────────────────────────────────
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
