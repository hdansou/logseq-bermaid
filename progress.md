# Bermaid Plugin - Compliance Progress

**Last Updated:** 2026-03-01  
**Status:** Not Started - All items pending

## Critical Issues (Must Fix)

- [x] **Add icon.png file**
  - File: `/icon.png`
  - Current: Referenced in `package.json` (`logseq.icon: "./icon.png"`) but missing
  - Implemented: Added `/icon.png` (128x128 PNG, ~11KB)
  - **Refined Scope (MVP):**
    - Add a single static PNG icon at plugin root: `/icon.png`
    - Use a square image (target: 128x128; acceptable: 64x64+)
    - Keep file size practical for plugin packaging (target: <100KB)
    - Do not rename or change the `logseq.icon` path unless file placement changes
  - **Acceptance Criteria:**
    - `icon.png` exists at plugin root
    - `package.json` `logseq.icon` resolves correctly to the file
    - Plugin loads in Logseq without icon-related manifest warnings/errors
  - **Out of Scope (for this task):**
    - Brand redesign, multiple icon variants, or dynamic theme-specific icons
    - Any other metadata or runtime code changes

- [x] **Fix DB graph compatibility check**
  - File: `src/index.ts` (slash command path near `upsertBlockProperty` calls)
  - Current: Always calls `upsertBlockProperty` for display/code-language metadata, which is DB-graph specific
  - Implemented: Added `await logseq.App.checkCurrentIsDbGraph()` guard before DB-only property upserts
  - **Refined Scope (MVP):**
    - Before calling `upsertBlockProperty`, detect graph type with `await logseq.App.checkCurrentIsDbGraph()`
    - Apply DB-only properties only when result is `true`
    - Keep child block insertion behavior unchanged for all graph types
    - For non-DB graphs, skip property upserts without throwing user-facing errors
  - **Acceptance Criteria:**
    - In DB graph: child block still receives display/code-language properties
    - In file graph: slash command still inserts renderer + child block, with no property API errors
    - No regression in existing slash command success/error messaging
  - **Out of Scope (for this task):**
    - Refactoring slash command UX/content template
    - Adding graph-type-specific notifications or new settings

## Highly Recommended

- [x] **Add README.md**
  - File: `/README.md`
  - Current: Missing
  - Implemented: Added plugin README with description, install/build steps, usage, settings, screenshot, and credits
  - Action: Add documentation with:
    - Plugin description
    - Installation instructions
    - Usage examples
    - Screenshot/demo
    - Credits to beautiful-mermaid library

- [x] **Add LICENSE file**
  - File: `/LICENSE`
  - Current: MIT declared in package.json but no file
  - Implemented: Added standard MIT license text in project root
  - Action: Add MIT license text

- [x] **Update package.json metadata**
  - File: `package.json`
  - Current: Missing author and repository fields
  - Implemented: Added `author` and `repository` fields
  - Action: Add:
    ```json
    "author": "Your Name",
    "repository": {
      "type": "git",
      "url": "git+https://github.com/logseq/logseq.git"
    }
    ```

- [x] **Fix dynamic require() for THEMES**
  - File: `src/index.ts` (lines 57-70)
  - Current: Uses `require()` with eslint-disable comment
  - Implemented: Replaced runtime `require()` with static `import { THEMES } from 'beautiful-mermaid'`
  - Action: Import THEMES at top of file instead: `import { THEMES } from 'beautiful-mermaid'`

- [x] **Implement event listener cleanup**
  - File: `src/index.ts`
  - Current: `onThemeModeChanged` listener not cleaned up
  - Implemented: Stored `onThemeModeChanged` off-hook and disposed all hooks in `logseq.beforeunload`
  - Action: Add `beforeunload` hook to cleanup event listeners:
    ```typescript
    const offHooks: (() => void)[] = [];
    // Store all off-hooks
    logseq.beforeunload(async () => {
      offHooks.forEach((off) => off());
    });
    ```

## Feature: Copy Image & Drag-to-Resize

**Status:** ✅ Completed — 2026-02-12

### Implementation Summary

