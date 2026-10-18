import { describe, it, expect } from 'vitest'
import { render } from 'pele'
import { applyTheme, resolveThemeName, PALETTES } from './theme'
import { THEME_CHOICES } from './constants'

const rootStyle = (svg: string) => svg.match(/^<svg[^>]*\sstyle="([^"]*)"/)?.[1] ?? ''

describe('resolveThemeName', () => {
  it('maps auto to the Logseq theme mode', () => {
    expect(resolveThemeName('auto', 'light')).toBe('github-light')
    expect(resolveThemeName('auto', 'dark')).toBe('tokyo-night')
  })
  it('passes a named theme through', () => {
    expect(resolveThemeName('nord', 'light')).toBe('nord')
  })
})

describe('PALETTES', () => {
  it('has a palette for every theme the settings offer', () => {
    for (const name of THEME_CHOICES.filter((t) => t !== 'auto')) {
      expect(PALETTES[name], name).toBeDefined()
    }
  })
})

describe('applyTheme', () => {
  const svg = render('flowchart LR\n  A --> B').svg

  it('bakes the palette into the root style, ahead of Pele\'s own fallbacks', () => {
    const style = rootStyle(applyTheme(svg, 'dracula', true))
    expect(style.startsWith('--pele-bg:#282a36;')).toBe(true)
    expect(style).toContain('--pele-accent:#bd93f9')
    expect(style).toContain('--_bg:var(--pele-bg,#fff)')
  })

  it('paints the background only when not transparent', () => {
    expect(rootStyle(applyTheme(svg, 'nord', true))).not.toContain('background:')
    expect(rootStyle(applyTheme(svg, 'nord', false))).toContain('background:var(--pele-bg)')
  })

  it('mixes surfaces and borders from fg the way beautiful-mermaid did (3% fill, 5% band, 20% stroke)', () => {
    const style = rootStyle(applyTheme(svg, 'nord', true))
    expect(style).toContain('--pele-surface:color-mix(in srgb,#d8dee9 3%,#2e3440)')
    expect(style).toContain('--pele-surface-alt:color-mix(in srgb,#d8dee9 5%,#2e3440)')
    expect(style).toContain('--pele-border:color-mix(in srgb,#d8dee9 20%,#2e3440)')
  })

  it('derives line, accent and muted from fg for bg/fg-only palettes, as beautiful-mermaid did', () => {
    const style = rootStyle(applyTheme(svg, 'zinc-dark', true))
    expect(style).toContain('--pele-line:color-mix(in srgb,#FAFAFA 50%,#18181B)')
    expect(style).toContain('--pele-accent:color-mix(in srgb,#FAFAFA 85%,#18181B)')
    expect(style).toContain('--pele-muted:color-mix(in srgb,#FAFAFA 40%,#18181B)')
  })

  it('fills solid arrowheads with the accent, leaving hollow markers alone', () => {
    const out = applyTheme(svg, 'github-light', true)
    expect(out).toContain('<style>.pele-marker[fill="var(--_l)"]{fill:var(--pele-accent)}</style>')
    expect(out.indexOf('<style>')).toBe(out.indexOf('>') + 1)
  })

  it('falls back to the dark default for an unknown theme name', () => {
    expect(rootStyle(applyTheme(svg, 'nope', true))).toContain('--pele-bg:#1a1b26')
  })

  it('leaves the diagram body untouched', () => {
    const out = applyTheme(svg, 'nord', true)
    expect(out.slice(out.indexOf('</style>') + 8)).toBe(svg.slice(svg.indexOf('>') + 1))
  })
})
