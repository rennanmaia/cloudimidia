import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveProgram, programSignature } from '../lib/schedule'
import {
  NewsWidget, WeatherWidget, SportsWidget, CurrencyWidget, ClockWidget, TextWidget, WebpageWidget, YoutubeWidget,
  useIntegrationData, loadIntegrationData,
} from './widgets'
import Footer from './Footer'
import FutDigitalWidget from './FutDigitalWidget'
import FutDigitalSlotItem, { SlotPrewarm, slotBlocked } from './FutDigitalSlotItem'
import './player.css'

const DEFAULTS = { weather: 15, sports: 20, currency: 15, clock: 10, text: 12, webpage: 30, youtube: 60 }

/** cached: mídias já salvas no aparelho (app); as que ainda baixam ficam fora da vez. */
function isPlayable(item, integrations, cached) {
  if (item.type === 'media') {
    if (item.kind !== 'image' && item.kind !== 'video') return false
    return !cached || !item.media?.src_url || cached.has(item.media.src_url)
  }
  const integ = integrations?.[item.integration_id]
  if (integ?.type === 'futdigital_slot') return !!integ.config?.slot_url && !slotBlocked(integ.id)
  return !!integ && integ.type !== 'music'
}

const MEDIA_ERRORS = {
  1: 'Carregamento interrompido',
  2: 'Falha de rede ao carregar o vídeo',
  3: 'O aparelho não conseguiu decodificar o vídeo (formato ou resolução pesados demais)',
  4: 'Formato de vídeo não suportado pelo aparelho',
}

function itemDuration(item, integrations) {
  if (item.duration) return item.duration
  if (item.type === 'media') return item.kind === 'image' ? 10 : null
  const integ = integrations?.[item.integration_id]
  if (integ?.type === 'futdigital_slot') return integ.config?.duration_seconds || 15
  if (integ?.type === 'rss') return Math.min(integ.config?.max_items || 10, 6) * (integ.config?.item_duration || 10)
  return DEFAULTS[integ?.type] ?? 15
}

/* ---------------- Itens ---------------- */
/** Último quadro do vídeo como imagem (meia resolução, leve). null se não der. */
function captureFrame(v) {
  try {
    if (!v.videoWidth || v.readyState < 2) return null
    const c = document.createElement('canvas')
    c.width = Math.round(v.videoWidth / 2)
    c.height = Math.round(v.videoHeight / 2)
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.8)
  } catch {
    return null // vídeo de outro endereço (sem permissão de leitura)
  }
}

/** Fecha o vídeo de verdade: libera arquivo, buffers e decodificador. */
function releaseVideo(v) {
  if (!v) return
  try { v.pause(); v.removeAttribute('src'); v.load() } catch { /* */ }
}

/*
 * Cada item avisa onReady quando já está desenhado; só então a camada aparece
 * (até lá continua a imagem anterior, sem tela preta). onEnd({ reason, detail }) = item pulado.
 */
function ImageItem({ item, onEnd, onReady, duration, shown }) {
  const fit = item.settings?.fit || 'cover'
  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => onEnd(), duration * 1000)
    return () => clearTimeout(t)
  }, [onEnd, duration, shown])
  // Imagem que não carrega nem dá erro
  useEffect(() => {
    if (shown) return
    const t = setTimeout(() => onEnd({ reason: 'timeout', detail: 'A imagem não carregou em 15 s' }), 15000)
    return () => clearTimeout(t)
  }, [onEnd, shown])
  return (
    <>
      {fit === 'contain' && <img className="cm-blur-bg" src={item.media.url} alt="" />}
      <img
        className={`cm-media cm-fit-${fit}`}
        src={item.media.url}
        alt=""
        style={{ position: 'relative' }}
        onLoad={onReady}
        onError={() => onEnd({ reason: 'error', detail: 'A imagem não pôde ser aberta' })}
      />
    </>
  )
}