All components have been successfully implemented:

✅ **SVG Cache** - Map storing rendered SVGs keyed by block UUID  
✅ **Copy Image** - Hover button and right-click context menu with PNG clipboard support  
✅ **Drag-to-Resize** - Left and right resize handles with host scope event delegation  
✅ **Width Persistence** - Block properties store diagram width in DB graphs  
✅ **Enhanced Template** - Wrapper structure with all interactive elements  
✅ **Complete CSS** - All styles for buttons, handles, menu, and resize states

### Features Delivered

#### 1. SVG to PNG Conversion

- `svgToPngBlob()` utility converts SVG to high-quality PNG (2x resolution)
- Respects transparent background setting
- Automatic dimension detection from SVG attributes

#### 2. Copy to Clipboard

- **Hover Button**: Appears in top-right corner on diagram hover
- **Context Menu**: Right-click on diagram shows "Copy as PNG" option
- Clipboard API with host scope fallback for compatibility
- Success/error notifications via toast messages

#### 3. Drag-to-Resize

- **Left Handle**: Resize from left edge (right edge stays anchored)
- **Right Handle**: Resize from right edge (left edge stays anchored)
- **Constraints**: Min 100px, max parent width
- **Visual Feedback**: Outline during resize, handles visible on hover
- **Host Scope Events**: Mouse events on `window.top.document` for reliability

#### 4. Width Persistence

- Diagram width saved as `bermaid-width` block property (DB graphs only)
- In-memory cache reduces redundant async lookups
- Automatic restoration on diagram render

#### 5. Enhanced UI

- Wrapper structure with proper positioning
- Smooth transitions and hover states
- Context menu with proper z-index and styling
- Responsive design adapts to container width

### Technical Implementation

**Core Functions Added:**

- `svgToPngBlob(svgString)` - SVG → PNG conversion with canvas rendering (2x resolution)
- `copyImageToClipboard(uuid)` - Clipboard write with host scope fallback
- `showContextMenu(uuid, x, y)` - Dynamic menu positioning
- `hideContextMenu()` - Menu cleanup and state reset
- `getBlockWidth(uuid)` / `setBlockWidth(uuid, width)` - Width persistence layer

**Event Handling:**

- `provideModel()` with `bermaidCopyImage` and `bermaidContextMenu` handlers
- Host scope event listeners for `mousedown`, `mousemove`, `mouseup` on `window.top.document`
- Cursor position tracking for context menu placement
- Resize state management with left/right side detection

**Template Structure:**

```html
<div
  class="bermaid-wrapper"
  data-block-uuid="${uuid}"
  style="width: ${width}px;"
>
  <div class="bermaid-resize-handle bermaid-resize-left" data-side="left"></div>
  <div class="bermaid-container" data-on-contextmenu="bermaidContextMenu" ...>
    ${svg}
  </div>
  <button class="bermaid-copy-btn" data-on-click="bermaidCopyImage" ...>
    📋 Copy
  </button>
  <div
    class="bermaid-resize-handle bermaid-resize-right"
    data-side="right"
  ></div>
</div>
```

**CSS Classes:**

- `.bermaid-wrapper` - Container with positioning and width constraints
- `.bermaid-copy-btn` - Hover-visible button with smooth transitions
- `.bermaid-resize-handle` - Edge-positioned handles with col-resize cursor
- `.bermaid-resizing` - Active resize state with visual outline
- `.bermaid-context-menu` / `.bermaid-context-menu-item` - Fixed positioned menu

### Verification Checklist

To test the implementation:

1. ✅ Build succeeds: `npm run build`
2. ⏳ Load plugin in Logseq (Settings → Plugins → Load unpacked plugin)
3. ⏳ Insert diagram with `/bermaid` slash command
4. ⏳ Hover diagram → copy button appears → click → paste to verify PNG
5. ⏳ Right-click diagram → context menu appears → "Copy as PNG" → verify clipboard
6. ⏳ Drag right handle → width changes smoothly
7. ⏳ Drag left handle → right edge stays anchored
8. ⏳ Reload page → diagram width persists (DB graphs only)
9. ⏳ Test in both DB and file-based graphs
10. ⏳ Verify transparent background setting affects PNG output

