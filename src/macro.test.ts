import { describe, it, expect } from 'vitest'
import { parseWidthArg, extractMermaidSyntax, getBlockText, BERMAID_MACRO_RE } from './macro'

describe('parseWidthArg', () => {
  it('falls back to the default when the arg is absent or empty', () => {
    expect(parseWidthArg([':bermaid'])).toBe(250)
    expect(parseWidthArg([':bermaid', ''])).toBe(250)
  })
  it('coerces the string the bridge hands back, with surrounding whitespace', () => {
    expect(parseWidthArg([':bermaid', ' 500 '])).toBe(500)
  })
  it('falls back on non-numeric input', () => {
    expect(parseWidthArg([':bermaid', 'wide'])).toBe(250)
    expect(parseWidthArg([':bermaid', 'NaN'])).toBe(250)
  })
  it('clamps to the min/max range', () => {
    expect(parseWidthArg([':bermaid', '10'])).toBe(200)
    expect(parseWidthArg([':bermaid', '99999'])).toBe(1200)
  })
})

describe('extractMermaidSyntax', () => {
  const block = (text: string) => ({ content: text }) as never
  it('joins child blocks with newlines', () => {
    expect(extractMermaidSyntax([block('graph TD'), block('A-->B')])).toBe('graph TD\nA-->B')
  })
  it('strips a wrapping ```mermaid fence', () => {
    expect(extractMermaidSyntax([block('```mermaid\ngraph TD\nA-->B\n```')])).toBe('graph TD\nA-->B')
  })
  it('strips a bare ``` fence and tolerates trailing whitespace on the fence lines', () => {
    expect(extractMermaidSyntax([block('```  \ngraph TD\n```\t')])).toBe('graph TD')
  })
  it('leaves an unfenced body alone and ignores uuid tuples', () => {
    expect(extractMermaidSyntax([['uuid', 'abc'] as never, block('graph LR')])).toBe('graph LR')
  })
  it('reads DB-graph blocks that carry title instead of content', () => {
    expect(extractMermaidSyntax([{ title: 'graph TD' } as never])).toBe('graph TD')
  })
  it('returns an empty string when there is nothing to render', () => {
    expect(extractMermaidSyntax([])).toBe('')
    expect(extractMermaidSyntax([block('```mermaid\n```')])).toBe('')
  })
})

describe('getBlockText', () => {
  it('prefers content, then title, then empty', () => {
    expect(getBlockText({ content: 'c', title: 't' } as never)).toBe('c')
    expect(getBlockText({ title: 't' } as never)).toBe('t')
    expect(getBlockText(null)).toBe('')
  })
})

describe('BERMAID_MACRO_RE', () => {
  it('matches the macro with and without a width arg, tolerating whitespace', () => {
    for (const s of ['{{renderer :bermaid}}', '{{renderer :bermaid, 500}}', '{{renderer  :bermaid ,500 }}']) {
      expect(s.replace(BERMAID_MACRO_RE, 'X')).toBe('X')
    }
  })
  it('does not match other renderers', () => {
    expect('{{renderer :other, 1}}'.replace(BERMAID_MACRO_RE, 'X')).toBe('{{renderer :other, 1}}')
  })
})
