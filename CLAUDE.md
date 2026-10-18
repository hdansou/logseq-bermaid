# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**logseq-bermaid** (Bermaid = **Better Mermaid**) is a Logseq plugin that renders Mermaid diagrams with [Pele](https://github.com/obsidianmd/pele), a fast, lightweight renderer that supports every diagram type built into Mermaid 12.1. Users insert `{{renderer :bermaid}}` macros with child blocks containing Mermaid syntax (via `/bermaid`, or **Render as Bermaid diagram** on an existing code block); the plugin renders them as themed, resizable SVG diagrams. Up to v0.5 the engine was `beautiful-mermaid`; its color themes carry over (`src/theme.ts`).

**Graph compatibility:** `web: true`, `supportsDB: true`, `supportsDBOnly: false` — works in both file-based and DB-based graphs.

## Commands

Node 24+ (`.nvmrc`, `engines`, CI). With nvm: `nvm use`.

```bash
npm install       # Install dependencies
npm run build     # Production build → dist/ (terser minification, no sourcemaps)
npm run watch     # Rebuild dist/ on file changes (no HTTP server)
npm run serve     # Dev HTTP server at http://localhost:8080 (no rebuild)
npm run typecheck # TypeScript type check only
npm test          # Unit tests (vitest): macro parsing, fence stripping, code-block detection, themes, worker clock, SVG sizing, CappedMap
```

## Testing

Unit tests (`npm test`, vitest) cover the pure helpers in `src/macro.ts`, `src/theme.ts`, `src/cache.ts`, `src/utils/clock.ts` and `src/utils/svg.ts`; CI runs them. Everything that needs a Logseq host is an e2e script under `scripts/e2e/` and is run by hand from an installed copy (see the test loop below).

