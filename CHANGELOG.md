# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [Unreleased]

### Security

- Bumped `vite` `^7.2.2` → `^7.3.2` to clear GHSA-4w7w-66w2-5vf9, GHSA-v2wj-q39q-566r, and GHSA-p9ff-h696-f583 (and transitively patched `rollup`, `picomatch`, `postcss`).
- Added `package.json` `overrides` to force patched `lodash-es@^4.18.1` (clears GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh) and `dompurify@^3.4.2` (clears GHSA-39q2-94rc-95cp + three related advisories) through `@logseq/libs`. `npm audit` now reports 0 vulnerabilities; the previously documented "Accepted Risk" entries in `CLAUDE.md` are no longer applicable.
- `escapeHtml` now also escapes `'` — defensive: no live XSS, but a future single-quoted attribute template would have silently regressed.

### Changed

- Upgraded `@logseq/libs` from 0.2.12 to 0.3.2. Adds MessageChannel-based host↔plugin messaging (performance); clears the dompurify GHSA-v2wj-7wpq-c8vv advisory via the transitive bump to 3.3.3. No call-site changes required; all APIs the plugin uses are signature-compatible.
- Added `src/__sdk_guard__.ts` — a compile-time assertion that references `logseq.App.getCurrentRoute` (new in 0.3.x). `npm run typecheck` will fail if the SDK is ever downgraded below 0.3.1. Not imported at runtime; tree-shaken out of the bundle.
- Renamed `dev` script to `watch` (`vite build --watch`) for clarity; added explicit `serve` script (`vite serve`) for the dev HTTP server.
- Removed unused `vite-plugin-logseq` devDependency (replaced by local `vite-logseq-safe-plugin.ts`).
- Extended `tsconfig.json` `include` to cover `vite.config.ts` and `vite-logseq-safe-plugin.ts` so `npm run typecheck` validates all project TypeScript.
- Narrowed `.gitignore` from `.vscode/` to `.vscode/*.code-workspace` so `settings.json` is tracked.
- Moved `test-insert.js` to `scripts/test-insert.js`; added usage comment header.

### Fixed

- `registerSlashCommand` callback marked `async` to satisfy `BlockCommandCallback` return-type constraint (latent TypeScript error surfaced by the expanded typecheck scope).

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
