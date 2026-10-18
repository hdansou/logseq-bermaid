import { applyTheme, resolveThemeName } from './theme'
import { svgCache } from './cache'
import { svgToPngBlob } from './utils/svg'

export interface RenderConfig {
  /** Logseq theme mode: 'light' | 'dark'. Used when `theme` is 'auto'. */
  themeMode: string
  /** Settings.theme — 'auto' or a palette name from src/theme.ts. */
  theme: string
  transparentBg: boolean
}

// pele/lazy loads each diagram type's code on first use, so only the types
// actually present in the graph are ever fetched.
let pelePromise: Promise<typeof import('pele/lazy')> | null = null
function loadPele() {
  if (!pelePromise) {
    pelePromise = import('pele/lazy')
  }
  return pelePromise
}

export async function renderDiagram(mermaidSyntax: string, config: RenderConfig): Promise<string> {
  const { renderAsync } = await loadPele()
  const { svg } = await renderAsync(mermaidSyntax)
  return applyTheme(svg, resolveThemeName(config.theme, config.themeMode), config.transparentBg)
}

/** Copy a previously-rendered SVG as PNG to the system clipboard. */
export async function copyImageToClipboard(uuid: string, transparentBg: boolean): Promise<void> {
  try {
    const svg = svgCache.get(uuid)
    if (!svg) {
      throw new Error('SVG not found in cache')
    }

    const blob = await svgToPngBlob(svg, transparentBg)

    const clipboardItem = new ClipboardItem({ 'image/png': blob })
    try {
      await navigator.clipboard.write([clipboardItem])
    } catch {
      let hostScope: unknown = null
      try { hostScope = await logseq.Experiments.ensureHostScope() } catch { /* ignore */ }
      const clipboard = (hostScope as { navigator?: { clipboard?: Clipboard } } | null)
        ?.navigator?.clipboard
      if (!clipboard) throw new Error('Clipboard API not available')
      await clipboard.write([clipboardItem])
    }

    logseq.UI.showMsg('✅ Diagram copied as PNG', 'success')
  } catch (err) {
    console.error('Failed to copy image:', err)
    const message = err instanceof Error ? err.message : String(err)
    logseq.UI.showMsg(`❌ Failed to copy: ${message}`, 'error')
  }
}
