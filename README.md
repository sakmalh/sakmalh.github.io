# akmal.sh — personal site

Personal site for Akmal Hameed, told as a scroll story. A generic 3D figure sits
at a desk (the real photo, `public/akmal.jpg`, is on the About card); as you scroll, the camera moves to
the part of the room that goes with each chapter: the face for About, a
thought graph above the head for the AI agent, the laptop for search and
billing, a server rack for the junior role, a whiteboard for the internship,
diplomas for education and a shelf of objects for side projects. Every résumé
point sits in a text card beside the scene, so nothing depends on the 3D.

The résumé PDF (`public/Akmal_Hameed.pdf`) downloads from the top bar, the
intro and the contact card.

## Stack

- All content is plain HTML in `index.html`: one `<section class="chap">` per chapter.
- `src/main.js` builds the chapter rail, keeps years of experience and role
  durations current, wires the copy-email button, then lazy-loads the scene.
- `src/story.js` is the three.js scene. Camera stops are keyed by section id
  in `STOPS`; chapter props fade in by the same ids.
- three.js ships as its own chunk and loads only after the page has rendered.
  Browsers without WebGL (or with Save-Data on) get `body.no-3d`: the same cards
  as a plain page, and three.js is never downloaded.
- Reduced motion keeps the scroll-driven camera but drops idle animation.
- Dark-only by design. Fonts: Onest and Geist Mono from Google Fonts.

To add a chapter: add a `<section class="chap" id="…" data-side="left|right"
data-name="…" data-c="#hex">` in `index.html` and a matching camera stop in
`STOPS` in `src/story.js`.

## Develop

```sh
npm install
npm run dev        # local dev server
npm run build      # production build → dist/
npm test           # build first; spawns vite preview and runs tests/smoke.mjs
```

The smoke test (34 checks) verifies content (chapters in order, rail links,
every résumé item present, stack lines, computed years and durations, photo,
résumé links and PDF served), that the 3D scene loads, renders at every stop and
moves between them, the no-WebGL fallback, layout at 1440px and 375px, reduced
motion, the dark theme, and the copy-email button. Screenshots of every stop
land in `tests/shots/`.

## Deploy

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds with Vite
and publishes `dist/` to GitHub Pages.

**Gotcha:** GitHub Pages must be set to deploy from **GitHub Actions**
(Settings → Pages → Source), not from the branch. Serving the repo verbatim
ships the source `index.html`, whose `/src/main.js` module import can't resolve
in a browser without the build step.
