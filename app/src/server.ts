import { Device } from './native'

export async function fetchJson<T = any>(url: string, opts: RequestInit & { timeout?: number } = {}): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), opts.timeout ?? 15000)
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { Accept: 'application/json', ...(opts.headers || {}) } })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
    return data as T
  } finally {
    clearTimeout(t)
  }
}

export const apiUrl = (server: string, path: string) => `${server.replace(/\/+$/, '')}/api/${path}`

/** Testa se o endereço responde como um servidor CloudiMídia. */
export async function testServer(server: string): Promise<boolean> {
  try {
    const r = await fetchJson(apiUrl(server, 'health'), { timeout: 8000 })
    return !!r?.ok
  } catch {
    return false
  }
}

/** Baixa uma versão nova do player, se houver. Retorna true quando atualizou. */
export async function checkPlayerUpdate(server: string, current: string): Promise<boolean> {
  const r = await fetchJson<{ version: string; files: { path: string; url: string }[] }>(apiUrl(server, 'player/bundle'))
  if (!r?.version || !r.files?.length || r.version === current) return false
  await Device.updatePlayerBundle(r.files, r.version)
  return true
}

export type AppRelease = { version_code: number; version_name: string; url: string }

/** Verifica e instala uma versão nova do app. Retorna a versão instalada (ou null). */
export async function checkAppUpdate(server: string, currentCode: number): Promise<AppRelease | null> {
  const r = await fetchJson<{ release: AppRelease | null }>(apiUrl(server, 'player/app'))
  if (!r?.release || r.release.version_code <= currentCode) return null
  Device.logEvent(`Baixando atualização do app ${r.release.version_name}`)
  await Device.installApk(r.release.url)
  return r.release
}

/** Envia a captura de tela para o painel (autenticado com o token do aparelho). */
export async function uploadScreenshot(server: string, token: string, image: string) {
  return fetchJson(apiUrl(server, 'player/screenshot'), {
    method: 'POST',
    timeout: 60000,
    headers: { 'Content-Type': 'application/json', 'X-Device-Token': token },
    body: JSON.stringify({ image }),
  })
}