---

2. Hover → copy button → click → "Copied!" toast → paste to verify PNG
3. Right-click → context menu → "Copy as PNG" → verify clipboard
4. Drag right edge → width changes smoothly
5. Drag left edge → right edge stays anchored
6. Navigate away and back → resized width persists

---

## Nice to Have (Improvements)

- [ ] **Enhance error messages**
  - File: `src/index.ts` (various error templates)
  - Current: Basic error messages
  - Action: Add more user-friendly messages with emoji indicators

- [ ] **Improve TypeScript configuration**
  - File: `tsconfig.json`
  - Current: Minimal config
  - Action: Add `lib`, `resolveJsonModule`, `isolatedModules` options

- [ ] **Optimize Vite configuration**
  - File: `vite.config.ts`
  - Current: Basic config
  - Action: Add `minify: 'terser'` and `sourcemap: false` for production builds

- [ ] **Add .gitignore**
  - File: `/.gitignore`
  - Current: Missing
  - Action: Add standard ignore patterns:
    ```
    node_modules/
    dist/
    *.log
    .DS_Store
    ```

## Code Quality Notes

### Current Strengths ✅

- Proper use of `logseq.ready()` bootstrap pattern
- Good use of `provideUI()` for macro renderer
- Settings schema properly configured
- CSS variables used for theming
- Slash command registration follows standards
- Error handling with try-catch blocks
- Loading states shown to users

### Architecture Compliance ✅

- Follows standard plugin entry point pattern
- Uses `@logseq/libs` SDK correctly
- Proper macro renderer implementation with `onMacroRendererSlotted`
- Settings schema using recommended patterns
- CSS injection via `provideStyle()`

## Testing Checklist

After implementing changes:

- [ ] Test in DB-based graph
- [ ] Test in file-based graph
- [ ] Test theme switching (light/dark)
- [ ] Test slash command insertion
- [ ] Test error states (missing child block, invalid syntax)
- [ ] Test plugin load/unload
- [ ] Verify no console errors
- [ ] Check memory leaks (event listener cleanup)

## References

