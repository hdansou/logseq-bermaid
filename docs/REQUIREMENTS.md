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
- Right-clicking the diagram shows a context menu with a "Copy as PNG" option
- Both paths write a PNG to the system clipboard at 2× resolution
- Respects the `transparentBg` setting
- Uses host-scope clipboard API with fallback for Logseq's sandboxed iframe

### FR-8: Drag-to-Resize

- Left and right resize handles are shown on diagram hover
- Dragging a handle changes diagram width (min 200 px, max parent width or 1200 px)
- Dragging the left handle keeps the right edge anchored (adjusts `marginLeft`)
- Width is persisted as a `bermaid-width` block property in DB graphs and restored on re-render

### FR-9: Lightbox Zoom & Pan

- Clicking a rendered diagram opens a full-screen lightbox overlay
- The lightbox can be closed via an ✕ button, pressing Esc, or clicking the backdrop
- Mouse-wheel scrolls zoom toward the cursor position; range: 12.5 %–800 %
- Click-drag inside the lightbox pans the diagram
- A zoom controls pill (bottom-centre) provides `−`, `+`, and `⊙` (reset) buttons with a live zoom label

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
- **UI**: `provideUI()` injects SVG + resize handles + copy button + lightbox trigger into the renderer slot
- **Styling**: `provideStyle()` injects CSS for container, lightbox, zoom controls, and error states
- **Host scope**: resize drag, context menu, lightbox, and zoom/pan use `window.top.document` event listeners; cleaned up on `beforeunload`

## Testing Strategy

End-to-end tests using Playwright against Logseq at localhost:3001:

1. Plugin loads successfully
2. Slash command inserts macro + child block (in both DB and file graphs)
3. Diagram renders as SVG
4. Invalid syntax shows error message
5. Theme switching updates diagram colors
6. Hover shows copy button; click copies PNG to clipboard
7. Right-click shows context menu with "Copy as PNG"
8. Drag resize handles change diagram width; width persists on reload (DB graph)
9. Click diagram opens lightbox; Esc / ✕ / backdrop closes it
10. Mouse-wheel zoom and click-drag pan work inside the lightbox
