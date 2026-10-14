// Configuração injetada pelo app da TV (CloudiMídia Player), quando o player roda dentro dele
export const RUNTIME = (typeof window !== 'undefined' && window.__CM_CONFIG__) || null

// Endereço da API: app da TV > variável de build > proxy do Vite (dev) > pasta api/ ao lado do build
export const API_BASE = RUNTIME?.apiBase || import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api/' : new URL('../api/', import.meta.url).href)
export const APP_BASE = RUNTIME?.appBase || new URL('../', API_BASE.startsWith('http') ? API_BASE : window.location.origin + API_BASE).href

// Endereço que deve ser aberto no navegador da TV
export const TV_URL = import.meta.env.DEV ? `${window.location.origin}/tv.html` : `${APP_BASE}tv`

const TOKEN_KEY = 'cm_token'

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message)
    this.status = status
    this.errors = errors || {}
  }
}

export async function request(path, { method = 'GET', body, headers = {}, auth = true, signal } = {}) {
  const opts = { method, headers: { Accept: 'application/json', ...headers }, signal }
  const token = auth ? getToken() : null
  if (token) opts.headers.Authorization = `Bearer ${token}`
  if (body instanceof FormData) {
    opts.body = body
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(API_BASE + path.replace(/^\//, ''), opts)
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError('Sem conexão com o servidor. Verifique sua internet.', 0)
  }
  let data = null
  try { data = await res.json() } catch { /* resposta vazia */ }
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event('auth:expired'))
    throw new ApiError(data?.error || `Erro ${res.status}`, res.status, data?.errors)
  }
  return data
}

export const api = {
  get: (p, o) => request(p, { ...o, method: 'GET' }),
  post: (p, body, o) => request(p, { ...o, method: 'POST', body }),
  put: (p, body, o) => request(p, { ...o, method: 'PUT', body }),
  del: (p, o) => request(p, { ...o, method: 'DELETE' }),
}

/** Envio de arquivo em partes, com progresso (0..1). */
export function uploadChunked(orgId, file, { meta = {}, thumbnail, onProgress, chunkSize = 4 * 1024 * 1024, endpoint } = {}) {
  const target = endpoint || `orgs/${orgId}/media/upload`
  const uploadId = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '')
  const total = Math.max(1, Math.ceil(file.size / chunkSize))
  let cancelled = false
  let xhr = null

  const sendChunk = (index) => new Promise((resolve, reject) => {
    const start = index * chunkSize
    const blob = file.slice(start, Math.min(file.size, start + chunkSize))
    const fd = new FormData()
    fd.append('upload_id', uploadId)
    fd.append('chunk_index', String(index))
    fd.append('total_chunks', String(total))
    fd.append('total_size', String(file.size))
    fd.append('name', file.name)
    fd.append('file', blob, 'chunk')
    if (index === total - 1) {
      Object.entries(meta).forEach(([k, v]) => v != null && fd.append(k, String(v)))
      if (thumbnail) fd.append('thumbnail', thumbnail, 'thumb.jpg')
    }
    xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}${target}`)
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.((start + e.loaded * (blob.size / e.total)) / file.size)
    }
    xhr.onload = () => {
      let data = null
      try { data = JSON.parse(xhr.responseText) } catch { /* */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new ApiError(data?.error || `Erro ${xhr.status}`, xhr.status))
    }
    xhr.onerror = () => reject(new ApiError('Falha de conexão durante o envio.', 0))
    xhr.onabort = () => reject(new ApiError('Envio cancelado.', -1))
    xhr.send(fd)
  })

  const promise = (async () => {
    let result
    for (let i = 0; i < total; i++) {
      if (cancelled) throw new ApiError('Envio cancelado.', -1)
      let attempts = 0
      for (;;) {
        try { result = await sendChunk(i); break } catch (e) {
          if (e.status !== 0 || ++attempts >= 3) throw e
          await new Promise((r) => setTimeout(r, 1500 * attempts))
        }
      }
    }
    onProgress?.(1)
    return result
  })()

  return { promise, cancel: () => { cancelled = true; xhr?.abort() } }
}
