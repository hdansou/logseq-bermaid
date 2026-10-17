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

  it('falls back to the dark default for an unknown theme name', () => {
    expect(rootStyle(applyTheme(svg, 'nope', true))).toContain('--pele-bg:#1a1b26')
  })

  it('leaves everything after the root tag untouched', () => {
    const out = applyTheme(svg, 'nord', true)
    expect(out.slice(out.indexOf('>'))).toBe(svg.slice(svg.indexOf('>')))
  })
})
