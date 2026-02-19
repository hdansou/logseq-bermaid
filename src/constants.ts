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