function VideoItem({ item, onEnd, onReady, shown, duration, muted, leaving, onSound }) {
  const ref = useRef(null)
  const fit = item.settings?.fit || 'contain'
  const wantMuted = muted || !!item.settings?.muted
  const lastTime = useRef({ t: -1, at: Date.now() })
  const started = useRef(false)
  const [still, setStill] = useState(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (leaving) {
      v.pause()
      // Guarda o último quadro numa imagem e libera o decodificador já, para o próximo vídeo
      // não disputar memória com este (TV boxes de 1 GB travam com dois vídeos abertos)
      const img = captureFrame(v)
      if (img) { setStill(img); setTimeout(() => releaseVideo(v), 60) }
      return
    }
    v.muted = wantMuted
    const p = v.play()
    if (p?.catch) {
      p.catch(() => {
        if (v.error) return // o onError do vídeo já cuida (com o motivo certo)
        // Navegador bloqueou som automático: toca sem som
        v.muted = true
        onSound?.(false)
        v.play().catch(() => !v.error && setTimeout(() => onEnd({ reason: 'error', detail: 'O aparelho recusou tocar o vídeo' }), 1000))
      })
    }
    if (!wantMuted) onSound?.(true)
    return () => onSound?.(false)
  }, [leaving]) // eslint-disable-line react-hooks/exhaustive-deps

  // Limite de duração definido na playlist + proteção contra travamentos
  useEffect(() => {
    if (leaving || !shown || !duration) return
    const t = setTimeout(() => onEnd(), duration * 1000)
    return () => clearTimeout(t)
  }, [leaving, shown, duration, onEnd])

  useEffect(() => {
    if (leaving) return
    const maxLen = (item.media?.duration || 600) + 20
    const guard = setTimeout(() => onEnd(), maxLen * 1000)
    const watchdog = setInterval(() => {
      const v = ref.current
      if (!v) return
      if (v.currentTime !== lastTime.current.t) lastTime.current = { t: v.currentTime, at: Date.now() }
      else if (Date.now() - lastTime.current.at > (started.current ? 10000 : 15000)) {
        onEnd(started.current
          ? { reason: 'stalled', detail: `Parou em ${Math.round(v.currentTime)} s e não voltou a tocar` }
          : { reason: 'timeout', detail: 'O vídeo não começou a tocar em 15 s' })
      }
    }, 2500)
    return () => { clearTimeout(guard); clearInterval(watchdog) }
  }, [leaving, onEnd, item.media?.duration])

  // Ao sair da tela, solta o arquivo e o decodificador na hora (sem esperar a limpeza de memória)
  useEffect(() => () => releaseVideo(ref.current), [])

  return (
    <>
    {still && <img className={`cm-media cm-fit-${fit}`} src={still} alt="" style={{ position: 'absolute', inset: 0, zIndex: 1 }} />}
    <video
      ref={ref}
      className={`cm-media cm-fit-${fit}`}
      src={item.media.url}
      poster={item.media.thumb_url || undefined}
      playsInline
      preload="auto"
      muted={wantMuted}
      data-sound={!wantMuted && !leaving ? '1' : undefined}
      onPlaying={() => { started.current = true; onReady() }}
      onEnded={() => onEnd()}
      onError={() => {
        const code = ref.current?.error?.code
        setTimeout(() => onEnd({ reason: 'error', detail: MEDIA_ERRORS[code] || 'O vídeo não pôde ser aberto' }), 1000)
      }}
    />
    </>
  )
}

