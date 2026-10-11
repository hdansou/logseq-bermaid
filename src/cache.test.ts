import { describe, it, expect } from 'vitest'
import { CappedMap } from './cache'

describe('CappedMap', () => {
  it('evicts the oldest entry once the cap is exceeded', () => {
    const m = new CappedMap<string, number>(2)
    m.set('a', 1); m.set('b', 2); m.set('c', 3)
    expect([...m.keys()]).toEqual(['b', 'c'])
  })
  it('re-setting an existing key makes it newest instead of growing the map', () => {
    const m = new CappedMap<string, number>(2)
    m.set('a', 1); m.set('b', 2); m.set('a', 3); m.set('c', 4)
    expect([...m.entries()]).toEqual([['a', 3], ['c', 4]])
  })
})
