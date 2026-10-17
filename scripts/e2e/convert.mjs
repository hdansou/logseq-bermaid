// E2E: "Render as Bermaid diagram" turns an existing mermaid code block into a diagram.
//
//   node scripts/e2e/convert.mjs --port 9345 [--page "Convert test"] [--max-ms 1000]
//
// Preconditions: a Logseq instance with --remote-debugging-port=<port>, the
// plugin loaded from ~/.logseq/plugins/logseq-bermaid, on a THROWAWAY graph,
// and the instance window visible (the block context menu needs real rendering).
//
// As a user: right-click a code block's bullet, click the menu item. Asserts:
//   1. a {{renderer :bermaid}} block now sits where the code block was, with the
//      code block as its only child,
//   2. the code is unchanged, indentation included (kanban depends on it),
//   3. the diagram is drawn within --max-ms of the click,
//   4. a python code block is left alone,
//   5. running it again on the wrapped code block adds no second macro,
//   6. the natural path works: an empty block, Logseq's /code (no language set),
//      type the diagram, Escape, then the menu item.
// Exit code 0 = pass, 1 = fail.
import { createRequire } from "node:module";
const require = createRequire("/Users/dzu/Projects/src/github.com/logseq/package.json");
const { chromium } = require("playwright");

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const port = arg("--port", "9345");
const pageName = arg("--page", "Convert test");
const maxMs = Number(arg("--max-ms", "1000"));
const LABEL = "Render as Bermaid diagram";
const KANBAN = "kanban\ntodo[Todo]\n  id3[Write the release notes]@{ assigned: 'dzu' }\ndone[Done]\n  id4[Ship Pele]";

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page = browser.contexts()[0].pages().find(p => p.url().startsWith("lsp://logseq.com/index.html"));
await page.setViewportSize({ width: 1400, height: 900 });
const errors = [];
page.on("pageerror", e => errors.push(String(e).slice(0, 120)));

let pass = true;
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) pass = false; };

// Code blocks are made the way the editor makes them: an empty fence, then the code
// written into it (insert_block with a filled fence strips leading indentation).
const { mermaid, python } = await page.evaluate(async ({ name, KANBAN }) => {
  if (!(await logseq.api.get_page(name))) await logseq.api.create_page(name, {}, { redirect: false });
  const make = async (lang, code) => {
    const b = await logseq.api.append_block_in_page(name, "```" + lang + "\n\n```");
    await logseq.api.update_block(b.uuid, code);
    return b.uuid;
  };
  const out = { mermaid: await make("mermaid", KANBAN), python: await make("python", "print('hi')") };
  await logseq.api.push_state("page", { name: name.toLowerCase() });
  return out;
}, { name: pageName, KANBAN });
await page.waitForTimeout(2500);

const shape = (u) => page.evaluate(async (u) => {
  const b = await logseq.api.get_block(u);
  const parent = b.parent.id === b.page.id ? null : await logseq.api.get_block(b.parent.id, { includeChildren: true });
  return { title: b.title, parentTitle: parent?.title ?? null, parentUuid: parent?.uuid ?? null, siblings: parent?.children?.length ?? null };
}, u);

const runMenu = async (u) => {
  const bullet = `.ls-block[blockid="${u}"] > .block-main-container .bullet-container`;
  await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "center" }), bullet);
  await page.click(bullet, { button: "right" });
  const item = page.getByText(LABEL, { exact: true });
  await item.waitFor({ timeout: 5000 });
  const t0 = await page.evaluate(() => performance.now());
  await item.click();
  return t0;
};

try {
  // 1-3: convert the mermaid code block
  const t0 = await runMenu(mermaid);
  const drawnAt = await page.evaluate(async (u) => {
    const until = performance.now() + 5000;
    while (performance.now() < until) {
      const b = await logseq.api.get_block(u);
      const p = b.parent.id === b.page.id ? null : await logseq.api.get_block(b.parent.id);
      if (p && document.querySelector(`.bermaid-wrapper[data-block-uuid="${p.uuid}"] svg`)) return performance.now();
      await new Promise(r => setTimeout(r, 20));
    }
    return null;
  }, mermaid);
  const after = await shape(mermaid);
  check(/^\{\{renderer :bermaid\}\}$/.test(after.parentTitle ?? ""), `code block now under a bermaid macro (parent: ${JSON.stringify(after.parentTitle)})`);
  check(after.siblings === 1, `code block is the macro's only child (${after.siblings})`);
  check(after.title === KANBAN, "code unchanged, indentation included");
  check(drawnAt !== null && drawnAt - t0 <= maxMs, `diagram drawn <= ${maxMs} ms after the click (${drawnAt === null ? "never" : Math.round(drawnAt - t0) + " ms"})`);

  // 5: again on the wrapped block: no second macro
  await runMenu(mermaid);
  await page.waitForTimeout(1500);
  const again = await shape(mermaid);
  check(again.parentUuid === after.parentUuid, "running it again adds no second macro");

  // 6: the natural path, /code leaves the language unset
  const typed = await page.evaluate(async (name) => {
    const b = await logseq.api.append_block_in_page(name, "");
    await logseq.api.edit_block(b.uuid);
    return b.uuid;
  }, pageName);
  await page.waitForTimeout(600);
  await page.keyboard.type("/code", { delay: 40 });
  await page.getByText("Code block", { exact: true }).first().waitFor({ timeout: 5000 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  await page.keyboard.type("flowchart LR\n  Code --> Diagram", { delay: 20 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  const lang = await page.evaluate(async (u) => (await logseq.api.get_block(u))[":logseq.property.code/lang"] ?? null, typed);
  await runMenu(typed);
  await page.waitForTimeout(1500);
  const t6 = await shape(typed);
  check(/^\{\{renderer :bermaid\}\}$/.test(t6.parentTitle ?? ""), `/code block with language ${JSON.stringify(lang)} converts (parent: ${JSON.stringify(t6.parentTitle)})`);

  // 4: a python code block is left alone
  await runMenu(python);
  await page.waitForTimeout(1500);
  const py = await shape(python);
  check(py.parentTitle === null && py.title === "print('hi')", "python code block left alone");
} catch (e) {
  check(false, "ran to the end (" + String(e).split("\n")[0] + ")");
}
const own = errors.filter(e => /bermaid/i.test(e));
check(own.length === 0, `no plugin page errors (${own.join(" | ") || "none"})`);
await browser.close();
process.exit(pass ? 0 : 1);
