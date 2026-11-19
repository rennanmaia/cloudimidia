import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { APP_BASE } from '../lib/api'

/*
 * Trilha sonora da TV: toca em segundo plano enquanto as propagandas passam.
 * Regras para nunca atrapalhar a programação:
 * - roda separada das propagandas (falha aqui não mexe no palco);
 * - sem internet, desliga e volta sozinha quando a conexão retorna;
 * - se a fonte falhar, espera um tempo crescente (1, 2, 5, 10 min) antes de tentar de novo;
 * - pausa quando a TV está sem som ou quando a propaganda tem som (se configurado).
 */

const BACKOFF = [60e3, 120e3, 300e3, 600e3]

/* ---------- Carregamento das bibliotecas das plataformas (com tempo limite) ---------- */
const scripts = {}
function loadScript(src, ready, timeout = 15000) {
  if (!scripts[src]) {
    scripts[src] = new Promise((resolve, reject) => {
      const t = setTimeout(() => { delete scripts[src]; reject(new Error('tempo esgotado')) }, timeout)
      ready((api) => { clearTimeout(t); resolve(api) })
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onerror = () => { clearTimeout(t); delete scripts[src]; s.remove(); reject(new Error('sem conexão')) }
      document.head.appendChild(s)
    })
  }
  return scripts[src]
}
const loadSoundCloud = () => (window.SC?.Widget ? Promise.resolve(window.SC) : loadScript('https://w.soundcloud.com/player/api.js', (done) => {
  const check = setInterval(() => { if (window.SC?.Widget) { clearInterval(check); done(window.SC) } }, 200)
}))
const loadSpotify = () => loadScript('https://open.spotify.com/embed/iframe-api/v1', (done) => {
  window.onSpotifyIframeApiReady = (api) => done(api)
})

