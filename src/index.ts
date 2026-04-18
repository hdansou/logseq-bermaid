import '@logseq/libs'
import { renderMermaid, THEMES } from 'beautiful-mermaid'
import type { RenderOptions } from 'beautiful-mermaid'
import {
  AUTO_THEME, DEFAULT_DIAGRAM_WIDTH, THEME_CHOICES,
  MIN_DIAGRAM_WIDTH, MAX_DIAGRAM_WIDTH,
  ZOOM_MIN, ZOOM_MAX, ZOOM_STEP,
  SVG_CACHE_CAP, WIDTH_CACHE_CAP, RENDERED_SLOTS_CAP,
} from './constants'
import { BERMAID_STYLES } from './styles'
import { svgToPngBlob } from './utils/svg'
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

/** Size-capped Map that evicts the least-recently-inserted entry when full. */
class CappedMap<K, V> extends Map<K, V> {
  constructor(private maxSize: number) { super() }
  set(key: K, value: V): this {
    if (this.has(key)) this.delete(key)
    super.set(key, value)
    if (this.size > this.maxSize) {
      const oldest = this.keys().next().value!
      this.delete(oldest)
    }
    return this
  }
}

let currentThemeMode: string = 'dark'

/** Rendered SVG strings keyed by block UUID, for copy-to-clipboard */
const svgCache = new CappedMap<string, string>(SVG_CACHE_CAP)

/** In-memory width cache to avoid redundant async lookups */
const widthCache = new CappedMap<string, number>(WIDTH_CACHE_CAP)

/** Tracks rendered diagram slots for re-rendering on theme change */
interface RenderedSlot {
  slot: string
  mermaidSyntax: string
}
const renderedSlots = new CappedMap<string, RenderedSlot>(RENDERED_SLOTS_CAP)

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

function buildRenderOptions(): RenderOptions {
  const { theme, transparentBg } = getSettings()
  const resolvedTheme = theme === 'auto'
    ? AUTO_THEME[currentThemeMode] || 'tokyo-night'
    : theme
  return {
    transparent: transparentBg,
    ...(THEMES?.[resolvedTheme] ?? {}),
  }
}

/** Normalize DB/file-graph block content field */
function getBlockText(block: any): string {
  return block?.content || block?.title || ''
}

/** Return true when running inside a DB-based graph */
async function isDbGraph(): Promise<boolean> {
  return (logseq.App as any).checkCurrentIsDbGraph().catch(() => false)
}

/** Inject plugin UI into a renderer slot */
function renderSlot(blockUuid: string, slot: string, template: string): void {
  logseq.provideUI({ key: `bermaid-${blockUuid}`, slot, template })
}

/**
 * Trim the empty top whitespace from a beautiful-mermaid SVG by adjusting
 * the viewBox and height so the diagram content starts at the top.
 */
function trimSvgTopWhitespace(svg: string): string {
  // Find all numeric y-attribute values to determine where content actually starts
  const yValues = [...svg.matchAll(/\sy="([\d.]+)"/g)].map(m => parseFloat(m[1]))
  if (yValues.length === 0) return svg

  const minY = Math.min(...yValues)
  if (minY <= 0) return svg

  // Parse existing viewBox: "0 0 width height"
  const vbMatch = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  if (!vbMatch) return svg

  const svgWidth = parseFloat(vbMatch[1])
  const svgHeight = parseFloat(vbMatch[2])

  // Keep a small buffer at the top
  const BUFFER = 5
  const trimAmount = Math.max(0, minY - BUFFER)
  const newHeight = svgHeight - trimAmount

  return svg
    .replace(`viewBox="0 0 ${vbMatch[1]} ${vbMatch[2]}"`, `viewBox="0 ${trimAmount} ${svgWidth} ${newHeight}"`)
    // Replace height only within the root <svg> opening tag; a plain string replace
    // would match the same value on child elements (e.g. <rect height="600">) first.
    .replace(/(<svg\b[\s\S]*?)\bheight="[\d.]+"/, `$1height="${newHeight}"`)
}

async function renderDiagram(mermaidSyntax: string): Promise<string> {
  const opts = buildRenderOptions()
  const svg = await renderMermaid(mermaidSyntax, opts)
  return trimSvgTopWhitespace(svg)
}

/**
 * Copy SVG as PNG to clipboard
 */
