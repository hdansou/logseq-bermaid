import '@logseq/libs'
import type { BlockEntity, BlockUUIDTuple } from '@logseq/libs/dist/LSPlugin'
import { THEME_CHOICES, MIN_DIAGRAM_WIDTH, MAX_DIAGRAM_WIDTH } from './constants'
import { parseWidthArg, extractMermaidSyntax, getBlockText, BERMAID_MACRO_RE } from './macro'
import { svgCache, renderedSlots } from './cache'
import { renderDiagram, copyImageToClipboard, type RenderConfig } from './render'
import { BERMAID_STYLES } from './styles'
import { openLightbox, closeLightbox } from './lightbox'
import { escapeHtml } from './utils/text'
import { sleep, delay } from './utils/clock'

/**
 * What the plugin bridge hands a `data-on-*` handler. Verified empirically
 * against a running install (see CLAUDE.md "Plugin Bridge Contract"): `value`
 * is always a string, `rect` is present only when the element carries
 * `data-rect`, and there is no key identity on keyboard events.
 */
interface BridgeEvent {
  type: string
  value?: string
  id?: string
  className?: string
  dataset?: Record<string, string | undefined>
  rect?: { width: number; height: number; x: number; y: number }
}

/** Retry an async function up to `attempts` times with `delay` ms between tries. */
async function retry<T>(
  fn: () => Promise<T | null | undefined>,
  opts?: { attempts?: number; delay?: number; retryIf?: (err: unknown) => boolean }
): Promise<T | null> {
  const { attempts = 5, delay = 300, retryIf } = opts ?? {}
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await fn()
      if (result !== null && result !== undefined) return result
    } catch (err) {
      lastErr = err
      if (retryIf && !retryIf(err)) throw err
    }
    if (i < attempts - 1) await sleep(delay)
  }
  if (lastErr) throw lastErr
  return null
}

function isRetryableDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('[deferred timeout]') || msg.includes('entity id, got 0')
}

let currentThemeMode: string = 'dark'

function getSettings() {
  return {
    theme: (logseq.settings?.theme as string) || 'auto',
    transparentBg: logseq.settings?.transparentBg !== false,
  }
}

function getRenderConfig(): RenderConfig {
  const { theme, transparentBg } = getSettings()
  return { themeMode: currentThemeMode, theme, transparentBg }
}

/** Inject plugin UI into a renderer slot */
function renderSlot(blockUuid: string, slot: string, template: string): void {
  logseq.provideUI({ key: `bermaid-${blockUuid}`, slot, template })
}

/** Persist width by rewriting the parent block's macro line. */
async function writeWidthToMacro(uuid: string, width: number): Promise<void> {
  try {
    const block = await logseq.Editor.getBlock(uuid)
    if (!block) return
    const oldContent = getBlockText(block)
    const newContent = oldContent.replace(BERMAID_MACRO_RE, `{{renderer :bermaid, ${width}}}`)
    if (newContent === oldContent) return
    // updateBlock is silently ignored while the editor holds the block; releasing first
    // is defensive — on resize-end the user is interacting with the rendered diagram,
    // not the editor, but better safe than to drop the write.
    await logseq.Editor.exitEditingMode(true).catch(() => null)
    await logseq.Editor.updateBlock(uuid, newContent)
  } catch (err) {
    console.warn('Bermaid: failed to persist width to macro', err)
  }
}

/**
 * Re-render an already-tracked diagram from its current child-block source.
 * Used by the block-change subscription so edits appear live without a reload.
 * Silently no-ops if the macro is no longer tracked or the source is empty
 * (we keep the last good render rather than flashing an error mid-edit).
 */