function WidgetItem({ item, integration, fetchData, onEnd, onReady, duration, timezone, muted }) {
  const data = useIntegrationData(integration, fetchData)
  useEffect(() => { onReady() }, [onReady])
  // FutDigital sem duração fixa: o próprio widget avisa quando mostrou todas as páginas
  const auto = integration.type === 'futdigital' && !item.duration
  useEffect(() => {
    const t = setTimeout(onEnd, (auto ? 900 : duration) * 1000)
    return () => clearTimeout(t)
  }, [onEnd, duration, auto])
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
    case 'futdigital': return <FutDigitalWidget {...props} onDone={auto ? onEnd : undefined} />
    default: return null
  }
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
export default function Stage({ manifest, fetchData, onPlayed, onIssue, onRecover, cachedMedia, onNowPlaying, identify, preview }) {
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
  refs.current.onIssue = onIssue
  refs.current.onRecover = onRecover
  refs.current.cached = cachedMedia

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
    // Próximo item exibível depois da posição `last` (posição na playlist completa, para a
    // ordem não pular quando uma mídia termina de baixar). strict: só mídias já salvas no aparelho.
    const nextIn = (pl, last, strict = true) => {
      const items = pl?.items || []
      for (let k = 1; k <= items.length; k++) {
        const j = (last + k) % items.length
        if (isPlayable(items[j], ints, strict ? st.cached : null)) return j
      }
      return -1
    }
    const hasPlayable = (pl) => nextIn(pl, -1) >= 0
    while (st.queue.length) {
      const q = st.queue.shift()
      if (playlists[q.playlist.id]) return q
    }
    const base = prog.base ? playlists[prog.base.playlistId] : null
    let idx = base ? nextIn(base, st.baseIdx[base.id] ?? -1) : -1
    // Nada salvo ainda: melhor tocar pela internet do que deixar a tela parada
    if (base && idx < 0 && !prog.inserts.some((s) => hasPlayable(playlists[s.playlist_id]))) idx = nextIn(base, st.baseIdx[base.id] ?? -1, false)
    const pushInserts = (force, strict = true) => {
      prog.inserts.forEach((s) => {
        if (!force && st.since % Math.max(1, s.insert_every) !== 0) return
        const pl = playlists[s.playlist_id]
        const j = nextIn(pl, st.insertIdx[s.id] ?? -1, strict)
        if (j < 0) return
        st.insertIdx[s.id] = j
        st.queue.push({ item: pl.items[j], playlist: pl, scheduleId: s.id })
      })
    }
    if (idx >= 0) {
      st.baseIdx[base.id] = idx
      st.since++
      pushInserts(false)
      return { item: base.items[idx], playlist: base, scheduleId: prog.base.scheduleId }
    }
    // Sem programação base: exibe apenas as campanhas
    if (prog.inserts.length) {
      pushInserts(true)
      if (!st.queue.length) pushInserts(true, false)
      return st.queue.shift() || null
    }
    return null
  }, [])

  const advance = useCallback(() => {
    const st = refs.current
    const prev = st.current
    if (prev) {
      const ids = {
        media_id: prev.item.type === 'media' ? prev.item.media?.id : null,
        integration_id: prev.item.type === 'integration' ? prev.item.integration_id : null,
        playlist_id: prev.playlist?.id,
        schedule_id: prev.scheduleId,
      }
      const secs = prev.shownAt ? Math.round((Date.now() - prev.shownAt) / 1000) : 0
      if (prev.issue) st.onIssue?.({ ...ids, reason: prev.issue.reason, detail: prev.issue.detail || '', shown: secs, at: Date.now() })
      // Vários vídeos seguidos falhando = aparelho sem memória: o player pede para reiniciar
      if (prev.item.type === 'media' && prev.item.kind === 'video') {
        if (prev.issue) st.videoFails = (st.videoFails || 0) + 1
        else if (secs >= 3) st.videoFails = 0
        if (st.videoFails >= 3) { st.videoFails = 0; st.onRecover?.() }
      }
      // Só conta como exibição o que apareceu na tela
      if (st.onPlayed && secs >= 1) st.onPlayed({ ...ids, started_at: prev.shownAt, duration: secs })
    }
    const next = pickNext()
    st.startedAt = Date.now()
    const entry = next ? { ...next, key: ++st.key } : null
    st.current = entry
    for (const k of st.endFns.keys()) if (k < st.key - 4) st.endFns.delete(k)
    setCurrent(entry)
  }, [pickNext])

  // Camada aparece quando o item está desenhado; a anterior sai depois da transição
  const showLayer = useCallback((key) => {
    setLayers((ls) => (ls.some((l) => l.key === key && !l.shown) ? ls.map((l) => (l.key === key ? { ...l, shown: true } : l)) : ls))
    const cur = refs.current.current
    if (cur?.key === key && !cur.shownAt) cur.shownAt = Date.now()
    setTimeout(() => setLayers((ls) => ls.filter((l) => !(l.leaving && l.key < key))), 1100)
  }, [])

  // Funções estáveis por item (evita reiniciar temporizadores)
  const endFor = useCallback((key) => {
    const fns = refs.current.endFns
    if (!fns.has(key)) {
      fns.set(key, {
        end: (info) => {
          const cur = refs.current.current
          if (cur?.key !== key) return
          if (!info?.reason) return advance()
          // Item com problema: pequena pausa evita repetir sem parar se a playlist só tem ele
          cur.issue = info
          setTimeout(() => { if (refs.current.current?.key === key) advance() }, 800)
        },
        ready: () => showLayer(key),
      })
    }
    return fns.get(key)
  }, [advance, showLayer])

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
    // Fica na tela a última camada que chegou a aparecer, até a nova estar pronta
    setLayers((ls) => [
      ...ls.filter((l) => l.key !== current.key && l.shown).slice(-1).map((l) => ({ ...l, leaving: true })),
      { key: current.key, entry: current, shown: false },
    ])
    // Se o item demorar a avisar, aparece assim mesmo
    const t = setTimeout(() => showLayer(current.key), 8000)
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
        {layers.map(({ key, entry, leaving, shown }) => {
          const { item, playlist } = entry
          const transition = playlist?.transition || 'fade'
          const { end, ready } = endFor(key)
          const duration = itemDuration(item, integrations)
          const common = { item, onEnd: end, onReady: ready, shown }
          let content = null
          if (item.type === 'media' && item.kind === 'image') content = <ImageItem {...common} duration={duration} />
          else if (item.type === 'media' && item.kind === 'video') content = <VideoItem {...common} duration={item.duration} muted={muted} leaving={leaving} onSound={setVideoSound} />
          else if (item.type === 'integration' && integrations[item.integration_id]?.type === 'futdigital_slot') {
            content = <FutDigitalSlotItem {...common} integration={integrations[item.integration_id]} fetchData={fetchData} preview={preview} />
          } else if (item.type === 'integration' && integrations[item.integration_id]) {
            content = <WidgetItem {...common} integration={integrations[item.integration_id]} fetchData={fetchData} duration={duration} timezone={manifest?.organization?.timezone} muted={muted} />
          }
          return (
            <div
              key={key}
              className={`cm-layer ${shown && !leaving && transition !== 'none' ? `enter-${transition}` : ''}`}
              style={{ zIndex: leaving ? 1 : 2, opacity: shown ? undefined : 0 }}
            >
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
      {tickerPlaylist?.footer && <Footer footer={tickerPlaylist.footer} integrations={integrations} fetchData={fetchData} org={manifest?.organization} />}
      {musicInteg && <Music integration={musicInteg} paused={muted || videoSound} />}
      {!preview && <SlotPrewarm integrations={integrations} />}
    </div>
  )
}