async function copyImageToClipboard(uuid: string): Promise<void> {
  try {
    const svg = svgCache.get(uuid)
    if (!svg) {
      throw new Error('SVG not found in cache')
    }

    const { transparentBg } = getSettings()
    const blob = await svgToPngBlob(svg, transparentBg)
    
    const clipboardItem = new ClipboardItem({ 'image/png': blob })
    try {
      await navigator.clipboard.write([clipboardItem])
    } catch {
      let hostScope: any = null
      try { hostScope = await logseq.Experiments.ensureHostScope() } catch { /* ignore */ }
      const clipboard = hostScope?.navigator?.clipboard
      if (!clipboard) throw new Error('Clipboard API not available')
      await clipboard.write([clipboardItem])
    }
    
    logseq.UI.showMsg('✅ Diagram copied as PNG', 'success')
  } catch (err: any) {
    console.error('Failed to copy image:', err)
    logseq.UI.showMsg(`❌ Failed to copy: ${err.message}`, 'error')
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
 * Get persisted width for a block
 */
async function getBlockWidth(uuid: string): Promise<number> {
  // Check cache first
  if (widthCache.has(uuid)) {
    return widthCache.get(uuid)!
  }
  
  try {
    if (await isDbGraph()) {
      const block = await logseq.Editor.getBlock(uuid)
      const raw = (block as any)?.properties?.['bermaid-width']
      const width = typeof raw === 'number' ? raw : Number(raw)
      if (width && Number.isFinite(width)) {
        widthCache.set(uuid, width)
        return width
      }
    }
  } catch (err) {
    console.warn('Failed to get block width:', err)
  }
  
  return DEFAULT_DIAGRAM_WIDTH
}

/**
 * Persist width for a block
 */
async function setBlockWidth(uuid: string, width: number): Promise<void> {
  widthCache.set(uuid, width)
  
  try {
    if (await isDbGraph()) {
      await logseq.Editor.upsertBlockProperty(uuid, 'bermaid-width', width)
    }
  } catch (err) {
    console.warn('Failed to persist block width:', err)
  }
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
        await copyImageToClipboard(uuid)
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
  let hostScope: any = null
  try {
    hostScope = await Promise.resolve(logseq.Experiments.ensureHostScope())
  } catch (err) {
    console.warn('Could not get host scope for resize:', err)
  }

  // hostDoc declared above (before provideModel); resolve it here.
  try {
    // ensureHostScope() returns the host window proxy; .document is most reliable
    hostDoc = (hostScope as any)?.document
      ?? (hostScope as any)?.window?.document
      ?? (hostScope as any)?.window?.top?.document
      ?? null
    if (!hostDoc) {
      console.warn('Bermaid: Could not resolve host document')
    }
  } catch (err) {
    console.warn('Bermaid: Could not access host document', err)
  }

  if (hostDoc) {
    const doc = hostDoc

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
        const contentEl = doc.querySelector('.bermaid-lightbox-content') as HTMLElement | null
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
        await setBlockWidth(resizeState.uuid, finalWidth)
        resizeState = null
      }
      if (lightboxDragState) {
        lightboxDragState = null
        const contentEl = doc.querySelector('.bermaid-lightbox-content') as HTMLElement | null
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
      const contentEl = doc.querySelector('.bermaid-lightbox-content') as HTMLElement | null
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

    doc.addEventListener('mousemove', onMouseMove, true)
    doc.addEventListener('mousedown', onMouseDown, true)
    doc.addEventListener('mouseup', onMouseUp, true)
    doc.addEventListener('wheel', onWheel, { capture: true, passive: false })
    doc.addEventListener('keydown', onKeyDown, true)

    offHooks.push(() => {
      doc.removeEventListener('mousemove', onMouseMove, true)
      doc.removeEventListener('mousedown', onMouseDown, true)
      doc.removeEventListener('mouseup', onMouseUp, true)
      doc.removeEventListener('wheel', onWheel, true)
      doc.removeEventListener('keydown', onKeyDown, true)
    })
  }

  // --- Theme mode detection ---
  const offThemeModeChanged = logseq.App.onThemeModeChanged(({ mode }) => {
    currentThemeMode = mode
    // Re-render all tracked diagrams with the new theme
    for (const [uuid, { slot, mermaidSyntax }] of renderedSlots) {
      renderDiagram(mermaidSyntax).then(async (svg) => {
        svgCache.set(uuid, svg)
        const width = await getBlockWidth(uuid)
        renderSlot(uuid, slot, buildDiagramHtml(uuid, svg, width))
      }).catch((err) => {
        console.warn('Bermaid: failed to re-render on theme change', uuid, err)
      })
    }
  })
  if (typeof offThemeModeChanged === 'function') {
    offHooks.push(offThemeModeChanged)
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
      const children: any[] = block?.children || []

      if (!block) {
        renderSlot(blockUuid, slot, `<div class="bermaid-error">Block not found — try reloading the page.</div>`)
        return
      }

      if (children.length === 0) {
        renderSlot(blockUuid, slot, `<div class="bermaid-error">No child block found — add a child block with Mermaid syntax (e.g. "graph TD; A-->B").</div>`)
        return
      }

      const mermaidLines: string[] = []
      for (const child of children) {
        if (typeof child === 'string') continue
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
      if (!mermaidSyntax) {
        renderSlot(blockUuid, slot, `<div class="bermaid-error">Child block is empty — add Mermaid syntax (e.g. "graph TD; A-->B").</div>`)
        return
      }

      const svg = await renderDiagram(mermaidSyntax)
      svgCache.set(blockUuid, svg)
      renderedSlots.set(blockUuid, { slot, mermaidSyntax })
      const width = await getBlockWidth(blockUuid)

      renderSlot(blockUuid, slot, buildDiagramHtml(blockUuid, svg, width))
    } catch (err: any) {
      const message = err?.message || String(err)
      renderSlot(blockUuid, slot, `<div class="bermaid-error">Invalid Mermaid syntax — check the child block.\n${escapeHtml(message)}</div>`)
    }
  })

  const insertBermaidTemplate = async (targetUuid?: string) => {
    try {
      await sleep(100)

      let parentBlock: any = null
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
          () => logseq.Editor.getCurrentBlock().catch(() => null),
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

      const childTemplate = '```mermaid\ngraph TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Action]\n    B -->|No| D[End]\n```'

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
  logseq.Editor.registerSlashCommand('bermaid', async (event: any) => {
    const targetUuid = event?.uuid || event?.blockUuid
    setTimeout(() => {
      void insertBermaidTemplate(targetUuid)
    }, 0)
  })

  console.log('Bermaid plugin ready!')
}

logseq.ready(main).catch(console.error)
