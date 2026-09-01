# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**logseq-bermaid** is a Logseq plugin that renders Mermaid diagrams using the `beautiful-mermaid` library. Users insert `{{renderer :bermaid}}` macros with child blocks containing Mermaid syntax; the plugin renders them as styled, resizable SVG diagrams.

**Graph compatibility:** `web: true`, `supportsDB: true`, `supportsDBOnly: false` — works in both file-based and DB-based graphs.

## Commands

```bash
npm install       # Install dependencies
npm run build     # Production build → dist/ (terser minification, no sourcemaps)
npm run watch     # Rebuild dist/ on file changes (no HTTP server)
npm run serve     # Dev HTTP server at http://localhost:8080 (no rebuild)
npm run typecheck # TypeScript type check only
```

## Testing

The Logseq web app runs at **[http://localhost:3001](http://localhost:3001)**. If it's not running, start it with:

```bash
cd /Users/dzu/Projects/src/github.com/logseq && yarn watch
```

Loading the plugin into the Logseq web app requires two separate processes:

1. **Build watcher** — `npm run watch` (rebuilds `dist/` on file changes, no HTTP server)
2. **Dev HTTP server** — `npm run serve` (serves the plugin at `http://localhost:8080` with CORS headers)

Then in Logseq:

1. Enable **Developer mode** in Settings → Advanced
2. Go to Plugins → `⋮` menu → "Load plugin from web url"
3. Enter `http://localhost:8080` and click Install

For UI testing and browser automation, use the `playwright-cli` skill.
For loading/reloading the plugin and testing features, use the `logseq-plugin-tester` skill.

## Claude Skills

These skills are available and relevant to this project:

| Skill                      | When to use                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `logseq-plugin-dev`        | Implement new plugin features (renderers, slash commands, settings, DB properties) |
| `logseq-plugin-tester`     | Load, reload, and test the plugin against Logseq at localhost:3001                 |
| `logseq-plugin-release`    | Preparing a release: version bump, changelog, build, commit, tag                   |
| `logseq-plugin-screenshot` | Capturing screenshots of the plugin in action for README/marketplace               |
| `logseq-plugin-audit`      | Health check: typecheck, build, audit, package.json validation, README review      |
| `playwright-cli`           | Browser automation for UI testing and screenshots                                  |
| `logseq-cli`               | Inspecting or modifying graph data via the CLI                                     |
| `logseq-doc-updater`       | Updating docs (CLAUDE.md, README) when code changes make them stale                |
| `code-detective-docs`      | Generating investigative-style documentation for code components                   |

## Architecture

### Plugin Entry Point

`src/index.ts` is the entire plugin logic (~740 lines). It registers with the Logseq SDK via `logseq.ready(main)` and sets up:

- **Settings schema** — `theme` (enum, 14 named themes + "auto") and `transparentBg` (boolean)
- **CSS injection** via `logseq.provideStyle()` from `src/styles.ts`
- **Slash command** `/bermaid` — inserts macro + an empty ```` ```mermaid ```` child block
- **`onMacroRendererSlotted` hook** — core rendering hook (see Data Flow below)
- **`onThemeModeChanged` hook** — updates `currentThemeMode` and re-renders all tracked diagrams with the new theme
- **`DB.onChanged` subscription** — live re-render when a tracked macro or its source child is edited; debounced per macro (~350 ms) via `scheduleRerender()` → `rerenderTrackedDiagram()`. Holds the last good render rather than flashing an error on transient invalid syntax mid-typing
- **Host-scope DOM events** — `mousemove`, `mousedown`, `mouseup`, `scroll`, `contextmenu` for resize, context menu, lightbox zoom, and lightbox pan. Bound to every distinct document (host scope + plugin document, de-duplicated)

### Data Flow for Diagram Rendering

````txt
{{renderer :bermaid}} detected by onMacroRendererSlotted
  → fetch block + children (Editor.getBlock)
  → extractMermaidSyntax(children) — join with newlines, strip ```mermaid fences
    (shared with the live re-render path, so a bug here hits both)
  → renderMermaid() from beautiful-mermaid → SVG string
  → cache SVG in svgCache (CappedMap<uuid, string>)
  → track slot in renderedSlots for theme-change re-rendering
  → parseWidthArg(payload.arguments) → width from the macro's 2nd positional arg
  → provideUI() via buildDiagramHtml() → SVG container + resize handles + copy button + lightbox trigger
````

### Lightbox (Zoom & Pan)

`bermaidOpenFullscreen(uuid)` opens a host-scope overlay on top of the Logseq window:

- **Overlay** — `.bermaid-lightbox-backdrop` covers the full viewport; click backdrop or X button to close (also Esc key)
- **Zoom** — mouse-wheel listener (`capture: true, passive: false`) zooms toward the cursor using pan adjustment: `newPan = oldPan + cursorOffset * (1/newZoom - 1/oldZoom)`; range 12.5-800 %
- **Pan** — mousedown on `.bermaid-lightbox-content` (outside control buttons) starts a drag; mousemove computes delta relative to current zoom; mouseup releases
- **Zoom controls pill** — fixed bottom-centre bar with `-` / `+` / reset buttons and a live zoom label updated by `updateLightboxTransform()` (direct DOM mutation, no full re-render)
- **State** — `lightboxZoom`, `lightboxPanX/Y`, `lightboxDragging` reset on every open and close

### Resize Mechanism

- Drag left/right handles → `resizeState` tracks origin and side
- `mousemove` updates wrapper `width` style; left-side drag also adjusts `marginLeft`
- `mouseup` calls `writeWidthToMacro()` → rewrites the parent block's macro line to `{{renderer :bermaid, NNN}}` via `Editor.updateBlock`, after `exitEditingMode(true)`
- Width is read back by `parseWidthArg()` from the macro's second positional arg — clamped, falling back to `DEFAULT_DIAGRAM_WIDTH` (250px) when absent or non-numeric
- Works in both file-based and DB graphs; there is no block-property or cache involved in width persistence
- Min: 200px, Max: parent width or 1200px

### Caching

| Cache           | Type                              | Key        | Cap                       | Purpose                                                |
| --------------- | --------------------------------- | ---------- | ------------------------- | ------------------------------------------------------ |
| `svgCache`      | `CappedMap<string, string>`       | block UUID | 200 (`SVG_CACHE_CAP`)     | Avoid re-render for copy-to-PNG                        |
| `renderedSlots` | `CappedMap<string, RenderedSlot>` | block UUID | 200 (`RENDERED_SLOTS_CAP`) | Track slots for theme-change re-rendering and live edit |

`CappedMap` extends `Map` with oldest-entry eviction when the cap is exceeded. Caps live in `src/constants.ts`.

Width is **not** cached — it is read from the macro arg on every render (see Resize Mechanism above).

### Theme Resolution

`buildRenderOptions()` checks `settings.theme`:

- `"auto"` → maps to `github-light` or `tokyo-night` based on `currentThemeMode`
- Any named theme → passed directly to `beautiful-mermaid`

When theme mode changes, `onThemeModeChanged` re-renders all diagrams tracked in `renderedSlots`.

All theme names are defined in `src/constants.ts`.

### Copy to PNG

`copyImageToClipboard(uuid)`:

1. Retrieves SVG string from `svgCache`
2. Calls `svgToPngBlob()` (`src/utils/svg.ts`) — draws SVG to 2x-scaled canvas → PNG Blob
3. Writes to clipboard via `ClipboardItem` API (using `logseq.api.hostScope` for secure context)

### Key Files

| File                         | Purpose                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/index.ts`               | Plugin entry — settings, hooks, event handlers, lightbox, resize, slash command                                                      |
| `src/render.ts`              | Mermaid render pipeline — lazy-loads `beautiful-mermaid`, builds options, trims SVG, copy-to-PNG                                     |
| `src/cache.ts`               | `CappedMap` LRU + the two cache instances (`svgCache`, `renderedSlots`) and the `RenderedSlot` type                                  |
| `src/constants.ts`           | Theme choices, auto-theme mapping, default width (250px)                                                                             |
| `src/styles.ts`              | CSS injected into Logseq; includes lightbox, zoom controls, resize handles                                                           |
| `src/utils/svg.ts`           | SVG to PNG Blob conversion                                                                                                           |
| `src/utils/text.ts`          | `escapeHtml()` for safe error message display                                                                                        |
| `vite.config.ts`             | Vite config; terser minification, no sourcemaps; dev server on port 8080                                                             |
| `vite-logseq-safe-plugin.ts` | Custom Vite plugin replacing `vite-plugin-logseq`; handles dev-server CORS, HMR safety, and writes `dist/index.html` on watch builds |
| `icon.svg` / `icon-alt.svg`  | Plugin icons; `icon.svg` is referenced by `package.json` `logseq.icon`                                                               |
| `scripts/test-insert.js`     | Playwright-cli eval snippet for manual block-insert smoke tests                                                                      |
| `docs/`                      | Internal reference docs (`REQUIREMENTS.md`, `MARKETPLACE_SUBMISSION.md`)                                                             |

### Build

Vite with the local `vite-logseq-safe-plugin` (see `vite-logseq-safe-plugin.ts`) produces `dist/index.html` (main entry) and `dist/index.js`. Production builds use `minify: 'terser'` with `sourcemap: false`. The `terser` dev dependency is required for the minification option. The `package.json` `logseq` field defines plugin metadata (`id`, `title`, `icon` → `./icon.svg`, `main` → `dist/index.html`).

### Release

Pushing a `v*` tag triggers `.github/workflows/publish.yml` which builds, packages plugin files into `logseq-bermaid.zip`, and creates a GitHub release. Marketplace submission is a separate manual process. Use the `logseq-plugin-release` skill for the full release workflow.

## Conventions

- **Commit messages** — conventional commits, no scope: `fix: ...`, `feat: ...`, `chore: ...`
- **Changelog** — [Keep a Changelog](https://keepachangelog.com/) format in `CHANGELOG.md`
- **Versioning** — semver; patch for bugfixes, minor for features, major for breaking changes
- **Release flow** — bump version in `package.json` → update `CHANGELOG.md` → commit → tag `vX.Y.Z` → push tag triggers CI release

## Common Pitfalls

- **`updateBlock` ignored while editing** — call `exitEditingMode(true)` before `updateBlock`; the live editor state takes precedence over SDK writes.
- **DB timing / "entity id, got 0"** — `insertBlock` and `upsertBlockProperty` can fail if the parent block hasn't been committed to the DB yet. Use retry loops with `sleep(300)` between attempts.
- **`ensureHostScope()` sync/async duality** — returns a plain value in some Logseq versions and a Promise in others. Always wrap in `Promise.resolve()` or `try/catch`, never chain `.catch()` directly.
- **Renderer slot fires before child exists** — `onMacroRendererSlotted` can trigger before a child block inserted by the slash command is committed. The renderer retries child lookup for up to 1.5s.
- **`provideUI` template is a string** — no JSX; HTML must be a template literal. Use `data-on-click` attributes for event handlers registered via `provideModel()`.
- **Renderer slot `display: inline-flex`** — SVGs and large content need `width: 100%` CSS override to fill the slot.
- **Macro args are always strings** — `payload.arguments` hands back strings even for numeric args. Always coerce with `Number()` and validate with `Number.isFinite()` before use; see `parseWidthArg()`.
- **Host-doc access silently no-ops in sandboxed installs** — marketplace installs load the plugin in a cross-origin iframe, so `logseq.Experiments.ensureHostScope()` throws a `SecurityError` and `window.top.document` is unreachable. Any `if (hostDoc) { ... }` block then becomes a silent no-op, taking every host-scope listener with it — this broke drag-to-resize, lightbox pan, wheel-zoom, and Esc-to-close from v0.2.x onward without a single error surfacing. **Still unfixed.** See the shadow-mode entry below for the approach that does *not* work.
- **Do NOT set `"mode": "shadow"` in the manifest** — it looks like the fix for the host-doc problem above, and it is not. v0.4.0 shipped it and the plugin failed to load entirely, on *every* install type (sideload included), with `TypeError: gs is not a function`. Logseq's shadow path (`LSPluginLocal._setupShadowSandbox` → `LSPluginShadow.load`) destructures `const {importHTML, createSandboxContainer} = window.QSandbox || {}`, but no shipped Logseq build defines `window.QSandbox` — `qiankun` is not bundled and no script tag provides it. The `|| {}` makes it degrade to `undefined` functions rather than a clear error, and `this.shadow ? _setupShadowSandbox() : _setupIframeSandbox()` is a hard branch with **no fallback**, so choosing shadow means the plugin never registers. Reverted in v0.4.1. To check any future build: `strings app.asar | grep -c QSandbox` — you need an *assignment*, not just the two consumer destructures.

### Plugin Origin Split — read this before touching any interaction code

Logseq serves plugins from two different origins, and the host app from a third URL on one of them:

| Load type | Entry URL | Same-origin with host? |
| --------- | --------- | ---------------------- |
| Host app | `lsp://logseq.com/` | — |
| Sideloaded ("load unpacked", `externals` in `preferences.json`) | `lsp://logseq.com/external/…` | **Yes** — `window.top.document` reachable |
| Installed (marketplace, `~/.logseq/plugins/<id>/`) | `lsp://logseq.io/plugins/…` | **No** — throws `SecurityError` |

Consequences:

- **Anything depending on the host DOM works when sideloaded and silently dies when installed.** This is the single most important fact about this plugin. `logseq.Experiments.ensureHostScope()` does not throw — it catches internally, logs, and returns `window.top` anyway; the `SecurityError` only surfaces when you touch `.document`.
- **Sideloading cannot validate an interaction fix.** Test from `~/.logseq/plugins/<id>/` instead — see the test loop below.
- **Never have the same plugin id registered as both a sideload and an install.** Both load, and results become untraceable to a copy. Check `preferences.json` → `externals` for stale paths.

Local cross-origin test loop (no release required; plugin reload re-reads from disk):

```bash
npm run build
D=~/.logseq/plugins/logseq-bermaid
rm -rf "$D/dist" && /bin/cp -R dist "$D/" && /bin/cp -f package.json "$D/"
```

Use `/bin/cp` — plain `cp` is aliased to interactive and silently skips overwrites in scripts.

### Plugin Bridge Contract (`provideModel` + `data-on-*`)

Cross-origin plugins can only receive DOM events that Logseq explicitly forwards over the RPC bridge. Verified empirically against a running install, not inferred:

**Forwarded events** — `click`, `focus`, `focusin`, `focusout`, `blur`, `dblclick`, `keyup`, `keypress`, `keydown`, `change`, `input`, `contextmenu`.

**Not forwarded** — `mousedown`, `mousemove`, `mouseup`, `wheel`, `resize`. So **drag and wheel gestures cannot be reconstructed**; only controls the browser drags natively (e.g. `<input type="range">`) work, reporting through `change`/`input`.

**Payload shape** (`{type, value, id, className, dataset}`, plus `rect` only when the element carries a `data-rect` attribute):

```js
{ type: "change", value: "253", id: "", className: "...",
  dataset: { blockUuid: "..." }, rect: { width: 926.73, ... } }
```

- `value` is always a **string** — coerce with `Number()` and validate, same as macro args.
- `rect` is live `getBoundingClientRect()` at event time, and reflects CSS-resized geometry.
- There is **no key identity on `keydown`** — Esc cannot be distinguished from any other key, so Esc-to-close is not recoverable this way.
- `provideUI` replaces the **entire** slot template, so re-rendering during a drag destroys the element being dragged. Commit on `change` (release), never on `input`.

### Dependency Overrides

`package.json` declares `overrides` for five transitive deps. Two come in through `@logseq/libs@0.3.2` (runtime), three through `vite` (build-time only — they never reach `dist/`).

Via `@logseq/libs`:

- `lodash-es: ^4.18.1` — clears GHSA-r5fr-rjxr-66jc (`_.template` code injection) and GHSA-f23m-r3pf-42rh (prototype pollution in `_.unset`/`_.omit`). `@logseq/libs` ships an older lodash-es; the override forces the patched line.
- `dompurify: ^3.4.14` — clears a large XSS/sanitizer-bypass cluster (GHSA-hpcv-96wg-7vj8, GHSA-r47g-fvhr-h676, GHSA-x4vx-rjvf-j5p4 and others) affecting `<=3.4.12`. Note that `npm audit` reports these as **"No fix available"**, which is wrong — 3.4.14 is published and clears them. Check the registry directly rather than trusting the advisory text.

Via `vite`:

- `esbuild: ^0.28.2` — clears GHSA-g7r4-m6w7-qqqr (dev-server arbitrary file read on Windows). `vite@7.3.6` still resolves 0.27.3.
- `postcss: ^8.5.26` — clears GHSA-fxqj-rqcc-2cmp and GHSA-r28c-9q8g-f849 (sourceMappingURL path traversal).
- `nanoid: ^3.3.18` — clears GHSA-28wg-ghj8-5hjv and GHSA-2v37-7h3g-55p8 (infinite loop on zero/negative size). Pulled in by `postcss`, which constrains it to `^3`, so **stay in the 3.x line** — overriding to 5.x/6.x would break postcss.

`vite` itself is pinned to `^7.3.6` (not 7.3.2) to clear GHSA-fx2h-pf6j-xcff and GHSA-v6wh-96g9-6wx3. Deliberately staying in-major: there is no test framework here today, but a future `vitest` would peer-pin the Vite major, and vite 8 also risks the custom `vite-logseq-safe-plugin.ts`.

`npm audit` should report 0 vulnerabilities. When it doesn't, verify each proposed target version actually exists (`npm view <pkg> versions --json | tail`) before writing an override. If a future `@logseq/libs` upgrade requires older majors, drop or relax the relevant override.
