import '@logseq/libs'
import { renderMermaid, THEMES } from 'beautiful-mermaid'
import type { RenderOptions } from 'beautiful-mermaid'
import { AUTO_THEME, DEFAULT_DIAGRAM_WIDTH, THEME_CHOICES } from './constants'
import { BERMAID_STYLES } from './styles'
import { svgToPngBlob } from './utils/svg'
import { escapeHtml } from './utils/text'

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

let currentThemeMode: string = 'dark'

/** Rendered SVG strings keyed by block UUID, for copy-to-clipboard */
const svgCache = new Map<string, string>()

/** In-memory width cache to avoid redundant async lookups */
const widthCache = new Map<string, number>()

/** Context menu visibility state */
let contextMenuVisible = false

/** Fullscreen lightbox visibility state */
let fullscreenVisible = false

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
    .replace(`height="${vbMatch[2]}"`, `height="${newHeight}"`)
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
      const hostScope = await logseq.Experiments.ensureHostScope().catch(() => null)
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
 * Show context menu at cursor position
 */
function showContextMenu(uuid: string, x: number, y: number): void {
  contextMenuVisible = true
  logseq.provideUI({
    key: 'bermaid-context-menu',
    path: 'body',
    template: `
      <div class="bermaid-context-menu" style="left: ${x}px; top: ${y}px;">
        <div class="bermaid-context-menu-item" data-on-click="bermaidCopyImage" data-block-uuid="${uuid}">
          📋 Copy as PNG
        </div>
      </div>
    `,
  })
}

/**
 * Show fullscreen lightbox for a rendered diagram
 */
