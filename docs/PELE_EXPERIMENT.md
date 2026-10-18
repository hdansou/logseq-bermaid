# Experiment: beautiful-mermaid → Pele

Branch: `experiment/pele`. Question: is [Pele](https://github.com/obsidianmd/pele) (`pele@1.6.0`) a viable, faster and lighter replacement for `beautiful-mermaid@1.1.3`?

Decision (2026-10-17): **adopt Pele as the only engine.** beautiful-mermaid is not kept as a fallback; see Round 3 for why. Open: insertion option E, then release prep.

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
- [x] Finding 1 decided: option (a), natural size, never upscaled (round 2)
- [x] Finding 2 decided: carry beautiful-mermaid's color derivation forward exactly (round 2)
- [x] Round 2 gates: sizing e2e (new), resize ×3, lightbox, light and dark screenshots
- [x] Owner review of round 2: pursue Pele
- [x] Measure `/bermaid` latency and assess insertion alternatives, see [`INSERT_FLOW_ASSESSMENT.md`](INSERT_FLOW_ASSESSMENT.md) (new `scripts/e2e/slash-latency.mjs`)
- [x] Owner decision on the insertion flow: worker clock + A
- [x] Worker clock + A implemented and gated, see `INSERT_FLOW_ASSESSMENT.md` §6
- [x] Prototype E and test it, see `INSERT_FLOW_ASSESSMENT.md` §7 (new `scripts/e2e/convert.mjs`)
- [x] Owner decision (2026-10-17): **ship E** in this release. README: feature line, "From an existing code block" usage section; `/bermaid` usage corrected (empty code block, diagram appears on Esc)
- [x] Coverage (522 Mermaid docs examples, both engines) and per-type visual review, see Round 3
- [x] Owner decision (2026-10-17): **Pele only**, no engine setting
- [x] Name stays **Bermaid**, now standing for **Better Mermaid** (owner, 2026-10-17). Plugin id `logseq-bermaid` and the `:bermaid` macro are unchanged, so existing installs and diagrams keep working. Updated: `package.json` descriptions, README intro / Settings / Credits (Pele as engine, beautiful-mermaid credited for the themes and as the engine up to v0.5), theme setting description, `docs/MARKETPLACE_SUBMISSION.md`
- [x] v0.6.0 release prep: CLAUDE.md, README (Better Mermaid, Render as Bermaid diagram, new media), `docs/REQUIREMENTS.md`, CHANGELOG, version 0.6.0. `@logseq/libs` already at 0.3.4 (newest). Media recorded in today's journal in the test instance: `docs/demo.gif` (CDP screencast, 48 s; the MP4 master was dropped from the tree, it is in commit `034310d`), `docs/screenshot-light.png` / `-dark.png` (2×). Experiment screenshots removed from the tree; the links above point at commit `a4331d8`
- [x] Final gate on the installed v0.6.0 build: typecheck, `npm test` 39/39, `npm audit` 0, build (`dist/` 992 KB), `convert` 8/8, `slash-latency` 4/4 (160 / 412 ms), `sizing` 36/36, `resize` 6/6, `lightbox` 7/7
- [ ] Owner review, then merge to `main`, tag `v0.6.0`, push (publishes the GitHub release)
- [ ] After the release: replace the installed test build with the released zip (v0.5.0 backup no longer needed)

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

Screenshots: [`light-auto.png`](https://github.com/hdansou/logseq-bermaid/blob/a4331d8/docs/pele-experiment/light-auto.png), [`dark-auto.png`](https://github.com/hdansou/logseq-bermaid/blob/a4331d8/docs/pele-experiment/dark-auto.png), [`dark-er-pie.png`](https://github.com/hdansou/logseq-bermaid/blob/a4331d8/docs/pele-experiment/dark-er-pie.png).

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

## Round 2 (2026-10-17): sizing and faithful themes

Decisions: option (a) for finding 1; carry beautiful-mermaid's color schemes forward as it actually applied them.

### How beautiful-mermaid applied its palettes

Read from `beautiful-mermaid@1.1.3` `dist/index.js` (`MIX` and the `--_*` derivations):

| Role | beautiful-mermaid | Pele variable, now |
| ---- | ----------------- | ------------------ |
| edges | `--line`, else fg 50% into bg | `--pele-line` = `line` ?? mix 50% |
| arrowheads | `--accent`, else fg 85% | solid markers recolored to `--pele-accent` = `accent` ?? mix 85% |
| muted text | `--muted`, else fg 40% | `--pele-muted` = `muted` ?? mix 40% |
| node fill | fg 3% | `--pele-surface` mix 3% (was 6%) |
| group band | fg 5% | `--pele-surface-alt` mix 5% (was 12%) |
| node stroke | fg 20% | `--pele-border` mix 20% (was 30%) |

beautiful-mermaid drew `github-light` edges in the same pale `#d1d9e0`; what kept them readable was the blue accent on the arrowheads. Pele colors arrowheads with the line, so `applyTheme()` adds `<style>.pele-marker[fill="var(--_l)"]{fill:var(--pele-accent)}</style>`. The attribute match leaves hollow markers (`fill="var(--_bg)"`, e.g. class inheritance) and stroke-only ones alone. `zinc-dark` (bg/fg only in beautiful-mermaid) now derives its line, accent and muted colors instead of the values invented in round 1.

### Changes

| File | Change |
| ---- | ------ |
| `src/theme.ts` | beautiful-mermaid mix percentages; optional `line`/`accent`/`muted` derived from fg; marker style |
| `src/theme.test.ts` | 3 new tests (mixes, derived colors, marker style); body-untouched test adjusted for the `<style>` |
| `src/styles.ts` | `.bermaid-container svg`: `width: 100%` → `width: auto; max-width: 100%` |
| `scripts/e2e/sizing.mjs` | New. Every diagram: drawn width ≤ natural, ≤ wrapper, aspect kept |
| `scripts/e2e/resize.mjs` | Aspect check measures the SVG, not the wrapper (see below) |

Sizing is CSS-only on purpose: the wrapper keeps the macro width. Clamping the wrapper to the natural width would let a plain click commit a different width, because `bermaidWrapperClick` clamps to `MIN_DIAGRAM_WIDTH` (200px), more than a 122px state diagram.

The old resize check compared the **wrapper's** height/width before and after a drag. That held only while the SVG always filled the wrapper. Now a drag between two widths above the natural width leaves the diagram at its natural size and changes only the box, which failed the check (601 → 481 on a 457px flowchart) without anything being distorted. The property worth guarding is that the diagram is never stretched, so the check measures the SVG.

### Results

| Gate | Result |
| ---- | ------ |
| `npm test` | 28/28 (red first: 4 failing before the change) |
| `sizing.mjs` | red before (flowchart 601 > 457, class 250 > 131, state 250 > 122); green after on 7 diagrams |
| `resize.mjs` flowchart 481 → 250 (above natural → below) | 6/6 |
| `resize.mjs` sequence 250 → 210 (shrink) | 6/6 |
| `resize.mjs` sequence 210 → 360 (crosses natural 333) | 6/6 |
| `lightbox.mjs` | 7/7 |

Screenshots: [`v2-light-auto.png`](https://github.com/hdansou/logseq-bermaid/blob/a4331d8/docs/pele-experiment/v2-light-auto.png), [`v2-dark-auto.png`](https://github.com/hdansou/logseq-bermaid/blob/a4331d8/docs/pele-experiment/v2-dark-auto.png), [`v2-dark-er-pie-c4.png`](https://github.com/hdansou/logseq-bermaid/blob/a4331d8/docs/pele-experiment/v2-dark-er-pie-c4.png). The C4 component diagram on the test page was added by the owner during review and renders as `pele-c4`.

Trade-off of option (a): dragging the grip past a diagram's natural width grows the box but not the diagram. Use the lightbox to see it larger.

## Open questions / risks

- Pele has its own layout and visual style; diagrams will not look like beautiful-mermaid's.
- Pele 1.6.0 was published the day this experiment started; the API is young.

## Round 3 (2026-10-17): coverage and polish, and an engine choice

Question from the owner: offer a setting to pick Pele or beautiful-mermaid, because Pele is new and some types are marked "beta"?

### What "beta" means here

Pele's compatibility table (`website/src/content/docs/compatibility.md`) lists the `-beta` keywords (`xychart-beta`, `sankey-beta`, `architecture-beta`, `radar-beta`, `treeView-beta`, …). These are **Mermaid's own keywords**: Mermaid marks those diagram types as beta, and Pele accepts the same keywords. Pele claims every diagram type built into Mermaid 12.1.0 (33 types plus `info`); ZenUML and external Mermaid plugins are not supported.

### Coverage: every example in Mermaid's documentation

Corpus: `tests/corpus/*-docs.json` in the Pele repo (commit `458322a`), 522 examples across 33 types, extracted from Mermaid's documentation. Both engines in Node; "renders" = returns an SVG without throwing.

| Type | Docs examples | Pele 1.6.0 | beautiful-mermaid 1.1.3 |
| ---- | ------------- | ---------- | ----------------------- |
| flowchart | 114 | 114 | 109 |
| class | 38 | 38 | 33 |
| sequence | 38 | 38 | 37 |
| er | 25 | 25 | 22 |
| state | 22 | 22 | 20 |
| xychart (beta) | 8 | 8 | 4 |
| 27 other types (block, gantt, git, mindmap, pie, timeline, C4, sankey, …) | 277 | 277 | **0** |
| **Total** | **522** | **522** | **225** |
| Types with at least one render | 33 | **33** | **6** |

Caveats: this is Pele's own test corpus, so 522/522 shows it accepts the documented syntax, not that the output is good. That needs eyes (next section).

### Polish: one example per type, looked at

32 types (all but `info`), the fullest documentation example under 500 characters (Pele's own site uses the same rule), at width 600, `github-light`. 28 were captured from the **installed plugin** in the test instance; 4 (cynefin, er, eventmodeling, flowchart) in headless Chromium with the same Pele build and theme, because the test window became hidden and Logseq stopped mounting blocks. Sheets: [`coverage-sheet-1.png`](https://github.com/hdansou/logseq-bermaid/blob/a4331d8/docs/pele-experiment/coverage-sheet-1.png) … [`coverage-sheet-4.png`](https://github.com/hdansou/logseq-bermaid/blob/a4331d8/docs/pele-experiment/coverage-sheet-4.png).

All 32 draw complete, coherent diagrams: labels, legends, axes, nesting and arrows are where they should be, and colors set by the example itself (state `Crash`, sequence `rect` blocks) are honoured. Notes:

- **Faint lines in `github-light`** hurt Wardley most (edges barely visible), the same pale `line` color seen in round 1. A theme question, not Pele.
- **Wide diagrams** (timeline 1388px, mindmap 1274, swimlane 1174) shrink to fit and their text gets small; resize or the lightbox shows them full size.
- **Pie, and other charts with series colors,** use Pele's default series palette, not the theme.
- Two apparent defects were mine, checked and ruled out:
  - *Kanban card drawn as a second column.* Pele renders the source correctly (Todo, count 1, card with ticket and assignee). The seeding used `insert_block` with a fenced string, and **Logseq's `insert_block` strips leading indentation from fenced content** (`"\n  id3[Card]"` stored as `"\nid3[Card]"`). `update_block` on an existing code block keeps indentation. The plugin only inserts an empty fence, so it is not affected; typing into the code editor could not be tested while the window was hidden (unverified).
  - *Railroad cut off at the bottom.* Screenshot viewport (1000px) vs a 1012px diagram; rendered alone, the content ends at y=1004 inside its 1012 viewBox.

### Conclusion on an engine setting

beautiful-mermaid only renders 6 of the 33 types. For the other 27, including every `-beta` type, there is nothing to fall back to, so a fallback would protect only the mature types, where Pele is strongest. Recommendation: **Pele only**, no engine setting; keep the engine confined to `src/render.ts` and `src/theme.ts`; pin the exact version (done: `"pele": "1.6.0"`) and treat each Pele upgrade as a release gate (corpus run plus contact-sheet review).
