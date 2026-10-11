// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { svgSize } from './svg'

describe('svgSize', () => {
  it('reads width/height attributes, including the fractional ones beautiful-mermaid emits', () => {
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="697.705" height="286.7"></svg>')).toEqual({ width: 697.705, height: 286.7 })
  })
  it('falls back to the viewBox when width/height are missing', () => {
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"></svg>')).toEqual({ width: 640, height: 480 })
  })
  it('falls back to 800x600 when neither is usable', () => {
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="0"></svg>')).toEqual({ width: 800, height: 600 })
    expect(svgSize('not svg at all')).toEqual({ width: 800, height: 600 })
  })
})
