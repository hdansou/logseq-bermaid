import { describe, it, expect, vi } from 'vitest'
import { parseWidthArg, extractMermaidSyntax, getBlockText, BERMAID_MACRO_RE, isMermaidCodeBlock } from './macro'

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

describe('isMermaidCodeBlock', () => {
  it('recognises a DB-graph code block by its language property', () => {
    expect(isMermaidCodeBlock({ title: 'graph TD', ':logseq.property.code/lang': 'mermaid' } as never)).toBe(true)
  })
  it('recognises a file-graph block by its ```mermaid fence', () => {
    expect(isMermaidCodeBlock({ content: '```mermaid\ngraph TD\n```' } as never)).toBe(true)
    expect(isMermaidCodeBlock({ content: '  ```Mermaid  \ngraph TD\n```' } as never)).toBe(true)
  })
  it('rejects code blocks in other languages and plain text', () => {
    expect(isMermaidCodeBlock({ title: 'x = 1', ':logseq.property.code/lang': 'python' } as never)).toBe(false)
    expect(isMermaidCodeBlock({ content: '```js\nx()\n```' } as never)).toBe(false)
    expect(isMermaidCodeBlock({ content: 'graph TD; A-->B' } as never)).toBe(false)
    expect(isMermaidCodeBlock(null)).toBe(false)
  })
  // Logseq's /code command makes a code block with no language set.
  const looksLikeMermaid = (code: string) => /^(flowchart|graph|kanban)\b/.test(code)
  it('accepts a code block with no language when the detector recognises the content', () => {
    expect(isMermaidCodeBlock({ title: 'flowchart LR\n  A --> B', ':logseq.property.node/display-type': 'code' } as never, looksLikeMermaid)).toBe(true)
    expect(isMermaidCodeBlock({ content: '```\ngraph TD\n```' } as never, looksLikeMermaid)).toBe(true)
  })
  it('rejects a code block with no language when the detector does not recognise it', () => {
    expect(isMermaidCodeBlock({ title: "print('hi')", ':logseq.property.node/display-type': 'code' } as never, looksLikeMermaid)).toBe(false)
    expect(isMermaidCodeBlock({ content: '```\nls -la\n```' } as never, looksLikeMermaid)).toBe(false)
  })
  it('never asks the detector about a block that is not a code block, or one in another language', () => {
    const detector = vi.fn(() => true)
    expect(isMermaidCodeBlock({ content: 'graph TD; A-->B' } as never, detector)).toBe(false)
    expect(isMermaidCodeBlock({ title: 'graph TD', ':logseq.property.code/lang': 'python' } as never, detector)).toBe(false)
    expect(detector).not.toHaveBeenCalled()
  })
})
