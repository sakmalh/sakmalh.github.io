import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.SITE_URL || 'http://localhost:4174/';
const OUT = process.env.SHOTS || './tests/shots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function newCtx(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/favicon/i.test(t)) errors.push(t);
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => requests.push(r.url()));
  return { ctx, page, errors, requests };
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

const STATIONS = [
  'hero', 'terminal', 'about', 'architecture', 'architecture-2',
  'experience', 'experience-2', 'projects', 'projects-2', 'skills', 'contact',
];
const SKILLS_STATION = STATIONS.indexOf('skills');
const DOC_SECTIONS = ['hero', 'terminal', 'about', 'architecture', 'experience', 'projects', 'skills', 'contact'];

// ───────────────────────────────────────────────────────── 1. the 3D world
{
  const { ctx, page, errors, requests } = await newCtx(browser);
  await page.goto(URL + '?tier=high', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  // Software rendering here would (correctly) trip the watchdog mid-test;
  // watchdog.mjs covers that path on its own.
  await page.evaluate(() => { window.__site.experience.watchdog.enabled = false; });

  check('world: html.world-3d applied', await page.evaluate(() => document.documentElement.classList.contains('world-3d')));
  check('world: three chunk fetched', requests.some((u) => /three-.*\.js/.test(u)));
  check('world: CSS3D layer mounted', await page.locator('.css3d-layer').count() === 1);

  const mounted = await page.evaluate(() => ({
    total: document.querySelectorAll('.world-panel').length,
    inLayer: document.querySelectorAll('.css3d-layer .world-panel').length,
    offsets: [...document.querySelectorAll('.css3d-layer .world-panel')]
      .filter((el) => el.offsetTop !== 0 || el.offsetLeft !== 0).length,
  }));
  check('world: every panel docked into the CSS3D layer', mounted.total === mounted.inLayer && mounted.total >= 20,
    `${mounted.inLayer}/${mounted.total}`);
  check('world: no panel carries a layout offset', mounted.offsets === 0,
    `${mounted.offsets} offset panel(s) — a margin here becomes 1000s of px of drift`);

  const shells = await page.evaluate((ids) => ids
    .filter((id) => getComputedStyle(document.getElementById(id)).display !== 'none'), DOC_SECTIONS);
  check('world: document section shells hidden', shells.length === 0, shells.join(', ') || 'all hidden');

  check('world: station rail built', await page.locator('.world-rail button').count() === STATIONS.length);

  const geometry = await page.evaluate(() => {
    const e = window.__site.experience;
    return { calls: e.renderer.info.render.calls, points: e.renderer.info.render.points, tris: e.renderer.info.render.triangles };
  });
  check('world: WebGL layers drawing', geometry.points > 20000 && geometry.tris > 0, JSON.stringify(geometry));

  // Fly the whole route.
  const trip = [];
  for (let i = 0; i < STATIONS.length; i++) {
    await page.evaluate((idx) => window.__site.goToStation(idx, { immediate: true }), i);
    // Poll for convergence rather than trusting a fixed wait: this browser
    // renders in software at single-digit fps, and the camera smoothing runs
    // per frame, so a fixed timeout measures the renderer, not the rig.
    await page
      .waitForFunction(
        (idx) => {
          const e = window.__site.experience;
          const p = e.rig.poses[idx];
          return e.camera.position.distanceTo(p.position) < 3 + p.pan;
        },
        i,
        { timeout: 15000, polling: 200 }
      )
      .catch(() => {});
    trip.push(await page.evaluate((idx) => {
      const e = window.__site.experience;
      const visible = e.stage.panels.filter((p) => p.el.style.visibility !== 'hidden' && +p.el.style.opacity > 0.5);
      return {
        drift: +e.camera.position.distanceTo(e.rig.poses[idx].position).toFixed(2),
        pan: +e.rig.poses[idx].pan.toFixed(2),
        onStation: visible.filter((p) => p.stationIndex === idx).length,
        strays: visible.filter((p) => Math.abs(p.stationIndex - idx) > 1).length,
      };
    }, i));
    await page.screenshot({ path: `${OUT}/world-${STATIONS[i]}.png` });
  }

  // A station that pans parks part-way through its dwell, so allow its pan.
  check('world: camera converges on every station',
    trip.every((t, i) => t.drift < 3 + (t.pan ?? 0)),
    `max drift ${Math.max(...trip.map((t) => t.drift)).toFixed(2)} units`);
  check('world: each station shows its own panels', trip.every((t) => t.onStation > 0),
    trip.map((t) => t.onStation).join(','));
  check('world: distant stations culled', trip.every((t) => t.strays === 0),
    `${trip.reduce((n, t) => n + t.strays, 0)} stray panel(s)`);

  // Content is still real, interactive DOM — the whole reason for CSS3D.
  const content = await page.evaluate(() => {
    const email = document.querySelector('.contact-email');
    return { href: email?.getAttribute('href'), text: document.querySelector('.proj-title')?.textContent };
  });
  check('world: links survive as real DOM', content.href === 'mailto:s.hameedakmal@gmail.com', content.href);
  check('world: text survives as real DOM', content.text === 'AI Resume Search', content.text);

  // Nav anchor should fly to the matching station.
  await page.evaluate(() => window.__site.goToStation(0, { immediate: true }));
  await page.waitForTimeout(1200);
  await page.click('.nav-links a[href="#skills"]');
  // Clicking parks the mouse over the nav, and cursor parallax is real camera
  // movement — recentre the pointer so the measurement is of the flight alone.
  await page.mouse.move(720, 450);
  await page.waitForTimeout(4000);
  const atSkills = await page.evaluate((idx) => {
    const e = window.__site.experience;
    return +e.camera.position.distanceTo(e.rig.poses[idx].position).toFixed(1);
  }, SKILLS_STATION);
  check('world: nav anchor flies to its station', atSkills < 6, `${atSkills} units from the skills dock pose`);

  // Poll rather than sample: the typewriter holds a completed word for 2.2s,
  // so any fixed pair of samples can legitimately match.
  const tw1 = await page.textContent('#tw');
  let tw2 = tw1;
  for (let i = 0; i < 25 && tw2 === tw1; i++) {
    await page.waitForTimeout(200);
    tw2 = await page.textContent('#tw');
  }
  check('world: typewriter runs inside a panel', tw1 !== tw2, `"${tw1}" -> "${tw2}"`);
  const strip = await page.evaluate(() => ({
    clock: document.getElementById('local-time')?.textContent?.trim() ?? '',
    resume: document.querySelector('.ha-btn.is-primary')?.getAttribute('href') ?? '',
    actions: document.querySelectorAll('.hero-availability .ha-btn').length,
  }));
  check('world: local clock is live inside a panel', /^\d{2}:\d{2}\s+\S+$/.test(strip.clock), strip.clock);
  check('world: r\u00e9sum\u00e9 and profile links present', strip.resume.endsWith('.pdf') && strip.actions === 3,
    `${strip.resume}, ${strip.actions} actions`);

  // ── The core guarantee ────────────────────────────────────────────────
  // Docked panels must render at EXACTLY 1:1. getBoundingClientRect is
  // axis-aligned, so rect.width === offsetWidth proves both that the scale is
  // 1 and that nothing is rotated on screen. This is the regression guard for
  // the entire docked-reading design.
  const oneToOne = [];
  for (let i = 0; i < STATIONS.length; i++) {
    await page.evaluate((idx) => window.__site.goToStation(idx, { immediate: true }), i);
    await page.waitForTimeout(1400);
    oneToOne.push(await page.evaluate((idx) => {
      const e = window.__site.experience;
      const panels = e.stage.panels.filter((p) => p.stationIndex === idx);
      const worst = Math.max(...panels.map((p) => {
        const r = p.el.getBoundingClientRect();
        return Math.max(Math.abs(r.width - p.el.offsetWidth), Math.abs(r.height - p.el.offsetHeight));
      }));
      return { id: e.stage.stations[idx].id, worst: +worst.toFixed(2) };
    }, i));
  }
  const worstOverall = Math.max(...oneToOne.map((s) => s.worst));
  check('world: every docked panel renders at exactly 1:1', worstOverall <= 1,
    `worst deviation ${worstOverall}px (${oneToOne.filter((s) => s.worst > 1).map((s) => s.id).join(', ') || 'all within 1px'})`);

  // Scale must not drift while panning a station taller than the viewport.
  const panning = await page.evaluate(() => {
    const e = window.__site.experience;
    const i = e.rig.poses.findIndex((p) => p.pan > 0.5);
    if (i < 0) return null;
    const seg = e.rig.segments.find((s) => s.type === 'dock' && s.i === i);
    return { i, start: seg.start, end: seg.end, id: e.stage.stations[i].id };
  });
  if (panning) {
    const scales = [];
    for (const t of [0, 0.33, 0.66, 1]) {
      await page.evaluate((prog) => {
        window.scrollTo(0, prog * (document.documentElement.scrollHeight - window.innerHeight));
      }, panning.start + (panning.end - panning.start) * t);
      await page.waitForTimeout(700);
      scales.push(await page.evaluate((idx) => {
        const e = window.__site.experience;
        const p = e.stage.panels.filter((x) => x.stationIndex === idx).pop();
        return +(p.el.getBoundingClientRect().width / p.el.offsetWidth).toFixed(3);
      }, panning.i));
    }
    check('world: scale holds at 1:1 while panning a tall station',
      scales.every((v) => v === 1), `${panning.id}: ${scales.join(', ')}`);
  } else {
    check('world: scale holds at 1:1 while panning a tall station', false, 'no panning station found');
  }

  // Motion must be exactly zero at rest, or "nearly docked" reintroduces the
  // resampling this design exists to remove.
  await page.evaluate(() => window.__site.goToStation(0, { immediate: true }));
  await page.mouse.move(200, 200);
  await page.waitForTimeout(1200);
  const atRest = await page.evaluate(() => {
    const e = window.__site.experience;
    const pose = e.dockPoses[0];
    return {
      transit: +e.rig.update(0).transit.toFixed(4),
      offset: +e.camera.position.distanceTo(pose.position).toFixed(3),
      roll: +Math.abs(e.camera.rotation.z).toFixed(4),
    };
  });
  check('world: camera is perfectly still while docked',
    atRest.transit === 0 && atRest.offset < 0.01 && atRest.roll < 0.001, JSON.stringify(atRest));

  // Palette: guard against a silent regression to the old generic blue.
  const palette = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    // Browsers normalise #ff9900 to #f90, so compare on resolved rgb().
    const resolve = (name) => {
      const probe = document.createElement('span');
      probe.style.color = cs.getPropertyValue(name).trim();
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    };
    return { accent: resolve('--accent'), accent2: resolve('--accent2'), orange: resolve('--orange') };
  });
  check('world: terminal-phosphor palette in use',
    palette.accent === 'rgb(0, 237, 100)' &&
    palette.accent2 === 'rgb(255, 176, 0)' &&
    palette.orange === 'rgb(255, 153, 0)',
    JSON.stringify(palette));

  // The shell has to actually answer, not just look like a shell.
  await page.evaluate((idx) => window.__site.goToStation(idx, { immediate: true }), STATIONS.indexOf('terminal'));
  await page.waitForTimeout(1800);
  const shell = await page.evaluate(async () => {
    const out = document.getElementById('term-out');
    const input = document.getElementById('term-in');
    const before = out.querySelectorAll('.t-line').length;
    const results = {};
    for (const cmd of ['stack', 'uptime', 'architecture', 'bogus-command']) {
      input.value = cmd;
      document.getElementById('term-form').requestSubmit();
      results[cmd] = out.lastElementChild.textContent.trim().slice(0, 40);
    }
    return { added: out.querySelectorAll('.t-line').length - before, results,
             pinned: out.scrollTop + out.clientHeight >= out.scrollHeight - 6 };
  });
  check('world: shell answers real commands', shell.added >= 8 && shell.results.stack.length > 5,
    JSON.stringify(shell.results.stack));
  check('world: shell reports unknown commands', /not found/.test(shell.results['bogus-command']));
  check('world: shell log stays pinned after re-parenting', shell.pinned);

  const arch = await page.evaluate(() => ({
    nodes: document.querySelectorAll('#arch-search .arch-node').length,
    why: document.querySelectorAll('#arch-search .arch-why li').length,
    second: document.querySelectorAll('#arch-interview .arch-node').length,
  }));
  check('world: architecture diagrams present', arch.nodes >= 6 && arch.second >= 5 && arch.why >= 3,
    JSON.stringify(arch));

  check('world: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ─────────────────────────────────────── 2 & 3. cold-start fallbacks
for (const [label, opts, init] of [
  ['reduced-motion', { reducedMotion: 'reduce' }, null],
  ['no-webgl', {}, () => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (String(type).includes('webgl')) return null;
      return orig.call(this, type, ...rest);
    };
  }],
]) {
  const { ctx, page, errors, requests } = await newCtx(browser, opts);
  if (init) await page.addInitScript(init);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  check(`${label}: tier is none`, (await page.getAttribute('html', 'data-quality')) === 'none');
  check(`${label}: stays a plain document`, !(await page.evaluate(() => document.documentElement.classList.contains('world-3d'))));
  check(`${label}: no CSS3D layer`, await page.locator('.css3d-layer').count() === 0);
  check(`${label}: 2D backdrop used`, await page.locator('#bg-2d').count() === 1);
  check(`${label}: three chunk NEVER fetched`, !requests.some((u) => /three-.*\.js/.test(u)));
  check(`${label}: sections visible`, await page.evaluate((ids) =>
    ids.every((id) => getComputedStyle(document.getElementById(id)).display !== 'none'), DOC_SECTIONS));
  check(`${label}: shell works without 3D`, await page.evaluate(() => {
    document.getElementById('term-in').value = 'uptime';
    document.getElementById('term-form').requestSubmit();
    return /in production/.test(document.getElementById('term-out').textContent);
  }));
  check(`${label}: content still works`, /^\d{2}:\d{2}/.test(
    (await page.textContent('#local-time')).trim()));
  await page.screenshot({ path: `${OUT}/${label}.png` });
  check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ──────────────────────── 4. runtime bail-out: world -> plain document
{
  const { ctx, page, errors } = await newCtx(browser);
  await page.goto(URL + '?tier=high', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { window.__site.experience.watchdog.enabled = false; });
  await page.evaluate(() => window.__site.forceFallback());
  await page.waitForTimeout(1200);

  const after = await page.evaluate(() => ({
    world: document.documentElement.classList.contains('world-3d'),
    layer: !!document.querySelector('.css3d-layer'),
    has2d: !!document.getElementById('bg-2d'),
    has3d: !!document.getElementById('bg-3d'),
    // Every panel must be back inside its original section.
    homed: ['#contact .contact-card', '#projects .proj-card', '#skills .sk-group', '.hero-content',
            '#terminal #term', '#architecture #arch-search', '#architecture #arch-interview']
      .every((sel) => !!document.querySelector(sel)),
    sectionsVisible: getComputedStyle(document.getElementById('projects')).display !== 'none',
    inlineWidth: document.querySelector('#contact .contact-card')?.style.width || '',
  }));

  check('bail-out: world mode removed', !after.world);
  check('bail-out: CSS3D layer torn down', !after.layer);
  check('bail-out: 3D canvas swapped for 2D', after.has2d && !after.has3d);
  check('bail-out: every panel returned to its section', after.homed);
  check('bail-out: inline panel styles cleaned up', after.inlineWidth === '', `width="${after.inlineWidth}"`);
  check('bail-out: document sections visible again', after.sectionsVisible);

  // Assert the reveals keep firing as you scroll, rather than a count at one
  // arbitrary offset — the document grew and that number moves with it.
  const before = await page.evaluate(() => document.querySelectorAll('.fi.in').length);
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    await page.evaluate((f) => window.scrollTo(0, document.body.scrollHeight * f), frac);
    await page.waitForTimeout(500);
  }
  const revealed = await page.evaluate(() => document.querySelectorAll('.fi.in').length);
  check('bail-out: document reveals re-armed', revealed > before && revealed > 10,
    `${before} -> ${revealed} revealed`);
  await page.screenshot({ path: `${OUT}/bail-out.png` });
  check('bail-out: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ──────────────────────────────────────────────────────── 5. mobile
{
  const { ctx, page, errors, requests } = await newCtx(browser, {
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  });
  // Force a tier the device could render, to prove the *viewport* gate is what
  // refuses the world here — not the GPU check.
  await page.goto(URL + '?tier=high', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  check('mobile: viewport gate refuses world mode',
    !(await page.evaluate(() => document.documentElement.classList.contains('world-3d'))));
  check('mobile: falls back to the plain document',
    await page.evaluate(() => getComputedStyle(document.getElementById('projects')).display !== 'none'));
  check('mobile: 2D backdrop used', await page.locator('#bg-2d').count() === 1);
  check('mobile: three chunk NEVER fetched', !requests.some((u) => /three-.*\.js/.test(u)));
  check('mobile: content readable at document size',
    await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.proj-desc')).fontSize) >= 13));
  check('mobile: no horizontal overflow', !(await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 1)));
  await page.screenshot({ path: `${OUT}/mobile.png` });
  check('mobile: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ────────────────────────────── 6. auto-detection rejects software GPUs
{
  const { ctx, page } = await newCtx(browser);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('auto-detect: software GPU rejected to none',
    (await page.getAttribute('html', 'data-quality')) === 'none');
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED:');
  failed.forEach((f) => console.log(' - ' + f.name + (f.detail ? ' — ' + f.detail : '')));
  process.exit(1);
}
