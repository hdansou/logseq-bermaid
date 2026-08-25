import '@logseq/libs'
import type { BlockEntity, BlockUUIDTuple } from '@logseq/libs/dist/LSPlugin'
import {
  DEFAULT_DIAGRAM_WIDTH, THEME_CHOICES,
  MIN_DIAGRAM_WIDTH, MAX_DIAGRAM_WIDTH,
  ZOOM_MIN, ZOOM_MAX, ZOOM_STEP,
} from './constants'
import { svgCache, renderedSlots } from './cache'
import { renderDiagram, copyImageToClipboard, type RenderConfig } from './render'
import { BERMAID_STYLES } from './styles'
import { escapeHtml } from './utils/text'

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

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

/** Fullscreen lightbox visibility state */
let fullscreenVisible = false

/** Lightbox zoom/pan state */
let lightboxZoom = 1
let lightboxPanX = 0
let lightboxPanY = 0

/** Lightbox pan-drag state */
interface LightboxDragState {
  startX: number
  startY: number
  startPanX: number
  startPanY: number
}
let lightboxDragState: LightboxDragState | null = null

function resetLightboxState(): void {
  lightboxZoom = 1
  lightboxPanX = 0
  lightboxPanY = 0
  lightboxDragState = null
}

/** Resize state */
interface ResizeState {
  uuid: string
  startWidth: number
  startX: number
  side: 'left' | 'right'
  wrapperEl: HTMLElement
}
let resizeState: ResizeState | null = null

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

/** Normalize DB/file-graph block content field */
function getBlockText(block: BlockEntity | null | undefined): string {
  return block?.content || block?.title || ''
}

/** Inject plugin UI into a renderer slot */
function renderSlot(blockUuid: string, slot: string, template: string): void {
  logseq.provideUI({ key: `bermaid-${blockUuid}`, slot, template })
}

/** Parse the second positional macro arg as the diagram width. Clamped, falls back to default. */
function parseWidthArg(args: ReadonlyArray<string>): number {
  const raw = args[1]
  if (raw === undefined || raw === null || raw === '') return DEFAULT_DIAGRAM_WIDTH
  const n = Number(String(raw).trim())
  if (!Number.isFinite(n)) return DEFAULT_DIAGRAM_WIDTH
  return Math.max(MIN_DIAGRAM_WIDTH, Math.min(MAX_DIAGRAM_WIDTH, n))
}

/** Match a {{renderer :bermaid[, ...]}} macro call. Tolerant to whitespace around args. */
const BERMAID_MACRO_RE = /\{\{renderer\s+:bermaid(?:\s*,[^}]*)?\s*\}\}/

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
 * Show fullscreen lightbox for a rendered diagram
 */
function showFullscreen(uuid: string): void {
  const svg = svgCache.get(uuid)
  if (!svg) return

  resetLightboxState()
  fullscreenVisible = true

  logseq.provideUI({
    key: 'bermaid-fullscreen',
    path: 'body',
    template: `
      <div class="bermaid-lightbox">
        <div class="bermaid-lightbox-backdrop" data-on-click="bermaidCloseFullscreen"></div>
        <button class="bermaid-lightbox-close" data-on-click="bermaidCloseFullscreen" title="Close (Esc)">✕</button>
        <div class="bermaid-zoom-controls">
          <button class="bermaid-zoom-btn" data-on-click="bermaidZoomOut" title="Zoom out">−</button>
          <span class="bermaid-zoom-level">100%</span>
          <button class="bermaid-zoom-btn" data-on-click="bermaidZoomIn" title="Zoom in">+</button>
          <button class="bermaid-zoom-btn" data-on-click="bermaidZoomReset" title="Reset zoom &amp; pan">⊙</button>
        </div>
        <div class="bermaid-lightbox-content" data-on-click="bermaidLightboxContentClick">
          <div class="bermaid-lightbox-zoom-container" style="transform: scale(1) translate(0px, 0px); transform-origin: center center;">
            ${svg}
          </div>
        </div>
      </div>
    `,
  })
}

/**
 * Hide fullscreen lightbox
 */
function hideFullscreen(): void {
  if (!fullscreenVisible) return

  fullscreenVisible = false
  resetLightboxState()

  logseq.provideUI({
    key: 'bermaid-fullscreen',
    path: 'body',
    template: '',
  })
}

