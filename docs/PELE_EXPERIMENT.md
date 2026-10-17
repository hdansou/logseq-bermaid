# Experiment: beautiful-mermaid → Pele

Branch: `experiment/pele`. Question: is [Pele](https://github.com/obsidianmd/pele) (`pele@1.6.0`) a viable, faster and lighter replacement for `beautiful-mermaid@1.1.3`?

Decision: **pending** (owner reviews the results below).

## Tasks

- [x] Branch, install `pele@1.6.0`, remove `beautiful-mermaid`
- [x] Theme mapping: keep the 14 setting names, bake palettes into the SVG (`src/theme.ts`, unit-tested)
- [x] Bundle size and render-time comparison (Node)
- [ ] Install the build into `~/.logseq/plugins/logseq-bermaid` (installed / cross-origin path)
- [ ] `scripts/e2e/resize.mjs` against the installed build
- [ ] `scripts/e2e/lightbox.mjs` against the installed build
- [ ] Visual check: screenshots of each diagram type, light and dark
- [ ] Copy-to-PNG keeps theme colors
- [ ] Restore the v0.5.0 install after the experiment

## Changes

| File | Change |
| ---- | ------ |
| `package.json` | `beautiful-mermaid` removed, `pele@1.6.0` added (exact) |
| `src/render.ts` | Renders with `renderAsync` from `pele/lazy` (per-diagram-type chunks), then `applyTheme()` |
| `src/theme.ts` | New. Palettes carried over from beautiful-mermaid's `THEMES`; `applyTheme()` prepends `--pele-*` vars to the root `<svg style>`; `resolveThemeName()` handles `auto` |
| `src/theme.test.ts` | New. Every setting has a palette, vars land in the root style, background only when not transparent, rest of the SVG untouched |

### Why the theme is baked into the SVG

Pele has no theme option; colors are CSS variables (`--pele-bg`, `--pele-fg`, …) with fallbacks inside the root `style`. The lightbox and copy-to-PNG load the SVG as an image (`data:` / blob URL), where outside CSS never reaches, so the variables are written into the SVG itself. Surface and border colors are mixed from bg/fg with `color-mix`. Pele paints no background, so `background:var(--pele-bg)` is added when *Transparent background* is off.

## Results

### Bundle (`npm run build`)

| | beautiful-mermaid (main) | Pele |
| - | - | - |
| Fetched on first diagram | 1.66 MB (491 KB gz) | 37 KB core + one chunk per diagram type (1–45 KB each) |
| `dist/` total | 1.8 MB | 992 KB |

### Render time (Node 22, mean of 20, after warm-up)

| Diagram | beautiful-mermaid | Pele | SVG size bm → pele |
| ------- | ----------------- | ---- | ------------------ |
| flowchart, 40 nodes | 12.88 ms | 1.13 ms | 30.7 → 20.1 KB |
| sequence, 30 messages | 0.09 ms | 0.19 ms | 15.9 → 12.5 KB |
| class, 16 classes | 2.83 ms | 0.26 ms | 19.9 → 12.0 KB |
| state, 15 states | 5.97 ms | 0.48 ms | 17.4 → 10.5 KB |

Node has no browser text measurement; treat as indicative.

### In-app (installed path)

_Pending._

## Open questions / risks

- Pele has its own layout and visual style; diagrams will not look like beautiful-mermaid's.
- `github-light` line color `#d1d9e0` is faint, and Pele draws edges and arrowheads in `--pele-line`.
- Pele measures text with its default measurer in `render()`; check labels for clipping.
