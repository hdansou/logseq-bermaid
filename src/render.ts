import type { RenderOptions } from 'beautiful-mermaid'
import { AUTO_THEME } from './constants'
import { svgCache } from './cache'
import { svgToPngBlob } from './utils/svg'

export interface RenderConfig {
  /** Logseq theme mode: 'light' | 'dark'. Used when `theme` is 'auto'. */
  themeMode: string
  /** Settings.theme — 'auto' or a beautiful-mermaid theme name. */
  theme: string
  transparentBg: boolean
}

// Lazy-load beautiful-mermaid (~1.6 MB) — defers the heavy bundle until
// the user actually renders a {{renderer :bermaid}} macro.
let beautifulMermaidPromise: Promise<typeof import('beautiful-mermaid')> | null = null
function loadBeautifulMermaid() {
  if (!beautifulMermaidPromise) {
    beautifulMermaidPromise = import('beautiful-mermaid')
  }
  return beautifulMermaidPromise
}

function buildRenderOptions(
  THEMES: Record<string, RenderOptions>,
  config: RenderConfig,
): RenderOptions {
  const resolvedTheme = config.theme === 'auto'
    ? AUTO_THEME[config.themeMode] || 'tokyo-night'
    : config.theme
  return {
    transparent: config.transparentBg,
    ...(THEMES?.[resolvedTheme] ?? {}),
  }
}

/**
 * Trim the empty top whitespace from a beautiful-mermaid SVG by adjusting
 * the viewBox and height so the diagram content starts at the top.
 */
function trimSvgTopWhitespace(svg: string): string {
  const yValues = [...svg.matchAll(/\sy="([\d.]+)"/g)].map(m => parseFloat(m[1]))
  if (yValues.length === 0) return svg

  const minY = Math.min(...yValues)
  if (minY <= 0) return svg

  const vbMatch = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  if (!vbMatch) return svg

  const svgWidth = parseFloat(vbMatch[1])
  const svgHeight = parseFloat(vbMatch[2])

  const BUFFER = 5
  const trimAmount = Math.max(0, minY - BUFFER)
  const newHeight = svgHeight - trimAmount

  return svg
    .replace(`viewBox="0 0 ${vbMatch[1]} ${vbMatch[2]}"`, `viewBox="0 ${trimAmount} ${svgWidth} ${newHeight}"`)
    // Replace height only within the root <svg> opening tag; a plain string replace
    // would match the same value on child elements (e.g. <rect height="600">) first.
    .replace(/(<svg\b[\s\S]*?)\bheight="[\d.]+"/, `$1height="${newHeight}"`)
}

export async function renderDiagram(mermaidSyntax: string, config: RenderConfig): Promise<string> {
  const { renderMermaid, THEMES } = await loadBeautifulMermaid()
  const opts = buildRenderOptions(THEMES as unknown as Record<string, RenderOptions>, config)
  const svg = await renderMermaid(mermaidSyntax, opts)
  return trimSvgTopWhitespace(svg)
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
