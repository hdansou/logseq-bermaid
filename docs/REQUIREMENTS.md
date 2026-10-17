# Bermaid - Better Mermaid Diagrams for Logseq

## Overview

Bermaid (**Better Mermaid**) is a Logseq plugin that renders Mermaid diagrams as themed SVG using [Pele](https://github.com/obsidianmd/pele), a fast, lightweight Mermaid renderer with no runtime dependencies that supports every diagram type built into Mermaid 12.1. Up to v0.5 the engine was [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid); its color themes carry over.

## Functional Requirements

### FR-1: Mermaid Diagram Rendering

- The plugin renders mermaid diagrams as SVG within Logseq pages
- Diagrams are triggered via the `{{renderer :bermaid}}` macro syntax
- Mermaid source syntax is provided in a **child block** beneath the renderer macro
- The rendered SVG replaces the macro placeholder inline

### FR-2: Slash Command

- Register a `/bermaid` slash command in Logseq's editor
- When invoked, it inserts:
  - A `{{renderer :bermaid}}` macro in the current block
  - An empty ```` ```mermaid ```` code block as its child
- The code block must appear within 400 ms of Enter (median; `scripts/e2e/slash-latency.mjs`). No fixed waits: the hidden plugin iframe runs `setTimeout` at 1 Hz, so any wait goes through the worker clock (`src/utils/clock.ts`).
- Until the child has Mermaid in it, the slot shows a neutral hint, not an error, and the slot is tracked so the diagram appears as soon as the code block is left (Esc or blur): within 700 ms (median).

### FR-2b: Render an existing code block

- A block context-menu item, **Render as Bermaid diagram**, turns a Mermaid code block into a diagram: it inserts `{{renderer :bermaid}}` just above the block and moves the code block under it, without rewriting the code (indentation-sensitive types such as kanban and mindmap survive).
- Accepts a DB-graph code block with `lang` = `mermaid`, a file-graph block opening with a ```` ```mermaid ```` fence, and a code block with **no language** whose content Pele's `detectType` recognises (Logseq's `/code` sets no language).
- Leaves anything else alone with a message ("not a mermaid code block"); on a code block already under a Bermaid macro it adds nothing ("already a diagram").
- The diagram must be on screen within 1 s of the click (`scripts/e2e/convert.mjs`).

### FR-3: Theme Support

- Auto-detect Logseq's light/dark mode: `auto` maps to `github-light` / `tokyo-night`
- Provide a settings dropdown with `auto` and 14 named themes (palettes carried over from beautiful-mermaid): `zinc-dark`, `tokyo-night`, `tokyo-night-storm`, `tokyo-night-light`, `catppuccin-mocha`, `catppuccin-latte`, `nord`, `nord-light`, `dracula`, `github-light`, `github-dark`, `solarized-light`, `solarized-dark`, `one-dark`
- Colors are baked into each SVG as `--pele-*` variables, so the lightbox and copy-to-PNG (which load the SVG as an image) keep them
- Re-render diagrams when Logseq's theme mode changes

### FR-4: Plugin Settings

| Setting         | Type          | Default | Description                        |
| --------------- | ------------- | ------- | ---------------------------------- |
| `theme`         | enum (select) | `auto`  | Diagram color theme                |
| `transparentBg` | boolean       | `true`  | Render with transparent background |

### FR-5: Error Handling

- Display a user-friendly error message in the renderer slot when Mermaid syntax is invalid or the renderer fails
- An empty diagram (no child, or an empty code block) shows a neutral hint instead of an error
- While a diagram is being edited, invalid intermediate syntax keeps the last good render
- Surface non-retryable slash-command failures as a user-visible toast instead of a silent warning

### FR-6: Supported Diagram Types

Every diagram type built into Mermaid 12.1, as supported by Pele: flowchart, sequence, class, state, ER, Gantt, git graph, pie, mindmap, kanban, timeline, user journey, quadrant chart, XY chart, requirement, sankey, architecture, C4, block, agentflow, railroad, tree view, Cynefin, Wardley map, event modeling, use case, Venn, Ishikawa, packet, radar, treemap, swimlane. ZenUML and external Mermaid plugins are not supported.

- Diagrams are shown at their natural size, shrinking to fit the wrapper but never scaled up (`scripts/e2e/sizing.mjs`).

### FR-7: Copy as PNG

- A copy button appears when hovering over a rendered diagram
- Clicking it writes a PNG to the system clipboard at 2× resolution
- Respects the `transparentBg` setting
- Uses the plugin frame's clipboard API, falling back to the host-scope clipboard when the frame's is unavailable

### FR-8: Drag-to-Resize

