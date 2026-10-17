# `/bermaid` insertion: measurement and alternatives

Branch `experiment/pele`, 2026-10-17. Goal: less friction and delay between "I want a diagram" and typing Mermaid.

All numbers come from the installed plugin (`lsp://logseq.io/plugins/…`, cross-origin) in a private Logseq-DB instance (CDP 9345), throwaway graph `bermaid-pele-test`.

## 1. Baseline

`node scripts/e2e/slash-latency.mjs --port 9345 --runs 5` types `/bermaid`, presses Enter, and timestamps every block-related host API call plus every state of the block in the DOM.

| ms after Enter (median of 5) | What the user sees |
| ---------------------------- | ------------------ |
| 323 | nothing yet (first plugin call) |
| 1408 | slot "Rendering mermaid diagram..." |
| **2376** | **empty code block appears** |
| **3342** | slot settles on a red "Child block is empty" error |
| - | **cursor is nowhere**; the user must click into the code block |

First (cold) run: code block at 3077 ms, slot settled at 4056 ms.

## 2. Root cause: the plugin's timers run at 1 Hz

The plugin iframe is hidden (`document.visibilityState === "hidden"`), and Chromium aligns timers in hidden cross-origin frames to 1-second wake-ups. Measured inside the installed iframe:

| Wait | Requested | Actual |
| ---- | --------- | ------ |
| `setTimeout` | 100 ms | 602, 1000, 1000, 1000 |
| `setTimeout` | 300 ms | 999, 1001, 1000, 999 |
| `setTimeout` in a Web Worker | 100 ms | 102, 102, 103, 102 |
| `setTimeout` in a Web Worker | 300 ms | 303, 303, 302, 301 |
| microtask / `MessageChannel` | 0 | 0 |

SDK round-trips themselves are fast: `getBlock` 3–5 ms, `updateBlock` 18–20, `insertBlock` 29–33, `insertBatchBlock` 37–45, `editBlock` 4–15.

So `/bermaid` is three throttled sleeps (`sleep(100)`, `sleep(100)`, `sleep(300)`), each costing up to a full second, plus the renderer's child poll (`retry` with 250 ms delays → 1 s each). The same throttling also hits:

- the live re-render debounce (`scheduleRerender`, 350 ms → ~1 s after the last keystroke),
- the lightbox's `innerWidth` poll before opening.

## 3. Alternatives

Each prototype ran its SDK sequence inside the installed iframe with no timers, on a block in edit mode (the state right after `/bermaid`).

| | A. Two blocks, no timers | B. Batch insert + remove | C. One block: macro + fence | D. Fenced-code renderer |
| - | - | - | - | - |
| Shape | today's: macro parent, ```` ```mermaid ```` child | same as A | `{{renderer :bermaid}}` and the fence in one block | a plain ```` ```mermaid ```` block renders itself; no macro |
| Calls | exit, update, insert, edit | exit, insertBatch, remove, get, edit | exit, update, edit(pos) | `Experiments.registerFencedCodeRenderer` |
| Measured | **246 ms** | 264 ms | **227 ms** | **throws `SecurityError`** in the installed iframe |
| DB "entity id, got 0" without sleeps | none | none | none | - |
| Cursor ends in | nowhere: `editBlock` on a code block does not focus its CodeMirror | nowhere | **inside the fence** (raw editor, caret at offset 33) | - |
| Typing multi-line Mermaid | click into the code block first, then normal | same as A | **breaks**: Enter splits the block (and carries the closing fence away) | - |
| Pasting Mermaid | fine | fine | fine | - |
| Live preview while typing | no: the code editor writes to the DB only when left (see §6) | same as A | no, the slot is hidden while the block is in the raw editor | - |
| Existing diagrams | unchanged | unchanged | renderer must also read its own block; both forms then coexist | - |
| Side effects seen | - | a "Block not found" flash from the removed block's slot | - | - |

D is the same trap as v0.2–v0.4: `Experiments.*` goes through `ensureHostScope()` and hands the host a JS function, which only works sideloaded. Not viable for marketplace installs.

