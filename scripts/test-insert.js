/**
 * Playwright-cli eval snippet — not a standalone Node script.
 *
 * Usage: paste into a playwright-cli session against http://localhost:3001
 * to smoke-test the bermaid slash-command insertion path:
 *   1. Navigate to any page in Logseq
 *   2. Evaluate this function via the playwright-cli skill
 *   3. Verify the {{renderer :bermaid}} macro + child block appear
 */
async (page) => {
  const result = await page.evaluate(async () => {
    const blocks = await logseq.Editor.getCurrentPageBlocksTree();
    if (!blocks || blocks.length === 0) return "no blocks";
    const firstBlock = blocks[0];
    await logseq.Editor.updateBlock(firstBlock.uuid, "{{renderer :bermaid}}");
    await logseq.Editor.insertBlock(
      firstBlock.uuid,
      "graph TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Action]\n    B -->|No| D[End]",
      { sibling: false }
    );
    return "done - inserted bermaid renderer";
  });
  return result;
}