async function rerenderTrackedDiagram(macroUuid: string): Promise<void> {
  const tracked = renderedSlots.get(macroUuid)
  if (!tracked) return
  try {
    const block = await logseq.Editor.getBlock(macroUuid, { includeChildren: true }).catch(() => null)
    const children: Array<BlockEntity | BlockUUIDTuple> = block?.children || []
    const mermaidSyntax = extractMermaidSyntax(children)
    if (!mermaidSyntax || mermaidSyntax === tracked.mermaidSyntax) return
    const svg = await renderDiagram(mermaidSyntax, getRenderConfig())
    svgCache.set(macroUuid, svg)
    renderedSlots.set(macroUuid, { slot: tracked.slot, mermaidSyntax, width: tracked.width })
    renderSlot(macroUuid, tracked.slot, buildDiagramHtml(macroUuid, svg, tracked.width))
  } catch (err) {
    console.warn('Bermaid: live re-render failed', macroUuid, err)
  }
}

// Per-macro debounce for live re-rendering on source edits (cancel functions).
const rerenderTimers = new Map<string, () => void>()

function scheduleRerender(macroUuid: string): void {
  rerenderTimers.get(macroUuid)?.()
  rerenderTimers.set(
    macroUuid,
    delay(350, () => {
      rerenderTimers.delete(macroUuid)
      void rerenderTrackedDiagram(macroUuid)
    }),
  )
}

function buildDiagramHtml(blockUuid: string, svg: string, width: number): string {
  // Resize is a native CSS grip on the wrapper (resize: both, see styles). The
  // browser performs the drag itself, so it needs no pointer listeners -- the
  // only path that works for installed (cross-origin) plugins, where the host
  // document is unreachable and the bridge forwards no mouse events.
  //
  // Releasing the grip ends with a `click` on the wrapper. `click` IS forwarded
  // by the bridge, and `data-rect` makes it carry a live getBoundingClientRect,
  // which already holds the new width. bermaidWrapperClick compares that to the
  // rendered width and commits the difference into the macro arg.
  return `
    <div class="bermaid-wrapper" data-block-uuid="${blockUuid}" style="width: ${width}px;"
         data-rect="true"
         data-on-click="bermaidWrapperClick">
      <div class="bermaid-container"
           data-on-click="bermaidOpenFullscreen"
           data-block-uuid="${blockUuid}">
        ${svg}
      </div>
      <button class="bermaid-copy-btn"
              data-on-click="bermaidCopyImage"
              data-block-uuid="${blockUuid}"
              title="Copy as PNG">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
    </div>
  `
}

