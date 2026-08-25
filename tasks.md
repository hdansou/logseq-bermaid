# tasks.md

Active work and immediate backlog. Completed work moves to `CHANGELOG.md`.

---

## Production-hardening pass — 2026-08-24

Ran after merging [#1](https://github.com/hdansou/logseq-bermaid/pull/1) and releasing v0.4.0.

**Applied.**

- **D — dependencies.** `npm audit` 6 → 0. `dompurify` override `^3.4.2` → `^3.4.14` (had gone stale as the advisory range grew; audit misreports it as "No fix available"), `vite` `^7.3.2` → `^7.3.6`, new build-time overrides for `esbuild` / `postcss` / `nanoid`. Build output byte-identical.
- **C — doc drift.** README width claim, CLAUDE.md data-flow / resize / caching / pitfalls sections, and this file. See below for what was actually wrong.
- **E — hygiene.** `.claude/` added to `.gitignore`.

**Deferred.**

- [ ] **B — decompose `src/index.ts`** (~740 lines holding lightbox, resize, macro renderer, and slash command). Extract `src/lightbox.ts` and `src/resize.ts`. Was blocked behind #1; now unblocked.
- [ ] **B — tighten 8 `any`/`unknown` casts** (7 in `src/index.ts`, 1 in `src/render.ts`).
- [ ] **B — no test framework at all.** A smoke test over `extractMermaidSyntax()` fence-stripping would be the highest-value first test: it is now shared by both the macro hook and the live re-render path, so a regression there breaks rendering twice over.

**Doc drift found — worth noting how much accumulated in one minor version.** CLAUDE.md documented `getBlockWidth()`, `setBlockWidth()`, `widthCache`, and an `isDbGraph` resize dependency. **None of these exist** — v0.3.0 removed them all when width moved into the macro arg. The caching table also listed `renderedSlots` as an unbounded `Map` when it is a `CappedMap` capped at 200. Lesson: when a release deletes a subsystem, grep the docs for its symbol names, not just its feature name.

---

## Open backlog

- [ ] **Marketplace PR.** Open against `logseq/marketplace`. Manifest + body drafted, awaiting `supportsDBOnly: false` confirmation. Now also needs the v0.4.0 entry.
- [ ] **GitHub Actions Node 24 readiness.** `actions/checkout@v4`, `setup-node@v4`, `upload-artifact@v4`, `softprops/action-gh-release@v2` are all being force-run on Node 24 and are slated for forced removal Sept 2026 — the v0.4.0 release run warned about this. Bump to v5 next time the workflows are touched.
- [ ] **Verify v0.4.0 interaction fixes against a real marketplace install.** Neither the shadow-mode fix nor #1's multi-document listener binding was tested in the iframe-sandboxed environment they target; sideload cannot distinguish them.
