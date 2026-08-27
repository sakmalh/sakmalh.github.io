# akmal.sh — personal site

Personal site for Akmal Hameed, styled as a GitHub README: repo-style header,
status badges, plain markdown-flavored typography, and ASCII architecture
diagrams. Optimized for one thing — a recruiter or engineer finding the facts
fast.

## Stack

- Static HTML + one stylesheet (`src/style.css`) + ~20 lines of JS (`src/main.js`, clipboard buttons).
- No frameworks, no Three.js, no runtime dependencies. Vite is used only to bundle and fingerprint assets.
- Light/dark follows the visitor's `prefers-color-scheme`; palette follows GitHub Primer in both themes.

## Develop

```sh
npm install
npm run dev        # local dev server
npm run build      # production build → dist/
npm test           # build first; spawns vite preview and runs tests/smoke.mjs
```

The smoke test (30 checks) verifies content completeness (sections, TOC links,
contact links, résumé PDF served), readability (≥16px body text, line measure,
no horizontal overflow at 1440px and 375px), dark scheme rendering, and the
copy-email button. Screenshots land in `tests/shots/`.

## Deploy

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds with Vite
and publishes `dist/` to GitHub Pages.

**Gotcha:** GitHub Pages must be set to deploy from **GitHub Actions**
(Settings → Pages → Source), not from the branch. Serving the repo verbatim
ships the source `index.html`, whose `/src/main.js` module import can't resolve
in a browser without the build step.