async function main() {
  console.log('Bermaid plugin loaded!')
  const offHooks: Array<() => void> = []

  // --- Settings ---
  logseq.useSettingsSchema([
    {
      key: 'theme',
      type: 'enum',
      enumChoices: [...THEME_CHOICES],
      enumPicker: 'select',
      default: 'auto',
      title: 'Theme',
      description: 'Beautiful-mermaid theme. "auto" matches Logseq light/dark mode.',
    },
    {
      key: 'transparentBg',
      type: 'boolean',
      default: true,
      title: 'Transparent Background',
      description: 'Render diagrams with transparent background.',
    },
  ])

  // --- CSS ---
  logseq.provideStyle(BERMAID_STYLES)

  // --- Event Handlers Model ---
  logseq.provideModel({
    async bermaidCopyImage(e: BridgeEvent) {
      const uuid = e.dataset?.blockUuid
      if (uuid) {
        await copyImageToClipboard(uuid, getSettings().transparentBg)
      }
    },
    async bermaidOpenFullscreen(e: BridgeEvent) {
      const uuid = e.dataset?.blockUuid
      const svg = uuid ? svgCache.get(uuid) : undefined
      if (svg) openLightbox(svg)
    },
    async bermaidWrapperClick(e: BridgeEvent) {
      const uuid = e.dataset?.blockUuid
      const tracked = uuid ? renderedSlots.get(uuid) : undefined
      const svg = uuid ? svgCache.get(uuid) : undefined
      if (!uuid || !tracked || !svg) return
      // rect is only attached because the wrapper carries data-rect.
      const measured = Number(e.rect?.width)
      const width = Number.isFinite(measured) && measured > 0
        ? Math.max(MIN_DIAGRAM_WIDTH, Math.min(MAX_DIAGRAM_WIDTH, Math.round(measured)))
        : tracked.width
      // Always re-render: the native grip may have dragged the height (resize:
      // both) even when the width ended up unchanged, and only a fresh
      // template restores the aspect-ratio height.
      renderedSlots.set(uuid, { ...tracked, width })
      renderSlot(uuid, tracked.slot, buildDiagramHtml(uuid, svg, width))
      if (width === tracked.width) return
      // Persist into the macro arg. Also re-fires the renderer, which is
      // harmless -- it lands on the same width we just rendered.
      await writeWidthToMacro(uuid, width)
    },
  })

  // --- Theme mode detection ---
  const offThemeModeChanged = logseq.App.onThemeModeChanged(({ mode }) => {
    currentThemeMode = mode
    // Re-render all tracked diagrams with the new theme
    const config = getRenderConfig()
    for (const [uuid, { slot, mermaidSyntax, width }] of renderedSlots) {
      if (!mermaidSyntax) continue // still showing the "type Mermaid" hint
      renderDiagram(mermaidSyntax, config).then((svg) => {
        svgCache.set(uuid, svg)
        renderSlot(uuid, slot, buildDiagramHtml(uuid, svg, width))
      }).catch((err) => {
        console.warn('Bermaid: failed to re-render on theme change', uuid, err)
      })
    }
  })
  if (typeof offThemeModeChanged === 'function') {
    offHooks.push(offThemeModeChanged)
  }

  // --- Live re-render on source edits ---
  // Without this, editing a diagram's child block does nothing until the
  // macro re-fires (page reload). Watch block changes and re-render the
  // affected tracked diagram (debounced per macro so typing stays smooth).
  const offDbChanged = logseq.DB.onChanged(({ blocks }) => {
    if (!renderedSlots.size || !Array.isArray(blocks) || blocks.length === 0) return
    for (const block of blocks) {
      const uuid = block?.uuid
      if (uuid && renderedSlots.has(uuid)) {
        // The macro block itself changed.
        scheduleRerender(uuid)
        continue
      }
      // Otherwise the edited block may be a source child of a tracked macro.
      const parentId = (block?.parent as { id?: number } | undefined)?.id
      if (parentId === undefined) continue
      void logseq.Editor.getBlock(parentId)
        .then((parent) => {
          const parentUuid = parent?.uuid
          if (parentUuid && renderedSlots.has(parentUuid)) scheduleRerender(parentUuid)
        })
        .catch(() => null)
    }
  })
  if (typeof offDbChanged === 'function') {
    offHooks.push(offDbChanged)
  }

  logseq.beforeunload(async () => {
    closeLightbox()
    // Pending debounce timers outlive the hooks below; without this they fire
    // against a torn-down plugin and call provideUI on a dead slot.
    for (const cancel of rerenderTimers.values()) {
      cancel()
    }
    rerenderTimers.clear()
    for (const off of offHooks) {
      off()
    }
    offHooks.length = 0
  })

  // Try to get initial theme mode
  try {
    const configs = await logseq.App.getUserConfigs()
    if (configs?.preferredThemeMode) {
      currentThemeMode = configs.preferredThemeMode
    }
  } catch {
    // default to dark
  }

  // --- Macro Renderer ---
  logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
    const [type] = payload.arguments
    if (type !== ':bermaid') return

    const blockUuid = payload.uuid

    renderSlot(blockUuid, slot, `<div class="bermaid-loading">Rendering mermaid diagram...</div>`)

    try {
      const block = await retry(
        async () => logseq.Editor.getBlock(blockUuid, { includeChildren: true }).catch(() => null),
        { attempts: 6, delay: 250 },
      )
      if (!block) {
        renderSlot(blockUuid, slot, `<div class="bermaid-error">Block not found — try reloading the page.</div>`)
        return
      }

      const width = parseWidthArg(payload.arguments)
      const children: Array<BlockEntity | BlockUUIDTuple> = block.children || []
      const mermaidSyntax = extractMermaidSyntax(children)
      // Track before rendering, so a diagram that is still empty or not yet valid
      // (e.g. right after /bermaid, before its child exists) picks up the user's
      // edits through DB.onChanged instead of waiting for a page reload.
      renderedSlots.set(blockUuid, { slot, mermaidSyntax, width })

      if (!mermaidSyntax) {
        const hint = children.length
          ? 'Type Mermaid in the code block below.'
          : 'Add a child code block with Mermaid (e.g. "graph TD; A-->B").'
        renderSlot(blockUuid, slot, `<div class="bermaid-hint">${hint}</div>`)
        return
      }

      const svg = await renderDiagram(mermaidSyntax, getRenderConfig())
      svgCache.set(blockUuid, svg)
      renderSlot(blockUuid, slot, buildDiagramHtml(blockUuid, svg, width))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      renderSlot(blockUuid, slot, `<div class="bermaid-error">Invalid Mermaid syntax — check the child block.\n${escapeHtml(message)}</div>`)
    }
  })

  const insertBermaidTemplate = async (targetUuid?: string) => {
    try {
      // No fixed waits: SDK round-trips take 3-45 ms, and any setTimeout here
      // costs a full second (the hidden iframe's timers run at 1 Hz).
      let parentBlock: BlockEntity | null = null
      if (targetUuid) {
        parentBlock = await retry(
          async () => {
            const b = await logseq.Editor.getBlock(targetUuid).catch(() => null)
            return b?.uuid ? b : null
          },
          { attempts: 5, delay: 100 },
        )
      }
      if (!parentBlock?.uuid) {
        parentBlock = await retry(
          async () => {
            const b = await logseq.Editor.getCurrentBlock().catch(() => null)
            // getCurrentBlock can return PageEntity; we need a block (uuid present).
            return b && 'uuid' in b ? (b as BlockEntity) : null
          },
          { attempts: 5, delay: 100 },
        )
      }

      if (!parentBlock?.uuid) {
        throw new Error('No active block to insert /bermaid template')
      }

      // Exit editing mode so the block is no longer held by the editor.
      // updateBlock on a block that is actively being edited is silently
      // ignored (the live editor state takes precedence).
      await logseq.Editor.exitEditingMode(true).catch(() => null)

      try {
        await retry(
          async () => {
            await logseq.Editor.updateBlock(parentBlock.uuid, '{{renderer :bermaid}}')
            return true
          },
          { retryIf: isRetryableDbError },
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('Bermaid: Failed to update renderer block after retries', err)
        logseq.UI.showMsg(`❌ Failed to add renderer to block: ${msg}`, 'error')
        return
      }

      const childTemplate = '```mermaid\n\n```'

      // "entity id, got 0" (parent not committed yet) is retried by isRetryableDbError;
      // it did not occur in any prototype run without the old fixed 300 ms wait.
      const insertUuid = parentBlock.uuid

      const childBlock = await retry(
        async () => {
          const b = await logseq.Editor.insertBlock(insertUuid, childTemplate, { sibling: false })
          return b?.uuid ? b : null
        },
        { retryIf: isRetryableDbError },
      ).catch((err) => {
        console.warn('Bermaid: Failed to insert child mermaid block after retries', err)
        return null
      })

      if (!childBlock) return

      // Avoid DB schema-specific child metadata writes here; they can fail on
      // some graphs and are not required for Bermaid rendering.
    } catch (err) {
      console.error('Bermaid: Failed to insert template', err)
      logseq.UI.showMsg('❌ Failed to insert /bermaid template', 'error')
    }
  }

  // --- Slash Command ---
  logseq.Editor.registerSlashCommand('bermaid', async (event) => {
    const targetUuid = event?.uuid ?? (event as { blockUuid?: string } | undefined)?.blockUuid
    setTimeout(() => {
      void insertBermaidTemplate(targetUuid)
    }, 0)
  })

  console.log('Bermaid plugin ready!')
}

logseq.ready(main).catch(console.error)
