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

`src/index.ts` is the entire plugin logic (~830 lines). It registers with the Logseq SDK via `logseq.ready(main)` and sets up:

- **Settings schema** — `theme` (enum, 14 named themes + "auto") and `transparentBg` (boolean)
- **CSS injection** via `logseq.provideStyle()` from `src/styles.ts`
- **Slash command** `/bermaid` — inserts macro + child block with starter template
- **`onMacroRendererSlotted` hook** — core rendering hook (see Data Flow below)
- **`onThemeModeChanged` hook** — updates `currentThemeMode` and re-renders all tracked diagrams with the new theme
- **Host-scope DOM events** — `mousemove`, `mousedown`, `mouseup`, `scroll`, `contextmenu` for resize, context menu, lightbox zoom, and lightbox pan

### Data Flow for Diagram Rendering

````txt
{{renderer :bermaid}} detected by onMacroRendererSlotted
  → fetch block + children (Editor.getBlock)
  → extract Mermaid syntax from child blocks (join with newlines, strip ```mermaid fences)
  → renderMermaid() from beautiful-mermaid → SVG string
  → cache SVG in svgCache (CappedMap<uuid, string>)
  → track slot in renderedSlots for theme-change re-rendering
  → getBlockWidth() from widthCache or block property "bermaid-width"
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
- `mouseup` calls `setBlockWidth()` → writes to `widthCache` and persists via `upsertBlockProperty("bermaid-width", ...)` for DB graphs
- Min: 200px, Max: parent width or 1200px

### Caching

| Cache                          | Type                        | Key        | Cap       | Purpose                                   |
| ------------------------------ | --------------------------- | ---------- | --------- | ----------------------------------------- |
| `svgCache`                     | `CappedMap<string, string>` | block UUID | 200       | Avoid re-render for copy-to-PNG           |
| `widthCache`                   | `CappedMap<string, number>` | block UUID | 500       | Avoid async DB lookups during resize      |
| `renderedSlots`                | `Map<string, RenderedSlot>` | block UUID | unbounded | Track slots for theme-change re-rendering |
| Block property `bermaid-width` | DB graph only               | —          | —         | Persist width across sessions             |

`CappedMap` extends `Map` with oldest-entry eviction when the cap is exceeded.

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
| `src/index.ts`               | Entire plugin logic — settings, hooks, event handlers, rendering, lightbox                                                           |
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
- **DB property values may be strings** — `getBlock().properties` in DB graphs can return property values as strings even when written as numbers (e.g. `bermaid-width`). Always coerce with `Number()` and validate with `Number.isFinite()` before use.

### Dependency Overrides

`package.json` declares `overrides` for two transitive deps of `@logseq/libs@0.3.2`:

- `lodash-es: ^4.18.1` — clears GHSA-r5fr-rjxr-66jc (`_.template` code injection) and GHSA-f23m-r3pf-42rh (prototype pollution in `_.unset`/`_.omit`). `@logseq/libs` ships an older lodash-es; the override forces the patched line.
- `dompurify: ^3.4.2` — clears GHSA-39q2-94rc-95cp and three related XSS/bypass advisories. Same reason: `@logseq/libs` ships 3.3.3.

`npm audit` should report 0 vulnerabilities. If a future `@logseq/libs` upgrade requires older majors, drop or relax the override.
