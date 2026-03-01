# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**logseq-bermaid** is a Logseq plugin that renders Mermaid diagrams using the `beautiful-mermaid` library. Users insert `{{renderer :bermaid}}` macros with child blocks containing Mermaid syntax; the plugin renders them as styled, resizable SVG diagrams.

## Commands

```bash
npm install       # Install dependencies
npm run dev       # Watch build mode, serves at http://localhost:8080
npm run build     # Production build → dist/
```

## Testing

The Logseq web app runs at **[http://localhost:3001](http://localhost:3001)**. If it's not running, start it with:

```bash
cd /Users/dzu/Projects/src/github.com/logseq && yarn watch
```

Loading the plugin into the Logseq web app requires two separate processes:

1. **Build watcher** — `npm run dev` (rebuilds `dist/` on file changes, no HTTP server)
2. **Dev HTTP server** — `npx vite` (serves the plugin at `http://localhost:8080` with CORS headers)

Then in Logseq:

1. Enable **Developer mode** in Settings → Advanced
2. Go to Plugins → `⋮` menu → "Load plugin from web url"
3. Enter `http://localhost:8080` and click Install

For UI testing and browser automation, use the `playwright-cli` skill.

## Architecture

### Plugin Entry Point

`src/index.ts` is the entire plugin logic (~495 lines). It registers with the Logseq SDK via `logseq.ready(main)` and sets up:

- **Settings schema** — `theme` (enum, 15 options + "auto") and `transparentBg` (boolean)
- **CSS injection** via `logseq.provideStyle()` from `src/styles.ts`
- **Slash command** `/bermaid` — inserts macro + child block with starter template; for DB graphs also sets `display-type: "code"` and `lang: "mermaid"` on the child block
- **`onMacroRendererSlotted` hook** — core rendering hook (see Data Flow below)
- **`onThemeModeChanged` hook** — updates `currentThemeMode` for "auto" theme resolution
- **Host-scope DOM events** — `mousemove`, `mousedown`, `mouseup`, `scroll`, `contextmenu` for resize and context menu

### Data Flow for Diagram Rendering

````txt
{{renderer :bermaid}} detected by onMacroRendererSlotted
  → fetch block + children (Editor.getBlock)
  → extract Mermaid syntax from child blocks (join with newlines, strip ```mermaid fences)
  → renderMermaid() from beautiful-mermaid → SVG string
  → cache SVG in svgCache (Map<uuid, string>)
  → getBlockWidth() from widthCache or block property "bermaid-width"
  → provideUI() injects HTML: SVG container + resize handles + copy button
````

### Resize Mechanism

- Drag left/right handles → `resizeState` tracks origin and side
- `mousemove` updates wrapper `width` style; left-side drag also adjusts `marginLeft`
- `mouseup` calls `setBlockWidth()` → writes to `widthCache` and persists via `upsertBlockProperty("bermaid-width", ...)` for DB graphs
- Min: 200px, Max: parent width or 1200px

### Caching

| Cache                          | Type                  | Key        | Purpose                              |
| ------------------------------ | --------------------- | ---------- | ------------------------------------ |
| `svgCache`                     | `Map<string, string>` | block UUID | Avoid re-render for copy-to-PNG      |
| `widthCache`                   | `Map<string, number>` | block UUID | Avoid async DB lookups during resize |
| Block property `bermaid-width` | DB graph only         | —          | Persist width across sessions        |

### Theme Resolution

`buildRenderOptions()` checks `settings.theme`:

- `"auto"` → maps to `github-light` or `tokyo-night` based on `currentThemeMode`
- Any named theme → passed directly to `beautiful-mermaid`

All theme names are defined in `src/constants.ts`.

### Copy to PNG

`copyImageToClipboard(uuid)`:

1. Retrieves SVG string from `svgCache`
2. Calls `svgToPngBlob()` (`src/utils/svg.ts`) — draws SVG to 2x-scaled canvas → PNG Blob
3. Writes to clipboard via `ClipboardItem` API (using `logseq.api.hostScope` for secure context)

### Key Files

| File                | Purpose                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| `src/index.ts`      | Entire plugin logic — settings, hooks, event handlers, rendering            |
| `src/constants.ts`  | Theme choices, auto-theme mapping, default width (250px)                    |
| `src/styles.ts`     | CSS injected into Logseq; uses `--ls-*` CSS variables for theme integration |
| `src/utils/svg.ts`  | SVG → PNG Blob conversion                                                   |
| `src/utils/text.ts` | `escapeHtml()` for safe error message display                               |
| `vite.config.ts`    | Vite + `vite-plugin-logseq`; dev server on port 8080                        |

### Build

Vite with `vite-plugin-logseq` produces `dist/index.html` (main entry) and `dist/index.js`. The `package.json` `logseq` field defines plugin metadata (`id`, `title`, `icon`, `main`).

### Release

Pushing a `v*` tag triggers `.github/workflows/publish.yml` which builds, packages plugin files into `logseq-bermaid.zip`, and creates a GitHub release. Marketplace submission is a separate manual process.
