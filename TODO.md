# Bermaid — TODO

Open tasks ordered by priority. Completed work is recorded in [CHANGELOG.md](CHANGELOG.md).

---

## Functional

- [x] **Re-render on theme change** — existing diagrams on the page are now re-rendered when
      Logseq's light/dark mode switches at runtime via tracked `renderedSlots`.

- [x] **Bounded SVG cache** — `svgCache` and `widthCache` use `CappedMap` (200 / 500 entries)
      with oldest-entry eviction to avoid memory growth in long sessions.

- [x] **DOM-safe mermaid fence stripping** — replaced single regex with a line-based parser
      that handles unusual whitespace correctly.

---

## Quality

- [x] **Reduce per-mousemove DOM reads** — container elements are cached via a `MutationObserver`-
      invalidated reference instead of querying the DOM on every `mousemove`.

- [x] **Improve TypeScript config** — added `lib`, `resolveJsonModule`, and `isolatedModules`
      to `tsconfig.json` for stricter checking.

- [x] **Tighten Vite production config** — added `minify: 'terser'` and `sourcemap: false`
      in `vite.config.ts`.

- [x] **Enhance error messages** — error messages now include user-friendly guidance
      (e.g. "Invalid Mermaid syntax — check the child block").

---

## Marketplace

- [ ] **Add screenshot / GIF to README** — Logseq marketplace review requires at least one
      visual showing the plugin in action.

- [ ] **Submit marketplace PR** — see [docs/MARKETPLACE_SUBMISSION.md](docs/MARKETPLACE_SUBMISSION.md)
      for the full checklist.

---

## Security

- [x] **Document SDK vulnerability acceptance** — `npm audit` upstream issues in
      `@logseq/libs` transitive deps documented as accepted risk in CLAUDE.md.