B costs more calls than A for the same result, plus a visible error flash. Dropped.

Not prototyped, for completeness: **E. "Render as diagram" on an existing code block** (block context menu or `/bermaid` on a block that already holds a ```` ```mermaid ```` fence). The user creates the code block with Logseq's own `/code` command, which focuses CodeMirror natively, types or pastes, then one action wraps it under a macro. It is the only shape that gives a focused, multi-line editor without the plugin touching focus; the cost is two steps instead of one.

## 4. Recommendation

1. **Fix the clock first (applies to every option).** One worker-backed `sleep()` used by `retry`, `scheduleRerender` and the lightbox poll. Measured: 100 ms means ~102 ms again. The re-render debounce drops from ~1 s to the intended 350 ms.
2. **Ship A.** Drop the fixed sleeps from `insertBermaidTemplate` (keep `retry` on DB errors, now on the worker clock). Expected: code block visible in about 0.25 s instead of 2.4–3.1 s. Replace the renderer's child poll with the existing `DB.onChanged` path, and show a neutral "Type Mermaid in the code block below" hint instead of the red "Child block is empty" error. No change for existing diagrams.
3. **Decide on E as a follow-up.** It removes the remaining "click into the code block" step for people who start from a code block, and it pairs well with paste. C is not recommended: it only works when pasting.

The remaining friction after A, one click into the code block, cannot be removed by the plugin alone: focusing CodeMirror needs the host DOM, which installed plugins cannot reach.

## 5. Gate for the change

`scripts/e2e/slash-latency.mjs` is the before/after measurement. Target for A: code block in DOM < 400 ms (median), no red error state, zero DB errors over 5 runs. Then `resize.mjs`, `lightbox.mjs` and `sizing.mjs` must stay green.

## 6. Implemented: worker clock + A (2026-10-17)

### Changes

| File | Change |
| ---- | ------ |
| `src/utils/clock.ts` | New. `sleep()` / `delay()` (cancellable) on one lazily created Blob-URL worker; `setTimeout` fallback where `Worker` is missing |
| `src/utils/clock.test.ts` | New, 5 tests: waits run on the worker, concurrent ids route, cancel, lazy single worker, fallback |
| `src/index.ts` | `retry` and `scheduleRerender` use the worker clock. `insertBermaidTemplate` loses `sleep(100)`, `sleep(100)`, `sleep(300)` and the re-fetch. Renderer: one `getBlock` (retried only if the block itself is missing), slot tracked **before** rendering, neutral `.bermaid-hint` instead of the red "Child block is empty"/"No child block" errors. Theme re-render skips slots with no source yet |
| `src/lightbox.ts` | Open poll on the worker clock (16 ms, was ~1 s per tick while hidden) |
| `src/styles.ts` | `.bermaid-hint` shares the loading style |
| `scripts/e2e/slash-latency.mjs` | Now a gate: also clicks into the code block, types, presses Escape, times Escape → diagram; fails on thresholds or any red error |

### Finding: no preview while typing, from any plugin

Logseq's code-block editor (CodeMirror) writes the block to the DB only when it is left (Escape or blur). Measured: 3 s after typing, still focused, `get_block(child).title === ""`; after Escape the diagram showed in 448 ms. So the user-visible latency to measure is Escape → diagram.

### Bug fixed along the way (also on main)

After `/bermaid`, the slot showed "Child block is empty" and was **not tracked**, so `DB.onChanged` ignored the child's edits: the diagram never appeared until the page was reloaded. Tracking the slot before rendering fixes it (and also lets a diagram whose first source was invalid recover once fixed).

### Gate results

| `slash-latency.mjs` (median) | Before (previous commit, 3 runs) | After (5 runs) |
| ---------------------------- | -------------------------------- | -------------- |
| code block in DOM | 2335 ms | **179 ms** |
| slot final state | red "Child block is empty" | neutral hint at 344 ms |
| diagram after leaving the code block | **never** (5 s timeout) | **425 ms** (411–433) |
| verdict | FAIL ×3 | PASS ×4 |

Regression gates on the new build: `sizing.mjs` 24/24 (8 diagrams), `resize.mjs` 6/6 at dx +120 and −60, `lightbox.mjs` 7/7, `npm test` 33/33.

Still open: the cursor ends nowhere after `/bermaid`; one click into the code block remains (not fixable from an installed plugin). Option E is the candidate follow-up.

## 7. Option E prototype: "Render as Bermaid diagram" (2026-10-17)

Built on the branch for evaluation; the owner decides whether it ships.

### How it works

Block context menu item **Render as Bermaid diagram** (right-click a block's bullet). On a mermaid code block it inserts `{{renderer :bermaid}}` just above the block (`insertBlock(…, { before: true, sibling: true })`) and moves the code block under it (`moveBlock(…, { children: true })`). The code is never rewritten. On anything else it shows "not a mermaid code block"; on a code block already under a Bermaid macro, "already a diagram".

`isMermaidCodeBlock()` (`src/macro.ts`, unit-tested) accepts:

- a DB-graph code block with `:logseq.property.code/lang` = `mermaid`,
- a file-graph block whose first line is a ```` ```mermaid ```` fence,
- a code block with **no language** whose content Pele's `detectType` recognises. Needed because Logseq's `/code` creates code blocks with `lang: null`; without this the natural path failed (caught by the e2e, red before the fix).

A code block in another language (e.g. python) is never sent to the detector.

### Measured (`scripts/e2e/convert.mjs`, installed build)

| Check | Result |
| ----- | ------ |
| Code block becomes the only child of a new `{{renderer :bermaid}}` block | PASS |
| Code unchanged, kanban indentation included | PASS |
| Diagram on screen after the menu click | **370–424 ms** |
| Second run on the wrapped block adds no macro | PASS |
| `/code` → type → Escape → menu (language unset) | PASS (red before the detector) |
| Python code block left alone | PASS |

Regression gates on the same build: `slash-latency` 4/4 (code block 176 ms, diagram 423 ms after Esc), `sizing` 36/36, `resize` 6/6, `lightbox` 7/7, `npm test` 39/39.

Screenshots: [`option-e-1-code.png`](https://github.com/hdansou/logseq-bermaid/blob/a4331d8/docs/pele-experiment/option-e-1-code.png), [`option-e-2-menu.png`](https://github.com/hdansou/logseq-bermaid/blob/a4331d8/docs/pele-experiment/option-e-2-menu.png), [`option-e-3-result.png`](https://github.com/hdansou/logseq-bermaid/blob/a4331d8/docs/pele-experiment/option-e-3-result.png).

### Findings from the user path

- **`/code` focuses the code editor natively** (`activeElement` inside `.CodeMirror` right after Enter): you type at once, which `/bermaid` cannot offer.
- **`/code` sets no language.** Hence the detector.
- **Typing ```` ```mermaid ```` by hand is unreliable:** Logseq turns the block into a code block mid-word and the rest (`aid`) lands in the code. Not a path to document.
- Right after Escape, the `/code` block was drawn as plain text in one screenshot; after conversion it shows as a normal code block. Logseq display, outside the plugin.
- The menu item sits among every plugin's block items (here between "Collapse all" and a list of AI items), so it relies on the user knowing it is there: README needs a line, and the `/bermaid` hint could mention it.

### Steps compared

| | `/bermaid` (A) | `/code` + menu (E) |
| - | - | - |
| Start | type `/bermaid` ↵ | type `/code` ↵ |
| Cursor in the code editor | click into the code block | already there |
| Write the diagram | type or paste, Esc | type or paste, Esc |
| Make it a diagram | done | right-click bullet → Render as Bermaid diagram |
| Diagram visible | ~0.4 s after Esc | ~0.4 s after the click |
| Also converts code that already exists (pasted from elsewhere, older notes) | no | **yes** |
