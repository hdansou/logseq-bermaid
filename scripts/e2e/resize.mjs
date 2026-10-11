// E2E: drag-to-resize must work from an INSTALLED (cross-origin) plugin.
//
//   node scripts/e2e/resize.mjs --port 9345 --uuid <macro block uuid> [--dx 120]
//
// Preconditions: a Logseq instance with --remote-debugging-port=<port>, the
// plugin loaded from ~/.logseq/plugins/logseq-bermaid, and the page holding the
// macro block open. (See CLAUDE.md "Plugin Origin Split" for why sideloads do
// not count.)
//
// Asserts, for a real pointer drag on the resize grip:
//   1. the wrapper's width changed by roughly dx,
//   2. the macro arg was rewritten to the new width,
//   3. the block did not drop into edit mode.
// Exit code 0 = pass, 1 = fail.
import { createRequire } from "node:module";
const require = createRequire("/Users/dzu/Projects/src/github.com/logseq/package.json");
const { chromium } = require("playwright");

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const port = arg("--port", "9345");
const uuid = arg("--uuid");
const dx = Number(arg("--dx", "120"));
if (!uuid) { console.error("--uuid required"); process.exit(2); }

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page = browser.contexts()[0].pages().find(p => p.url().startsWith("lsp://logseq.com/index.html"));
// The instance window is small (980x700); a grip dragged past the window edge
// releases outside the document and no click fires. A user cannot do that
// either. Deterministic viewport for the gestures below.
await page.setViewportSize({ width: 1400, height: 900 });
await page.waitForTimeout(500);
const sel = `.bermaid-wrapper[data-block-uuid="${uuid}"]`;
const errors = [];
page.on("pageerror", e => errors.push(String(e).slice(0, 120)));

// CodeMirror keeps a hidden <textarea> under every rendered code block, so
// "is a textarea present" is not "is a block being edited". Ask the host.
const editing = () => page.evaluate(async () => !!(await logseq.api.check_editing()));
const settle = async () => {
  for (let i = 0; i < 3; i++) {
    if (await editing()) {
      await page.evaluate(() => logseq.api.exit_editing_mode(false));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1500);
    }
  }
  let stable = 0;
  for (let i = 0; i < 40 && stable < 6; i++) {
    await page.waitForTimeout(500);
    stable = (await page.evaluate(s => !!document.querySelector(s), sel)) ? stable + 1 : 0;
  }
  if (stable < 6) throw new Error("wrapper never settled in the DOM");
};
const rect = () => page.evaluate(s => {
  const w = document.querySelector(s); if (!w) return null;
  w.scrollIntoView({ block: "center" });
  const r = w.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, inlineHeight: w.style.height };
}, sel);
const macroWidth = () => page.evaluate(async u => {
  const b = await logseq.api.get_block(u); const t = b?.title ?? b?.content ?? "";
  const m = /\{\{renderer\s+:bermaid\s*,\s*(\d+)\s*\}\}/.exec(t); return m ? Number(m[1]) : null;
}, uuid);

let pass = true;
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) pass = false; };
try {
  await settle();
  const before = await rect();
  await page.waitForTimeout(500);
  const b = await rect();
  const macroBefore = await macroWidth();
  // the grip is the bottom-right corner of the wrapper
  const gx = b.right - 6, gy = b.bottom - 6;
  await page.mouse.move(gx, gy); await page.waitForTimeout(200);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(gx + dx * i / 10, gy, { steps: 2 }); await page.waitForTimeout(40); }
  const during = await rect();
  const editingDuring = await editing();
  await page.mouse.up();
  await page.waitForTimeout(3000);
  const editingAfter = await editing();
  const after = await rect();
  const macroAfter = await macroWidth();
  console.log(JSON.stringify({ before: b.width, during: during?.width, after: after?.width, macroBefore, macroAfter, inlineHeightDuring: during?.inlineHeight, heightBefore: b.height, heightAfter: after?.height }));
  check(during && Math.abs(during.width - (b.width + dx)) <= 4, `width follows the drag live (${during?.width} vs ${b.width + dx})`);
  check(!editingDuring && !editingAfter, "block did not enter edit mode");
  check(after && Math.abs(after.width - (b.width + dx)) <= 4, `width persisted after release (${after?.width})`);
  check(macroAfter !== null && Math.abs(macroAfter - (b.width + dx)) <= 4, `macro arg rewritten (${macroBefore} -> ${macroAfter})`);
  check(after && Math.abs(after.height / after.width - b.height / b.width) < 0.02, "aspect ratio preserved");
  const own = errors.filter(e => /bermaid/i.test(e) && !/SecurityError/.test(e));
  check(own.length === 0, `no plugin page errors (${own.join(" | ") || "none"})`);
} catch (e) { console.log("FAIL " + e); pass = false; }
await settle().catch(() => {});
await browser.close();
process.exit(pass ? 0 : 1);
