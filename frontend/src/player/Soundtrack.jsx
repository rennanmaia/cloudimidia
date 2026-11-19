import { useCallback, useEffect, useRef, useState } from 'react'

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
const loadYouTube = () => (window.YT?.Player ? Promise.resolve(window.YT) : loadScript('https://www.youtube.com/iframe_api', (done) => {
  const prev = window.onYouTubeIframeAPIReady
  window.onYouTubeIframeAPIReady = () => { prev?.(); done(window.YT) }
}))
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

function YouTubeTrack({ cfg, paused, onFail, onPlaying, onTitle }) {
  const host = useRef(null)
  const player = useRef(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    let dead = false
    let errors = 0
    const s = cfg.source
    loadYouTube().then((YT) => {
      if (dead || !host.current) return
      const el = document.createElement('div')
      host.current.appendChild(el)
      // Sem autoplay do próprio YouTube: quem manda tocar ou pausar é a TV
      const vars = { autoplay: 0, controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, playsinline: 1, origin: window.location.origin }
      if (s.list_id) Object.assign(vars, { listType: 'playlist', list: s.list_id })
      else Object.assign(vars, { loop: 1, playlist: s.video_id })
      player.current = new YT.Player(el, {
        width: '100%',
        height: '100%',
        ...(s.list_id ? {} : { videoId: s.video_id }),
        playerVars: vars,
        events: {
          onReady: (e) => {
            const p = e.target
            p.setVolume(cfg.volume)
            if (s.list_id) {
              p.setLoop(true)
              if (cfg.shuffle) { p.setShuffle(true); p.playVideoAt(0) }
            }
            if (!pausedRef.current) p.playVideo()
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) {
              // Começou sozinho (ex.: próximo vídeo da lista) durante uma propaganda com som
              if (pausedRef.current) { e.target.pauseVideo(); return }
              errors = 0
              onPlaying()
              onTitle(e.target.getVideoData?.()?.title || '')
            }
            if (e.data === YT.PlayerState.ENDED && !s.list_id) { e.target.seekTo(0); e.target.playVideo() }
          },
          onError: (e) => {
            errors++
            // Numa playlist, pula o vídeo com problema; desiste se vários seguidos falharem
            if (s.list_id && errors < 5) e.target.nextVideo()
            // Vídeo único com falha de reprodução: recarrega uma vez antes de desistir
            else if (!s.list_id && errors === 1 && e.data === 5) e.target.loadVideoById(s.video_id)
            else onFail(`YouTube: ${YT_ERRORS[e.data] || `erro ${e.data}`}`)
          },
        },
      })
    }).catch((e) => !dead && onFail(`YouTube: ${e.message}`))
    return () => {
      dead = true
      try { player.current?.destroy() } catch { /* */ }
      player.current = null
      if (host.current) host.current.innerHTML = ''
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = player.current
    if (!p?.getPlayerState) return
    try { paused ? p.pauseVideo() : p.playVideo() } catch { /* */ }
  }, [paused])
  useEffect(() => { try { player.current?.setVolume?.(cfg.volume) } catch { /* */ } }, [cfg.volume])

  useWatchdog(
    () => { try { const st = player.current?.getPlayerState?.(); return st === 1 || st === 3 } catch { return false } },
    () => { try { player.current?.playVideo() } catch { /* */ } },
    (why) => {
      const st = player.current?.getPlayerState?.()
      onFail(st === -1 || st === 5 ? 'YouTube: o aparelho bloqueou o som automático (use o app CloudiMídia Player)' : why)
    },
    !paused,
    'YouTube',
  )
  return <div ref={host} className="cm-st-host" />
}

/* ---------- SoundCloud ---------- */
function SoundCloudTrack({ cfg, paused, onFail, onPlaying }) {
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
      w.bind(E.PLAY, () => { playing.current = true; onPlaying() })
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

export default function Soundtrack({ config, muted, adSound, online, onIssue }) {
  const [netOk, setNetOk] = useState(() => navigator.onLine !== false)
  const [retryAt, setRetryAt] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [title, setTitle] = useState('')
  const [showVideo, setShowVideo] = useState(false)
  const [playingSince, setPlayingSince] = useState(null)
  const fails = useRef(0)

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

  // Depois de uma falha, espera e tenta de novo (remonta o player)
  useEffect(() => {
    if (!retryAt) return
    const t = setTimeout(() => { setRetryAt(0); setAttempt((n) => n + 1) }, Math.max(0, retryAt - Date.now()))
    return () => clearTimeout(t)
  }, [retryAt])

  const onFail = useCallback((detail) => {
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
  const onPlaying = useCallback(() => setPlayingSince((t) => t || Date.now()), [])

  // Tocando bem por 5 min: zera a contagem de falhas
  useEffect(() => {
    if (!playingSince) return
    const t = setTimeout(() => { fails.current = 0 }, 5 * 60000)
    return () => clearTimeout(t)
  }, [playingSince])

  const cfg = config
  const provider = cfg?.source?.provider
  const active = !!PROVIDERS[provider] && serverOk && netOk && !muted && !retryAt
  const paused = !!(cfg?.pause_on_ad_sound && adSound)

  // Sem internet: zera o estado para recomeçar limpo quando voltar
  useEffect(() => { if (!active) { setPlayingSince(null); setShowVideo(false) } }, [active])

  // Miniatura do vídeo de tempos em tempos (YouTube)
  // Conta pelo relógio (as pausas das propagandas com som não zeram a contagem)
  const withVideo = provider === 'youtube' && cfg.video_mode !== 'off'
  const lastShown = useRef(0)
  useEffect(() => {
    if (!withVideo || !active || paused || !playingSince) { setShowVideo(false); return }
    if (!lastShown.current) lastShown.current = playingSince
    const every = Math.max(1, cfg.video_every) * 60000
    const t = setInterval(() => {
      const since = Date.now() - lastShown.current
      if (since >= every) {
        lastShown.current = Date.now()
        setShowVideo(true)
      } else if (since >= cfg.video_for * 1000) {
        setShowVideo(false)
      }
    }, 1000)
    return () => clearInterval(t)
  }, [withVideo, active, paused, playingSince, cfg?.video_every, cfg?.video_for])

  if (!active) return null
  const Track = PROVIDERS[provider]
  const box = withVideo ? `cm-st-mini cm-st-${cfg.video_mode} cm-st-${cfg.corner}${showVideo ? ' on' : ''}` : 'cm-st-mini cm-st-audio'
  return (
    <div className={box} aria-hidden={!showVideo} data-state={paused ? 'paused' : playingSince ? 'playing' : 'loading'}>
      <Track key={`${cfg.url}#${attempt}`} cfg={cfg} paused={paused} onFail={onFail} onPlaying={onPlaying} onTitle={setTitle} />
      {withVideo && title && <div className="cm-st-title"><span>♪</span>{title}</div>}
    </div>
  )
}
