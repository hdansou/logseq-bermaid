import { AUTO_THEME } from './constants'

interface Palette { bg: string; fg: string; line: string; accent: string; muted: string }

// Carried over from beautiful-mermaid's THEMES so the theme setting keeps its meaning.
// zinc-dark only defined bg/fg there; the rest is filled in from the same zinc scale.
export const PALETTES: Record<string, Palette> = {
  'zinc-dark': { bg: '#18181B', fg: '#FAFAFA', line: '#52525B', accent: '#A1A1AA', muted: '#71717A' },
  'tokyo-night': { bg: '#1a1b26', fg: '#a9b1d6', line: '#3d59a1', accent: '#7aa2f7', muted: '#565f89' },
  'tokyo-night-storm': { bg: '#24283b', fg: '#a9b1d6', line: '#3d59a1', accent: '#7aa2f7', muted: '#565f89' },
  'tokyo-night-light': { bg: '#d5d6db', fg: '#343b58', line: '#34548a', accent: '#34548a', muted: '#9699a3' },
  'catppuccin-mocha': { bg: '#1e1e2e', fg: '#cdd6f4', line: '#585b70', accent: '#cba6f7', muted: '#6c7086' },
  'catppuccin-latte': { bg: '#eff1f5', fg: '#4c4f69', line: '#9ca0b0', accent: '#8839ef', muted: '#9ca0b0' },
  'nord': { bg: '#2e3440', fg: '#d8dee9', line: '#4c566a', accent: '#88c0d0', muted: '#616e88' },
  'nord-light': { bg: '#eceff4', fg: '#2e3440', line: '#aab1c0', accent: '#5e81ac', muted: '#7b88a1' },
  'dracula': { bg: '#282a36', fg: '#f8f8f2', line: '#6272a4', accent: '#bd93f9', muted: '#6272a4' },
  'github-light': { bg: '#ffffff', fg: '#1f2328', line: '#d1d9e0', accent: '#0969da', muted: '#59636e' },
  'github-dark': { bg: '#0d1117', fg: '#e6edf3', line: '#3d444d', accent: '#4493f8', muted: '#9198a1' },
  'solarized-light': { bg: '#fdf6e3', fg: '#657b83', line: '#93a1a1', accent: '#268bd2', muted: '#93a1a1' },
  'solarized-dark': { bg: '#002b36', fg: '#839496', line: '#586e75', accent: '#268bd2', muted: '#586e75' },
  'one-dark': { bg: '#282c34', fg: '#abb2bf', line: '#4b5263', accent: '#c678dd', muted: '#5c6370' },
}

const FALLBACK_THEME = 'tokyo-night'

export function resolveThemeName(theme: string, themeMode: string): string {
  return theme === 'auto' ? AUTO_THEME[themeMode] || FALLBACK_THEME : theme
}

/**
 * Bake a palette into Pele's root `<svg style>` as `--pele-*` variables, so the colors
 * travel with the SVG into `data:` images (lightbox, copy-to-PNG) where outside CSS never reaches.
 * Surfaces and borders are mixed from bg/fg; Pele itself never paints a background.
 */
export function applyTheme(svg: string, themeName: string, transparent: boolean): string {
  const p = PALETTES[themeName] ?? PALETTES[FALLBACK_THEME]
  const mix = (pct: number) => `color-mix(in srgb,${p.fg} ${pct}%,${p.bg})`
  const vars = `--pele-bg:${p.bg};--pele-fg:${p.fg};--pele-line:${p.line};--pele-accent:${p.accent};` +
    `--pele-muted:${p.muted};--pele-surface:${mix(6)};--pele-surface-alt:${mix(12)};--pele-border:${mix(30)};` +
    (transparent ? '' : 'background:var(--pele-bg);')
  return svg.replace(/^(<svg[^>]*?\sstyle=")/, `$1${vars}`)
}
