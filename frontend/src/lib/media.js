/** Extrai dimensões, duração e miniatura do arquivo no navegador, antes do envio. */
export function mediaKind(file) {
  const t = file.type || ''
  const ext = file.name.split('.').pop().toLowerCase()
  if (t.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (t.startsWith('video/') || ['mp4', 'm4v', 'webm', 'ogv'].includes(ext)) return 'video'
  if (t.startsWith('audio/') || ['mp3', 'ogg', 'wav', 'm4a', 'aac'].includes(ext)) return 'audio'
  return null
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8))

function drawThumb(source, w, h) {
  const max = 480
  const scale = Math.min(1, max / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
  return toBlob(canvas)
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((resolve) => setTimeout(() => resolve(null), ms))])

export async function extractMeta(file) {
  const kind = mediaKind(file)
  const url = URL.createObjectURL(file)
  try {
    if (kind === 'image') {
      return (await withTimeout(new Promise((resolve) => {
        const img = new Image()
        img.onload = async () => resolve({ meta: { width: img.naturalWidth, height: img.naturalHeight }, thumbnail: await drawThumb(img, img.naturalWidth, img.naturalHeight) })
        img.onerror = () => resolve(null)
        img.src = url
      }), 15000)) || { meta: {} }
    }
    if (kind === 'video') {
      return (await withTimeout(new Promise((resolve) => {
        const v = document.createElement('video')
        v.preload = 'metadata'
        v.muted = true
        v.playsInline = true
        v.onloadedmetadata = () => {
          v.currentTime = Math.min(1.5, (v.duration || 2) / 3)
        }
        v.onseeked = async () => {
          const meta = { duration: v.duration?.toFixed(2), width: v.videoWidth, height: v.videoHeight }
          let thumbnail = null
          try { thumbnail = await drawThumb(v, v.videoWidth, v.videoHeight) } catch { /* */ }
          resolve({ meta, thumbnail })
        }
        v.onerror = () => resolve(null)
        v.src = url
      }), 20000)) || { meta: {} }
    }
    if (kind === 'audio') {
      return (await withTimeout(new Promise((resolve) => {
        const a = document.createElement('audio')
        a.preload = 'metadata'
        a.onloadedmetadata = () => resolve({ meta: { duration: a.duration?.toFixed(2) } })
        a.onerror = () => resolve(null)
        a.src = url
      }), 10000)) || { meta: {} }
    }
    return { meta: {} }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }
}
