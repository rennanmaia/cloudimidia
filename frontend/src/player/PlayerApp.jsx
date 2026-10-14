import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { MonitorPlay, Maximize, Smartphone, Wifi, WifiOff } from 'lucide-react'
import { API_BASE, APP_BASE, RUNTIME } from '../lib/api'
import Stage from './Stage'

/** Rodando dentro do app CloudiMídia Player (Android)? */
const NATIVE = !!(RUNTIME?.native && window.ReactNativeWebView)
const VERSION = NATIVE ? `app-${RUNTIME.appVersion || '?'}` : 'web-1.0.0'
/** Comandos do painel executados pelo app (não pelo navegador) */
const NATIVE_COMMANDS = ['screenshot', 'restart_app', 'update_app', 'update_player', 'sync_media', 'clear_media', 'autostart_on', 'autostart_off']
const LS = {
  key: 'cm_device_key',
  token: 'cm_device_token',
  manifest: 'cm_manifest',
}
const store = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* */ } },
}

/* ---------------- Ponte com o app ---------------- */
const bridge = {
  diag: null,
  post(msg) {
    if (!NATIVE) return
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)) } catch { /* */ }
  },
}
if (NATIVE) {
  window.__cmNative = {
    diag: (d) => { bridge.diag = d },
    ping: (n) => bridge.post({ type: 'pong', n }),
    unpair: () => { store.set(LS.token, null); store.set(LS.manifest, null); window.location.reload() },
  }
}

/**
 * No app, as mídias passam pelo servidor local do aparelho (cache em disco),
 * o que permite exibir tudo sem internet. Retorna também a lista de mídias para baixar.
 */
