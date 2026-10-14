import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveProgram, programSignature } from '../lib/schedule'
import {
  NewsWidget, WeatherWidget, SportsWidget, CurrencyWidget, ClockWidget, TextWidget, WebpageWidget, YoutubeWidget,
  useIntegrationData, loadIntegrationData,
} from './widgets'
import './player.css'

const DEFAULTS = { weather: 15, sports: 20, currency: 15, clock: 10, text: 12, webpage: 30, youtube: 60 }

function isPlayable(item, integrations) {
  if (item.type === 'media') return item.kind === 'image' || item.kind === 'video'
  const integ = integrations?.[item.integration_id]
  return !!integ && integ.type !== 'music'
}

function itemDuration(item, integrations) {
  if (item.duration) return item.duration
  if (item.type === 'media') return item.kind === 'image' ? 10 : null
  const integ = integrations?.[item.integration_id]
  if (integ?.type === 'rss') return Math.min(integ.config?.max_items || 10, 6) * (integ.config?.item_duration || 10)
  return DEFAULTS[integ?.type] ?? 15
}

/* ---------------- Itens ---------------- */
function ImageItem({ item, onEnd, duration }) {
  const fit = item.settings?.fit || 'cover'
  useEffect(() => {
    const t = setTimeout(onEnd, duration * 1000)
    return () => clearTimeout(t)
  }, [onEnd, duration])
  return (
    <>
      {fit === 'contain' && <img className="cm-blur-bg" src={item.media.url} alt="" />}
      <img className={`cm-media cm-fit-${fit}`} src={item.media.url} alt="" style={{ position: 'relative' }} onError={() => setTimeout(onEnd, 1000)} />
    </>
  )
}

function VideoItem({ item, onEnd, duration, muted, leaving, onSound }) {
  const ref = useRef(null)
  const fit = item.settings?.fit || 'contain'
  const wantMuted = muted || !!item.settings?.muted
  const lastTime = useRef({ t: -1, at: Date.now() })

  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (leaving) { v.pause(); return }
    v.muted = wantMuted
    const p = v.play()
    if (p?.catch) {
      p.catch(() => {
        // Navegador bloqueou som automático: toca sem som
        v.muted = true
        onSound?.(false)
        v.play().catch(() => setTimeout(onEnd, 2000))
      })
    }
    if (!wantMuted) onSound?.(true)
    return () => onSound?.(false)
  }, [leaving]) // eslint-disable-line react-hooks/exhaustive-deps

  // Limite de duração definido na playlist + proteção contra travamentos
  useEffect(() => {
    if (leaving) return
    const timers = []
    if (duration) timers.push(setTimeout(onEnd, duration * 1000))
    const maxLen = (item.media?.duration || 600) + 20
    timers.push(setTimeout(onEnd, maxLen * 1000))
    const watchdog = setInterval(() => {
      const v = ref.current
      if (!v) return
      if (v.currentTime !== lastTime.current.t) lastTime.current = { t: v.currentTime, at: Date.now() }
      else if (Date.now() - lastTime.current.at > 20000) onEnd()
    }, 5000)
    return () => { timers.forEach(clearTimeout); clearInterval(watchdog) }
  }, [leaving, duration, onEnd, item.media?.duration])

  return (
    <video
      ref={ref}
      className={`cm-media cm-fit-${fit}`}
      src={item.media.url}
      poster={item.media.thumb_url || undefined}
      playsInline
      preload="auto"
      muted={wantMuted}
      data-sound={!wantMuted && !leaving ? '1' : undefined}
      onEnded={onEnd}
      onError={() => setTimeout(onEnd, 1500)}
    />
  )
}

function WidgetItem({ item, integration, fetchData, onEnd, duration, timezone, muted }) {
  const data = useIntegrationData(integration, fetchData)
  useEffect(() => {
    const t = setTimeout(onEnd, duration * 1000)
    return () => clearTimeout(t)
  }, [onEnd, duration])
  const props = { integration, data, timezone, muted }
  switch (integration.type) {
    case 'rss': return <NewsWidget {...props} />
    case 'weather': return <WeatherWidget {...props} />
    case 'sports': return <SportsWidget {...props} />
    case 'currency': return <CurrencyWidget {...props} />
    case 'clock': return <ClockWidget {...props} />
    case 'text': return <TextWidget {...props} />
    case 'webpage': return <WebpageWidget {...props} />
    case 'youtube': return <YoutubeWidget {...props} />
    default: return null
  }
}

