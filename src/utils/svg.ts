export async function svgToPngBlob(svgString: string, transparentBg: boolean): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const parser = new DOMParser()
      const svgDoc = parser.parseFromString(svgString, 'image/svg+xml')
      const svgEl = svgDoc.querySelector('svg')

      if (!svgEl) {
        throw new Error('Invalid SVG')
      }

      const width = parseFloat(svgEl.getAttribute('width') || '800')
      const height = parseFloat(svgEl.getAttribute('height') || '600')

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
