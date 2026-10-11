import PhotoSwipeLightbox from 'photoswipe/lightbox'
import PhotoSwipe from 'photoswipe'
import 'photoswipe/style.css'

/**
 * Fullscreen diagram viewer.
 *
 * Lives in the plugin's OWN document (the main UI iframe), never in the host
 * body. Installed plugins are cross-origin and cannot reach the host document,
 * and the bridge forwards no mouse, wheel or key identity -- so a host-injected
 * overlay can never zoom, pan or close on Esc there. Inside our iframe every
 * event is ours.
 *
 * It is PhotoSwipe with the options Logseq itself passes for images
 * (frontend.extensions.lightbox), so the experience matches native image
 * previews: fade in, wheel/pinch zoom, drag pan, Esc and backdrop close.
 */

let current: PhotoSwipeLightbox | null = null

/** Intrinsic size from width/height attributes, else the viewBox, else a sane default. */
export function svgSize(svg: string): { width: number; height: number } {
  const el = new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('svg')
  const w = parseFloat(el?.getAttribute('width') ?? '')
  const h = parseFloat(el?.getAttribute('height') ?? '')
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h }
  const vb = (el?.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { width: vb[2], height: vb[3] }
  return { width: 800, height: 600 }
}

export function openLightbox(svg: string): void {
  closeLightbox()
  const { width, height } = svgSize(svg)
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  logseq.setMainUIInlineStyle({ position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh', zIndex: 9999 })
  logseq.showMainUI({ autoFocus: true })
  // Esc is handled by PhotoSwipe on OUR document; that needs our window to
  // hold focus. autoFocus asks the host to focus the iframe, this makes sure.
  window.focus()

  const lightbox = new PhotoSwipeLightbox({
    dataSource: [{ src, width, height }],
    pswpModule: PhotoSwipe,
    // Logseq fades its image viewer in. We open instantly on purpose: any
    // click during PhotoSwipe's opening animation (zoom button, the image)
    // interrupts it, the opener never reaches isOpen, and from then on both
    // the close button and Esc are no-ops -- a fullscreen overlay the user
    // cannot leave. Reproduced in scripts/e2e/lightbox.mjs; no window, no trap.
    showHideAnimationType: 'none',
    // Logseq's images are rasters, so PhotoSwipe's default secondary zoom
    // (natural size) is right for them. A diagram is vector and already
    // renders at natural size when it fits, which would leave the zoom button
    // with nothing to do. Zoom relative to the fitted size instead.
    initialZoomLevel: 'fit',
    secondaryZoomLevel: (levels) => levels.fit * 2,
    maxZoomLevel: (levels) => levels.fit * 8,
  })
  // Hide our frame on 'destroy', not 'close': 'close' fires at the START of
  // the fade-out, and a hidden iframe gets no animation frames, so PhotoSwipe
  // would never finish tearing down and would stay half-open under the next
  // click. The old instance is dropped on the next open (see closeLightbox).
  lightbox.on('destroy', () => {
    if (current === lightbox) current = null
    logseq.hideMainUI()
  })
  // For scripts/e2e/lightbox.mjs, which asserts on PhotoSwipe's opener state.
  ;(window as unknown as { __bermaidLightbox?: PhotoSwipeLightbox }).__bermaidLightbox = lightbox
  current = lightbox
  // Only open once our iframe is actually displayed. showMainUI is an RPC to
  // the host (and the SDK's own 'ui:visible:changed' fires before the host
  // acts on it); until the host adds its 'visible' class this document is
  // display:none, has a 0x0 viewport, and the image PhotoSwipe starts loading
  // in it ends up broken (complete, naturalWidth 0). rAF does not run in a
  // hidden frame, so poll with a timer.
  const deadline = Date.now() + 3000
  const open = () => {
    if (current !== lightbox) return
    if ((window.innerWidth === 0 || window.innerHeight === 0) && Date.now() < deadline) {
      setTimeout(open, 16)
      return
    }
    lightbox.init()
    lightbox.loadAndOpen(0)
  }
  open()
}

export function closeLightbox(): void {
  if (!current) return
  const lb = current
  current = null
  // close() is a no-op unless the opener finished opening; destroy() always works.
  if (lb.pswp?.opener?.isOpen) lb.pswp.close() // ends in 'destroy' above
  else if (lb.pswp) lb.pswp.destroy()
  else { lb.destroy(); logseq.hideMainUI() }
}