/* ---------------- Rodapé de notícias ---------------- */
function Ticker({ playlist, integrations, fetchData, logo, timezone }) {
  const integ = playlist?.ticker_integration_id ? integrations?.[playlist.ticker_integration_id] : null
  const data = useIntegrationData(integ?.type === 'rss' ? integ : null, fetchData)
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(t)
  }, [])
  const texts = useMemo(() => {
    const list = []
    if (playlist?.ticker_text) list.push(...playlist.ticker_text.split('\n').filter(Boolean))
    if (integ?.type === 'text') list.push([integ.config?.title, integ.config?.message].filter(Boolean).join(' — '))
    if (integ?.type === 'rss' && data?.items) list.push(...data.items.map((i) => i.title))
    return list.filter(Boolean)
  }, [playlist?.ticker_text, integ, data])
  if (!texts.length) return null
  const label = integ?.type === 'rss' ? (data?.source || integ.name) : 'Avisos'
  const speed = Math.max(20, texts.join(' ').length * 0.16)
  let clock = ''
  try { clock = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: timezone }) } catch { clock = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
  return (
    <div className="cm-ticker">
      <div className="cm-ticker-label">{logo && <img src={logo} alt="" />}{label}</div>
      <div className="cm-ticker-track">
        <div key={texts.join('|')} className="cm-ticker-text" style={{ animationDuration: `${speed}s` }}>
          {texts.map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </div>
      <div className="cm-ticker-clock">{clock}</div>
    </div>
  )
}

/* ---------------- Música ambiente ---------------- */
function Music({ integration, paused }) {
  const ref = useRef(null)
  const cfg = integration?.config || {}
  const tracks = useMemo(() => {
    const t = [...(integration?.tracks || [])]
    if (cfg.shuffle) t.sort(() => Math.random() - 0.5)
    return t
  }, [integration?.id, integration?.tracks?.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const [idx, setIdx] = useState(0)
  const src = cfg.source === 'library' ? tracks[idx % Math.max(1, tracks.length)]?.url : cfg.stream_url
  useEffect(() => {
    const a = ref.current
    if (!a || !src) return
    a.volume = Math.min(1, Math.max(0, (cfg.volume ?? 60) / 100))
    if (paused) a.pause()
    else a.play().catch(() => { /* aguardando interação do usuário */ })
  }, [paused, src, cfg.volume])
  if (!integration || !src) return null
  return (
    <audio
      ref={ref}
      src={src}
      autoPlay={!paused}
      data-sound={!paused ? '1' : undefined}
      loop={cfg.source !== 'library' || tracks.length === 1}
      onEnded={() => setIdx((i) => i + 1)}
      onError={() => setTimeout(() => (cfg.source === 'library' ? setIdx((i) => i + 1) : ref.current?.load()), 5000)}
    />
  )
}

/* ---------------- Telas do sistema ---------------- */
export function IdleScreen({ org, message = 'Aguardando programação' }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  let time
  try { time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: org?.timezone }) } catch { time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
  return (
    <div className="cm-idle">
      {org?.logo_url && <img src={org.logo_url} alt="" />}
      <h1>{time}</h1>
      <p>{org?.name ? `${org.name} · ` : ''}{message}</p>
    </div>
  )
}

/* ---------------- Palco ---------------- */
/**
 * Executa a programação de um manifesto.
 * - manifest: { screen, organization, default_playlist_id, schedules, playlists, integrations }
 * - fetchData(integrationId): busca os dados de integrações dinâmicas
 * - onPlayed(log): chamado ao fim de cada item (comprovação de exibição)
 * - onNowPlaying(texto)
 */
export default function Stage({ manifest, fetchData, onPlayed, onNowPlaying, identify }) {
  const integrations = manifest?.integrations || {}
  const muted = !!manifest?.screen?.muted
  const [program, setProgram] = useState(() => resolveProgram(manifest))
  const [current, setCurrent] = useState(null)
  const [layers, setLayers] = useState([])
  const [videoSound, setVideoSound] = useState(false)

  const refs = useRef({ manifest, program, baseIdx: {}, insertIdx: {}, since: 0, queue: [], key: 0, current: null, startedAt: 0, endFns: new Map() })
  refs.current.manifest = manifest
  refs.current.program = program
  refs.current.onPlayed = onPlayed

  // Reavalia a grade periodicamente e quando o manifesto muda
  useEffect(() => {
    const tick = () => setProgram((p) => {
      const n = resolveProgram(refs.current.manifest)
      return programSignature(n) === programSignature(p) ? p : n
    })
    tick()
    const t = setInterval(tick, 10000)
    return () => clearInterval(t)
  }, [manifest])

  // Pré-carrega dados das integrações usadas
  useEffect(() => {
    Object.values(integrations).forEach((i) => i.has_data && loadIntegrationData(i, fetchData))
  }, [manifest?.version]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickNext = useCallback(() => {
    const st = refs.current
    const { playlists = {}, integrations: ints = {} } = st.manifest || {}
    const prog = st.program
    const playable = (pl) => (pl?.items || []).filter((it) => isPlayable(it, ints))
    while (st.queue.length) {
      const q = st.queue.shift()
      if (playlists[q.playlist.id]) return q
    }
    const base = prog.base ? playlists[prog.base.playlistId] : null
    const baseItems = playable(base)
    const pushInserts = (force) => {
      prog.inserts.forEach((s) => {
        if (!force && st.since % Math.max(1, s.insert_every) !== 0) return
        const pl = playlists[s.playlist_id]
        const its = playable(pl)
        if (!its.length) return
        const j = ((st.insertIdx[s.id] ?? -1) + 1) % its.length
        st.insertIdx[s.id] = j
        st.queue.push({ item: its[j], playlist: pl, scheduleId: s.id })
      })
    }
    if (baseItems.length) {
      const idx = ((st.baseIdx[base.id] ?? -1) + 1) % baseItems.length
      st.baseIdx[base.id] = idx
      st.since++
      pushInserts(false)
      return { item: baseItems[idx], playlist: base, scheduleId: prog.base.scheduleId }
    }
    // Sem programação base: exibe apenas as campanhas
    if (prog.inserts.length) {
      pushInserts(true)
      return st.queue.shift() || null
    }
    return null
  }, [])

  const advance = useCallback(() => {
    const st = refs.current
    const prev = st.current
    if (prev && st.onPlayed) {
      const secs = Math.round((Date.now() - st.startedAt) / 1000)
      if (secs >= 1) {
        st.onPlayed({
          media_id: prev.item.type === 'media' ? prev.item.media?.id : null,
          integration_id: prev.item.type === 'integration' ? prev.item.integration_id : null,
          playlist_id: prev.playlist?.id,
          schedule_id: prev.scheduleId,
          started_at: st.startedAt,
          duration: secs,
        })
      }
    }
    const next = pickNext()
    st.startedAt = Date.now()
    const entry = next ? { ...next, key: ++st.key } : null
    st.current = entry
    for (const k of st.endFns.keys()) if (k < st.key - 4) st.endFns.delete(k)
    setCurrent(entry)
  }, [pickNext])

  // Função de término estável por item (evita reiniciar temporizadores)
  const endFor = useCallback((key) => {
    const fns = refs.current.endFns
    if (!fns.has(key)) fns.set(key, () => { if (refs.current.current?.key === key) advance() })
    return fns.get(key)
  }, [advance])

  // Troca imediata quando a programação muda (início/fim de um horário)
  const sig = programSignature(program)
  useEffect(() => { advance() }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps

  // Se não há nada para exibir, tenta novamente de tempos em tempos
  useEffect(() => {
    if (current) return
    const t = setInterval(advance, 8000)
    return () => clearInterval(t)
  }, [current, advance, manifest?.version])

  // Camadas para transição suave
  useEffect(() => {
    if (!current) { setLayers([]); return }
    setLayers((ls) => [...ls.filter((l) => l.key !== current.key).slice(-1).map((l) => ({ ...l, leaving: true })), { key: current.key, entry: current }])
    const t = setTimeout(() => setLayers((ls) => ls.filter((l) => !l.leaving)), 1100)
    onNowPlaying?.(current.item.name)
    return () => clearTimeout(t)
  }, [current]) // eslint-disable-line react-hooks/exhaustive-deps

  const basePlaylist = program.base ? manifest?.playlists?.[program.base.playlistId] : current?.playlist
  const tickerPlaylist = basePlaylist || current?.playlist
  const musicInteg = tickerPlaylist?.music_integration_id ? integrations[tickerPlaylist.music_integration_id] : null

  return (
    <div className="cm-stage">
      <div className="cm-main">
        {!current && <IdleScreen org={manifest?.organization} />}
        {layers.map(({ key, entry, leaving }) => {
          const { item, playlist } = entry
          const transition = playlist?.transition || 'fade'
          const end = endFor(key)
          const duration = itemDuration(item, integrations)
          let content = null
          if (item.type === 'media' && item.kind === 'image') content = <ImageItem item={item} onEnd={end} duration={duration} />
          else if (item.type === 'media' && item.kind === 'video') content = <VideoItem item={item} onEnd={end} duration={item.duration} muted={muted} leaving={leaving} onSound={setVideoSound} />
          else if (item.type === 'integration' && integrations[item.integration_id]) {
            content = <WidgetItem item={item} integration={integrations[item.integration_id]} fetchData={fetchData} onEnd={end} duration={duration} timezone={manifest?.organization?.timezone} muted={muted} />
          }
          return (
            <div key={key} className={`cm-layer ${!leaving && transition !== 'none' ? `enter-${transition}` : ''}`} style={{ zIndex: leaving ? 1 : 2 }}>
              {content}
            </div>
          )
        })}
        {identify && (
          <div className="cm-identify">
            <small>Esta TV é</small>
            <b>{manifest?.screen?.name}</b>
          </div>
        )}
      </div>
      {tickerPlaylist && (tickerPlaylist.ticker_integration_id || tickerPlaylist.ticker_text) && (
        <Ticker playlist={tickerPlaylist} integrations={integrations} fetchData={fetchData} logo={manifest?.organization?.logo_url} timezone={manifest?.organization?.timezone} />
      )}
      {musicInteg && <Music integration={musicInteg} paused={muted || videoSound} />}
    </div>
  )
}
