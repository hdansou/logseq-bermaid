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
