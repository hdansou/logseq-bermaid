// E2E: a diagram is never drawn larger than its natural size.
//
//   node scripts/e2e/sizing.mjs --port 9345
//
// Preconditions: a Logseq instance with --remote-debugging-port=<port>, the
// plugin loaded from ~/.logseq/plugins/logseq-bermaid, and a page holding
// several {{renderer :bermaid}} blocks open, including at least one diagram
// narrower than its wrapper (a small state or class diagram).
//
// Asserts, for every rendered diagram on the page:
//   1. drawn width <= the SVG's width attribute (no upscaling),
//   2. drawn width <= the wrapper's width (still shrinks to fit),
//   3. the drawn aspect ratio matches the intrinsic one.
// Exit code 0 = pass, 1 = fail.
import { createRequire } from "node:module";
const require = createRequire("/Users/dzu/Projects/src/github.com/logseq/package.json");
const { chromium } = require("playwright");

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const port = arg("--port", "9345");

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page = browser.contexts()[0].pages().find(p => p.url().startsWith("lsp://logseq.com/index.html"));

const rows = await page.evaluate(() => [...document.querySelectorAll(".bermaid-wrapper")].map(w => {
  const svg = w.querySelector(".bermaid-container svg");
  const r = svg.getBoundingClientRect();
  return {
    uuid: w.dataset.blockUuid.slice(0, 8),
    kind: svg.getAttribute("class"),
    natural: [Number(svg.getAttribute("width")), Number(svg.getAttribute("height"))],
    drawn: [r.width, r.height],
    wrapper: w.getBoundingClientRect().width,
  };
}));

let failed = rows.length === 0;
if (failed) console.log("FAIL no diagrams on the page");
for (const { uuid, kind, natural: [nw, nh], drawn: [dw, dh], wrapper } of rows) {
  const checks = [
    [dw <= nw + 0.5, `drawn ${dw.toFixed(1)} <= natural ${nw}`],
    [dw <= wrapper + 0.5, `drawn ${dw.toFixed(1)} <= wrapper ${wrapper.toFixed(1)}`],
    [Math.abs(dw / dh - nw / nh) < 0.02, `aspect ${(dw / dh).toFixed(3)} ~ ${(nw / nh).toFixed(3)}`],
  ];
  for (const [ok, msg] of checks) {
    if (!ok) failed = true;
    console.log(`${ok ? "PASS" : "FAIL"} ${uuid} ${kind}: ${msg}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