function localizeManifest(m) {
  if (!m || !NATIVE || !RUNTIME.cacheBase) return { manifest: m, media: [] }
  const media = new Set()
  const loc = (u) => {
    if (!u || !/^https?:\/\//.test(u)) return u
    media.add(u)
    return RUNTIME.cacheBase + encodeURIComponent(u)
  }
  const copy = JSON.parse(JSON.stringify(m))
  if (copy.organization) copy.organization.logo_url = loc(copy.organization.logo_url)
  for (const p of Object.values(copy.playlists || {})) {
    for (const it of p.items || []) if (it.media) { it.media.url = loc(it.media.url); it.media.thumb_url = loc(it.media.thumb_url) }
    for (const sl of p.footer?.slots || []) if (sl.media) sl.media.url = loc(sl.media.url)
  }
  for (const i of Object.values(copy.integrations || {})) for (const t of i.tracks || []) t.url = loc(t.url)
  return { manifest: copy, media: [...media] }
}

function deviceKey() {
  let k = store.get(LS.key)
  if (!k) {
    k = (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`)
    store.set(LS.key, k)
  }
  return k
}

function deviceInfo() {
  return {
    resolution: `${window.screen.width}x${window.screen.height}`,
    platform: navigator.userAgentData?.platform || navigator.platform || '',
    user_agent: navigator.userAgent.slice(0, 250),
    version: VERSION,
    language: navigator.language,
  }
}

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' }
  if (token) headers['X-Device-Token'] = token
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
  let data = null
  try { data = await res.json() } catch { /* */ }
  if (!res.ok) {
    const e = new Error(data?.error || `HTTP ${res.status}`)
    e.status = res.status
    throw e
  }
  return data
}

/* ---------------- Pareamento ---------------- */
function Pairing({ onPaired }) {
  const [code, setCode] = useState(null)
  const [pairUrl, setPairUrl] = useState('')
  const [qr, setQr] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    let timer
    const key = deviceKey()
    bridge.post({ type: 'status', paired: false, token: null, online: true, screenName: null })
    const register = async () => {
      try {
        const r = await call('player/register', { method: 'POST', body: { device_key: key, info: deviceInfo() } })
        if (!alive) return
        setCode(r.code)
        setPairUrl(r.pair_url)
        setError(false)
        QRCode.toDataURL(r.pair_url, { margin: 1, width: 360, color: { dark: '#0f172a', light: '#ffffff' } }).then((d) => alive && setQr(d))
      } catch {
        if (alive) setError(true)
        timer = setTimeout(register, 5000)
        return
      }
      poll()
    }
    const poll = async () => {
      try {
        const r = await call('player/poll', { method: 'POST', body: { device_key: key } })
        if (!alive) return
        if (r.status === 'paired') return onPaired(r.token)
        if (r.status === 'expired' || r.status === 'unknown') return register()
        setError(false)
      } catch {
        if (alive) setError(true)
      }
      timer = setTimeout(poll, 3000)
    }
    register()
    return () => { alive = false; clearTimeout(timer) }
  }, [onPaired])

  const appUrl = APP_BASE.replace(/^https?:\/\//, '').replace(/\/$/, '')

  return (
    <div style={S.pair}>
      <div style={S.glow1} /><div style={S.glow2} />
      <div style={S.pairInner}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.brand}>
            <span style={S.brandIcon}><MonitorPlay size="3.2vmin" color="#fff" /></span>
            Cloud<span style={{ color: '#a5b4fc' }}>Mídia</span>
          </div>
          <h1 style={S.h1}>Conecte esta TV</h1>
          <ol style={S.steps}>
            <li style={S.step}><span style={S.num}>1</span><span>No celular ou computador, acesse <b style={{ color: '#c7d2fe' }}>{appUrl}</b></span></li>
            <li style={S.step}><span style={S.num}>2</span><span>Entre em <b>TVs → Adicionar TV</b></span></li>
            <li style={S.step}><span style={S.num}>3</span><span>Digite o código abaixo ou aponte a câmera para o QR Code</span></li>
          </ol>
          <div style={S.codeRow}>
            {(code || '------').split('').map((d, i) => <span key={i} style={S.digit}>{d}</span>)}
          </div>
          <p style={S.hint}>
            {error ? <><WifiOff size="2.2vmin" style={{ verticalAlign: '-0.3vmin' }} /> Sem conexão com o servidor. Tentando novamente…</> : <><Wifi size="2.2vmin" style={{ verticalAlign: '-0.3vmin' }} /> Aguardando cadastro… a tela muda sozinha.</>}
          </p>
          {NATIVE && <p style={{ ...S.hint, color: '#94a3b8', marginTop: '1.4vmin' }}>Menu de manutenção: segure OK no controle por 2 segundos.</p>}
        </div>
        <div style={S.qrBox}>
          {qr ? <img src={qr} alt="QR Code" style={{ width: '100%', display: 'block', borderRadius: '1.5vmin' }} /> : <div style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>…</div>}
          <p style={S.qrText}><Smartphone size="2.4vmin" style={{ verticalAlign: '-0.4vmin' }} /> Escaneie para cadastrar</p>
          {pairUrl && <p style={{ ...S.qrText, fontSize: '1.5vmin', opacity: 0.5, marginTop: '0.5vmin' }}>Código válido por 1 hora</p>}
        </div>
      </div>
      {!NATIVE && (
        <button type="button" style={S.fsBtn} onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
        <Maximize size="2.2vmin" /> Tela cheia
      </button>
      )}
    </div>
  )
}

/* ---------------- Execução ---------------- */
function Runtime({ token, onUnpaired }) {
  const [manifest, setManifest] = useState(() => {
    try { return JSON.parse(store.get(LS.manifest)) } catch { return null }
  })
  const [online, setOnline] = useState(true)
  const [identify, setIdentify] = useState(false)
  const logs = useRef([])
  const nowPlaying = useRef('')
  const versionRef = useRef(manifest?.version)
  const startedAt = useRef(Date.now())

  const fetchManifest = useCallback(async () => {
    try {
      const m = await call('player/manifest', { token })
      versionRef.current = m.version
      setManifest(m)
      store.set(LS.manifest, JSON.stringify(m))
      setOnline(true)
    } catch (e) {
      if (e.status === 401) onUnpaired()
      else setOnline(false)
    }
  }, [token, onUnpaired])

  const heartbeat = useCallback(async () => {
    const sending = logs.current.splice(0, 200)
    try {
      const r = await call('player/heartbeat', { method: 'POST', token, body: { now_playing: nowPlaying.current, logs: sending, info: deviceInfo(), native: bridge.diag } })
      setOnline(true)
      if (r.version !== versionRef.current) fetchManifest()
      for (const c of r.commands || []) {
        if (NATIVE_COMMANDS.includes(c.command)) bridge.post({ type: 'command', command: c.command })
        if (c.command === 'reload') setTimeout(() => window.location.reload(), 500)
        if (c.command === 'identify') { setIdentify(true); setTimeout(() => setIdentify(false), 12000) }
        if (c.command === 'refresh') fetchManifest()
        if (c.command === 'clear_cache') {
          try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))) } catch { /* */ }
          store.set(LS.manifest, null)
          setTimeout(() => window.location.reload(), 500)
        }
      }
    } catch (e) {
      logs.current.unshift(...sending)
      if (logs.current.length > 2000) logs.current.length = 2000
      if (e.status === 401) onUnpaired()
      else setOnline(false)
    }
  }, [token, fetchManifest, onUnpaired])

  useEffect(() => {
    fetchManifest()
    const hb = setTimeout(heartbeat, 3000)
    const t = setInterval(heartbeat, 15000)
    const m = setInterval(fetchManifest, 10 * 60000)
    // Reinício preventivo diário (de madrugada) para manter a TV estável
    const daily = setInterval(() => {
      if (Date.now() - startedAt.current > 20 * 3600e3 && new Date().getHours() === 4) window.location.reload()
    }, 10 * 60000)
    return () => { clearTimeout(hb); clearInterval(t); clearInterval(m); clearInterval(daily) }
  }, [fetchManifest, heartbeat])

  const fetchData = useCallback((id) => call(`player/integrations/${id}`, { token }), [token])

  // App: mídias pelo cache local + estado para o menu de manutenção
  const view = useMemo(() => localizeManifest(manifest), [manifest])
  useEffect(() => { if (view.media.length) bridge.post({ type: 'manifest', media: view.media }) }, [view])
  useEffect(() => {
    bridge.post({ type: 'status', paired: true, token, online, screenName: manifest?.screen?.name || null })
  }, [token, online, manifest?.screen?.name])
  const onPlayed = useCallback((log) => { logs.current.push(log); if (logs.current.length > 2000) logs.current.shift() }, [])
  const onNowPlaying = useCallback((name) => { nowPlaying.current = name || '' }, [])

  if (!manifest) {
    return <div style={{ ...S.full, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontFamily: 'Inter, sans-serif', fontSize: '2.4vmin' }}>Carregando programação…</div>
  }

  const rotation = manifest.screen?.rotation || 0
  const rotated = rotation === 90 || rotation === 270
  const wrapStyle = rotation
    ? { position: 'absolute', top: '50%', left: '50%', width: rotated ? '100vh' : '100vw', height: rotated ? '100vw' : '100vh', transform: `translate(-50%, -50%) rotate(${rotation}deg)` }
    : { position: 'absolute', inset: 0 }

  return (
    <div style={S.full}>
      <div style={wrapStyle}>
        {manifest.screen?.is_active ? (
          <Stage manifest={view.manifest} fetchData={fetchData} onPlayed={onPlayed} onNowPlaying={onNowPlaying} identify={identify} />
        ) : (
          <div className="cm-stage cm-off">
            {identify && <div className="cm-identify"><small>Esta TV é</small><b>{manifest.screen?.name}</b></div>}
          </div>
        )}
        {!online && <div className="cm-offline-dot" title="Sem conexão — exibindo a última programação recebida" style={{ position: 'absolute' }} />}
      </div>
    </div>
  )
}

/** Lê ?instalar=TOKEN da URL (link de instalação gerado no painel). */
function installTokenFromUrl() {
  try { return new URLSearchParams(window.location.search).get('instalar') } catch { return null }
}

function Installing({ error, onSkip }) {
  return (
    <div style={{ ...S.pair, flexDirection: 'column', gap: '3vmin', textAlign: 'center', padding: '6vmin' }}>
      <div style={S.brand}><span style={S.brandIcon}><MonitorPlay size="3.2vmin" color="#fff" /></span>Cloud<span style={{ color: '#a5b4fc' }}>Mídia</span></div>
      {error ? (
        <>
          <h1 style={{ ...S.h1, fontSize: '5vmin', margin: 0 }}>Não foi possível instalar</h1>
          <p style={{ fontSize: '2.6vmin', color: '#fecaca', maxWidth: '110vmin', margin: 0 }}>{error}</p>
          <button type="button" style={{ ...S.fsBtn, position: 'static', fontSize: '2.4vmin', padding: '1.6vmin 3vmin' }} onClick={onSkip}>Usar código de cadastro</button>
        </>
      ) : (
        <>
          <div className="cm-spinner" style={{ width: '7vmin', height: '7vmin', borderRadius: '50%', border: '0.8vmin solid rgba(255,255,255,.15)', borderTopColor: '#818cf8', animation: 'cm-spin 1s linear infinite' }} />
          <h1 style={{ ...S.h1, fontSize: '5vmin', margin: 0 }}>Instalando esta TV…</h1>
        </>
      )}
    </div>
  )
}

export default function PlayerApp() {
  const [token, setToken] = useState(() => store.get(LS.token))
  const [install, setInstall] = useState(() => (installTokenFromUrl() ? { error: null } : null))

  // Instalação por link: conecta o aparelho à TV já cadastrada, sem código
  useEffect(() => {
    const t = installTokenFromUrl()
    if (!t) return
    const clearUrl = () => window.history.replaceState(null, '', window.location.pathname)
    call('player/install', { method: 'POST', body: { token: t, info: deviceInfo() } })
      .then((r) => {
        store.set(LS.manifest, null)
        store.set(LS.token, r.token)
        setToken(r.token)
        setInstall(null)
        clearUrl()
      })
      .catch((e) => {
        clearUrl()
        // Se o aparelho já estava instalado (link aberto de novo), segue exibindo normalmente
        if (store.get(LS.token)) setInstall(null)
        else setInstall({ error: e.status ? e.message : 'Sem conexão com o servidor. Verifique a internet da TV e abra o link novamente.' })
      })
  }, [])

  // Mantém a tela ligada e esconde o cursor
  useEffect(() => {
    let lock = null
    const req = async () => { try { lock = await navigator.wakeLock?.request('screen') } catch { /* */ } }
    req()
    const onVis = () => document.visibilityState === 'visible' && req()
    document.addEventListener('visibilitychange', onVis)
    let t
    const showCursor = () => {
      document.body.style.cursor = 'default'
      clearTimeout(t)
      t = setTimeout(() => { document.body.style.cursor = 'none' }, 3000)
    }
    window.addEventListener('mousemove', showCursor)
    showCursor()
    // Qualquer toque/tecla libera som bloqueado pelo navegador
    const unlock = () => document.querySelectorAll('[data-sound="1"]').forEach((m) => { m.muted = false; m.play?.().catch(() => {}) })
    window.addEventListener('keydown', unlock)
    window.addEventListener('click', unlock)
    return () => {
      lock?.release?.()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('mousemove', showCursor)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('click', unlock)
    }
  }, [])

  // Aparelhos com toque: 5 toques rápidos abrem o menu de manutenção do app
  useEffect(() => {
    if (!NATIVE) return
    let taps = []
    const onTap = () => {
      const now = Date.now()
      taps = [...taps.filter((t) => now - t < 3000), now]
      if (taps.length >= 5) { taps = []; bridge.post({ type: 'open_menu' }) }
    }
    window.addEventListener('pointerdown', onTap)
    return () => window.removeEventListener('pointerdown', onTap)
  }, [])

  const onPaired = useCallback((t) => { store.set(LS.token, t); setToken(t) }, [])
  const onUnpaired = useCallback(() => { store.set(LS.token, null); store.set(LS.manifest, null); setToken(null) }, [])

  if (install) return <Installing error={install.error} onSkip={() => setInstall(null)} />
  return token ? <Runtime key={token} token={token} onUnpaired={onUnpaired} /> : <Pairing onPaired={onPaired} />
}

const S = {
  full: { position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' },
  pair: { position: 'fixed', inset: 0, overflow: 'hidden', background: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 55%,#312e81 100%)', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  glow1: { position: 'absolute', width: '70vmin', height: '70vmin', borderRadius: '50%', background: 'rgba(99,102,241,.35)', filter: 'blur(12vmin)', top: '-25vmin', right: '-15vmin' },
  glow2: { position: 'absolute', width: '60vmin', height: '60vmin', borderRadius: '50%', background: 'rgba(168,85,247,.25)', filter: 'blur(12vmin)', bottom: '-25vmin', left: '-10vmin' },
  pairInner: { position: 'relative', display: 'flex', alignItems: 'center', gap: '7vmin', width: 'min(92vw, 160vmin)', padding: '4vmin', flexWrap: 'wrap', justifyContent: 'center' },
  brand: { display: 'flex', alignItems: 'center', gap: '1.6vmin', fontSize: '3.6vmin', fontWeight: 800, letterSpacing: '-0.02em' },
  brandIcon: { display: 'inline-flex', padding: '1.2vmin', borderRadius: '1.6vmin', background: 'linear-gradient(135deg,#6366f1,#a855f7)' },
  h1: { fontSize: '7.5vmin', fontWeight: 800, letterSpacing: '-0.03em', margin: '4vmin 0 3vmin', lineHeight: 1.05 },
  steps: { listStyle: 'none', padding: 0, margin: '0 0 4.5vmin', display: 'grid', gap: '1.8vmin' },
  step: { display: 'flex', alignItems: 'center', gap: '1.8vmin', fontSize: '2.7vmin', color: '#e2e8f0' },
  num: { flexShrink: 0, width: '4.4vmin', height: '4.4vmin', borderRadius: '50%', background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '2.2vmin' },
  codeRow: { display: 'flex', gap: '1.6vmin' },
  digit: { width: '10vmin', height: '13vmin', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8.5vmin', fontWeight: 800, borderRadius: '2vmin', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.22)', fontVariantNumeric: 'tabular-nums', boxShadow: '0 2vmin 5vmin rgba(0,0,0,.25)' },
  hint: { marginTop: '3.5vmin', fontSize: '2.2vmin', color: '#a5b4fc' },
  qrBox: { width: '36vmin', background: '#fff', padding: '2.4vmin', borderRadius: '3vmin', boxShadow: '0 4vmin 10vmin rgba(0,0,0,.45)' },
  qrText: { margin: '1.8vmin 0 0', textAlign: 'center', color: '#0f172a', fontSize: '2.1vmin', fontWeight: 700 },
  fsBtn: { position: 'absolute', right: '3vmin', bottom: '3vmin', display: 'inline-flex', alignItems: 'center', gap: '1vmin', padding: '1.4vmin 2.4vmin', borderRadius: '99px', border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: '1.9vmin', fontWeight: 600, cursor: 'pointer' },
}
