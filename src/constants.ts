export const THEME_CHOICES = [
  'auto',
  'zinc-dark',
  'tokyo-night',
  'tokyo-night-storm',
  'tokyo-night-light',
  'catppuccin-mocha',
  'catppuccin-latte',
  'nord',
  'nord-light',
  'dracula',
  'github-light',
  'github-dark',
  'solarized-light',
  'solarized-dark',
  'one-dark',
] as const

export const AUTO_THEME: Record<string, string> = {
  light: 'github-light',
  dark: 'tokyo-night',
}

export const DEFAULT_DIAGRAM_WIDTH = 250
export const MIN_DIAGRAM_WIDTH = 200
export const MAX_DIAGRAM_WIDTH = 1200
export const ZOOM_MIN = 0.125
export const ZOOM_MAX = 8
export const ZOOM_STEP = 1.25
export const SVG_CACHE_CAP = 200
export const RENDERED_SLOTS_CAP = 200
