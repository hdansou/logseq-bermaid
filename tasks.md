# tasks.md

Active work and immediate backlog. Completed work moves to `CHANGELOG.md`.

---

## v0.3.0 — width in macro args (in progress)

**Why.** v0.2.x persisted resize width as a `bermaid-width` block property via `Editor.upsertBlockProperty`. Logseq DB defaults un-registered properties to `:db.cardinality/many`, so each resize appended a new value instead of replacing — blocks ended up with duplicate `bermaid-width: 248`, `bermaid-width: 352`, `bermaid-width: 589`. Property persistence also never worked in file-based graphs.

**What.** Move width into the macro itself: `{{renderer :bermaid, NNN}}`. Self-contained, graph-agnostic, no DB property cardinality issues, single source of truth.

### Tasks

- [ ] Parse width from macro args in `onMacroRendererSlotted` (defaults to `DEFAULT_DIAGRAM_WIDTH` when absent or invalid).
- [ ] On resize end, rewrite the parent block via `Editor.updateBlock` with the new width arg. Keep `widthCache` for snappy re-renders.
- [ ] Drop `bermaid-width` reads/writes from `getBlockWidth` / `setBlockWidth`; remove the `isDbGraph` dependency from the resize path.
- [ ] Verify `/bermaid` slash command still inserts a working macro (no width arg → default).
- [ ] CHANGELOG entry under `[0.3.0]`; bump `package.json` version.
- [ ] Commit, tag `v0.3.0`, push tag → publish workflow → verify release zip.

### Out of scope

- No upgrade migration for the orphaned `bermaid-width` property — plugin is hours old on the marketplace, zero installs. Existing properties are silently ignored; one resize re-embeds the width.

---

## Open backlog

- [ ] **Marketplace PR.** Open against `logseq/marketplace` after v0.3.0 ships. Manifest + body drafted, awaiting `supportsDBOnly: false` confirmation.
- [ ] **GitHub Actions Node 24 readiness.** `actions/checkout@v4` etc. flagged as Node-20-only and slated for forced removal Sept 2026. Bump to v5 next time the workflows are touched.
