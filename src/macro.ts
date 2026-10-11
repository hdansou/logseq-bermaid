import type { BlockEntity, BlockUUIDTuple } from '@logseq/libs/dist/LSPlugin'
import { DEFAULT_DIAGRAM_WIDTH, MIN_DIAGRAM_WIDTH, MAX_DIAGRAM_WIDTH } from './constants'

/**
 * Pure helpers around the {{renderer :bermaid}} macro and its child blocks.
 * No SDK calls here, so they are unit-testable without a Logseq host
 * (src/macro.test.ts). Both the first render and the live re-render go
 * through extractMermaidSyntax, so a bug here hits twice.
 */

/** Normalize DB/file-graph block content field */
export function getBlockText(block: BlockEntity | null | undefined): string {
  return block?.content || block?.title || ''
}

/** Parse the second positional macro arg as the diagram width. Clamped, falls back to default. */
export function parseWidthArg(args: ReadonlyArray<string>): number {
  const raw = args[1]
  if (raw === undefined || raw === null || raw === '') return DEFAULT_DIAGRAM_WIDTH
  const n = Number(String(raw).trim())
  if (!Number.isFinite(n)) return DEFAULT_DIAGRAM_WIDTH
  return Math.max(MIN_DIAGRAM_WIDTH, Math.min(MAX_DIAGRAM_WIDTH, n))
}

/** Match a {{renderer :bermaid[, ...]}} macro call. Tolerant to whitespace around args. */
export const BERMAID_MACRO_RE = /\{\{renderer\s+:bermaid(?:\s*,[^}]*)?\s*\}\}/

/**
 * Join child-block text into Mermaid syntax and strip a wrapping ```mermaid ... ``` fence.
 * Children may be BlockEntity or ['uuid', BlockUUID] tuples; only the entity form has text.
 */
export function extractMermaidSyntax(children: Array<BlockEntity | BlockUUIDTuple>): string {
  const mermaidLines: string[] = []
  for (const child of children) {
    if (Array.isArray(child)) continue
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
  return mermaidSyntax
}
