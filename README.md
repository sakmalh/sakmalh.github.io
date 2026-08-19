# akmal.sh

A personal site built as a **3D world**. The content isn't a page with a 3D
backdrop — the sections *are* places in space, and scrolling flies a camera
through them.

## Running it

```bash
npm install
npm run dev        # dev server with HMR
npm run build      # static bundle -> dist/
npm run preview    # serve the built bundle
```

`vite.config.js` uses `base: './'`, so `dist/` deploys as-is to Vercel, Netlify,
GitHub Pages, or any static host.

## Palette and voice

The palette is the stack, not a theme: **MongoDB green** (`#00ed64`) leads,
**phosphor amber** (`#ffb000`) carries metrics, place and time, and **AWS
orange** (`#ff9900`) marks infrastructure, on near-black. Channels live in
`base.css` as raw RGB triplets (`--c-green`, `--c-amber`, `--c-aws`,
`--c-text`, `--c-bg`) so every alpha variant derives from one source —
`rgba(var(--c-green), 0.2)` rather than a hand-mixed literal that drifts.
`tests/smoke.mjs` asserts the resolved values, so a regression to the old
generic blue fails the build rather than shipping quietly.

Typography splits by role: **monospace carries structure** — labels, keys,
metrics, coordinates, anything the eye should read as data — and **sans carries
prose**. That split is `src/styles/systems.css`.

## Content

Three things exist to give context rather than assert it:

- **`#terminal`** — a shell that actually answers (`src/ui/terminal.js`).
  `whoami`, `stack`, `experience`, `projects`, `architecture`, `education`,
  `uptime`, `contact`, `neofetch`, plus tab completion and history. It reads
  from the same constants the page does, so there is one source of truth.
- **`#architecture`** — the two production systems drawn honestly: the
  multi-tenant candidate search path and the interview agent graph, each with a
  short "why it's built this way" list covering the decisions that only exist
  because the naive version didn't hold up.
- **Experience copy** — engineering decisions, not feature lists. Why chunks are
  max-pooled, why the query splits before it searches, why there's a critic node.

## How the world works

### Content lives in the world, not behind it

Panels are **real DOM elements transformed in 3D** via `CSS3DRenderer`
(`src/three/Stage.js`). Baking the content into WebGL textures or text meshes
would look marginally more unified, but this is a resume: the text has to stay
selectable, the links clickable, the markup crawlable and screen-reader
navigable. CSS3D keeps all of that while still putting the content in space.

The WebGL canvas sits behind the CSS3D layer, so the two never depth-interleave.
Everything is composed with that in mind — particle formations sit *behind* the
panels (`FIELD_SETBACK` in `world/World.js`), never in front.

### Stations

`src/three/world/layout.js` is the map. Eleven stations, each with a world
position, an approach direction, a particle formation, a landmark, and its
panels. Dense sections are split across **sub-stations** — framing six project
cards at once shrinks each below reading size, so they get two stops of three.
That's why `formation` is a separate field from the station index: consecutive
sub-stations share a formation, so the particle field holds its shape while you
move between them.

Panels are placed either by explicit `offset` or by `row`/`col` in the station's
auto-grid. **Panel heights are measured after mount, never assumed** — resume
copy reflows, and a guessed height clips it.

Two things that will bite anyone editing this:

- **Panel elements must sit at the CSS3D container's origin.** `CSS3DRenderer`
  transforms from that origin and assumes the element is already there. Any
  `margin` or `max-width` the element carried in the document offsets or shrinks
  it — and because the offset is then multiplied by the perspective scale, a
  `3rem` top margin became ~3500px of drift. `Stage` pins `margin/top/left/
  max-width` inline to prevent it, and `tests/smoke.mjs` asserts no panel
  carries a layout offset.
- **Hiding the document shells needs id-level specificity.** `#hero` sets
  `display: flex` in `components.css`, and an id selector outranks any
  element/class combination, so `world.css` lists the sections by id.
- **Selectors that depend on a panel's old ancestors stop matching.** Once an
  element is docked, it is no longer inside `.about-grid` or `#contact`. Style
  panels by a class on the element itself (that is why `.about-lede` exists).
- **Re-parenting resets scroll.** The terminal's log is scrollable, and moving
  it into the CSS3D container silently scrolled it back to the top; `main.js`
  calls `pinTerminal()` after the stage mounts.
- **Fixed chrome has to be accounted for.** Stations centre in the area the nav
  and footer leave free (`Stage.chromeInset`), not in the raw viewport, or a
  station's heading docks behind the nav bar.

### Docked reading — the thing that makes it legible

Panels are read at **exactly 1:1 pixel scale**. This is the core of the design,
and it exists because the obvious approach does not work: if the camera frames
a station by pulling back, the camera decides how big your text is, CSS3D
resamples every glyph, and no amount of font-size tuning recovers it.

`CSS3DRenderer` sets `perspective(fov px)` where
`fov = heightHalf / tan(fovY/2)`, so an object at camera-space depth `d` renders
at CSS scale `fov / d`. Solving `PANEL_SCALE * fov / d === 1` gives

```
DOCK_DISTANCE = PANEL_SCALE * heightHalf / tan(fovY / 2)
```

**One distance, the same for every station, independent of panel size**
(`Stage.dockDistance`). At 900px tall and 52° fov that is 18.45 world units.

