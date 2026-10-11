export const BERMAID_STYLES = `
  .bermaid-wrapper {
    position: relative;
    display: inline-block;
    min-width: 200px;
    max-width: 100%;
    box-sizing: border-box;
    /* Native resize grip: the browser drags it, no JS involved. resize needs
       overflow != visible. The grip release ends in a click that the bridge
       forwards with the wrapper's live rect (see buildDiagramHtml).

       'both', not 'horizontal', on purpose: the SVG keeps its aspect ratio, so
       a horizontal-only grip would move UP as the width shrinks, the release
       would land on whatever sits below the diagram, and the click would never
       reach this element. With 'both' the corner tracks the pointer on both
       axes, so the release is always on the wrapper. Only the width is
       persisted; the re-render after commit drops the dragged height. */
    resize: both;
    overflow: hidden;
    font-size: 0;
    line-height: 0;
  }
  .bermaid-wrapper::-webkit-resizer {
    background: linear-gradient(135deg, transparent 0 50%, var(--ls-active-primary-color, #7c3aed) 50% 100%);
    opacity: 0.35;
    border-bottom-right-radius: 4px;
  }
  .bermaid-wrapper:hover::-webkit-resizer {
    opacity: 0.8;
  }
  /* Feedback while the grip is held: the diagram itself cannot track the
     pointer mid-drag (no events cross the bridge), only the box can. */
  .bermaid-wrapper:active {
    outline: 2px dashed var(--ls-active-primary-color, #7c3aed);
    outline-offset: -2px;
  }
  .bermaid-container {
    display: flex;
    /* Without this, align-items defaults to stretch and the SVG is stretched
       to the container's cross-size instead of following its own aspect ratio --
       width would resize but height would not track it. */
    align-items: flex-start;
    width: 100%;
    overflow-x: auto;
    padding: 0;
    cursor: zoom-in;
  }
  .bermaid-container svg {
    width: 100%;
    /* height:auto + the viewBox's intrinsic ratio keeps resizing proportional. */
    height: auto;
    display: block;
  }
  .bermaid-copy-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 30px;
    height: 30px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    color: rgba(255, 255, 255, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s, border-color 0.15s, transform 0.1s;
    z-index: 10;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    flex-shrink: 0;
  }
  .bermaid-wrapper:hover .bermaid-copy-btn {
    opacity: 1;
  }
  .bermaid-copy-btn:hover {
    background: rgba(0, 0, 0, 0.7);
    border-color: rgba(255, 255, 255, 0.5);
    color: white;
    transform: scale(1.08);
  }
  .bermaid-copy-btn:active {
    transform: scale(0.95);
  }
  .bermaid-copy-btn svg {
    display: block;
    pointer-events: none;
  }
  .bermaid-loading {
    color: var(--ls-secondary-text-color, #999);
    font-style: italic;
    padding: 8px;
  }
  .bermaid-error {
    color: var(--ls-error-text-color, #e55);
    background: var(--ls-tertiary-background-color, #fee);
    border: 1px solid var(--ls-error-text-color, #e55);
    border-radius: 4px;
    padding: 8px 12px;
    font-family: monospace;
    font-size: 0.85em;
    white-space: pre-wrap;
  }

`
