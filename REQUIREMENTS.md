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
  - No child block content is found
  - The rendering library encounters an error

### FR-6: Supported Diagram Types

All diagram types supported by beautiful-mermaid:

- Flowcharts
- State diagrams
- Sequence diagrams
- Class diagrams
- ER diagrams

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

- **SDK**: `@logseq/libs` — Logseq Plugin SDK
- **Renderer**: `beautiful-mermaid` — SVG rendering engine
- **Bundler**: Vite — dev server + production build
- **Entry**: `onMacroRendererSlotted` hook intercepts `{{renderer :bermaid}}` macros
- **UI**: `provideUI()` injects SVG into the renderer slot
- **Styling**: `provideStyle()` injects CSS for container sizing and error states

## Testing Strategy

End-to-end tests using Playwright against Logseq at localhost:3001:

1. Plugin loads successfully
2. Slash command inserts macro + child block
3. Diagram renders as SVG
4. Invalid syntax shows error message
5. Theme switching updates diagram colors
