# Logseq Marketplace Submission

Use this checklist when publishing Bermaid to the official Logseq plugin marketplace.

## 1) Publish a GitHub release with plugin zip

1. Push a version tag:

   ```bash
   git tag v0.2.1
   git push origin v0.2.1
   ```

2. The workflow in `.github/workflows/publish.yml` builds the plugin and uploads:
   - A release asset zip: `logseq-bermaid.zip`
   - A workflow artifact zip

3. Verify the release has a zip asset attached (not only source-code zip).

## 2) Prepare marketplace manifest

In your fork of `logseq/marketplace`, create:

`packages/logseq-bermaid/manifest.json`

Suggested content:

```json
{
  "title": "Bermaid - Diagrams",
  "description": "Beautiful mermaid diagram renderer for Logseq using beautiful-mermaid",
  "author": "Danzu",
  "repo": "danzu/logseq-bermaid",
  "icon": "./icon.svg",
  "effect": false,
  "theme": false,
  "web": true,
  "supportsDB": true,
  "supportsDBOnly": false
}
```

Adjust `author` and `repo` if your canonical GitHub owner/repo differs.

## 3) Open marketplace PR

1. Fork `https://github.com/logseq/marketplace`
2. Add `packages/logseq-bermaid/manifest.json`
3. Open PR with:
   - Plugin repo URL
   - Latest release URL
   - Notes that release asset zip is attached

## 4) Pre-submit checks

- README clearly explains install and usage
- At least one visual image/gif in README showing the plugin in action (**pending**)
- `package.json` has valid `logseq` fields (`id`, `title`, `main`, `icon`)
- Latest release loads correctly via **Load unpacked plugin** and release zip install
