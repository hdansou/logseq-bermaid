# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [Unreleased]

## [0.2.3] - 2026-05-02

### Changed

- Plugin `id` simplified to `logseq-bermaid` (was `logseq-hdansou-bermaid` in 0.2.2; never published to the marketplace under that id). This is the canonical identifier going forward; future releases will not rename it.
- README: added a Credits section attributing [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) by lukilabs and the [Mermaid](https://github.com/mermaid-js/mermaid) project; the upstream link in the intro now points at the GitHub repo (npm secondary).

## [0.2.2] - 2026-05-02

First marketplace-targeted release. Hardening pass: zero `npm audit` advisories, faster cold-load via code splitting, and repo metadata aligned with the canonical `hdansou/logseq-bermaid` repo.

### Security

- Bumped `vite` `^7.2.2` → `^7.3.2` clearing GHSA-4w7w-66w2-5vf9, GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583 (and transitively patches `rollup`, `picomatch`, `postcss`).
- Added `package.json` `overrides` for `lodash-es@^4.18.1` (clears GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh) and `dompurify@^3.4.2` (clears GHSA-39q2-94rc-95cp + three related advisories). `npm audit` now reports 0 vulnerabilities.
- `escapeHtml` now also escapes `'` — defensive against future single-quoted attribute templates.

### Performance

- Code-split `beautiful-mermaid` via dynamic `import()`. Cold-load main chunk drops from 1.71 MB to 120 KB (510 KB → 39 KB gzip); the renderer bundle loads on first `{{renderer :bermaid}}` slot.

### Changed

- Upgraded `@logseq/libs` 0.2.12 → 0.3.2. Adds MessageChannel-based host↔plugin messaging. Compile-time minimum SDK version pinned via `src/__sdk_guard__.ts`.
- Plugin `id` renamed `logseq-danzu-bermaid` → `logseq-hdansou-bermaid`; repo URLs in `package.json`, docs, and `homepage` now point at `hdansou/logseq-bermaid`.
- `package.json` `logseq` block declares `minSDKVersion: "0.3.2"` for marketplace consumers.
- `src/index.ts` slimmed 754 → 660 LOC: cache (`CappedMap` + LRU instances) extracted to `src/cache.ts`; render pipeline (`renderDiagram`, `copyImageToClipboard`, lazy beautiful-mermaid loader) extracted to `src/render.ts`.
- Tightened `any` at SDK boundaries — `BlockEntity` / `BlockUUIDTuple` types from `@logseq/libs`; explicit `Array.isArray` check on the children-tuple form.
- Repo hygiene: untracked `.vscode/settings.json`; broadened `.gitignore` (`.env*`, `.vite/`, `.cache/`, `*.local.*`, `tmp/`, `scratch/`); dropped obsolete `TODO.md` and `tasks.md` (folded into `CHANGELOG.md`).
- CI + publish workflows bumped Node 20 → 22 (current LTS).
- Renamed `dev` → `watch` script; added explicit `serve` script.
- Removed unused `vite-plugin-logseq` devDependency (replaced by local `vite-logseq-safe-plugin.ts`).

### Fixed

- `registerSlashCommand` callback marked `async` to satisfy `BlockCommandCallback` return-type constraint.

## [0.2.1] - 2026-03-01

### Fixed

- **Copy button crash** — `logseq.Experiments.ensureHostScope()` returns a plain value (not a Promise) in the current Logseq version; calling `.catch()` on it threw `is not a function`. Both call sites now use `try/catch` (clipboard fallback) and `Promise.resolve()` (host scope setup) to handle both sync and async returns safely.
- **Copy button redesign** — replaced the wide `📋 Copy` text button (whose background was incorrectly inheriting a theme variable, rendering as a native OS system button) with a compact 30×30 px icon-only button using an inline SVG clipboard icon and a frosted-glass dark background that works on any diagram theme.

## [0.2.0] - 2026-03-01

### Added

- **Lightbox zoom & pan** — mouse wheel zooms toward the cursor (12.5% – 800%); click-drag pans the diagram.
- **Zoom controls bar** — fixed pill at the bottom of the lightbox with `−`, `+`, and `⊙` (reset) buttons and a live zoom-level label.
- **Lightbox close button (✕)** — circular button in the top-right corner of the lightbox; equivalent to pressing Esc or clicking the backdrop.

### Fixed

- `/bermaid` slash command no longer silently fails to write `{{renderer :bermaid}}` to the parent block; `exitEditingMode` is now called before `updateBlock` so the live editor does not suppress the write.
- Eliminated the "No child block found" error flash immediately after inserting via `/bermaid`; the macro renderer now retries the child-block lookup for up to 1.5 s before showing the error state.

### Changed

- Pinned `beautiful-mermaid` to `1.1.3` (was `latest`) for reproducible builds.
- Added `.github/workflows/ci.yml` CI gate running `npm ci`, `typecheck`, and `build` on push to `main` and all pull requests.
- Host document event listeners are now explicitly removed on plugin unload via named handler references in `beforeunload`.
- Non-retryable `updateBlock` failures in the slash command are now surfaced as a user-visible error toast instead of a silent `console.warn`.

## [0.1.0] - 2026-02-12

### Added

- Initial Bermaid release.
- `{{renderer :bermaid}}` macro renderer using `beautiful-mermaid`.
- `/bermaid` slash command with starter diagram template.
- Theme support (`auto` + manual theme selection).
- PNG copy support (button + context menu).
- Drag resize handles with DB graph width persistence.