Scale alone isn't enough — the panel must also be screen-parallel and unrolled,
or the text is crisp but tilted. So each station carries a **dock quaternion**
built from a plain `lookAt` against world up (no roll), the camera adopts it
directly instead of calling `lookAt` each frame, and every panel in the station
adopts it too.

Three consequences that constrain everything else:

- **Panels in a station are coplanar.** Every offset has `z = 0`. Staggering one
  forward by `z` would render it `fov/(d-z)` larger — crisp, but the wrong size.
  Depth lives *between* stations.
- **Offsets are applied in the dock plane's basis**, not world axes
  (`Stage.#place`). A station whose `view` is tilted has a tilted plane; adding
  world-axis offsets pushes side panels off it, and they land at a different
  depth and a different scale. This was the single biggest bug in the build.
- **Nothing is ever scaled to fit.** A station too tall for the viewport is read
  by translating the camera along its own up axis, which never changes distance
  and so never changes scale. Too wide, and the panels are *re-authored*
  narrower so the text re-wraps at its real size — and past `STACK_THRESHOLD`
  the station collapses to a single centred column.

### Camera

The journey is a chain of alternating segments (`src/three/CameraRig.js`):

```
DOCK(0) → TRANSIT(0→1) → DOCK(1) → TRANSIT(1→2) → …
```

During `DOCK` the camera holds the station's pose exactly — no easing toward it,
because "nearly docked" is precisely the resampled-text problem this design
removes. A station's dwell length grows with how far it has to pan, so the
scroll track height is computed from the rig at runtime rather than hardcoded.

`transit` is 0 at both docks and peaks mid-flight. Cursor parallax, camera bank
and the brightness of the whole particle field are all multiplied by it, so the
world is vivid while you fly and still while you read.

Scroll stays native — a tall empty `#scroll-track` supplies the distance, Lenis
only smooths it. Keyboard, trackpad and screen readers keep working. Nav anchors
fly to the matching station. **Programmatic navigation must go through
`window.__site.goToStation`** — calling `window.scrollTo` directly fights Lenis
and strands the camera mid-flight.

### WebGL layers

| Layer | File | Moves with you? |
|---|---|---|
| Particle field — up to 60k points, eight formations | `world/ParticleField.js` | yes |
| Agent graph — instanced nodes + edges | `world/AgentGraph.js` | yes |
| Signal flow — pulses along the edges | `world/SignalFlow.js` | yes |
| Landmarks — core, stream, orbits, pipeline, spine, platforms, lattice, beacon, route line | `world/Landmarks.js` | no, they're places |

Formations are computed **in the vertex shader** from a per-particle seed
(`world/shaders/particles.js`) rather than stored per shape: ~2.4MB of
attributes instead of ~11MB, and morphing costs nothing on the CPU.

## When the world doesn't run

The world is opt-in at runtime via `html.world-3d`. Without that class the page
is the plain scrolling document it has always been — which is also the no-JS
experience. Two independent gates must both pass:

1. **The device can render it** — `src/three/quality.js` resolves a tier before
   three.js is imported.
2. **The viewport can display it legibly** — at least 720×520. Panels are never
   scaled down, but a station still has to fit; below this the responsive
   collapse bottoms out. Smaller screens get the document version, which reads
   well there.

| Tier | Particles | DPR cap |
|---|---|---|
| `high` | 60k | 2.0 |
| `medium` | 24k | 1.5 |
| `low` | 6k | 1.0 |
| `none` | — | — |

On `none` the three.js chunk is **never fetched** — `main.js` reaches it only
through a dynamic `import()` behind the check. Triggers: no WebGL, a software or
known-weak GPU, a low-end mobile (≤4 cores or ≤2GB on a small touch screen), or
`prefers-reduced-motion: reduce`.

Static checks can't predict thermal throttling, so an FPS watchdog measures
reality: sustained sub-40fps steps down a tier, and a device still struggling on
`low` is dropped out of the world entirely. Bailing out mid-session returns
every panel to its original place in the document (`Stage.restore`) and re-arms
the document's scroll reveals. Rendering stops completely when the tab is hidden.

Append `?tier=high|medium|low|none` to force a tier and inspect any level.

## Tests

```bash
npm run build && npm run preview   # in one terminal
npm run test                       # 59 checks, in another
npm run test:watchdog              # ~20s; watches the downgrade chain
```

`tests/smoke.mjs` flies the whole route. The load-bearing assertions are the
1:1 ones — that every docked panel's `getBoundingClientRect()` matches its
`offsetWidth`/`offsetHeight` within 1px (an axis-aligned rect proves both unit
scale *and* zero rotation), that the scale never leaves 1.0 while panning a tall
station, and that the camera is perfectly still while docked. It also checks the
camera settles at each station, each station shows its own panels, distant
stations are culled, and no panel carries a layout offset. It also covers both cold-start fallbacks
(reduced-motion, no-WebGL), the mobile viewport gate, the runtime bail-out
(including that every panel returns to its section with inline styles cleaned
up), and that links and text survive as real DOM. Screenshots land in
`tests/shots/`.

`tests/watchdog.mjs` forces `high` on a software-rendered browser and asserts the
full high → medium → low → document chain fires.

Both drive your installed Chrome via Playwright (`channel: 'chrome'`), so no
browser download is needed. Set `SITE_URL` to point either suite elsewhere.
