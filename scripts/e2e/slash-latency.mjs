// E2E: how long /bermaid takes, step by step, as a user experiences it.
//
//   node scripts/e2e/slash-latency.mjs --port 9345 [--runs 5] [--page "Slash latency"] [--command bermaid]
//
// Preconditions: a Logseq instance with --remote-debugging-port=<port>, the
// plugin loaded from ~/.logseq/plugins/logseq-bermaid, on a THROWAWAY graph
// (each run appends a block to --page).
//
// Each run: append an empty block, edit it, type "/<command>", press Enter, and
// timestamp from the Enter keypress (host clock):
//   - every block-related call into the host API (wrapped logseq.api functions;
//     polling by other installed plugins is filtered out, see `tracked`),
//   - every distinct state of the block's renderer slot (loading / error / diagram),
//   - when the child code block appears,
//   - where the cursor is once things settle (the user's next keystroke goes there).
// Prints one timeline per run and a median summary. Exit code 0 unless a run times out.
import { createRequire } from "node:module";
const require = createRequire("/Users/dzu/Projects/src/github.com/logseq/package.json");
const { chromium } = require("playwright");

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const port = arg("--port", "9345");
const runs = Number(arg("--runs", "5"));
const pageName = arg("--page", "Slash latency");
const command = arg("--command", "bermaid");
// Other installed plugins poll the host API (check_editing / get_current_block every 500 ms),
// and the host itself calls should_exec_plugin_hook; keep only calls that drive the block.
const tracked = new Set(["get_block", "exit_editing_mode", "update_block", "insert_block", "insert_batch_block", "edit_block", "remove_block"]);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page = browser.contexts()[0].pages().find(p => p.url().startsWith("lsp://logseq.com/index.html"));
await page.setViewportSize({ width: 1400, height: 900 });

await page.evaluate(async (name) => {
  if (!(await logseq.api.get_page(name))) await logseq.api.create_page(name, {}, { redirect: false });
  await logseq.api.push_state("page", { name: name.toLowerCase() });
  // Wrap the host API once; the plugin's SDK calls land here over the bridge.
  if (!window.__bmWrapped) {
    window.__bmWrapped = true;
    window.__bmCalls = [];
    for (const k of Object.keys(logseq.api)) {
      const fn = logseq.api[k];
      if (typeof fn !== "function") continue;
      logseq.api[k] = function (...a) {
        if (window.__bmRecording) window.__bmCalls.push({ t: performance.now(), call: k });
        return fn.apply(this, a);
      };
    }
  }
}, pageName);
await page.evaluate((names) => { window.__bmTracked = new Set(names); }, [...tracked]);
await page.waitForTimeout(1500);

const results = [];
for (let r = 0; r < runs; r++) {
  const uuid = await page.evaluate(async (name) => {
    window.__bmRecording = false;
    const b = await logseq.api.append_block_in_page(name, "");
    await new Promise(res => setTimeout(res, 300));
    await logseq.api.edit_block(b.uuid);
    return b.uuid;
  }, pageName);
  await page.waitForTimeout(600);
  await page.keyboard.type("/" + command, { delay: 30 });
  await page.waitForTimeout(700); // let the slash popup filter settle

  // Arm the recorder, then press Enter; t0 is taken in the host right before.
  await page.evaluate((u) => {
    window.__bmCalls = [];
    const marks = window.__bmMarks = [];
    const block = () => document.querySelector(`.ls-block[blockid="${u}"]`);
    let lastSlot = null, child = false;
    const look = () => {
      const b = block(); if (!b) return;
      const s = b.querySelector(".bermaid-wrapper") ? "diagram"
        : b.querySelector(".bermaid-error") ? "error: " + b.querySelector(".bermaid-error").textContent.trim().slice(0, 40)
        : b.querySelector(".bermaid-loading") ? "loading" : null;
      if (s && s !== lastSlot) { lastSlot = s; marks.push({ t: performance.now(), mark: "slot " + s }); }
      if (!child && b.querySelector(".block-children .ls-block")) { child = true; marks.push({ t: performance.now(), mark: "child block in DOM" }); }
    };
    window.__bmObs?.disconnect();
    window.__bmObs = new MutationObserver(look);
    window.__bmObs.observe(document.body, { subtree: true, childList: true, characterData: true });
    window.__bmT0 = performance.now();
    window.__bmRecording = true;
  }, uuid);
  await page.keyboard.press("Enter");

  // Settled = child present and the slot has held one state for 1.5 s, or 10 s timeout.
  const out = await page.evaluate(async (u) => {
    const t0 = window.__bmT0;
    const until = t0 + 10000;
    let stableSince = 0, lastLen = -1;
    while (performance.now() < until) {
      await new Promise(res => setTimeout(res, 100));
      const calls = window.__bmCalls.filter(c => window.__bmTracked.has(c.call));
      const n = window.__bmMarks.length + calls.length;
      const hasChild = window.__bmMarks.some(m => m.mark.startsWith("child"));
      if (n !== lastLen) { lastLen = n; stableSince = performance.now(); }
      else if (hasChild && performance.now() - stableSince > 1500) break;
    }
    window.__bmRecording = false;
    window.__bmObs.disconnect();
    const editing = await logseq.api.check_editing();
    const parent = await logseq.api.get_block(u, { includeChildren: true });
    const childUuid = parent?.children?.[0]?.uuid;
    const where = !editing ? "nowhere (not editing)"
      : editing === childUuid ? "child code block" : editing === u ? "macro block" : "other block " + String(editing).slice(0, 8);
    const ev = [...window.__bmMarks.map(m => ({ t: m.t - t0, e: m.mark })),
                ...window.__bmCalls.filter(c => window.__bmTracked.has(c.call)).map(c => ({ t: c.t - t0, e: "api " + c.call }))].sort((a, b) => a.t - b.t);
    return { ev, cursor: where, timedOut: performance.now() >= until, title: parent?.title ?? parent?.content };
  }, uuid);
  results.push(out);

  console.log(`\n--- run ${r + 1}${out.timedOut ? " (TIMED OUT)" : ""}: block "${out.title}", cursor ends in: ${out.cursor}`);
  // Collapse runs of the same call for readability.
  let prev = null, count = 0, first = 0;
  const flush = () => { if (prev) console.log(`${first.toFixed(0).padStart(6)} ms  ${prev}${count > 1 ? ` ×${count}` : ""}`); };
  for (const { t, e } of out.ev) {
    if (e === prev) { count++; continue; }
    flush(); prev = e; count = 1; first = t;
  }
  flush();
}

const median = (xs) => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const at = (o, pred) => o.ev.find(x => pred(x.e))?.t ?? null;
const summary = {
  "first plugin call": median(results.map(o => at(o, e => e.startsWith("api ")))),
  "macro slot appears": median(results.map(o => at(o, e => e.startsWith("slot ")))),
  "child block in DOM": median(results.map(o => at(o, e => e.startsWith("child")))),
  "slot final state": median(results.map(o => [...o.ev].reverse().find(x => x.e.startsWith("slot "))?.t ?? null)),
  "last plugin call": median(results.map(o => [...o.ev].reverse().find(x => x.e.startsWith("api "))?.t ?? null)),
};
console.log("\n=== median over", runs, "runs (ms from Enter)");
for (const [k, v] of Object.entries(summary)) console.log(`${k.padEnd(20)} ${v == null ? "-" : v.toFixed(0)}`);
console.log("cursor ends in:", [...new Set(results.map(o => o.cursor))].join(" | "));
await browser.close();
process.exit(results.some(o => o.timedOut) ? 1 : 0);
