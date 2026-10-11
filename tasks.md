# tasks.md

Active work and immediate backlog. Completed work moves to `CHANGELOG.md`.

---

## Production-hardening pass — 2026-10-11

Ran on `feat/cross-origin-resize` before cutting v0.5.0. Baseline was green (typecheck, build, `npm audit` 0, clean tree).

**Applied.**

- **A — DRY.** One `svgSize()` in `src/utils/svg.ts` (width/height → viewBox → 800×600) now serves both the PNG export and the lightbox. Stale `resize: horizontal` comment fixed.
- **C — docs.** `docs/REQUIREMENTS.md` FR-7/8/9 and the architecture section rewritten for the native grip and the in-frame PhotoSwipe lightbox. CHANGELOG 0.5.0 gained a Security section (SDK 0.3.4, dompurify/source-map-js overrides, escaping verified against hostile labels).
- **E — hygiene.** `ci.yml` on Node 24 like the release workflow and `engines`. GitHub Actions bumped to current majors (checkout/setup-node/upload-artifact v7, gh-release v3).
- **B — types.** The three `e: any` bridge handlers typed with `BridgeEvent`, matching the payload shape documented in CLAUDE.md.

**Deferred (need an explicit yes).**

- [ ] Delete `icon-alt.svg` (unreferenced) and `scripts/test-insert.js` (superseded by `scripts/e2e/`), with their CLAUDE.md rows.
- [ ] Local cleanup: `git worktree prune` (stale `pr-1` worktree in a scratchpad), delete branches `pr-1` and `chore/prod-readiness-top3`, delete `../logseq-bermaid-pr1`.
- [ ] **No unit test framework.** `extractMermaidSyntax()`, `parseWidthArg()`, `svgSize()` and `CappedMap` are pure and untested; vitest 3 fits Vite 7. CI gates only typecheck + build; the e2e scripts under `scripts/e2e/` need a live Logseq and stay manual.
- [ ] Optional `packageManager` field for Corepack.

**Resize + lightbox outcome (closes the 08-31 investigation).** The slider could not be grabbed cross-origin at all. What shipped: a native CSS `resize: both` grip committed through a `data-rect` click, and the lightbox moved into the plugin's own iframe as PhotoSwipe. Both verified red→green from `~/.logseq/plugins` with `scripts/e2e/resize.mjs` and `scripts/e2e/lightbox.mjs`. Details and the three PhotoSwipe-in-an-iframe traps are in CLAUDE.md.

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
- [x] **GitHub Actions Node 24 readiness.** Done 2026-10-11: actions on current majors, workflows on Node 24.
- [x] **Verify interaction fixes against a real marketplace install.** Done 2026-10-11 via the cross-origin test loop; v0.5.0 is the first release whose resize and lightbox were verified from `~/.logseq/plugins`.