/**
 * Join child-block text into Mermaid syntax and strip a wrapping ```mermaid ... ``` fence.
 * Children may be BlockEntity or ['uuid', BlockUUID] tuples; only the entity form has text.
 */
function extractMermaidSyntax(children: Array<BlockEntity | BlockUUIDTuple>): string {
  const mermaidLines: string[] = []
  for (const child of children) {
    if (Array.isArray(child)) continue
    const text = getBlockText(child)
    if (text) mermaidLines.push(text)
  }

  let mermaidSyntax = mermaidLines.join('\n').trim()

  // Strip code fence if wrapped in ```mermaid ... ```
  // Line-based parser handles unusual whitespace better than a single regex.
  const lines = mermaidSyntax.split('\n')
  if (lines.length >= 2) {
    const first = lines[0].trimEnd()
    const last = lines[lines.length - 1].trimEnd()
    if (/^```(?:mermaid)?\s*$/.test(first) && /^```\s*$/.test(last)) {
      mermaidSyntax = lines.slice(1, -1).join('\n').trim()
    }
  }
  return mermaidSyntax
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

// Per-macro debounce timers for live re-rendering on source edits.
const rerenderTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleRerender(macroUuid: string): void {
  const existing = rerenderTimers.get(macroUuid)
  if (existing) clearTimeout(existing)
  rerenderTimers.set(
    macroUuid,
    setTimeout(() => {
      rerenderTimers.delete(macroUuid)
      void rerenderTrackedDiagram(macroUuid)
    }, 350),
  )
}

function buildDiagramHtml(blockUuid: string, svg: string, width: number): string {
  return `
    <div class="bermaid-wrapper" data-block-uuid="${blockUuid}" style="width: ${width}px;">
      <div class="bermaid-resize-handle bermaid-resize-left" data-side="left"></div>
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
      <div class="bermaid-resize-handle bermaid-resize-right" data-side="right"></div>
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

  // hostDoc is declared here (before provideModel) so that model handler
  // closures can reference it even though it is resolved later in main().
  let hostDoc: Document | null = null

  /** Directly mutate the lightbox DOM to update zoom/pan without re-rendering */
  function updateLightboxTransform(): void {
    if (!hostDoc || !fullscreenVisible) return
    const container = (hostDoc as Document).querySelector('.bermaid-lightbox-zoom-container') as HTMLElement | null
    if (container) {
      container.style.transform = `scale(${lightboxZoom}) translate(${lightboxPanX}px, ${lightboxPanY}px)`
    }
    const levelEl = (hostDoc as Document).querySelector('.bermaid-zoom-level') as HTMLElement | null
    if (levelEl) {
      levelEl.textContent = `${Math.round(lightboxZoom * 100)}%`
    }
  }

  // --- Event Handlers Model ---
  logseq.provideModel({
    async bermaidCopyImage(e: any) {
      const uuid = e.dataset?.blockUuid
      if (uuid) {
        await copyImageToClipboard(uuid, getSettings().transparentBg)
      }
    },
    async bermaidOpenFullscreen(e: any) {
      const uuid = e.dataset?.blockUuid
      if (!uuid) return
      showFullscreen(uuid)
    },
    async bermaidCloseFullscreen(e: any) {
      e?.stopPropagation?.()
      hideFullscreen()
    },
    async bermaidLightboxContentClick(e: any) {
      // Prevent clicks inside the content box from bubbling to the backdrop.
      e?.stopPropagation?.()
    },
    async bermaidZoomIn(e: any) {
      e?.stopPropagation?.()
      lightboxZoom = Math.min(lightboxZoom * ZOOM_STEP, ZOOM_MAX)
      updateLightboxTransform()
    },
    async bermaidZoomOut(e: any) {
      e?.stopPropagation?.()
      lightboxZoom = Math.max(lightboxZoom / ZOOM_STEP, ZOOM_MIN)
      updateLightboxTransform()
    },
    async bermaidZoomReset(e: any) {
      e?.stopPropagation?.()
      lightboxZoom = 1
      lightboxPanX = 0
      lightboxPanY = 0
      updateLightboxTransform()
    },
  })

  // --- Host Scope Event Listeners for Resize/Zoom/Pan ---
  let hostScope: unknown = null
  try {
    hostScope = await Promise.resolve(logseq.Experiments.ensureHostScope())
  } catch (err) {
    console.warn('Could not get host scope for resize:', err)
  }

  // hostDoc declared above (before provideModel); resolve it here.
  try {
    // ensureHostScope() returns the host window proxy; .document is most reliable
    type HostScopeShape = { document?: Document; window?: { document?: Document; top?: { document?: Document } } }
    const hs = hostScope as HostScopeShape | null
    hostDoc = hs?.document
      ?? hs?.window?.document
      ?? hs?.window?.top?.document
      ?? null
    if (!hostDoc) {
      console.warn('Bermaid: Could not resolve host document')
    }
  } catch (err) {
    console.warn('Bermaid: Could not access host document', err)
  }

  // Bind the resize/lightbox listeners to every distinct document involved.
  // The rendered diagram (and its resize handles) may live in a different
  // document than the host scope; binding to both ensures the mousedown that
  // carries `.bermaid-resize-handle` actually reaches our handler.
  const targetDocs: Document[] = []
  for (const d of [hostDoc, typeof document !== 'undefined' ? document : null]) {
    if (d && !targetDocs.includes(d)) targetDocs.push(d)
  }

  if (targetDocs.length) {
    // Primary document for querying lightbox elements; fall back across all docs.
    const queryEl = <T extends Element>(sel: string): T | null => {
      for (const d of targetDocs) {
        const el = d.querySelector(sel) as T | null
        if (el) return el
      }
      return null
    }

    const onMouseMove = (e: MouseEvent) => {
      // Handle resize dragging
      if (resizeState) {
        const delta = e.clientX - resizeState.startX
        const wrapper = resizeState.wrapperEl
        
        let newWidth: number
        if (resizeState.side === 'right') {
          newWidth = resizeState.startWidth + delta
        } else { // left
          newWidth = resizeState.startWidth - delta
        }
        
        // Clamp width
        const maxWidth = Math.max(wrapper.parentElement?.offsetWidth || MAX_DIAGRAM_WIDTH, MAX_DIAGRAM_WIDTH)
        newWidth = Math.max(MIN_DIAGRAM_WIDTH, Math.min(maxWidth, newWidth))
        
        wrapper.style.width = `${newWidth}px`
        
        // For left handle, adjust margin to keep right edge anchored
        if (resizeState.side === 'left') {
          const widthDiff = newWidth - resizeState.startWidth
          wrapper.style.marginLeft = `${-widthDiff}px`
        }
      }

      // Handle lightbox pan dragging
      if (lightboxDragState) {
        const dx = e.clientX - lightboxDragState.startX
        const dy = e.clientY - lightboxDragState.startY
        lightboxPanX = lightboxDragState.startPanX + dx / lightboxZoom
        lightboxPanY = lightboxDragState.startPanY + dy / lightboxZoom
        updateLightboxTransform()
      }
    }

    // Mouse down on resize handle or lightbox content for pan
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target?.classList?.contains('bermaid-resize-handle')) {
        e.preventDefault()
        const side = target.dataset.side as 'left' | 'right'
        const wrapper = target.closest('.bermaid-wrapper') as HTMLElement
        const uuid = wrapper?.dataset?.blockUuid
        
        if (uuid && wrapper) {
          resizeState = {
            uuid,
            startWidth: wrapper.offsetWidth,
            startX: e.clientX,
            side,
            wrapperEl: wrapper,
          }
          wrapper.classList.add('bermaid-resizing')
        }
      }
      
      // Start lightbox pan when dragging on content (but not on buttons)
      if (fullscreenVisible && target?.closest?.('.bermaid-lightbox-content') && !(target as HTMLElement).closest?.('button')) {
        lightboxDragState = {
          startX: e.clientX,
          startY: e.clientY,
          startPanX: lightboxPanX,
          startPanY: lightboxPanY,
        }
        const contentEl = queryEl<HTMLElement>('.bermaid-lightbox-content')
        if (contentEl) contentEl.classList.add('bermaid-panning')
        e.preventDefault()
      }

    }

    // Mouse up - finish resize or lightbox pan
    const onMouseUp = async () => {
      if (resizeState) {
        const wrapper = resizeState.wrapperEl
        wrapper.classList.remove('bermaid-resizing')
        wrapper.style.marginLeft = '' // Clear temporary margin

        const finalWidth = wrapper.offsetWidth
        const { uuid } = resizeState
        resizeState = null
        // Persist into the macro args. The updateBlock will re-fire
        // onMacroRendererSlotted, which re-renders at the new width.
        await writeWidthToMacro(uuid, finalWidth)
      }
      if (lightboxDragState) {
        lightboxDragState = null
        const contentEl = queryEl<HTMLElement>('.bermaid-lightbox-content')
        if (contentEl) contentEl.classList.remove('bermaid-panning')
      }
    }

    // Mouse wheel - zoom lightbox toward cursor
    const onWheel = (e: WheelEvent) => {
      if (!fullscreenVisible) return
      const target = e.target as HTMLElement
      if (!target?.closest?.('.bermaid-lightbox')) return
      e.preventDefault()
      const zoomFactor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, lightboxZoom * zoomFactor))
      // Zoom toward cursor position relative to content center
      const contentEl = queryEl<HTMLElement>('.bermaid-lightbox-content')
      if (contentEl) {
        const rect = contentEl.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        lightboxPanX = lightboxPanX + (e.clientX - cx) * (1 / newZoom - 1 / lightboxZoom)
        lightboxPanY = lightboxPanY + (e.clientY - cy) * (1 / newZoom - 1 / lightboxZoom)
      }
      lightboxZoom = newZoom
      updateLightboxTransform()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideFullscreen()
      }
    }

    for (const d of targetDocs) {
      d.addEventListener('mousemove', onMouseMove, true)
      d.addEventListener('mousedown', onMouseDown, true)
      d.addEventListener('mouseup', onMouseUp, true)
      d.addEventListener('wheel', onWheel, { capture: true, passive: false })
      d.addEventListener('keydown', onKeyDown, true)

      offHooks.push(() => {
        d.removeEventListener('mousemove', onMouseMove, true)
        d.removeEventListener('mousedown', onMouseDown, true)
        d.removeEventListener('mouseup', onMouseUp, true)
        d.removeEventListener('wheel', onWheel, true)
        d.removeEventListener('keydown', onKeyDown, true)
      })
    }
  }

  // --- Theme mode detection ---
  const offThemeModeChanged = logseq.App.onThemeModeChanged(({ mode }) => {
    currentThemeMode = mode
    // Re-render all tracked diagrams with the new theme
    const config = getRenderConfig()
    for (const [uuid, { slot, mermaidSyntax, width }] of renderedSlots) {
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
    hideFullscreen()
    resizeState = null
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
      // The renderer slot can fire before the child mermaid block has been
      // committed (e.g. immediately after /bermaid inserts the macro).
      // Retry for up to ~1.5 s so we don't flash the "no child" error.
      const block = await retry(
        async () => {
          const b = await logseq.Editor.getBlock(blockUuid, { includeChildren: true }).catch(() => null)
          return b?.children?.length ? b : null
        },
        { attempts: 6, delay: 250 },
      )
      const children: Array<BlockEntity | BlockUUIDTuple> = block?.children || []

      if (!block) {
        renderSlot(blockUuid, slot, `<div class="bermaid-error">Block not found — try reloading the page.</div>`)
        return
      }

      if (children.length === 0) {
        renderSlot(blockUuid, slot, `<div class="bermaid-error">No child block found — add a child block with Mermaid syntax (e.g. "graph TD; A-->B").</div>`)
        return
      }

      const mermaidSyntax = extractMermaidSyntax(children)
      if (!mermaidSyntax) {
        renderSlot(blockUuid, slot, `<div class="bermaid-error">Child block is empty — add Mermaid syntax (e.g. "graph TD; A-->B").</div>`)
        return
      }

      const width = parseWidthArg(payload.arguments)
      const svg = await renderDiagram(mermaidSyntax, getRenderConfig())
      svgCache.set(blockUuid, svg)
      renderedSlots.set(blockUuid, { slot, mermaidSyntax, width })

      renderSlot(blockUuid, slot, buildDiagramHtml(blockUuid, svg, width))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      renderSlot(blockUuid, slot, `<div class="bermaid-error">Invalid Mermaid syntax — check the child block.\n${escapeHtml(message)}</div>`)
    }
  })

  const insertBermaidTemplate = async (targetUuid?: string) => {
    try {
      await sleep(100)

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
      await sleep(100)

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

      // Wait for the parent block update to be committed to the DB before inserting a child.
      // In DB-based graphs, the entity may not be persisted immediately,
      // causing "entity id, got 0" errors.
      await sleep(300)

      // Re-fetch the parent block to ensure we have the latest persisted UUID
      const refreshed = await logseq.Editor.getBlock(parentBlock.uuid).catch(() => null)
      const insertUuid = refreshed?.uuid ?? parentBlock.uuid

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
