# Experiment: beautiful-mermaid → Pele

Branch: `experiment/pele`. Question: is [Pele](https://github.com/obsidianmd/pele) (`pele@1.6.0`) a viable, faster and lighter replacement for `beautiful-mermaid@1.1.3`?

Decision: **pending** (owner reviews the results below).

## Tasks

- [x] Branch, install `pele@1.6.0`, remove `beautiful-mermaid`
- [x] Theme mapping: keep the 14 setting names, bake palettes into the SVG (`src/theme.ts`, unit-tested)
- [x] Bundle size and render-time comparison (Node)
- [x] Install the build into `~/.logseq/plugins/logseq-bermaid` (installed / cross-origin path); v0.5.0 backed up first
- [x] `scripts/e2e/resize.mjs` against the installed build: 6/6 PASS
- [x] `scripts/e2e/lightbox.mjs` against the installed build: 7/7 PASS
- [x] Visual check: six diagram types, light and dark (screenshots in `docs/pele-experiment/`)
- [x] Theme colors survive the image context (lightbox, copy-to-PNG)
- [x] Live re-render on edit; invalid syntax mid-typing holds the last good render
- [ ] **Decide:** sizing of narrow diagrams (finding 1)
- [ ] **Decide:** faint edges in `github-light` (finding 2)
- [ ] Restore the v0.5.0 install after the experiment (or ship)

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

Run 2026-10-17 on a private Logseq-DB instance (CDP port 9345, fresh profile), throwaway graph `bermaid-pele-test`, page *Pele test*. The plugin iframe loaded from `lsp://logseq.io/plugins/logseq-bermaid/…`, which is the cross-origin installed path.

| Check | Result |
| ----- | ------ |
| flowchart, sequence, class, state, ER, pie render | PASS, no errors |
| `resize.mjs` (live width, no edit mode, persisted, macro arg, aspect, no page errors) | 6/6 PASS |
| `lightbox.mjs` (open, Esc, re-open, zoom button, wheel zoom, `isOpen`, close) | 7/7 PASS |
| Theme switch light → dark re-renders all six with `tokyo-night` | PASS |
| SVG drawn through `<img>` → canvas: background var paints, `color-mix` fill = 242 (expected 241.6) | PASS |
| Live edit re-renders; `A -->` (incomplete) keeps the last good render | PASS |

Screenshots: [`light-auto.png`](pele-experiment/light-auto.png), [`dark-auto.png`](pele-experiment/dark-auto.png), [`dark-er-pie.png`](pele-experiment/dark-er-pie.png).

### Intrinsic size, same source

| Diagram | beautiful-mermaid | Pele |
| ------- | ----------------- | ---- |
| flowchart | 541×183 | 458×152 |
| sequence | 420×240 | 332×241 |
| class | 200×276 | 131×238 |
| state | 267×346 | 122×406 |
| ER | 590×168 | 309×201 |
| pie | **rejected** ("Invalid mermaid header") | 406×296 |

## Findings

1. **Narrow diagrams are blown up (regression).** `styles.ts` stretches the SVG to `width: 100%` of the wrapper (default 250px). beautiful-mermaid's output was about 250px wide or more, so the default looked natural-size. Pele's is much narrower (state: 122px), so at 250px it renders at ~2× with large text and tall pages. Options: (a) no upscaling (`width: auto; max-width: 100%`), so the diagram shows at natural size and only shrinks; dragging past natural width then just adds space. (b) Keep filling the width but cap the scale (e.g. ≤ 1.25×). (c) Leave as is.
2. **Faint edges in `github-light`** (the `auto` light theme). Its `line` is `#d1d9e0`, and Pele draws edges and arrowheads in `--pele-line`. Dark themes are fine. Fix candidate: mix `line` toward `fg` in `applyTheme()`, or pick a darker `line` for the light palettes.
3. **Pie slices ignore the theme.** They use Pele's `--pele-series-1..8` defaults. Acceptable; they could be mapped from `accent` later.
4. **Gains:** pie (and the rest of Mermaid 12.1's types) now render; smaller, faster, lazily split bundle; SVG 25–55% smaller.

## Open questions / risks

- Pele has its own layout and visual style; diagrams will not look like beautiful-mermaid's.
- Pele 1.6.0 was published the day this experiment started; the API is young.
