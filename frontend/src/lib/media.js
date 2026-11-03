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

/** Procura o codec do vídeo no cabeçalho MP4/MOV (início e fim do arquivo, onde fica o "moov"). */
async function sniffCodec(file) {
  const read = async (start, end) => new TextDecoder('latin1').decode(await file.slice(start, end).arrayBuffer())
  try {
    const n = 2 * 1024 * 1024
    const text = (await read(0, n)) + (file.size > n ? await read(Math.max(n, file.size - n), file.size) : '')
    if (/hvc1|hev1/.test(text)) return { codec: 'hevc' }
    if (/av01/.test(text)) return { codec: 'av1' }
    if (/vp09/.test(text)) return { codec: 'vp9' }
    // avcC: versão, perfil, compatibilidade, nível (ex.: 40 = 4.0, 50 = 5.0)
    const i = text.indexOf('avcC')
    if (i >= 0) return { codec: 'h264', profile: text.charCodeAt(i + 5), level: text.charCodeAt(i + 7) / 10 }
    if (/avc1/.test(text)) return { codec: 'h264' }
  } catch { /* */ }
  return null
}

/**
 * Avisos para vídeos que costumam travar ou não abrir em TVs e TV boxes.
 * Não impede o envio.
 */
export async function videoWarnings(file, meta) {
  const out = []
  const w = Number(meta?.width) || 0
  const h = Number(meta?.height) || 0
  const duration = Number(meta?.duration) || 0
  const info = /\.(mp4|m4v|mov)$/i.test(file.name) || /mp4|quicktime/.test(file.type) ? await sniffCodec(file) : null
  const codec = info?.codec
  if (codec === 'hevc') out.push('Vídeo em H.265 (HEVC): muitas TVs e boxes não abrem. Prefira H.264.')
  if (codec === 'av1') out.push('Vídeo em AV1: a maioria das TVs não abre. Prefira H.264.')
  if (codec === 'h264' && info.level > 4.2 && Math.max(w, h) <= 1920) {
    out.push(`Vídeo H.264 nível ${info.level.toFixed(1)} (configuração de 4K): TV boxes costumam falhar. Exporte em H.264 nível 4.0 ou 4.1.`)
  }
  if (codec === 'h264' && info.profile >= 110) out.push('Vídeo H.264 de 10 bits ou 4:2:2: a maioria das TVs não abre. Exporte em 8 bits (perfil High).')
  if (!w && !h) out.push('O navegador não conseguiu ler este vídeo; a TV também pode não conseguir. Prefira MP4 em H.264.')
  if (Math.max(w, h) > 1920) out.push(`Resolução ${w}×${h} (acima de Full HD): pesada para TV boxes. Prefira 1920×1080.`)
  if (duration > 0) {
    const mbps = (file.size * 8) / duration / 1e6
    if (mbps > 12) out.push(`Taxa de ${mbps.toFixed(0)} Mbit/s: alta para TVs. Até 8 Mbit/s é o ideal.`)
  }
  return out
}

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
