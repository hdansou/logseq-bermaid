# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [Unreleased]

## [0.4.0] - 2026-08-24

Interaction fixes plus live editing. Drag-to-resize and the lightbox controls work again for marketplace installs, and editing a diagram's source now updates the render without a reload.

### Added

- **Live re-render on edit.** Editing a diagram's mermaid source now updates the rendered SVG in place — no page reload required. The plugin subscribes to `logseq.DB.onChanged` and re-renders the affected tracked diagram, debounced per macro (~350 ms) so typing stays smooth. Previously a diagram only re-rendered when its macro re-fired (initial load, reload, or width write). Thanks to [@Xanaxus](https://github.com/Xanaxus) ([#1](https://github.com/hdansou/logseq-bermaid/pull/1)).

### Fixed

- **Drag-to-resize, lightbox pan/wheel-zoom, and Esc-to-close were silently broken for marketplace installs.** v0.2.x–v0.3.0 attached mouse/keyboard listeners to the host document via `logseq.Experiments.ensureHostScope()`. In marketplace installs the plugin loads in a sandboxed iframe (cross-origin with the host), so `window.top.document` access throws a `SecurityError`; the `if (hostDoc)` branch silently became a no-op and none of those listeners attached. The macro-argument width path (`{{renderer :bermaid, 500}}`) kept working because it doesn't depend on host-doc events, which is why the bug was easy to miss. Fixed by setting `"mode": "shadow"` in the manifest so the plugin loads in a Shadow DOM container in the host JS context, restoring host-doc access.
- Unpacked sideload installs were unaffected because Logseq already loads sideloaded plugins without the iframe sandbox.
- **Resize listeners are now bound to every distinct document involved** (host scope + plugin document, de-duplicated), and lightbox element lookups resolve across those documents. Defence in depth alongside the shadow-mode fix above. Thanks to [@Xanaxus](https://github.com/Xanaxus) ([#1](https://github.com/hdansou/logseq-bermaid/pull/1)).

### Changed

- **`/bermaid` inserts an empty mermaid code block** instead of a pre-filled `graph TD` example, so you start from a blank diagram and type your own. Note that a freshly inserted diagram shows the "Child block is empty" hint until you type Mermaid syntax into it. Thanks to [@Xanaxus](https://github.com/Xanaxus) ([#1](https://github.com/hdansou/logseq-bermaid/pull/1)).

### Notes

- Shadow mode is labelled "still draft" in Logseq's plugin authoring guide (`logseq/libs/guides/AGENTS.md`), and depends on `window.QSandbox` being present at runtime. If a future Logseq build drops shadow mode or QSandbox, drag will break again the same way. Worth tracking.
- The web-dev workflow at `http://localhost:8080` is not expected to support drag-to-resize, lightbox pan, wheel-zoom, or Esc-to-close — those features need the plugin to be loaded as an unpacked sideload (or installed from the marketplace) in Logseq Desktop.

## [0.3.0] - 2026-05-02

Width persistence moves from a DB block property into the macro itself: `{{renderer :bermaid, NNN}}`. Self-contained, graph-agnostic, fixes a long-standing duplicate-property bug.

### Fixed

- **Resize no longer creates duplicate `bermaid-width` properties.** v0.2.x persisted the width via `Editor.upsertBlockProperty('bermaid-width', N)`, but Logseq DB defaults un-registered properties to `:db.cardinality/many`, so each resize appended a new value instead of replacing — blocks accumulated entries like `bermaid-width: 248`, `bermaid-width: 352`, `bermaid-width: 589`. v0.3.0 stores the width inside the macro arg, so the cardinality issue can't recur.

### Changed

- **Width is now stored as a macro arg.** `{{renderer :bermaid, 500}}` renders at 500 px; `{{renderer :bermaid}}` falls back to the default (250 px). Resizing a diagram rewrites the parent block via `Editor.updateBlock` to embed the new width. Works in both file-based and DB graphs (the previous block-property approach only persisted in DB graphs).
- Copying a `{{renderer :bermaid, NNN}}` block plus its mermaid child now preserves the width — diagrams are fully self-contained.
- Theme-mode re-renders read width from the in-session `renderedSlots` map (no extra DB lookups on theme change).

### Removed

- `getBlockWidth` / `setBlockWidth` / `isDbGraph` helpers and the `widthCache` LRU. Replaced by `parseWidthArg` (read) and `writeWidthToMacro` (write). Also dropped the `WIDTH_CACHE_CAP` constant.
- The `bermaid-width` block property is no longer read or written. Existing properties on user blocks (if any) are silently ignored — resize once to embed the width into the macro. No upgrade migration: the plugin is hours old on the marketplace, no installs to migrate.

## [0.2.4] - 2026-05-02

### Fixed

- **Top of polygon/circle/path nodes no longer clipped.** The `trimSvgTopWhitespace` post-processing scanned `y="..."` attributes to crop empty space above the diagram, but `<polygon>` (diamond, hexagon), `<circle>` (`cy`/`r`), and `<path>` (stadium) shapes have no `y=` attribute. When a label-rect lay below such a node, the trim used the rect's `y` as the new viewBox top, slicing off the node above it. Affected `graph LR` with circular nodes and any `graph TD` whose topmost shape was a diamond/circle/stadium. Removed the trim entirely; beautiful-mermaid's native viewBox is correct.

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