- [Logseq Plugin Development Guide](../../../libs/development-notes/AGENTS.md)
- [Plugin Samples](https://github.com/logseq/logseq-plugin-samples)
- [API Documentation](https://plugins-doc.logseq.com)

---

## Production Readiness Audit (2026-03-01)

### Top 3 (Start Here)

- [x] **Pin production dependency versions**
  - File: `/package.json`
  - Current: `"beautiful-mermaid": "latest"`
  - Action:
    - Pin to a deterministic version (exact or constrained semver)
    - Update lockfile to match pinned runtime version
  - Why:
    - Prevents surprise breakages from upstream publishes
    - Improves reproducibility across local/CI/release builds
  - Implemented (2026-03-01): Pinned to `"beautiful-mermaid": "1.1.3"` and updated `package-lock.json`

- [x] **Clean up host document event listeners on unload**
  - File: `src/index.ts`
  - Current: Host listeners are attached for resize/context interactions, but only Logseq off-hooks are explicitly cleaned up
  - Action:
    - Track and remove host listeners during plugin unload
    - Keep existing resize/copy/context behavior unchanged
  - Why:
    - Avoid duplicate handlers on plugin reload
    - Reduce leak risk and unintended repeated side effects
  - Implemented (2026-03-01): Added named host event handlers with explicit `removeEventListener` cleanup in `beforeunload`

- [x] **Add CI workflow for pull requests**
  - File: `.github/workflows/ci.yml` (new)
  - Current: Release-only workflow exists; no standard PR CI gate
  - Action:
    - Add CI on `push`/`pull_request` running install + type/build checks
  - Why:
    - Catches regressions before release tags
    - Enforces baseline build health in collaboration workflows
  - Implemented (2026-03-01): Added `.github/workflows/ci.yml` (push to `main` + `pull_request`) running `npm ci`, `npm run typecheck`, and `npm run build`

## Feature: Lightbox Zoom, Pan & Close Button

**Status:** ✅ Completed — 2026-03-01

### Implementation Summary

✅ **Close button (✕)** — Fixed circular button top-right of the lightbox overlay; triggers `hideFullscreen()` (same as Esc / backdrop click)  
✅ **Zoom controls bar** — Fixed pill at the bottom centre with `−`, `+`, `⊙` (reset) buttons and a live `%` label  
✅ **Mouse-wheel zoom** — Zooms toward cursor position (12.5% – 800%); uses `preventDefault` to block page scroll  
✅ **Click-drag to pan** — Mousedown on the image area starts a pan drag; cursor changes to `grab` / `grabbing`  
✅ **State reset** — Zoom, pan, and drag state reset on every open and on close/Esc  
✅ **CSS** — New classes: `.bermaid-lightbox-backdrop`, `.bermaid-lightbox-close`, `.bermaid-zoom-controls`, `.bermaid-zoom-btn`, `.bermaid-zoom-level`, `.bermaid-lightbox-zoom-container`, `.bermaid-panning`

### Features Delivered

#### Close Button

- Circular `✕` button fixed to top-right of the lightbox, always visible
- Same behaviour as pressing Esc or clicking the dark backdrop
- Smooth hover state (brightens border + background)

#### Zoom Controls

- Pill-shaped bar fixed at lightbox bottom-centre
- `−` / `+`: zoom out/in × 1.25 per click
- `⊙`: resets zoom to 100% and clears pan offset
- Live label shows current zoom (e.g. `125%`), updated by direct DOM mutation (`updateLightboxTransform`)
- Zoom range: 12.5% – 800%

#### Mouse Wheel Zoom

- Registered with `{ capture: true, passive: false }` so `preventDefault()` can block Logseq page scroll
- Zoom anchored toward cursor: `newPan = oldPan + cursorOffset × (1/newZoom − 1/oldZoom)`

#### Click-Drag Pan

- Mousedown inside `.bermaid-lightbox-content` (excluding buttons) starts pan drag
- Mousemove computes delta and updates `lightboxPanX/Y`, transformed by current zoom scale
- Mouseup ends drag and removes `.bermaid-panning` class

#### `updateLightboxTransform()`

- Directly mutates `.bermaid-lightbox-zoom-container` style and `.bermaid-zoom-level` text via `hostDoc.querySelector` — avoids re-rendering the entire lightbox `provideUI` call on every scroll/drag event

### Bug Fixes (2026-03-01)

- [x] **Fix `/bermaid` not writing `{{renderer :bermaid}}` to the parent block**
  - File: `src/index.ts` (`insertBermaidTemplate`)
  - Root cause: Slash command leaves the block in editing mode; `updateBlock` on an actively edited block is silently ignored by Logseq (live editor state takes precedence)
  - Fix: Call `logseq.Editor.exitEditingMode(true)` + 100 ms sleep before the `updateBlock` retry loop so the block is released before the programmatic write
  - Also surfaced non-retryable `updateBlock` failures as a user-visible error toast instead of a silent `console.warn`

- [x] **Fix "No child block found" flash immediately after `/bermaid`**
  - File: `src/index.ts` (`onMacroRendererSlotted`)
  - Root cause: The macro renderer slot fires the moment `{{renderer :bermaid}}` lands, before `insertBermaidTemplate` has finished inserting the child mermaid block (~300 ms+ later), so the first render sees no children
  - Fix: Added a retry loop in the renderer (up to 6 × 250 ms ≈ 1.5 s) that re-fetches the block until children appear, absorbing the insertion delay without flashing the error state

### Next Priorities

- [ ] Re-render existing diagrams when theme mode changes
- [ ] Align docs/manifest values across README/CLAUDE/marketplace template/package metadata
- [ ] Add bounded cache cleanup policy for rendered SVG and width caches
- [ ] Replace brittle SVG whitespace trim regex with DOM-safe parsing
- [ ] Reduce per-mousemove DOM updates for context menu positioning
- [ ] Track and document accepted upstream SDK vulnerability risk