/** Verifica de tempos em tempos se está tocando; tenta retomar e, se não der, desiste (a trilha espera e tenta depois). */
function useWatchdog(isPlaying, retry, onFail, active, label) {
  const stuck = useRef(0)
  useEffect(() => {
    if (!active) { stuck.current = 0; return }
    const t = setInterval(() => {
      if (isPlaying()) { stuck.current = 0; return }
      stuck.current += 10
      if (stuck.current === 20 || stuck.current === 40) retry()
      if (stuck.current >= 60) onFail(`${label} parou de tocar`)
    }, 10000)
    return () => clearInterval(t)
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps
}

/* ---------- YouTube (vídeo, playlist ou ao vivo) ---------- */
const YT_ERRORS = {
  2: 'link do YouTube inválido',
  5: 'o vídeo não toca neste aparelho',
  100: 'vídeo removido ou privado',
  101: 'o dono do vídeo não permite tocar fora do YouTube',
  150: 'o dono do vídeo não permite tocar fora do YouTube',
  153: 'o YouTube recusou o player',
}

/*
 * O player do YouTube roda numa página do próprio sistema (public/yt-relay.html), não aqui:
 * o YouTube recusa tocar quando a página em volta é um IP, como o servidor local do app (127.0.0.1).
 */
function relayUrl(cfg, paused) {
  const s = cfg.source
  const q = new URLSearchParams({ vol: String(cfg.volume), shuffle: cfg.shuffle ? '1' : '0', paused: paused ? '1' : '0' })
  if (s.list_id) q.set('list', s.list_id)
  else q.set('v', s.video_id)
  return `${APP_BASE}public/yt-relay.html?${q}`
}

/** Próxima/anterior pedida pelo controle remoto: { cmd: 'next' | 'prev', n } (n muda a cada pedido). */
function useSkip(control, fn) {
  useEffect(() => { if (control?.n) fn(control.cmd) }, [control?.n]) // eslint-disable-line react-hooks/exhaustive-deps
}

function YouTubeTrack({ cfg, paused, onFail, onPlaying, onTitle, control }) {
  const frame = useRef(null)
  const state = useRef(null)
  const [src] = useState(() => relayUrl(cfg, paused))
  const send = (cmd, value) => { try { frame.current?.contentWindow?.postMessage({ type: 'cm-yt', cmd, value }, '*') } catch { /* */ } }

  useEffect(() => {
    const onMessage = (e) => {
      const m = e.data
      if (!m || m.type !== 'cm-yt' || e.source !== frame.current?.contentWindow) return
      if (m.event === 'state') {
        state.current = m.state
        if (m.state === 1) { onPlaying(); onTitle(m.title || '') }
      } else if (m.event === 'error') {
        onFail(`YouTube: ${m.code === 'load' ? 'sem conexão' : YT_ERRORS[m.code] || `erro ${m.code}`}`)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onFail, onPlaying, onTitle])

  useEffect(() => { send(paused ? 'pause' : 'play') }, [paused])
  useEffect(() => { send('volume', cfg.volume) }, [cfg.volume])
  useSkip(control, (cmd) => send(cmd))

  useWatchdog(
    () => state.current === 1 || state.current === 3,
    () => send('play'),
    (why) => onFail(state.current === -1 || state.current === 5 ? 'YouTube: o vídeo não começou a tocar' : state.current == null ? 'YouTube: o player não carregou' : why),
    !paused,
    'YouTube',
  )
  return <iframe ref={frame} src={src} title="" allow="autoplay; encrypted-media" className="cm-st-frame" tabIndex={-1} />
}

/* ---------- SoundCloud ---------- */
function SoundCloudTrack({ cfg, paused, onFail, onPlaying, onTitle, control }) {
  const frame = useRef(null)
  const widget = useRef(null)
  const playing = useRef(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(cfg.source.url)}&auto_play=true&hide_related=true&show_comments=false&visual=false&buying=false&sharing=false&download=false&show_artwork=false`

  useEffect(() => {
    let dead = false
    loadSoundCloud().then((SC) => {
      if (dead || !frame.current) return
      const w = SC.Widget(frame.current)
      widget.current = w
      const E = SC.Widget.Events
      w.bind(E.READY, () => {
        w.setVolume(cfg.volume)
        w.getSounds((list) => {
          if (cfg.shuffle && list?.length > 1) w.skip(Math.floor(Math.random() * list.length))
          if (!pausedRef.current) w.play()
        })
      })
      w.bind(E.PLAY, () => {
        playing.current = true
        onPlaying()
        w.getCurrentSound((s) => onTitle(s?.title || ''))
      })
      w.bind(E.PAUSE, () => { playing.current = false })
      w.bind(E.FINISH, () => {
        playing.current = false
        w.getSounds((list) => w.getCurrentSoundIndex((i) => {
          // Fim da lista ou música única: recomeça
          if (!list || list.length <= 1) { w.seekTo(0); w.play() } else if (i >= list.length - 1) w.skip(cfg.shuffle ? Math.floor(Math.random() * list.length) : 0)
        }))
      })
      w.bind(E.ERROR, () => onFail('SoundCloud: não foi possível tocar este link'))
    }).catch((e) => !dead && onFail(`SoundCloud: ${e.message}`))
    return () => { dead = true; widget.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { try { paused ? widget.current?.pause() : widget.current?.play() } catch { /* */ } }, [paused])
  useEffect(() => { try { widget.current?.setVolume(cfg.volume) } catch { /* */ } }, [cfg.volume])
  useSkip(control, (cmd) => { try { cmd === 'next' ? widget.current?.next() : widget.current?.prev() } catch { /* */ } })
  useWatchdog(() => playing.current, () => { try { widget.current?.play() } catch { /* */ } }, onFail, !paused, 'SoundCloud')
  return <iframe ref={frame} src={src} title="" allow="autoplay" className="cm-st-hidden" tabIndex={-1} />
}

/* ---------- Spotify (sem conta conectada, a própria plataforma toca trechos de 30 s) ---------- */
function SpotifyTrack({ cfg, paused, onFail, onPlaying }) {
  const host = useRef(null)
  const ctrl = useRef(null)
  const playing = useRef(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  useEffect(() => {
    let dead = false
    loadSpotify().then((API) => {
      if (dead || !host.current) return
      const el = document.createElement('div')
      host.current.appendChild(el)
      API.createController(el, { uri: `spotify:${cfg.source.kind}:${cfg.source.id}`, width: '100%', height: 152 }, (c) => {
        if (dead) { c.destroy?.(); return }
        ctrl.current = c
        c.addListener('ready', () => { if (!pausedRef.current) c.play() })
        c.addListener('playback_update', (e) => {
          playing.current = !e.data.isPaused && !e.data.isBuffering
          if (playing.current) onPlaying()
        })
      })
    }).catch((e) => !dead && onFail(`Spotify: ${e.message}`))
    return () => {
      dead = true
      try { ctrl.current?.destroy?.() } catch { /* */ }
      ctrl.current = null
      if (host.current) host.current.innerHTML = ''
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { paused ? ctrl.current?.pause() : ctrl.current?.resume() } catch { /* */ } }, [paused])
  useWatchdog(() => playing.current, () => { try { ctrl.current?.resume() } catch { /* */ } }, onFail, !paused, 'Spotify')
  return <div ref={host} className="cm-st-hidden" />
}

/* ---------- Deezer (widget; sem conta conectada toca trechos de 30 s) ---------- */
function DeezerTrack({ cfg, paused }) {
  // O widget não aceita comandos: pausar = tirar da tela (volta do início da lista)
  if (paused) return null
  const s = cfg.source
  return <iframe src={`https://widget.deezer.com/widget/dark/${s.kind}/${s.id}?autoplay=true&tracklist=false&radius=false`} title="" allow="autoplay; encrypted-media" className="cm-st-hidden" tabIndex={-1} />
}

/* ---------- Rádio / áudio online ---------- */
function StreamTrack({ cfg, paused, onFail, onPlaying }) {
  const ref = useRef(null)
  const last = useRef({ t: -1 })
  useEffect(() => {
    const a = ref.current
    if (!a) return
    a.volume = cfg.volume / 100
    if (paused) a.pause()
    else a.play().catch(() => { /* o vigia tenta de novo */ })
  }, [paused, cfg.volume])
  useWatchdog(
    () => { const a = ref.current; const moving = a && !a.paused && a.currentTime !== last.current.t; last.current.t = a?.currentTime; return moving },
    () => { const a = ref.current; if (a) { a.load(); a.play().catch(() => {}) } },
    onFail,
    !paused,
    'A rádio',
  )
  return (
    <audio
      ref={ref}
      src={cfg.source.url}
      autoPlay={!paused}
      preload="none"
      onPlaying={onPlaying}
      onError={() => onFail('A rádio não respondeu')}
    />
  )
}

const PROVIDERS = { youtube: YouTubeTrack, soundcloud: SoundCloudTrack, spotify: SpotifyTrack, deezer: DeezerTrack, stream: StreamTrack }

/**
 * O que fazer quando a propaganda tem som: 'mute_ads' (tira o som da propaganda), 'pause_music' ou 'both'.
 * Configurações antigas (pause_on_ad_sound) continuam como eram.
 */
export function adAudioMode(cfg) {
  if (!cfg) return 'both'
  if (cfg.ad_audio) return cfg.ad_audio
  return cfg.pause_on_ad_sound === false ? 'both' : 'pause_music'
}

const VOLUME_KEY = 'cm_st_volume'
const readVolume = (url) => { try { const v = JSON.parse(localStorage.getItem(VOLUME_KEY) || 'null'); return v?.url === url ? v.value : null } catch { return null } }
const saveVolume = (url, value) => { try { localStorage.setItem(VOLUME_KEY, JSON.stringify({ url, value })) } catch { /* */ } }

export default function Soundtrack({ config, muted, adSound, online, onIssue, onStatus }) {
  const [netOk, setNetOk] = useState(() => navigator.onLine !== false)
  const [retryAt, setRetryAt] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [title, setTitle] = useState('')
  const [showVideo, setShowVideo] = useState(false)
  const [playingSince, setPlayingSince] = useState(null)
  const [lastError, setLastError] = useState('')
  const fails = useRef(0)
  // Controle remoto (celular)
  const [userPaused, setUserPaused] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [control, setControl] = useState(null)
  const [volume, setVolume] = useState(() => readVolume(config?.url))

  // Falha passageira do servidor não interrompe a música: só desliga após 30 s sem conexão
  const [serverOk, setServerOk] = useState(online)
  useEffect(() => {
    if (online) { setServerOk(true); return }
    const t = setTimeout(() => setServerOk(false), 30000)
    return () => clearTimeout(t)
  }, [online])

  useEffect(() => {
    const on = () => setNetOk(true)
    const off = () => setNetOk(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Trocou a trilha no painel: volta ao estado normal
  useEffect(() => {
    setUserPaused(false)
    setStopped(false)
    setVolume(readVolume(config?.url))
    setTitle('')
  }, [config?.url])

  // Depois de uma falha, espera e tenta de novo (remonta o player)
  useEffect(() => {
    if (!retryAt) return
    const t = setTimeout(() => { setRetryAt(0); setAttempt((n) => n + 1) }, Math.max(0, retryAt - Date.now()))
    return () => clearTimeout(t)
  }, [retryAt])

  const onFail = useCallback((detail) => {
    setLastError(detail)
    setRetryAt((cur) => {
      if (cur) return cur
      const wait = BACKOFF[Math.min(fails.current, BACKOFF.length - 1)]
      fails.current++
      onIssue?.({ media_id: null, integration_id: null, reason: 'soundtrack', detail: `${detail}. Nova tentativa em ${Math.round(wait / 60000)} min.`, at: Date.now() })
      return Date.now() + wait
    })
    setPlayingSince(null)
    setShowVideo(false)
  }, [onIssue])
  const onPlaying = useCallback(() => { setPlayingSince((t) => t || Date.now()); setLastError('') }, [])

  // Comandos do controle remoto
  useEffect(() => {
    const onCommand = (e) => {
      const { cmd, value } = e.detail || {}
      if (cmd === 'play') {
        setUserPaused(false)
        setStopped(false)
        // Estava esperando para tentar de novo: tenta já
        setRetryAt((cur) => { if (cur) { fails.current = 0; setAttempt((n) => n + 1) } return 0 })
      } else if (cmd === 'pause') {
        setUserPaused(true)
      } else if (cmd === 'stop') {
        setStopped(true)
        setPlayingSince(null)
        setShowVideo(false)
      } else if (cmd === 'next' || cmd === 'prev') {
        setUserPaused(false)
        setControl({ cmd, n: Date.now() })
      } else if (cmd === 'volume' && Number.isFinite(Number(value))) {
        const v = Math.max(0, Math.min(100, Number(value)))
        setVolume(v)
        saveVolume(config?.url, v)
      }
    }
    window.addEventListener('cm-soundtrack', onCommand)
    return () => window.removeEventListener('cm-soundtrack', onCommand)
  }, [config?.url])

  // Tocando bem por 5 min: zera a contagem de falhas
  useEffect(() => {
    if (!playingSince) return
    const t = setTimeout(() => { fails.current = 0 }, 5 * 60000)
    return () => clearTimeout(t)
  }, [playingSince])

  const provider = config?.source?.provider
  const cfg = useMemo(() => (config ? { ...config, volume: volume ?? config.volume } : config), [config, volume])
  const active = !!PROVIDERS[provider] && serverOk && netOk && !muted && !retryAt && !stopped
  const adPaused = adAudioMode(config) === 'pause_music' && adSound
  const paused = userPaused || adPaused

  // Sem internet ou parada: zera o estado para recomeçar limpo
  useEffect(() => { if (!active) { setPlayingSince(null); setShowVideo(false) } }, [active])

  // Situação para o controle remoto (vai junto com o heartbeat)
  const canSkip = (provider === 'youtube' && !!config?.source?.list_id) || provider === 'soundcloud'
  const state = muted ? 'muted'
    : stopped ? 'stopped'
      : !netOk || !serverOk ? 'offline'
        : retryAt ? 'error'
          : userPaused ? 'paused'
            : adPaused ? 'ad'
              : playingSince ? 'playing' : 'loading'
  useEffect(() => {
    onStatus?.({ state, title, can_skip: canSkip, can_pause: true, volume: cfg?.volume ?? null, detail: state === 'error' ? lastError : '' })
  }, [state, title, canSkip, cfg?.volume, lastError, onStatus])
  useEffect(() => () => onStatus?.(null), [onStatus])

  // Miniatura do vídeo de tempos em tempos (YouTube)
  // Conta pelo relógio (as pausas das propagandas com som não zeram a contagem)
  const withVideo = provider === 'youtube' && config.video_mode !== 'off'
  const lastShown = useRef(0)
  useEffect(() => {
    if (!withVideo || !active || paused || !playingSince) { setShowVideo(false); return }
    if (!lastShown.current) lastShown.current = playingSince
    const every = Math.max(1, config.video_every) * 60000
    const t = setInterval(() => {
      const since = Date.now() - lastShown.current
      if (since >= every) {
        lastShown.current = Date.now()
        setShowVideo(true)
      } else if (since >= config.video_for * 1000) {
        setShowVideo(false)
      }
    }, 1000)
    return () => clearInterval(t)
  }, [withVideo, active, paused, playingSince, config?.video_every, config?.video_for])

  if (!active) return null
  const Track = PROVIDERS[provider]
  const box = withVideo ? `cm-st-mini cm-st-${config.video_mode} cm-st-${config.corner}${showVideo ? ' on' : ''}` : 'cm-st-mini cm-st-audio'
  return (
    <div className={box} aria-hidden={!showVideo} data-state={state}>
      <Track key={`${config.url}#${attempt}`} cfg={cfg} paused={paused} onFail={onFail} onPlaying={onPlaying} onTitle={setTitle} control={control} />
      {withVideo && title && <div className="cm-st-title"><span>♪</span>{title}</div>}
    </div>
  )
}
