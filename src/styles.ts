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

  .bermaid-lightbox {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bermaid-lightbox-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.82);
    z-index: 1;
    cursor: zoom-out;
  }

  .bermaid-lightbox-close {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.55);
    background: rgba(0,0,0,0.45);
    color: white;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s;
    line-height: 1;
    padding: 0;
  }
  .bermaid-lightbox-close:hover {
    background: rgba(255,255,255,0.2);
    border-color: white;
  }

  .bermaid-zoom-controls {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(0,0,0,0.62);
    border-radius: 999px;
    padding: 5px 10px;
    z-index: 10;
    backdrop-filter: blur(6px);
    user-select: none;
  }

  .bermaid-zoom-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.35);
    background: transparent;
    color: white;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s;
    line-height: 1;
    padding: 0;
  }
  .bermaid-zoom-btn:hover {
    background: rgba(255,255,255,0.2);
    border-color: rgba(255,255,255,0.7);
  }

  .bermaid-zoom-level {
    color: rgba(255,255,255,0.9);
    font-size: 12px;
    min-width: 40px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .bermaid-lightbox-content {
    position: relative;
    z-index: 5;
    width: min(96vw, 1800px);
    height: calc(100vh - 96px);
    overflow: hidden;
    background: var(--ls-primary-background-color, white);
    border-radius: 8px;
    box-sizing: border-box;
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .bermaid-lightbox-content.bermaid-panning {
    cursor: grabbing;
  }

  .bermaid-lightbox-zoom-container {
    transform-origin: center center;
    will-change: transform;
    width: 100%;
    padding: 16px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .bermaid-lightbox-zoom-container svg {
    display: block;
    width: 100%;
    height: auto;
    max-height: calc(100vh - 128px);
  }
`
