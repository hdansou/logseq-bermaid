/** Intrinsic size from width/height attributes, else the viewBox, else a sane default. */
export function svgSize(svgString: string): { width: number; height: number } {
  const el = new DOMParser().parseFromString(svgString, 'image/svg+xml').querySelector('svg')
  const w = parseFloat(el?.getAttribute('width') ?? '')
  const h = parseFloat(el?.getAttribute('height') ?? '')
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h }
  const vb = (el?.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { width: vb[2], height: vb[3] }
  return { width: 800, height: 600 }
}

export async function svgToPngBlob(svgString: string, transparentBg: boolean): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const { width, height } = svgSize(svgString)

      const canvas = document.createElement('canvas')
      const scale = 2
      canvas.width = width * scale
      canvas.height = height * scale

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Could not get canvas context')
      }

      if (!transparentBg) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      const img = new Image()
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      img.onload = () => {
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0, width, height)
        URL.revokeObjectURL(url)

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to create PNG blob'))
          }
        }, 'image/png')
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Failed to load SVG image'))
      }

      img.src = url
    } catch (err) {
      reject(err)
    }
  })
}
