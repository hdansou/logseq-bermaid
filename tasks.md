# SDK Upgrade: `@logseq/libs` 0.2.12 → 0.3.2

Upgrade the plugin SDK to `@logseq/libs@^0.3.2` (from `^0.2.12`). The 0.3.x refactor (logseq PR #12395, commit `a95483655b`) is additive to the public API: every call site in `src/index.ts` keeps working unchanged. The value of the upgrade:

- **Security**: transitive `dompurify` 3.3.1 → 3.3.3 clears GHSA-v2wj-7wpq-c8vv (XSS, listed as "Accepted Risk" in `CLAUDE.md`). A newer dompurify advisory (`GHSA-39q2-94rc-95cp`) has since appeared with no upstream fix — documented in its place.
- **Perf**: Postmate now uses `MessageChannel` for host↔plugin messages.
- **New APIs** (additive, unused): `App.getCurrentRoute`, `Experiments.registerHostedRenderer`, `Experiments.registerSidebarRenderer`.

Workflow is TDD-shaped using **type-level assertions** as the failing test (no runtime test framework in this repo).

---

## Task 1: RED — add a type-level assertion that requires a 0.3.x API ✅ DONE

### What was done

- Added `src/__sdk_guard__.ts`:

  ```ts
  import '@logseq/libs'

  // Compile-time guard: references an API that only exists in @logseq/libs ≥ 0.3.1.
  // If this file fails typecheck, upgrade the SDK.
  export const _sdkGuard: typeof logseq.App.getCurrentRoute = logseq.App.getCurrentRoute
  ```

- Ran `npm run typecheck` against 0.2.12 — failed with `TS2339: Property 'getCurrentRoute' does not exist on type 'IAppProxy'`. RED state confirmed.

---

## Task 2: GREEN — bump SDK, install, confirm typecheck + build pass ✅ DONE

### What was done

- `package.json`: `"@logseq/libs": "^0.2.12"` → `"@logseq/libs": "^0.3.2"`.
- `npm install` — installed `@logseq/libs@0.3.2`. `package-lock.json` refreshed.
- `npm run typecheck` — passes.
- `npm run build` — passes; emits `dist/index.html` (0.33 kB) and `dist/assets/index-*.js` (1,713.63 kB / 509.43 kB gzip).
- No source changes required in `src/index.ts`, `src/styles.ts`, `src/constants.ts`, or `src/utils/*` — every SDK call retains an identical signature in 0.3.2.

---

## Task 3: Keep the SDK guard file as a permanent minimum-version assertion ✅ DONE

`src/__sdk_guard__.ts` is committed. It is **not** imported from `src/index.ts`, so Vite tree-shakes it out of the production bundle. `tsc --noEmit` still picks it up via the `src/` include glob in `tsconfig.json`, so any future accidental downgrade below 0.3.1 fails typecheck.

---

## Task 4: Re-run `npm audit` and refresh accepted-risk notes ✅ DONE

### Post-upgrade audit summary

Transitive runtime deps (ship in the bundle):

- **dompurify ≤3.3.3** — moderate — GHSA-39q2-94rc-95cp (`ADD_TAGS` bypasses `FORBID_TAGS`). **No upstream fix.** Replaces the previously documented GHSA-v2wj-7wpq-c8vv (cleared at 3.3.3).
- **lodash-es ≤4.17.23** — high — GHSA-r5fr-rjxr-66jc (`_.template` code injection), GHSA-f23m-r3pf-42rh (prototype pollution in `_.unset`/`_.omit`). Would require a patched `@logseq/libs` release.

Dev deps (build-time only, not in plugin bundle): `vite`, `rollup`, `picomatch` — resolvable with `npm audit fix` if they ever block a build. Noted but not actioned.

### Where documented

`CLAUDE.md` → "Known `npm audit` Vulnerabilities (Accepted Risk)" section now reflects the post-upgrade picture.

---

## Task 5: Smoke-test in Logseq web app ⏸ PENDING (manual, by user)

Requires Logseq running at `http://localhost:3001` (not up at time of upgrade). Run when convenient; no code blockers.

### Checklist (each must pass)

1. `npm run watch` and `npm run serve` running in parallel.
2. Reload plugin in Logseq dev plugins list (from `http://localhost:8080`).
3. `/bermaid` slash command: inserts `{{renderer :bermaid}}` macro + child block with starter template. Diagram renders.
4. Reload page: existing `{{renderer :bermaid}}` diagrams re-render.
5. Theme toggle (Logseq light ↔ dark): diagrams re-render via `onThemeModeChanged`.
6. Click diagram: lightbox opens.
7. Lightbox wheel-zoom + pan + buttons (−/+/⊙) + Esc/backdrop close all work.
8. Copy-as-PNG button: PNG lands in system clipboard (tests `Experiments.ensureHostScope` + clipboard API).
9. Drag left/right resize handle: width updates live, persists on mouse-up (`upsertBlockProperty`), survives page reload.
10. No unexpected console errors from `@logseq/libs`.

---

## Task 6: Update `CHANGELOG.md` ✅ DONE

New entries under `[Unreleased]`:

- Upgrade `@logseq/libs` 0.2.12 → 0.3.2 (MessageChannel messaging; clears the `dompurify` GHSA-v2wj-7wpq-c8vv advisory).
- New `src/__sdk_guard__.ts` compile-time assertion; tree-shaken from the bundle.

`version` in `package.json` is **not** bumped — the upgrade is not user-visible. A release bump will come with the next user-visible change.

---

## Task 7: Update `docs/REQUIREMENTS.md` ✅ DONE

Technical Architecture → SDK line now reads:

> **SDK**: `@logseq/libs` ≥ 0.3.2 — Logseq Plugin SDK. Minimum version is enforced at compile time by `src/__sdk_guard__.ts`, which references an API introduced in 0.3.x; `npm run typecheck` fails on any downgrade.

---

## Non-goals (explicitly out of scope)

- Adopting new 0.3.x APIs (`registerSidebarRenderer`, `getCurrentRoute`, etc.). Noted for future work.
- `version` / tag / release — this upgrade is not user-visible.
- Refactoring any existing call sites — every SDK API the plugin uses is signature-compatible.
