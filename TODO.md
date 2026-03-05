# Bermaid — TODO

Open tasks ordered by priority. Completed work is recorded in [CHANGELOG.md](CHANGELOG.md).

---

## Functional

- [ ] **Re-render on theme change** — existing diagrams on the page are not re-rendered when
      Logseq's light/dark mode switches at runtime; only newly opened pages pick up the new theme.

- [ ] **Bounded SVG cache** — `svgCache` and `widthCache` are unbounded `Map`s; add an LRU
      or size-capped eviction policy to avoid memory growth in long sessions.

- [ ] **DOM-safe mermaid fence stripping** — the current regex trim for triple-backtick mermaid
      fences is fragile with unusual whitespace; replace with a proper line-based parser.

---

## Quality

- [ ] **Reduce per-mousemove DOM reads** — the context menu repositioning path queries the DOM
      on every `mousemove`; throttle or cache the bounding-rect lookup.

- [ ] **Improve TypeScript config** — add `lib`, `resolveJsonModule`, and `isolatedModules`
      to `tsconfig.json` for stricter checking. (`include` already covers all project TS files.)

- [ ] **Tighten Vite production config** — add `minify: 'terser'` and `sourcemap: false`
      in `vite.config.ts`.

- [ ] **Enhance error messages** — replace bare text errors with user-friendly messages
      (e.g. "Invalid Mermaid syntax — check the child block").

---

## Marketplace

- [ ] **Add screenshot / GIF to README** — Logseq marketplace review requires at least one
      visual showing the plugin in action.

- [ ] **Submit marketplace PR** — see [docs/MARKETPLACE_SUBMISSION.md](docs/MARKETPLACE_SUBMISSION.md)
      for the full checklist.

---

## Security

- [ ] **Document SDK vulnerability acceptance** — `npm audit` reports upstream issues in
      `@logseq/libs` transitive deps that cannot be resolved without an SDK upgrade; document the
      accepted risk in CLAUDE.md.
