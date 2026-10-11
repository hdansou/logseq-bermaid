// E2E: the lightbox must work from an INSTALLED (cross-origin) plugin:
// open on diagram click, zoom, and Esc/close -- none of which may depend on
// the host document. It lives in the plugin's own iframe (main UI) and is
// PhotoSwipe, the same viewer Logseq uses for images.
//
//   node scripts/e2e/lightbox.mjs --port 9345 --uuid <macro block uuid>
//
// Same preconditions as resize.mjs.
import { createRequire } from "node:module";
import { pluginFrame } from "./plugin-frame.mjs";
const require = createRequire("/Users/dzu/Projects/src/github.com/logseq/package.json");
const { chromium } = require("playwright");

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const port = arg("--port", "9345");
const uuid = arg("--uuid");
if (!uuid) { console.error("--uuid required"); process.exit(2); }

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page = browser.contexts()[0].pages().find(p => p.url().startsWith("lsp://logseq.com/index.html"));
// The instance window is small (980x700); a grip dragged past the window edge
// releases outside the document and no click fires. A user cannot do that
// either. Deterministic viewport for the gestures below.
await page.setViewportSize({ width: 1400, height: 900 });
await page.waitForTimeout(500);
// The installed plugin iframe is cross-origin and out-of-process; Playwright
// does not list it as a frame, so talk to its CDP target directly.
const pf = await pluginFrame(port, "logseq-bermaid");
const sel = `.bermaid-wrapper[data-block-uuid="${uuid}"]`;

const state = async () => {
  const inFrame = await pf.eval(`(() => {
    const pswp = document.querySelector(".pswp");
    const img = document.querySelector(".pswp__img");
    // what the user sees: the rendered image width, not PhotoSwipe internals
    const scale = img ? Math.round(img.getBoundingClientRect().width) : null;
    return { open: !!(pswp && pswp.classList.contains("pswp--open")), scale, hasImg: !!img };
  })()`);
  const frameVisible = await page.evaluate(() => { const f = [...document.querySelectorAll("iframe")].find(f => /logseq-bermaid/.test(f.src)); if (!f) return null; const r = f.getBoundingClientRect(); const cs = getComputedStyle(f); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 100 && r.height > 100; });
  return { ...inFrame, frameVisible };
};
const clickInFrame = async (cssSel) => {
  // screen coords = frame offset + element rect inside the frame
  const off = await page.evaluate(() => { const f = [...document.querySelectorAll("iframe")].find(f => /logseq-bermaid/.test(f.src)); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  const r = await pf.eval(`document.querySelector(${JSON.stringify(cssSel)})?.getBoundingClientRect().toJSON()`);
  if (!r) throw new Error(`no ${cssSel} in plugin frame`);
  await page.mouse.click(off.x + r.x + r.width / 2, off.y + r.y + r.height / 2);
  await page.waitForTimeout(700);
};
const openIt = async () => {
  const r = await page.evaluate(s => { const w = document.querySelector(s); w.scrollIntoView({ block: "center" }); return w.getBoundingClientRect().toJSON(); }, sel);
  await page.waitForTimeout(300);
  await page.mouse.click(r.left + r.width / 2, r.top + r.height / 2);
  // wait for PhotoSwipe to open AND the image to have loaded (width > 0)
  let st = await state();
  for (let i = 0; i < 20 && !(st.open && st.scale > 0); i++) { await page.waitForTimeout(250); st = await state(); }
  return st;
};

let pass = true;
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) pass = false; };
try {
  const opened = await openIt();
  check(opened.open && opened.frameVisible && opened.hasImg, `diagram click opens PhotoSwipe in the plugin frame (${JSON.stringify(opened)})`);
  const s0 = opened.scale;
  await page.waitForTimeout(600); // let focus settle in the plugin frame, as a human would
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);
  const afterEsc = await state();
  check(!afterEsc.open && !afterEsc.frameVisible, `Esc closes it and hides the plugin frame (${JSON.stringify(afterEsc)})`);
  const re = await openIt();
  check(re.open, "re-opens after Esc");
  await clickInFrame(".pswp__button--zoom");
  const zoomed = await state();
  check(zoomed.scale !== null && s0 !== null && zoomed.scale !== s0, `zoom button changes the rendered image width (${s0}px -> ${zoomed.scale}px)`);
  // plain mouse wheel (no modifier) over the image must zoom
  const beforeWheel = (await state()).scale;
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(600);
  const afterWheel = (await state()).scale;
  check(afterWheel !== null && afterWheel > beforeWheel, `mouse wheel zooms in (${beforeWheel}px -> ${afterWheel}px)`);
  // PhotoSwipe must have finished opening, or close/Esc are silently ignored.
  const opener = await pf.eval(`(() => { const p = window.__bermaidLightbox?.pswp; return p ? { isOpen: p.opener?.isOpen, isOpening: p.opener?.isOpening } : null })()`);
  check(opener && opener.isOpen === true && opener.isOpening === false, `opener finished opening before interaction (${JSON.stringify(opener)})`);
  await clickInFrame(".pswp__button--close");
  await page.waitForTimeout(500);
  const closed = await state();
  check(!closed.open && !closed.frameVisible, `close button closes it (${JSON.stringify(closed)})`);
} catch (e) { console.log("FAIL " + e); pass = false; }
await page.keyboard.press("Escape").catch(() => {});
pf.close();
await browser.close();
process.exit(pass ? 0 : 1);
