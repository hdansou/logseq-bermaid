# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [0.2.0] - 2026-03-01

### Added

- **Lightbox zoom & pan** — mouse wheel zooms toward the cursor (12.5% – 800%); click-drag pans the diagram.
- **Zoom controls bar** — fixed pill at the bottom of the lightbox with `−`, `+`, and `⊙` (reset) buttons and a live zoom-level label.
- **Lightbox close button (✕)** — circular button in the top-right corner of the lightbox; equivalent to pressing Esc or clicking the backdrop.

### Fixed

- `/bermaid` slash command no longer silently fails to write `{{renderer :bermaid}}` to the parent block; `exitEditingMode` is now called before `updateBlock` so the live editor does not suppress the write.
- Eliminated the "No child block found" error flash immediately after inserting via `/bermaid`; the macro renderer now retries the child-block lookup for up to 1.5 s before showing the error state.

### Changed

- Pinned `beautiful-mermaid` to `1.1.3` (was `latest`) for reproducible builds.
- Added `.github/workflows/ci.yml` CI gate running `npm ci`, `typecheck`, and `build` on push to `main` and all pull requests.
- Host document event listeners are now explicitly removed on plugin unload via named handler references in `beforeunload`.
- Non-retryable `updateBlock` failures in the slash command are now surfaced as a user-visible error toast instead of a silent `console.warn`.

## [0.1.0] - 2026-02-12

### Added

- Initial Bermaid release.
- `{{renderer :bermaid}}` macro renderer using `beautiful-mermaid`.
- `/bermaid` slash command with starter diagram template.
- Theme support (`auto` + manual theme selection).
- PNG copy support (button + context menu).
- Drag resize handles with DB graph width persistence.