function showFullscreen(uuid: string): void {
  const svg = svgCache.get(uuid)
  if (!svg) return

  fullscreenVisible = true

  logseq.provideUI({
    key: 'bermaid-fullscreen',
    path: 'body',
    template: `
      <div class="bermaid-lightbox" data-on-click="bermaidCloseFullscreen">
        <div class="bermaid-lightbox-content" data-on-click="bermaidLightboxContentClick">
          ${svg}
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

  logseq.provideUI({
    key: 'bermaid-fullscreen',
    path: 'body',
    template: '',
  })
}

/**
 * Hide context menu
 */
function hideContextMenu(): void {
  if (contextMenuVisible) {
    contextMenuVisible = false
    logseq.provideUI({
      key: 'bermaid-context-menu',
      path: 'body',
      template: '',
    })
  }
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
      const width = (block as any)?.properties?.['bermaid-width']
      if (width && typeof width === 'number') {
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
    async bermaidCopyImage(e: any) {
      const uuid = e.dataset?.blockUuid
      if (uuid) {
        await copyImageToClipboard(uuid)
        hideContextMenu()
      }
    },
    async bermaidContextMenu(e: any) {
      e.preventDefault?.()
      const uuid = e.dataset?.blockUuid
      const rect = e.dataset?.rect
      if (uuid && rect) {
        const { x, y } = JSON.parse(rect)
        showContextMenu(uuid, x, y)
      }
    },
    async bermaidOpenFullscreen(e: any) {
      const uuid = e.dataset?.blockUuid
      if (!uuid) return
      showFullscreen(uuid)
    },
    async bermaidCloseFullscreen() {
      hideFullscreen()
    },
    async bermaidLightboxContentClick(e: any) {
      e.stopPropagation?.()
    },
  })

  // --- Host Scope Event Listeners for Resize ---
  let hostScope: any = null
  try {
    hostScope = await logseq.Experiments.ensureHostScope()
  } catch (err) {
    console.warn('Could not get host scope for resize:', err)
  }

  let hostDoc: Document | null = null
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
      // Update context menu position attribute
      const containers = doc.querySelectorAll('.bermaid-container[data-on-contextmenu]')
      containers.forEach((el: any) => {
        el.dataset.rect = JSON.stringify({ x: e.clientX, y: e.clientY })
      })

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
        const minWidth = 200
        const maxWidth = Math.max(wrapper.parentElement?.offsetWidth || 1200, 1200)
        newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))
        
        wrapper.style.width = `${newWidth}px`
        
        // For left handle, adjust margin to keep right edge anchored
        if (resizeState.side === 'left') {
          const widthDiff = newWidth - resizeState.startWidth
          wrapper.style.marginLeft = `${-widthDiff}px`
        }
      }
    }

    // Mouse down on resize handle
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
      
      // Hide context menu on any click
      if (!target?.closest('.bermaid-context-menu')) {
        hideContextMenu()
      }
    }

    // Mouse up - finish resize
    const onMouseUp = async () => {
      if (resizeState) {
        const wrapper = resizeState.wrapperEl
        wrapper.classList.remove('bermaid-resizing')
        wrapper.style.marginLeft = '' // Clear temporary margin
        
        const finalWidth = wrapper.offsetWidth
        await setBlockWidth(resizeState.uuid, finalWidth)
        resizeState = null
      }
    }

    // Hide context menu on scroll or another context menu
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target?.closest('.bermaid-container')) {
        hideContextMenu()
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideContextMenu()
        hideFullscreen()
      }
    }

    doc.addEventListener('mousemove', onMouseMove, true)
    doc.addEventListener('mousedown', onMouseDown, true)
    doc.addEventListener('mouseup', onMouseUp, true)
    doc.addEventListener('scroll', hideContextMenu, true)
    doc.addEventListener('contextmenu', onContextMenu, true)
    doc.addEventListener('keydown', onKeyDown, true)

    offHooks.push(() => {
      doc.removeEventListener('mousemove', onMouseMove, true)
      doc.removeEventListener('mousedown', onMouseDown, true)
      doc.removeEventListener('mouseup', onMouseUp, true)
      doc.removeEventListener('scroll', hideContextMenu, true)
      doc.removeEventListener('contextmenu', onContextMenu, true)
      doc.removeEventListener('keydown', onKeyDown, true)
    })
  }

  // --- Theme mode detection ---
  const offThemeModeChanged = logseq.App.onThemeModeChanged(({ mode }) => {
    currentThemeMode = mode
    // Note: re-rendering existing diagrams would require tracking rendered slots.
    // For now, new renders will pick up the updated mode.
  })
  if (typeof offThemeModeChanged === 'function') {
    offHooks.push(offThemeModeChanged)
  }

  logseq.beforeunload(async () => {
    hideContextMenu()
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
      let block: any = null
      let children: any[] = []
      for (let attempt = 0; attempt < 6; attempt += 1) {
        if (attempt > 0) await sleep(250)
        block = await logseq.Editor.getBlock(blockUuid, { includeChildren: true }).catch(() => null)
        children = block?.children || []
        if (children.length > 0) break
      }

      if (!block) {
        renderSlot(blockUuid, slot, `<div class="bermaid-error">Error: Block not found</div>`)
        return
      }

      if (children.length === 0) {
        renderSlot(blockUuid, slot, `<div class="bermaid-error">No child block found. Add a child block with mermaid syntax.</div>`)
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
      const fenceMatch = mermaidSyntax.match(/^```(?:mermaid)?\s*\n([\s\S]*?)\n?```$/m)
      if (fenceMatch) {
        mermaidSyntax = fenceMatch[1].trim()
      }
      if (!mermaidSyntax) {
        renderSlot(blockUuid, slot, `<div class="bermaid-error">Child block is empty. Add mermaid syntax.</div>`)
        return
      }

      const svg = await renderDiagram(mermaidSyntax)
      svgCache.set(blockUuid, svg)
      const width = await getBlockWidth(blockUuid)

      renderSlot(blockUuid, slot, `
          <div class="bermaid-wrapper" data-block-uuid="${blockUuid}" style="width: ${width}px;">
            <div class="bermaid-resize-handle bermaid-resize-left" data-side="left"></div>
            <div class="bermaid-container" 
                 data-on-click="bermaidOpenFullscreen"
                 data-on-contextmenu="bermaidContextMenu"
                 data-block-uuid="${blockUuid}"
                 data-rect='{"x":0,"y":0}'
                 data-prevent-default="true">
              ${svg}
            </div>
            <button class="bermaid-copy-btn"
                    data-on-click="bermaidCopyImage"
                    data-block-uuid="${blockUuid}"
                    title="Copy as PNG">📋 Copy</button>
            <div class="bermaid-resize-handle bermaid-resize-right" data-side="right"></div>
          </div>
        `)
    } catch (err: any) {
      const message = err?.message || String(err)
      renderSlot(blockUuid, slot, `<div class="bermaid-error">Bermaid render error:\n${escapeHtml(message)}</div>`)
    }
  })

  const insertBermaidTemplate = async (targetUuid?: string) => {
    try {
      await sleep(100)

      let parentBlock: any = null
      if (targetUuid) {
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          parentBlock = await logseq.Editor.getBlock(targetUuid).catch(() => null)
          if (parentBlock?.uuid) break
          await sleep(100)
        }
      }

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        if (parentBlock?.uuid) break
        parentBlock = await logseq.Editor.getCurrentBlock().catch(() => null)
        if (parentBlock?.uuid) break
        await sleep(100)
      }

      if (!parentBlock?.uuid) {
        throw new Error('No active block to insert /bermaid template')
      }

      // Exit editing mode so the block is no longer held by the editor.
      // updateBlock on a block that is actively being edited is silently
      // ignored (the live editor state takes precedence).
      await logseq.Editor.exitEditingMode(true).catch(() => null)
      await sleep(100)

      let rendererUpdated = false
      let lastUpdateError: unknown = null
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          await logseq.Editor.updateBlock(parentBlock.uuid, '{{renderer :bermaid}}')
          rendererUpdated = true
          break
        } catch (error) {
          lastUpdateError = error
          const message = error instanceof Error ? error.message : String(error)
          const retryable = message.includes('[deferred timeout]') || message.includes('entity id, got 0')
          if (!retryable || attempt === 5) break
          await sleep(300)
        }
      }

      if (!rendererUpdated) {
        const msg = lastUpdateError instanceof Error ? lastUpdateError.message : String(lastUpdateError ?? 'unknown error')
        console.warn('Bermaid: Failed to update renderer block after retries', lastUpdateError)
        logseq.UI.showMsg(`❌ Failed to add renderer to block: ${msg}`, 'error')
        return
      }

      const childTemplate = '```mermaid\ngraph TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Action]\n    B -->|No| D[End]\n```'
      let childBlock: any = null
      let lastInsertError: unknown = null

      // Wait for the parent block update to be committed to the DB before inserting a child.
      // In DB-based graphs, the entity may not be persisted immediately,
      // causing "entity id, got 0" errors.
      await sleep(300)

      // Re-fetch the parent block to ensure we have the latest persisted UUID
      const refreshed = await logseq.Editor.getBlock(parentBlock.uuid).catch(() => null)
      const insertUuid = refreshed?.uuid ?? parentBlock.uuid

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          childBlock = await logseq.Editor.insertBlock(insertUuid, childTemplate, { sibling: false })
          if (childBlock?.uuid) break
        } catch (error) {
          lastInsertError = error
          const message = error instanceof Error ? error.message : String(error)
          const retryable = message.includes('[deferred timeout]') || message.includes('entity id, got 0')
          if (!retryable || attempt === 5) break
          await sleep(300)
        }
      }

      if (!childBlock?.uuid) {
        if (lastInsertError) console.warn('Bermaid: Failed to insert child mermaid block after retries', lastInsertError)
        return
      }

      // Avoid DB schema-specific child metadata writes here; they can fail on
      // some graphs and are not required for Bermaid rendering.
    } catch (err) {
      console.error('Bermaid: Failed to insert template', err)
      logseq.UI.showMsg('❌ Failed to insert /bermaid template', 'error')
    }
  }

  // --- Slash Command ---
  logseq.Editor.registerSlashCommand('bermaid', (event: any) => {
    const targetUuid = event?.uuid || event?.blockUuid
    setTimeout(() => {
      void insertBermaidTemplate(targetUuid)
    }, 0)
  })

  console.log('Bermaid plugin ready!')
}

logseq.ready(main).catch(console.error)