- A resize grip appears in the diagram's bottom-right corner on hover (native CSS `resize: both`; the browser performs the drag, no pointer listeners).
- Dragging the grip changes diagram width (min 200 px, max parent width or 1200 px); height follows the SVG's aspect ratio after release.
- Width is persisted as the second positional argument of the macro: `{{renderer :bermaid, NNN}}`. On release, the bridge forwards the wrapper's click with its live rect (`data-rect`), and the parent block is updated via `Editor.updateBlock` to rewrite the macro line with the new width.
- Must work in **installed** (cross-origin) plugins, where the host document is unreachable and the bridge forwards no mouse events. See CLAUDE.md "Plugin Origin Split".
- A macro without a width arg (`{{renderer :bermaid}}`) renders at the default width (250 px).
- Persistence is graph-agnostic — works in both file-based and DB graphs because the value lives in block content, not a property.
- Copying the parent block (with its child mermaid block) preserves the width — the diagram is fully self-contained.
- Legacy: prior to v0.3.0, width was persisted as a `bermaid-width` block property in DB graphs only. v0.3.0+ ignores that property; users on the new version must resize once to embed the width into the macro.

### FR-9: Lightbox Zoom & Pan

- Clicking a rendered diagram opens it full-screen in PhotoSwipe, the viewer Logseq uses for its own images, rendered inside the plugin's own iframe (main UI) so it works in installed plugins
- The lightbox can be closed via the ✕ button, pressing Esc, or clicking the backdrop
- Mouse wheel and pinch zoom toward the cursor, up to 8× the fitted size; the zoom button or a click on the image toggles 2×
- Click-drag pans the diagram when zoomed in
- Opens instantly (no fade) and only once the frame is displayed; see CLAUDE.md "Lightbox" for why

## Non-Functional Requirements

### NFR-1: Performance

- Diagrams should render within 500ms for typical flowcharts
- Use async rendering to avoid blocking the Logseq UI thread
- Load the renderer lazily and per diagram type (`pele/lazy`): the core is ~37 KB, each type's chunk 1–45 KB

### NFR-2: Compatibility

- Works with Logseq DB-based graphs
- Runs in iframe sandbox mode (default plugin isolation)

### NFR-3: Development

- Built with TypeScript and Vite
- Dev server with hot-reload at `http://localhost:8080`
- Testable against Logseq at `http://localhost:3001/#/`

## Usage Example

```mermaid
- {{renderer :bermaid}}
  - graph TD
      A[Start] --> B{Decision}
      B -->|Yes| C[Action]
      B -->|No| D[End]
```

This renders as an inline SVG flowchart in the Logseq page.

## Technical Architecture

- **SDK**: `@logseq/libs` ≥ 0.3.4 — Logseq Plugin SDK (manifest `minSDKVersion` must match the floor in `package.json`). Minimum version is enforced at compile time by `src/__sdk_guard__.ts`, which references an API introduced in 0.3.x; `npm run typecheck` fails on any downgrade.
- **Renderer**: `pele` — SVG rendering engine, pinned to an exact version; every upgrade is a release gate (Mermaid docs corpus plus a visual review per type)
- **Themes**: `src/theme.ts` — palettes, `auto` resolution, `applyTheme()`
- **Timers**: `src/utils/clock.ts` — worker-backed `sleep` / `delay`, because the hidden plugin iframe throttles `setTimeout` to 1 Hz
- **Bundler**: Vite — dev server + production build
- **Entry**: `onMacroRendererSlotted` hook intercepts `{{renderer :bermaid}}` macros
- **UI**: `provideUI()` injects a CSS-resizable wrapper + SVG + copy button + lightbox trigger into the renderer slot
- **Lightbox**: `src/lightbox.ts`, PhotoSwipe 5 in the plugin's main UI iframe
- **Styling**: `provideStyle()` injects CSS for the wrapper, resize grip, copy button, hint and error states; PhotoSwipe's CSS is bundled into the plugin frame
- **Host scope**: none. Nothing depends on `window.top.document`; the only `ensureHostScope()` call is the clipboard fallback

## Testing Strategy

Unit tests (`npm test`, vitest) for the pure helpers: macro parsing, fence stripping, code-block detection, themes, the worker clock, SVG sizing, `CappedMap`.

End-to-end scripts under `scripts/e2e/`, run against an **installed** copy in a Logseq instance with a CDP port:

1. Plugin loads successfully
2. Slash command inserts macro + child block (in both DB and file graphs)
3. Diagram renders as SVG
4. Invalid syntax shows error message
5. Theme switching updates diagram colors
6. Hover shows copy button; click copies PNG to clipboard
7. Drag the resize grip changes diagram width; the macro arg is rewritten and the aspect ratio is kept (`scripts/e2e/resize.mjs`, run from an installed copy)
8. Click diagram opens the lightbox in the plugin frame; Esc / ✕ / backdrop closes it; zoom button and mouse wheel zoom (`scripts/e2e/lightbox.mjs`, run from an installed copy)
9. Diagrams are never drawn larger than their natural size (`scripts/e2e/sizing.mjs`)
10. `/bermaid` timing and the path to a first diagram (`scripts/e2e/slash-latency.mjs`)
11. Render as Bermaid diagram, including a `/code` block with no language (`scripts/e2e/convert.mjs`)
