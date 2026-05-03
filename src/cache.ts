import { SVG_CACHE_CAP, RENDERED_SLOTS_CAP } from './constants'

/** Size-capped Map that evicts the least-recently-inserted entry when full. */
export class CappedMap<K, V> extends Map<K, V> {
  constructor(private maxSize: number) { super() }
  set(key: K, value: V): this {
    if (this.has(key)) this.delete(key)
    super.set(key, value)
    if (this.size > this.maxSize) {
      const oldest = this.keys().next().value!
      this.delete(oldest)
    }
    return this
  }
}

/** Tracks rendered diagram slots for re-rendering on theme change. */
export interface RenderedSlot {
  slot: string
  mermaidSyntax: string
  width: number
}

/** Rendered SVG strings keyed by block UUID, for copy-to-clipboard. */
export const svgCache = new CappedMap<string, string>(SVG_CACHE_CAP)

/** Slots tracked across the current session, indexed by block UUID. */
export const renderedSlots = new CappedMap<string, RenderedSlot>(RENDERED_SLOTS_CAP)
