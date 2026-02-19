import '@logseq/libs'
import { renderMermaid } from 'beautiful-mermaid'
import { THEMES } from 'beautiful-mermaid'
import type { RenderOptions } from 'beautiful-mermaid'
import { AUTO_THEME, DEFAULT_DIAGRAM_WIDTH, THEME_CHOICES } from './constants'
import { BERMAID_STYLES } from './styles'
import { svgToPngBlob } from './utils/svg'
import { escapeHtml } from './utils/text'

let currentThemeMode: string = 'dark'

/** Rendered SVG strings keyed by block UUID, for copy-to-clipboard */
const svgCache = new Map<string, string>()

/** In-memory width cache to avoid redundant async lookups */
const widthCache = new Map<string, number>()

/** Context menu state */
let contextMenuVisible = false
let contextMenuBlockUuid: string | null = null

/** Resize state */
interface ResizeState {
  uuid: string
  startWidth: number
  startX: number
  side: 'left' | 'right'
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

  const opts: RenderOptions = {
    transparent: transparentBg,
  }

  // If theme is 'auto', pick based on Logseq's current mode
  const resolvedTheme = theme === 'auto'
    ? AUTO_THEME[currentThemeMode] || 'tokyo-night'
    : theme

  // beautiful-mermaid's THEMES object can be used directly,
  // but renderMermaid accepts color options not a theme name.
  // We'll import THEMES to resolve colors.
  return { ...opts, ...(getThemeColors(resolvedTheme) || {}) }
}

function getThemeColors(themeName: string): Partial<RenderOptions> | null {
  if (THEMES && THEMES[themeName]) {
    return THEMES[themeName]
  }
  return null
}

