# Bermaid - Beautiful Mermaid Diagrams for Logseq

## Overview

Bermaid is a Logseq plugin that renders mermaid diagrams using the [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) library, providing beautiful SVG output with built-in themes and zero DOM dependencies.

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
  - A child block containing a default flowchart template:

    ```mermaid
    graph TD
        A[Start] --> B{Decision}
        B -->|Yes| C[Action]
        B -->|No| D[End]
    ```

- In DB graphs only: set `display-type: "code"` and `lang: "mermaid"` on the child block via `upsertBlockProperty`; skip those calls in file-based graphs

### FR-3: Theme Support

- Auto-detect Logseq's light/dark mode and select an appropriate beautiful-mermaid theme
- Provide a settings dropdown to choose from beautiful-mermaid's 15 built-in themes:
  `auto`, `default`, `tokyo-night`, `catppuccin`, `nord`, `dracula`, etc.
- Re-render diagrams when Logseq's theme mode changes

### FR-4: Plugin Settings

| Setting         | Type          | Default | Description                        |
| --------------- | ------------- | ------- | ---------------------------------- |
| `theme`         | enum (select) | `auto`  | beautiful-mermaid theme name       |
| `transparentBg` | boolean       | `true`  | Render with transparent background |

### FR-5: Error Handling

- Display a user-friendly error message in the renderer slot when:
  - Mermaid syntax is invalid
  - No child block content is found after a 1.5 s retry window
  - The rendering library encounters an error
- Surface non-retryable slash-command failures as a user-visible toast instead of a silent warning

### FR-6: Supported Diagram Types

All diagram types supported by beautiful-mermaid:

- Flowcharts
- State diagrams
- Sequence diagrams
- Class diagrams
- ER diagrams

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

- **SDK**: `@logseq/libs` ≥ 0.3.2 — Logseq Plugin SDK. Minimum version is enforced at compile time by `src/__sdk_guard__.ts`, which references an API introduced in 0.3.x; `npm run typecheck` fails on any downgrade.
- **Renderer**: `beautiful-mermaid` — SVG rendering engine (pinned version)
- **Bundler**: Vite — dev server + production build
- **Entry**: `onMacroRendererSlotted` hook intercepts `{{renderer :bermaid}}` macros
- **UI**: `provideUI()` injects a CSS-resizable wrapper + SVG + copy button + lightbox trigger into the renderer slot
- **Lightbox**: `src/lightbox.ts`, PhotoSwipe 5 in the plugin's main UI iframe
- **Styling**: `provideStyle()` injects CSS for the wrapper, resize grip, copy button, and error states; PhotoSwipe's CSS is bundled into the plugin frame
- **Host scope**: none. Nothing depends on `window.top.document`; the only `ensureHostScope()` call is the clipboard fallback

## Testing Strategy

End-to-end tests using Playwright against Logseq at localhost:3001:

1. Plugin loads successfully
2. Slash command inserts macro + child block (in both DB and file graphs)
3. Diagram renders as SVG
4. Invalid syntax shows error message
5. Theme switching updates diagram colors
6. Hover shows copy button; click copies PNG to clipboard
7. Drag the resize grip changes diagram width; the macro arg is rewritten and the aspect ratio is kept (`scripts/e2e/resize.mjs`, run from an installed copy)
8. Click diagram opens the lightbox in the plugin frame; Esc / ✕ / backdrop closes it; zoom button and mouse wheel zoom (`scripts/e2e/lightbox.mjs`, run from an installed copy)
