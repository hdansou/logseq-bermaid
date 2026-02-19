export const BERMAID_STYLES = `
  .bermaid-wrapper {
    position: relative;
    display: inline-block;
    min-width: 200px;
    max-width: none;
    box-sizing: border-box;
  }
  .bermaid-wrapper.bermaid-resizing {
    outline: 2px solid var(--ls-primary-background-color, #3b82f6);
    user-select: none;
  }
  .bermaid-container {
    width: 100%;
    overflow-x: auto;
    padding: 8px 0;
  }
  .bermaid-container svg {
    width: 100%;
    height: auto;
  }
  .bermaid-copy-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--ls-primary-background-color, #3b82f6);
    color: white;
    border: none;
    border-radius: 4px;
    padding: 6px 10px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s;
    font-size: 12px;
    z-index: 10;
  }
  .bermaid-wrapper:hover .bermaid-copy-btn {
    opacity: 1;
  }
  .bermaid-copy-btn:hover {
    background: var(--ls-primary-background-color-hover, #2563eb);
  }
  .bermaid-resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 16px;
    cursor: col-resize;
    opacity: 0;
    transition: opacity 0.2s, background 0.2s;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .bermaid-resize-handle::after {
    content: '';
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 40px;
    background: var(--ls-primary-background-color, #3b82f6);
    border-radius: 2px;
    box-shadow: 0 0 4px rgba(0,0,0,0.2);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .bermaid-resize-left {
    left: -8px;
  }
  .bermaid-resize-right {
    right: -8px;
  }
  .bermaid-wrapper:hover .bermaid-resize-handle {
    opacity: 1;
  }
  .bermaid-wrapper:hover .bermaid-resize-handle::after {
    opacity: 0.6;
  }
  .bermaid-resize-handle:hover {
    background: rgba(59, 130, 246, 0.1);
  }
  .bermaid-resize-handle:hover::after {
    opacity: 1 !important;
    background: var(--ls-link-text-color, #3b82f6);
  }
  .bermaid-wrapper.bermaid-resizing .bermaid-resize-handle::after {
    opacity: 1 !important;
    background: var(--ls-link-text-color, #3b82f6);
  }
  .bermaid-context-menu {
    position: fixed;
    background: var(--ls-primary-background-color, white);
    border: 1px solid var(--ls-border-color, #ddd);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    z-index: 1000;
    min-width: 150px;
  }
  .bermaid-context-menu-item {
    padding: 8px 12px;
    cursor: pointer;
    transition: background 0.1s;
  }
  .bermaid-context-menu-item:hover {
    background: var(--ls-secondary-background-color, #f5f5f5);
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