async function renderDiagram(mermaidSyntax: string): Promise<string> {
  const opts = buildRenderOptions()
  const svg = await renderMermaid(mermaidSyntax, opts)
  return svg
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
    
    // Try clipboard API with fallback to host scope
    const clipboardItem = new ClipboardItem({ 'image/png': blob })
    
    try {
      await navigator.clipboard.write([clipboardItem])
    } catch {
      // Fallback to host scope
      const hostScope = await logseq.Experiments.ensureHostScope()
      if (hostScope?.navigator?.clipboard) {
        await hostScope.navigator.clipboard.write([clipboardItem])
      } else {
        throw new Error('Clipboard API not available')
      }
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
  contextMenuBlockUuid = uuid
  
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
 * Hide context menu
 */
function hideContextMenu(): void {
  if (contextMenuVisible) {
    contextMenuVisible = false
    contextMenuBlockUuid = null
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
    const isDbGraph = await (logseq.App as any).checkCurrentIsDbGraph()
    if (isDbGraph) {
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
    const isDbGraph = await (logseq.App as any).checkCurrentIsDbGraph()
    if (isDbGraph) {
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
    hostDoc = hostScope?.window?.top?.document ?? null
  } catch {
    console.warn('Bermaid: Could not access host document (cross-origin restriction)')
  }

  if (hostDoc) {
    const doc = hostDoc

    // Track cursor position for context menu
    let lastCursorX = 0
    let lastCursorY = 0
    doc.addEventListener('mousemove', (e: MouseEvent) => {
      lastCursorX = e.clientX
      lastCursorY = e.clientY
      
      // Update context menu position attribute
      const containers = doc.querySelectorAll('.bermaid-container[data-on-contextmenu]')
      containers.forEach((el: any) => {
        el.dataset.rect = JSON.stringify({ x: e.clientX, y: e.clientY })
      })

      // Handle resize dragging
      if (resizeState) {
        const delta = e.clientX - resizeState.startX
        const wrapper: any = doc.querySelector(`.bermaid-wrapper[data-block-uuid="${resizeState.uuid}"]`)
        
        if (wrapper) {
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
    }, true)

    // Mouse down on resize handle
    doc.addEventListener('mousedown', (e: MouseEvent) => {
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
          }
          wrapper.classList.add('bermaid-resizing')
        }
      }
      
      // Hide context menu on any click
      if (!target?.closest('.bermaid-context-menu')) {
        hideContextMenu()
      }
    }, true)

    // Mouse up - finish resize
    doc.addEventListener('mouseup', async () => {
      if (resizeState) {
        const wrapper: any = doc.querySelector(`.bermaid-wrapper[data-block-uuid="${resizeState.uuid}"]`)
        if (wrapper) {
          wrapper.classList.remove('bermaid-resizing')
          wrapper.style.marginLeft = '' // Clear temporary margin
          
          const finalWidth = wrapper.offsetWidth
          await setBlockWidth(resizeState.uuid, finalWidth)
        }
        resizeState = null
      }
    }, true)

    // Hide context menu on scroll or another context menu
    doc.addEventListener('scroll', hideContextMenu, true)
    doc.addEventListener('contextmenu', (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target?.closest('.bermaid-container')) {
        hideContextMenu()
      }
    }, true)
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

    // Show loading state
    logseq.provideUI({
      key: `bermaid-${blockUuid}`,
      slot,
      template: `<div class="bermaid-loading">Rendering mermaid diagram...</div>`,
    })

    try {
      // Fetch block with children to get mermaid source
      const block = await logseq.Editor.getBlock(blockUuid, {
        includeChildren: true,
      })

      if (!block) {
        logseq.provideUI({
          key: `bermaid-${blockUuid}`,
          slot,
          template: `<div class="bermaid-error">Error: Block not found</div>`,
        })
        return
      }

      // Extract mermaid syntax from child blocks
      const children = block.children || []
      if (children.length === 0) {
        logseq.provideUI({
          key: `bermaid-${blockUuid}`,
          slot,
          template: `<div class="bermaid-error">No child block found. Add a child block with mermaid syntax.</div>`,
        })
        return
      }

      // Get content from child blocks, joining them with newlines
      const mermaidLines: string[] = []
      for (const child of children) {
        if (typeof child === 'string') continue
        // SDK normalizes title→content for DB graphs; check content first
        const text = (child as any).content || (child as any).title || ''
        if (text) mermaidLines.push(text)
      }

      let mermaidSyntax = mermaidLines.join('\n').trim()

      // Strip code fence if wrapped in ```mermaid ... ```
      const fenceMatch = mermaidSyntax.match(/^```(?:mermaid)?\s*\n([\s\S]*?)\n?```$/m)
      if (fenceMatch) {
        mermaidSyntax = fenceMatch[1].trim()
      }
      if (!mermaidSyntax) {
        logseq.provideUI({
          key: `bermaid-${blockUuid}`,
          slot,
          template: `<div class="bermaid-error">Child block is empty. Add mermaid syntax.</div>`,
        })
        return
      }

      // Render the diagram
      const svg = await renderDiagram(mermaidSyntax)
      
      // Cache the SVG for clipboard operations
      svgCache.set(blockUuid, svg)
      
      // Get persisted width
      const width = await getBlockWidth(blockUuid)

      logseq.provideUI({
        key: `bermaid-${blockUuid}`,
        slot,
        template: `
          <div class="bermaid-wrapper" data-block-uuid="${blockUuid}" style="width: ${width}px;">
            <div class="bermaid-resize-handle bermaid-resize-left" data-side="left"></div>
            <div class="bermaid-container" 
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
        `,
      })
    } catch (err: any) {
      const message = err?.message || String(err)
      logseq.provideUI({
        key: `bermaid-${blockUuid}`,
        slot,
        template: `<div class="bermaid-error">Bermaid render error:\n${escapeHtml(message)}</div>`,
      })
    }
  })

  // --- Slash Command ---
  logseq.Editor.registerSlashCommand('bermaid', async () => {
    try {
      await logseq.Editor.insertAtEditingCursor('{{renderer :bermaid}}')

      // Insert a child code block with mermaid language
      const currentBlock = await logseq.Editor.getCurrentBlock()
      if (currentBlock) {
        const childBlock = await logseq.Editor.insertBlock(
          currentBlock.uuid,
          'graph TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Action]\n    B -->|No| D[End]',
          { sibling: false }
        )
        if (childBlock) {
          const isDbGraph = await (logseq.App as any).checkCurrentIsDbGraph()
          if (isDbGraph) {
            await logseq.Editor.upsertBlockProperty(childBlock.uuid, 'logseq.property.node/display-type', 'code')
            await logseq.Editor.upsertBlockProperty(childBlock.uuid, 'logseq.property.code/lang', 'mermaid')
          }
        }
      }
    } catch (err) {
      console.error('Bermaid: Failed to insert template', err)
      logseq.UI.showMsg('Failed to insert bermaid template', 'error')
    }
  })

  console.log('Bermaid plugin ready!')
}

logseq.ready(main).catch(console.error)