E2E gate before a release, all against an installed copy (`--port` is the instance's CDP port):

| Script | Asserts |
| ------ | ------- |
| `resize.mjs --uuid <macro>` | grip drag: live width, no edit mode, persisted, macro arg rewritten, diagram aspect kept |
| `lightbox.mjs --uuid <macro>` | open, Esc, re-open, zoom button, wheel zoom, opener state, close |
| `sizing.mjs` | every diagram on the open page: drawn width ≤ natural width and ≤ wrapper, aspect kept |
| `slash-latency.mjs` | types `/bermaid`: code block in DOM ≤ 400 ms, no red error, diagram ≤ 700 ms after leaving the code block (medians of 5 runs; per-step timeline) |
| `convert.mjs` | Render as Bermaid diagram: structure, code unchanged (indentation), drawn ≤ 1 s, idempotent, `/code` block with no language, python block untouched. Needs a **visible** instance window (context menu) |

A hidden or minimized instance window breaks UI tests silently: Logseq stops mounting blocks and the host page's own timers throttle. Check `document.visibilityState === "visible"` first; relaunching the instance gives a visible window.

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

`src/index.ts` holds the hooks and handlers (~450 lines; rendering, themes, macro helpers, caches, the lightbox and the clock live in their own modules). It registers with the Logseq SDK via `logseq.ready(main)` and sets up:

- **Settings schema** — `theme` (enum, 14 named themes + "auto") and `transparentBg` (boolean)
- **CSS injection** via `logseq.provideStyle()` from `src/styles.ts`
- **Slash command** `/bermaid` — rewrites the current block to the macro and inserts an empty ```` ```mermaid ```` child block. No fixed waits (see "Plugin iframe timers run at 1 Hz"); code block in the DOM in ~170 ms
- **Block context menu** "Render as Bermaid diagram" — `renderCodeBlockAsDiagram()`: if `isMermaidCodeBlock()` (lang `mermaid`, a ```` ```mermaid ```` fence, or a language-less code block that Pele's `detectType` recognises), inserts the macro just above the block (`insertBlock(…, {before: true, sibling: true})`) and moves the code block under it (`moveBlock(…, {children: true})`). The code is never rewritten, so indentation survives. Refuses non-mermaid blocks and blocks already under a Bermaid macro
- **`onMacroRendererSlotted` hook** — core rendering hook (see Data Flow below)
- **`onThemeModeChanged` hook** — updates `currentThemeMode` and re-renders all tracked diagrams with the new theme
- **`DB.onChanged` subscription** — live re-render when a tracked macro or its source child is edited; debounced per macro (350 ms, on the worker clock) via `scheduleRerender()` → `rerenderTrackedDiagram()`. Holds the last good render rather than flashing an error on transient invalid syntax mid-typing. A code block's editor writes to the DB only when it is left, so the re-render follows Esc/blur, not each keystroke
- **No host-document listeners.** Nothing in the plugin touches the host DOM any more: resize is a native CSS grip, the lightbox lives in the plugin's own iframe. The only `ensureHostScope()` call left is in `copyImageToClipboard()`, for a secure-context clipboard.

### Data Flow for Diagram Rendering

````txt
{{renderer :bermaid}} detected by onMacroRendererSlotted
  → fetch block + children (Editor.getBlock; retried only if the block itself is missing)
  → extractMermaidSyntax(children) — join with newlines, strip ```mermaid fences
    (shared with the live re-render path, so a bug here hits both)
  → parseWidthArg(payload.arguments) → width from the macro's 2nd positional arg
  → track the slot in renderedSlots BEFORE rendering — an empty or not-yet-valid
    diagram must still pick up edits through DB.onChanged
  → empty source → neutral .bermaid-hint, stop (no polling for the child: when it
    arrives or changes, DB.onChanged re-renders)
  → renderDiagram(): renderAsync() from pele/lazy (loads that diagram type's chunk)
    → applyTheme() bakes the palette into the SVG → SVG string
  → cache SVG in svgCache (CappedMap<uuid, string>)
  → provideUI() via buildDiagramHtml() → CSS-resizable wrapper (data-rect click commit) + SVG container + copy button + lightbox trigger
````

### Lightbox (`src/lightbox.ts`)

`bermaidOpenFullscreen` → `openLightbox(svg)`. The viewer is **PhotoSwipe 5**, the same library Logseq uses for its own image previews (`frontend.extensions.lightbox`), so zoom, pan, Esc and backdrop-close behave like native images.

- **Where it lives** — in the plugin's **own iframe**, shown as the main UI (`setMainUIInlineStyle` fixed full-window + `showMainUI`), never injected into the host body. Installed plugins cannot reach the host document and the bridge forwards no mouse, wheel or key identity, so a host-injected overlay could never zoom, pan or close on Esc there. Inside our frame every event is ours.
- **Source** — the cached SVG as a `data:image/svg+xml` URI; intrinsic size from the SVG's `width`/`height` attributes, else its `viewBox` (`svgSize()`).
- **Zoom levels** — `fit` initially, 2× fit on the zoom button / image click, 8× fit max; `wheelToZoom: true` so a plain wheel zooms (PhotoSwipe's default needs Ctrl/⌘). PhotoSwipe's default secondary level is the image's natural size, which for a vector that already fits would leave the zoom button doing nothing.
- **Opens with no animation, on purpose.** A click during PhotoSwipe's opening fade (zoom button, the image) interrupts the opener; it never reaches `isOpen`, and from then on close and Esc are silently ignored — a fullscreen overlay the user cannot leave. `showHideAnimationType: 'none'` removes the window. `closeLightbox()` also destroys an instance that never finished opening rather than calling `close()` on it.
- **Opens only once the frame is displayed.** `showMainUI` is an RPC; until the host adds its `visible` class the iframe is `display:none` with a 0×0 viewport, and an image PhotoSwipe starts loading there ends up broken (`complete`, `naturalWidth` 0). `openLightbox` polls `innerWidth` every 16 ms on the worker clock (rAF does not run in a hidden frame, and its own timers fire at 1 Hz) before `loadAndOpen`.
- **Hides the frame on `destroy`, not `close`** — `close` fires at the start of the teardown; hiding the iframe then would stop its animation frames and leave PhotoSwipe half-open under the next click.
- E2E test: `node scripts/e2e/lightbox.mjs --port <cdp port> --uuid <macro block uuid>`. It evaluates inside the plugin iframe through `scripts/e2e/plugin-frame.mjs` (raw CDP; the cross-origin iframe is a separate target that Playwright does not list as a frame) and asserts open, Esc, zoom, PhotoSwipe's `opener.isOpen`, and close.

### Resize Mechanism

- The wrapper is a native CSS-resizable box: `resize: both; overflow: hidden`. The browser performs the drag; the plugin has **no** pointer listeners for resize, which is why it works in installed (cross-origin) plugins.
- Releasing the grip ends in a `click` on the wrapper. The wrapper carries `data-rect` and `data-on-click="bermaidWrapperClick"`, so the bridge forwards that click with a live `getBoundingClientRect()`. The handler compares `rect.width` to the width it rendered; if they differ, it re-renders and calls `writeWidthToMacro()`, which rewrites the parent block's macro line to `{{renderer :bermaid, NNN}}` via `Editor.updateBlock` after `exitEditingMode(true)`.
- `resize: both`, not `horizontal`, on purpose. The SVG keeps its aspect ratio, so a horizontal-only grip moves *up* as the width shrinks; the release then lands on whatever sits below the diagram and the click's target becomes the block, which the bridge never sees. With `both`, the corner tracks the pointer on both axes. Only the width is persisted; the re-render after commit drops the dragged height.
- Width is read back by `parseWidthArg()` from the macro's second positional arg — clamped, falling back to `DEFAULT_DIAGRAM_WIDTH` (250px) when absent or non-numeric. Works in both file-based and DB graphs; no block property or cache is involved.
- Min: 200px (`MIN_DIAGRAM_WIDTH`), max: `MAX_DIAGRAM_WIDTH` (1200px) in the handler and `max-width: 100%` in CSS.
- **The SVG is drawn at its natural size, never scaled up** (`.bermaid-container svg { width: auto; max-width: 100% }`): it shrinks with the wrapper but stops at its `width` attribute. Pele's output is compact (a small state diagram is ~120 px wide), so filling the wrapper blew it up 2×. Dragging the grip past the natural width grows the box, not the diagram; the lightbox shows it larger. The sizing is CSS-only on purpose: clamping the wrapper instead would let a plain click commit a new width, because the click handler clamps to `MIN_DIAGRAM_WIDTH`.
- E2E test: `node scripts/e2e/resize.mjs --port <cdp port> --uuid <macro block uuid> [--dx N]` performs a real pointer drag on the grip against a running Logseq instance and asserts live width, persistence, macro rewrite, aspect ratio, and that the block did not enter edit mode. Run it from an **installed** copy (see the test loop below); it was red on the slider build and the edge handles, green on the grip.

### Caching

| Cache           | Type                              | Key        | Cap                       | Purpose                                                |
| --------------- | --------------------------------- | ---------- | ------------------------- | ------------------------------------------------------ |
| `svgCache`      | `CappedMap<string, string>`       | block UUID | 200 (`SVG_CACHE_CAP`)     | Avoid re-render for copy-to-PNG                        |
| `renderedSlots` | `CappedMap<string, RenderedSlot>` | block UUID | 200 (`RENDERED_SLOTS_CAP`) | Track slots for theme-change re-rendering and live edit, including slots that are still empty (`mermaidSyntax: ''`; skipped on theme change) |

`CappedMap` extends `Map` with oldest-entry eviction when the cap is exceeded. Caps live in `src/constants.ts`.

Width is **not** cached — it is read from the macro arg on every render (see Resize Mechanism above).

### Theme Resolution

`src/theme.ts`:

- `resolveThemeName(theme, mode)` — `"auto"` → `github-light` or `tokyo-night` (`AUTO_THEME` in `src/constants.ts`); a named theme passes through.
- `PALETTES` — the 14 palettes (`bg`, `fg`, and optional `line`, `accent`, `muted`), carried over from beautiful-mermaid's `THEMES` so the setting kept its meaning.
- `applyTheme(svg, name, transparent)` — Pele has **no theme option**; colors are CSS variables. The palette is prepended to the root `<svg style>` as `--pele-*` variables, because the lightbox and copy-to-PNG load the SVG as an image, where outside CSS never reaches. Missing colors are mixed from `fg` into `bg` with beautiful-mermaid's percentages (line 50, accent 85, muted 40; node fill 3, group band 5, border 20). A `<style>` rule recolors **solid** arrowheads (`.pele-marker[fill="var(--_l)"]`) to the accent, as beautiful-mermaid drew them; hollow and stroke-only markers keep theirs. `background:var(--pele-bg)` is added only when *Transparent background* is off (Pele paints none).
- Chart series colors (pie, xychart, …) use Pele's `--pele-series-*` defaults, not the palette.

When theme mode changes, `onThemeModeChanged` re-renders all diagrams tracked in `renderedSlots`. Setting names (`THEME_CHOICES`) are in `src/constants.ts`.

### Rendering engine (Pele)

- `pele` is pinned to an **exact** version. Treat every upgrade as a release gate: run all examples from Mermaid's docs (`tests/corpus/*-docs.json` in the Pele repo, 522 at 1.6.0) and review one rendered example per type (contact sheets); see `docs/PELE_EXPERIMENT.md` Round 3.
- `renderAsync` from `pele/lazy` loads only the chunk for the diagram type being drawn (core ~37 KB, types 1–45 KB each).
- The `-beta` keywords Pele accepts (`xychart-beta`, `architecture-beta`, …) are Mermaid's own; they say nothing about Pele's implementation.
- There is deliberately **no engine setting**: beautiful-mermaid drew only 6 of the 33 types, so a fallback would cover only the mature ones (decision, 2026-10-17).

### Copy to PNG

`copyImageToClipboard(uuid)`:

1. Retrieves SVG string from `svgCache`
2. Calls `svgToPngBlob()` (`src/utils/svg.ts`) — draws SVG to 2x-scaled canvas → PNG Blob
3. Writes to clipboard via `ClipboardItem` API (using `logseq.api.hostScope` for secure context)

### Key Files

| File                         | Purpose                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/index.ts`               | Plugin entry — settings, hooks, event handlers, resize commit, slash command                                                        |
| `src/macro.ts`               | Pure helpers: `parseWidthArg`, `extractMermaidSyntax`, `getBlockText`, `BERMAID_MACRO_RE`, `isMermaidCodeBlock`; unit-tested in `src/macro.test.ts` |
| `src/theme.ts`               | Palettes, `resolveThemeName`, `applyTheme` (see Theme Resolution); unit-tested in `src/theme.test.ts`                                |
| `src/utils/clock.ts`         | Worker-backed `sleep` / `delay` (cancellable), `setTimeout` fallback; unit-tested in `src/utils/clock.test.ts`                      |
| `src/lightbox.ts`            | PhotoSwipe viewer in the plugin's own iframe (main UI); see Lightbox                                                                |
| `src/render.ts`              | Render pipeline — `renderAsync` from `pele/lazy`, then `applyTheme`; copy-to-PNG                                                      |
| `src/cache.ts`               | `CappedMap` LRU + the two cache instances (`svgCache`, `renderedSlots`) and the `RenderedSlot` type                                  |
| `src/constants.ts`           | Theme setting choices, auto-theme mapping, widths, cache caps                                                                        |
| `src/styles.ts`              | CSS injected into Logseq: wrapper, native resize grip, natural-size SVG, copy button, hint/error states                              |
| `src/utils/svg.ts`           | SVG to PNG Blob conversion                                                                                                           |
| `src/__sdk_guard__.ts`       | Compile-time floor for `@logseq/libs` (references a 0.3.x API): `npm run typecheck` fails on a downgrade below `minSDKVersion` |
| `src/utils/text.ts`          | `escapeHtml()` for safe error message display                                                                                        |
| `vite.config.ts`             | Vite config; terser minification, no sourcemaps; dev server on port 8080                                                             |
| `vite-logseq-safe-plugin.ts` | Custom Vite plugin replacing `vite-plugin-logseq`; handles dev-server CORS, HMR safety, and writes `dist/index.html` on watch builds |
| `icon.svg`                   | Plugin icon, referenced by `package.json` `logseq.icon`                                                                            |
| `scripts/e2e/resize.mjs`     | E2E drag-to-resize test against a running Logseq instance over CDP; red/green gate for the installed (cross-origin) path             |
| `scripts/e2e/lightbox.mjs`   | E2E lightbox test (open, Esc, zoom, close) from the installed path                                                                   |
| `scripts/e2e/plugin-frame.mjs` | Raw-CDP helper to evaluate inside the cross-origin plugin iframe (Node's built-in WebSocket)                                       |
| `scripts/e2e/sizing.mjs`     | E2E: no diagram drawn larger than its natural size                                                                                   |
| `scripts/e2e/slash-latency.mjs` | E2E: `/bermaid` per-step timeline and thresholds, then type → Esc → diagram                                                       |
| `scripts/e2e/convert.mjs`    | E2E: Render as Bermaid diagram (needs a visible window)                                                                              |
| `docs/`                      | Internal reference docs (`REQUIREMENTS.md`, `MARKETPLACE_SUBMISSION.md`), decision records (`PELE_EXPERIMENT.md`, `INSERT_FLOW_ASSESSMENT.md`), README media |

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
- **Renderer slot fires before child exists** — `onMacroRendererSlotted` can trigger before a child block inserted by the slash command is committed. The renderer does not poll for it: the slot is tracked with empty source and shows a hint, and the child's arrival reaches it through `DB.onChanged`. (Before v0.6.0 an untracked "Child block is empty" slot never updated until a page reload.)
- **Plugin iframe timers run at 1 Hz** — the plugin iframe is `visibilityState: hidden` whenever it shows no main UI, and Chromium aligns its timers to 1-second wake-ups: `setTimeout(100)` takes ~1000 ms (`setTimeout(0)`, microtasks and `MessageChannel` are unaffected; SDK round-trips take 3–45 ms). This made `/bermaid` take 2.3–3 s. **Never use `setTimeout` for a wait, retry, debounce or poll** — use `sleep` / `delay` from `src/utils/clock.ts`, whose timers run in a Worker (100 ms → ~102 ms).
- **A code block's editor writes to the DB only when it is left** — CodeMirror commits on Esc/blur; while it has focus the block's `title` is unchanged. No preview mid-typing is possible through `DB.onChanged`; measure latency from Esc.
- **The plugin cannot focus a code block's editor** — `Editor.editBlock` on a code block leaves focus on `<body>`. Logseq's own `/code` does focus it, which is why "Render as Bermaid diagram" exists.
- **`/code` sets no language** — `:logseq.property.code/lang` is absent, so detection by language alone misses it; `isMermaidCodeBlock` falls back to Pele's `detectType`.
- **`insert_block` with a filled fence strips leading indentation** — `insertBlock(uuid, "```mermaid\n…\n```")` stores `"  id3[…]"` as `"id3[…]"`, breaking kanban/mindmap. `updateBlock` on an existing code block keeps it. The plugin only ever inserts an empty fence; tests that seed diagrams must insert an empty fence and `updateBlock` the code.
- **`provideUI` template is a string** — no JSX; HTML must be a template literal. Use `data-on-click` attributes for event handlers registered via `provideModel()`.
- **Renderer slot `display: inline-flex`** — SVGs and large content need `width: 100%` CSS override to fill the slot.
- **Macro args are always strings** — `payload.arguments` hands back strings even for numeric args. Always coerce with `Number()` and validate with `Number.isFinite()` before use; see `parseWidthArg()`.
- **Host-doc access silently no-ops in sandboxed installs** — marketplace installs load the plugin in a cross-origin iframe, so `logseq.Experiments.ensureHostScope()` throws a `SecurityError` and `window.top.document` is unreachable. Any `if (hostDoc) { ... }` block then becomes a silent no-op, taking every host-scope listener with it — this broke drag-to-resize, lightbox pan, wheel-zoom, zoom buttons and Esc-to-close from v0.2.x onward without a single error surfacing. Fixed in v0.5.0 by not using host listeners at all: resize is a native CSS `resize` grip committed through a `data-rect` click, and the lightbox moved into the plugin's own iframe (see Lightbox). Rule going forward: **never put interaction in the host document**; put it in our iframe (main UI) or in something the browser handles natively. See the shadow-mode entry below for the approach that does *not* work.
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
- `provideUI` replaces the **entire** slot template, so re-rendering during a drag destroys the element being dragged. Commit on release, never mid-gesture.
- **A native CSS `resize` grip drag ends in a `click` on the resized element**, and `rect` on that click already holds the new size. That is the only drag gesture that crosses the bridge, and it is what diagram resize uses. The release must land on the element itself: if the element's box moves out from under the pointer during the drag (aspect-ratio height following a horizontal-only grip), the click targets a common ancestor outside the slot and is lost.
- **A `<input type="range">` thumb cannot be made the only hit-testable part of the input.** `pointer-events: none` on the input plus `auto` on `::-webkit-slider-thumb` leaves nothing hit-testable in Chrome; the pointer falls through to the block and opens the editor. Making the whole input hit-testable instead makes its track swallow clicks on everything it overlaps. Tried and dropped before v0.5.0 shipped.

### Dependency Overrides

`package.json` declares `overrides` for six transitive deps. Two come in through `@logseq/libs@0.3.4` (runtime), four through `vite` (build-time only — they never reach `dist/`).

Note on `@logseq/libs` itself: the npm `latest` dist-tag is stale and points at 0.0.17. Real releases are published under the `next` tag, so check `npm view @logseq/libs dist-tags` and install the version explicitly (`npm install @logseq/libs@^0.3.4`) rather than trusting `npm install @logseq/libs@latest` or `npm outdated`.

Via `@logseq/libs`:

- `lodash-es: ^4.18.1` — clears GHSA-r5fr-rjxr-66jc (`_.template` code injection) and GHSA-f23m-r3pf-42rh (prototype pollution in `_.unset`/`_.omit`). `@logseq/libs` ships an older lodash-es; the override forces the patched line.
- `dompurify: ^3.4.16` — clears a large XSS/sanitizer-bypass cluster (GHSA-hpcv-96wg-7vj8, GHSA-r47g-fvhr-h676, GHSA-x4vx-rjvf-j5p4 and others) affecting `<=3.4.12`, plus the later IN_PLACE advisories GHSA-p98j-92pf-mc4p and GHSA-6688-9rhm-gjv2 affecting `<=3.4.15`. `@logseq/libs@0.3.4` pins 3.3.3. Note that `npm audit` has reported this cluster as **"No fix available"**, which is wrong — check the registry directly rather than trusting the advisory text.

Via `vite`:

- `esbuild: ^0.28.2` — clears GHSA-g7r4-m6w7-qqqr (dev-server arbitrary file read on Windows). `vite@7.3.6` still resolves 0.27.3.
- `postcss: ^8.5.26` — clears GHSA-fxqj-rqcc-2cmp and GHSA-r28c-9q8g-f849 (sourceMappingURL path traversal).
- `nanoid: ^3.3.18` — clears GHSA-28wg-ghj8-5hjv and GHSA-2v37-7h3g-55p8 (infinite loop on zero/negative size). Pulled in by `postcss`, which constrains it to `^3`, so **stay in the 3.x line** — overriding to 5.x/6.x would break postcss.
- `source-map-js: ^1.2.2` — clears GHSA-68fv-2mgg-jv7q (event-loop DoS through indexed source-map section offsets). Pulled in by `postcss`, which resolves 1.2.1 on its own.

`vite` itself is pinned to `^7.3.6` (not 7.3.2) to clear GHSA-fx2h-pf6j-xcff and GHSA-v6wh-96g9-6wx3. Deliberately staying in-major: `vitest` peer-pins the Vite major (5.x accepts `^6.4 || ^7 || ^8`), and vite 8 also risks the custom `vite-logseq-safe-plugin.ts`. `vitest` is `^5.0.3` because every 3.x/4.x release carries `tinypool` (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr) and `@vitest/mocker` (GHSA-82fw-gwwq-j7x9) advisories whose only fix is the 5.0.3 major; `npm audit` lit up the moment 3.2.7 was installed.

`npm audit` should report 0 vulnerabilities. When it doesn't, verify each proposed target version actually exists (`npm view <pkg> versions --json | tail`) before writing an override. If a future `@logseq/libs` upgrade requires older majors, drop or relax the relevant override.
