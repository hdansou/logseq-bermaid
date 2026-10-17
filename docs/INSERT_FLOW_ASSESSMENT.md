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
| Live preview while typing | yes (code block edits fire `DB.onChanged`) | yes | no, the slot is hidden while the block is in the raw editor | - |
| Existing diagrams | unchanged | unchanged | renderer must also read its own block; both forms then coexist | - |
| Side effects seen | - | a "Block not found" flash from the removed block's slot | - | - |

D is the same trap as v0.2–v0.4: `Experiments.*` goes through `ensureHostScope()` and hands the host a JS function, which only works sideloaded. Not viable for marketplace installs.

B costs more calls than A for the same result, plus a visible error flash. Dropped.

Not prototyped, for completeness: **E. "Render as diagram" on an existing code block** (block context menu or `/bermaid` on a block that already holds a ```` ```mermaid ```` fence). The user creates the code block with Logseq's own `/code` command, which focuses CodeMirror natively, types or pastes, then one action wraps it under a macro. It is the only shape that gives a focused, multi-line editor without the plugin touching focus; the cost is two steps instead of one.

## 4. Recommendation

1. **Fix the clock first (applies to every option).** One worker-backed `sleep()` used by `retry`, `scheduleRerender` and the lightbox poll. Measured: 100 ms means ~102 ms again. Live preview while typing drops from ~1 s to the intended 350 ms.
2. **Ship A.** Drop the fixed sleeps from `insertBermaidTemplate` (keep `retry` on DB errors, now on the worker clock). Expected: code block visible in about 0.25 s instead of 2.4–3.1 s. Replace the renderer's child poll with the existing `DB.onChanged` path, and show a neutral "Type Mermaid in the code block below" hint instead of the red "Child block is empty" error. No change for existing diagrams.
3. **Decide on E as a follow-up.** It removes the remaining "click into the code block" step for people who start from a code block, and it pairs well with paste. C is not recommended: it only works when pasting.

The remaining friction after A, one click into the code block, cannot be removed by the plugin alone: focusing CodeMirror needs the host DOM, which installed plugins cannot reach.

## 5. Gate for the change

`scripts/e2e/slash-latency.mjs` is the before/after measurement. Target for A: code block in DOM < 400 ms (median), no red error state, zero DB errors over 5 runs. Then `resize.mjs`, `lightbox.mjs` and `sizing.mjs` must stay green.
