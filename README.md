# akmal.sh — personal site

Personal site for Akmal Hameed. Dark, readable, built around one idea: every
skill links to the work that proves it. Tap a skill chip and the cards where it
was used light up; the rest dim.

Up top: availability, a "right now" card, and a facts strip (years of
experience, roles, degree, location). Experience and education sit side by
side. The résumé PDF (`public/Akmal_Hameed.pdf`) downloads from the sticky bar,
the "right now" card and the footer.

## Stack

- Static HTML (`index.html`), one stylesheet (`src/style.css`) and a small script (`src/main.js`).
- All content is plain HTML; JS only adds the skill filter, the copy-email button, and keeps the years of experience and role durations current (computed from start dates).
- Dark-only by design. Fonts: Onest and Geist Mono from Google Fonts.
- Vite bundles and fingerprints assets. No runtime dependencies.

To add a piece of work, add an `<article class="card" data-skills="A|B|C">` in
`index.html`. Chip counts update automatically, and the smoke test fails if any
skill chip has no card behind it.

## Develop

```sh
npm install
npm run dev        # local dev server
npm run build      # production build → dist/
npm test           # build first; spawns vite preview and runs tests/smoke.mjs
```

The smoke test (37 checks) verifies content (sections, nav links, facts,
computed years of experience, roles, education, résumé download links and PDF
served), that every skill has evidence, the skill filter, readability (≥16px
body text, line measure, no horizontal overflow at 1440px and 375px), the dark
theme, and the copy-email button. Screenshots land in `tests/shots/`.

## Deploy

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds with Vite
and publishes `dist/` to GitHub Pages.

**Gotcha:** GitHub Pages must be set to deploy from **GitHub Actions**
(Settings → Pages → Source), not from the branch. Serving the repo verbatim
ships the source `index.html`, whose `/src/main.js` module import can't resolve
in a browser without the build step.
