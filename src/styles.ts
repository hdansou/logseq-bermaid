export const BERMAID_STYLES = `
  .bermaid-wrapper {
    position: relative;
    display: inline-block;
    min-width: 200px;
    max-width: none;
    box-sizing: border-box;
    overflow: visible;
    font-size: 0;
    line-height: 0;
  }
  .bermaid-wrapper.bermaid-resizing {
    outline: 2px solid var(--ls-primary-background-color, #3b82f6);
    user-select: none;
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
  /* Width slider — the resize path that works in installed (cross-origin)
     plugins, where the edge handles' drag listeners can never attach.
     Hidden until hover so it stays out of the way. */
  /* The thumb IS the right edge handle.

     The track spans MIN..MAX diagram width in real pixels (left/width are set
     inline), so the thumb lands at x == the diagram's current right edge and
     dragging it horizontally reads as dragging the edge itself.

     The track therefore extends past the diagram whenever width < MAX, so it
     must not intercept clicks on whatever sits to the right: pointer-events is
     none on the input and re-enabled only on the thumb. */
  .bermaid-width-slider {
    position: absolute;
    top: 0;
    height: 100%;
    margin: 0;
    padding: 0;
    background: transparent;
    border: none;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    pointer-events: none;
    z-index: 6;
  }
  .bermaid-width-slider::-webkit-slider-runnable-track {
    background: transparent;
    border: none;
    height: 100%;
  }
  .bermaid-width-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    pointer-events: auto;
    width: 6px;
    height: 56px;
    border-radius: 3px;
    background: var(--ls-active-primary-color, #7c3aed);
    cursor: col-resize;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .bermaid-wrapper:hover .bermaid-width-slider::-webkit-slider-thumb {
    opacity: 0.55;
  }
  .bermaid-width-slider::-webkit-slider-thumb:hover,
  .bermaid-width-slider:focus::-webkit-slider-thumb {
    opacity: 1;
  }
  /* The static right handle is replaced by the thumb above; keeping both would
     render two bars at the same edge. The left handle still works same-origin. */
  .bermaid-resize-right {
    display: none;
  }
  .bermaid-resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 12px;
    cursor: col-resize;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: all;
  }
  .bermaid-resize-handle::after {
    content: '';
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 40px;
    background: var(--ls-link-text-color, #3b82f6);
    border-radius: 2px;
    box-shadow: 0 0 4px rgba(0,0,0,0.2);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .bermaid-resize-left {
    left: 0;
  }
  .bermaid-resize-right {
    right: 0;
  }
  .bermaid-wrapper:hover .bermaid-resize-handle {
    background: rgba(59, 130, 246, 0.06);
  }
  .bermaid-wrapper:hover .bermaid-resize-handle::after {
    opacity: 0.6;
  }
  .bermaid-resize-handle:hover {
    background: rgba(59, 130, 246, 0.15);
  }
  .bermaid-resize-handle:hover::after {
    opacity: 1 !important;
  }
  .bermaid-wrapper.bermaid-resizing .bermaid-resize-handle::after {
    opacity: 1 !important;
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
