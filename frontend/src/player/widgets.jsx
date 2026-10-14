import { useEffect, useMemo, useState } from 'react'
import {
  Sun, Moon, CloudSun, CloudMoon, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning, MapPin, Droplets, Wind, Thermometer,
} from 'lucide-react'

/* ---------- dados das integrações (com cache em memória) ---------- */
const dataCache = new Map()
const TTL = { rss: 5 * 60e3, weather: 15 * 60e3, sports: 90e3, currency: 4 * 60e3 }

export async function loadIntegrationData(integration, fetchData, force = false) {
  const c = dataCache.get(integration.id)
  const ttl = TTL[integration.type] ?? 5 * 60e3
  if (!force && c && Date.now() - c.at < ttl && c.hash === JSON.stringify(integration.config)) return c.data
  try {
    const r = await fetchData(integration.id)
    if (r?.data) {
      dataCache.set(integration.id, { data: r.data, at: Date.now(), hash: JSON.stringify(integration.config) })
      return r.data
    }
  } catch { /* mantém o último dado */ }
  return c?.data ?? null
}

export function useIntegrationData(integration, fetchData) {
  const [data, setData] = useState(() => dataCache.get(integration?.id)?.data ?? null)
  useEffect(() => {
    if (!integration?.has_data) return
    let alive = true
    const run = () => loadIntegrationData(integration, fetchData).then((d) => alive && d && setData(d))
    run()
    const t = setInterval(run, 60e3)
    return () => { alive = false; clearInterval(t) }
  }, [integration?.id, integration?.has_data]) // eslint-disable-line react-hooks/exhaustive-deps
  return data
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const Loading = () => <div className="cm-loading"><div className="cm-spinner" /></div>

/* ---------- Notícias ---------- */
export function NewsWidget({ integration, data }) {
  const items = data?.items || []
  const per = Math.max(4, integration.config?.item_duration || 10)
  const [i, setI] = useState(0)
  useEffect(() => {
    if (items.length < 2) return
    const t = setInterval(() => setI((x) => (x + 1) % items.length), per * 1000)
    return () => clearInterval(t)
  }, [items.length, per])
  if (!data) return <Loading />
  const it = items[i % Math.max(1, items.length)]
  if (!it) return <Loading />
  const dots = items.slice(0, 12)
  return (
    <div className="cm-widget cm-news">
      {it.image ? <img key={'i' + i} className="cm-news-img" src={it.image} alt="" referrerPolicy="no-referrer" /> : <div className="cm-news-noimg" />}
      {it.image && <div className="cm-news-shade" />}
      <div key={'b' + i} className={'cm-news-body' + (it.image ? '' : ' center')}>
        <div className="cm-news-meta">
          <span className="cm-news-source">{data.source || integration.name}</span>
          {it.date && <span>{relTime(it.date)}</span>}
        </div>
        <h1 className="cm-news-title">{it.title}</h1>
        {!it.image && it.description && <p className="cm-news-desc">{it.description}</p>}
      </div>
      {items.length > 1 && (
        <div className="cm-progress">
          {dots.map((_, k) => (
            <i key={k + '-' + i} className={k < i % dots.length ? 'done' : k === i % dots.length ? 'active' : ''} style={{ animationDuration: `${per}s` }} />
          ))}
        </div>
      )}
    </div>
  )
}

function relTime(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (Number.isNaN(min)) return ''
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  return new Date(iso).toLocaleDateString('pt-BR')
}

/* ---------- Clima ---------- */
export function weatherInfo(code, isDay = true) {
  const c = Number(code)
  if (c === 0) return { label: 'Céu limpo', Icon: isDay ? Sun : Moon, bg: isDay ? 'linear-gradient(160deg,#0284c7,#38bdf8 55%,#fbbf24)' : 'linear-gradient(160deg,#0f172a,#312e81)' }
  if (c <= 2) return { label: c === 1 ? 'Predominantemente limpo' : 'Parcialmente nublado', Icon: isDay ? CloudSun : CloudMoon, bg: isDay ? 'linear-gradient(160deg,#0369a1,#38bdf8)' : 'linear-gradient(160deg,#0f172a,#1e3a8a)' }
  if (c === 3) return { label: 'Nublado', Icon: Cloud, bg: 'linear-gradient(160deg,#334155,#64748b)' }
  if (c === 45 || c === 48) return { label: 'Neblina', Icon: CloudFog, bg: 'linear-gradient(160deg,#475569,#94a3b8)' }
  if (c >= 51 && c <= 57) return { label: 'Garoa', Icon: CloudDrizzle, bg: 'linear-gradient(160deg,#1e293b,#475569)' }
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return { label: c >= 80 ? 'Pancadas de chuva' : c === 65 ? 'Chuva forte' : 'Chuva', Icon: CloudRain, bg: 'linear-gradient(160deg,#0f172a,#334155)' }
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { label: 'Neve', Icon: CloudSnow, bg: 'linear-gradient(160deg,#64748b,#cbd5e1)' }
  if (c >= 95) return { label: 'Tempestade', Icon: CloudLightning, bg: 'linear-gradient(160deg,#020617,#3730a3)' }
  return { label: '—', Icon: Cloud, bg: 'linear-gradient(160deg,#334155,#64748b)' }
}

export function WeatherWidget({ data }) {
  if (!data?.current) return <Loading />
  const cur = data.current
  const info = weatherInfo(cur.code, cur.is_day)
  const days = (data.daily || []).slice(0, 5)
  return (
    <div className="cm-widget cm-weather" style={{ background: info.bg }}>
      <div className="cm-weather-now">
        <info.Icon style={{ width: 'min(30cqh,18cqw)', height: 'min(30cqh,18cqw)', filter: 'drop-shadow(0 1cqh 3cqh rgba(0,0,0,.25))' }} strokeWidth={1.5} />
        <div>
          <div className="cm-weather-city"><MapPin style={{ width: '1em', height: '1em' }} />{data.city}</div>
          <div className="cm-weather-temp">{cur.temp}°</div>
          <div className="cm-weather-desc">{info.label}</div>
          <div className="cm-weather-extra">
            <span><Thermometer style={iconSm} /> Sensação {cur.feels}°</span>
            {cur.humidity != null && <span><Droplets style={iconSm} /> {cur.humidity}%</span>}
            <span><Wind style={iconSm} /> {cur.wind} km/h</span>
          </div>
        </div>
      </div>
      <div className="cm-weather-days">
        {days.map((d, i) => {
          const di = weatherInfo(d.code, true)
          const label = i === 0 ? 'Hoje' : new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
          return (
            <div key={d.date} className="cm-weather-day">
              <b>{label}</b>
              <di.Icon strokeWidth={1.6} />
              <span>{d.max}°<small>{d.min}°</small></span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
const iconSm = { width: '1em', height: '1em', verticalAlign: '-0.15em', marginRight: '0.3em' }

/* ---------- Resultados de jogos ---------- */
export function SportsWidget({ integration, data }) {
  const events = data?.events || []
  const perPage = 6
  const pages = Math.max(1, Math.ceil(events.length / perPage))
  const [page, setPage] = useState(0)
  useEffect(() => {
    if (pages < 2) return
    const t = setInterval(() => setPage((p) => (p + 1) % pages), 9000)
    return () => clearInterval(t)
  }, [pages])
  if (!data) return <Loading />
  const slice = events.slice((page % pages) * perPage, (page % pages) * perPage + perPage)
  return (
    <div className="cm-widget cm-sports">
      <div className="cm-sports-head">
        {data.logo && <img src={data.logo} alt="" />}
        <div>
          <h2>{integration.config?.title || data.league}</h2>
          <p>{events.some((e) => e.state === 'in') ? 'Jogos ao vivo agora' : 'Resultados e próximos jogos'}</p>
        </div>
      </div>
      {events.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'min(4cqh,2.4cqw)', opacity: 0.8 }}>Nenhum jogo nesta rodada.</div>
      ) : (
        <div key={page} className="cm-sports-grid">
          {slice.map((e, i) => (
            <div key={i} className="cm-match">
              <Team t={e.home} />
              <div className="cm-score">
                {e.state === 'pre' ? <b style={{ fontSize: 'min(3.6cqh,2.2cqw)' }}>×</b> : <b>{e.home.score ?? 0} - {e.away.score ?? 0}</b>}
                <small className={e.state === 'in' ? 'live' : ''}>{matchStatus(e)}</small>
              </div>
              <Team t={e.away} away />
            </div>
          ))}
        </div>
      )}
      {pages > 1 && <div className="cm-pages">{Array.from({ length: pages }).map((_, i) => <i key={i} className={i === page % pages ? 'on' : ''} />)}</div>}
    </div>
  )
}

function Team({ t, away }) {
  return (
    <div className={'cm-team' + (away ? ' away' : '')}>
      {t.logo && <img src={t.logo} alt="" />}
      <span>{t.name}</span>
    </div>
  )
}

function matchStatus(e) {
  if (e.state === 'in') return `AO VIVO ${e.detail && !/^\d/.test(e.detail) ? '' : e.detail || ''}`.trim()
  if (e.state === 'post') return 'Encerrado'
  const d = new Date(e.date)
  if (Number.isNaN(d.getTime())) return e.detail
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '') + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/* ---------- Cotações ---------- */
export function CurrencyWidget({ data }) {
  const now = useNow(30000)
  if (!data) return <Loading />
  const fmt = (q) => {
    const digits = q.bid >= 1000 ? 0 : q.bid < 1 ? 4 : 2
    return q.bid.toLocaleString('pt-BR', { style: 'currency', currency: q.codein || 'BRL', minimumFractionDigits: digits, maximumFractionDigits: digits })
  }
  return (
    <div className="cm-widget cm-currency">
      <h2>Cotações <small>{now.toLocaleDateString('pt-BR')} · {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></h2>
      <div className="cm-currency-grid">
        {(data.quotes || []).map((q, i) => (
          <div key={q.code} className="cm-quote" style={{ animationDelay: `${i * 0.08}s` }}>
            <div className="cm-quote-code"><i>{q.code.slice(0, 1)}</i>{q.name}</div>
            <div className="cm-quote-value">{fmt(q)}</div>
            <div className={'cm-quote-pct ' + (q.pct >= 0 ? 'cm-up' : 'cm-down')}>
              {q.pct >= 0 ? '▲' : '▼'} {Math.abs(q.pct).toFixed(2).replace('.', ',')}%
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Relógio ---------- */
export function ClockWidget({ integration, timezone }) {
  const cfg = integration.config || {}
  const now = useNow(1000)
  const tz = cfg.timezone || timezone
  const opts = tz ? { timeZone: tz } : {}
  let time, date, parts
  try {
    time = now.toLocaleTimeString('pt-BR', { ...opts, hour: '2-digit', minute: '2-digit' })
    date = now.toLocaleDateString('pt-BR', { ...opts, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { ...opts, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, Number(p.value)]))
  } catch {
    time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    date = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    parts = { hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds() }
  }
  const sec = String(parts.second ?? now.getSeconds()).padStart(2, '0')
  return (
    <div className="cm-widget cm-clock" style={{ background: cfg.background || '#0f172a', color: cfg.color || '#fff' }}>
      {cfg.label && <div className="cm-clock-label">{cfg.label}</div>}
      {cfg.style === 'analog' ? (
        <AnalogClock h={parts.hour} m={parts.minute} s={parts.second} color={cfg.color || '#fff'} />
      ) : (
        <div className="cm-clock-time">{time}<small>{sec}</small></div>
      )}
      {cfg.show_date !== false && <div className="cm-clock-date">{date}</div>}
    </div>
  )
}

function AnalogClock({ h, m, s, color }) {
  const hand = (deg, len, w, c = color) => (
    <line x1="50" y1="50" x2={50 + len * Math.sin((deg * Math.PI) / 180)} y2={50 - len * Math.cos((deg * Math.PI) / 180)} stroke={c} strokeWidth={w} strokeLinecap="round" />
  )
  return (
    <svg viewBox="0 0 100 100" style={{ width: 'min(60cqh,40cqw)', height: 'min(60cqh,40cqw)' }}>
      <circle cx="50" cy="50" r="47" fill="none" stroke={color} strokeOpacity=".25" strokeWidth="2" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * 30 * Math.PI) / 180
        return <line key={i} x1={50 + 40 * Math.sin(a)} y1={50 - 40 * Math.cos(a)} x2={50 + 44 * Math.sin(a)} y2={50 - 44 * Math.cos(a)} stroke={color} strokeWidth={i % 3 === 0 ? 2.4 : 1.2} strokeLinecap="round" />
      })}
      {hand(((h % 12) + m / 60) * 30, 24, 3.4)}
      {hand((m + s / 60) * 6, 34, 2.2)}
      {hand(s * 6, 38, 0.9, '#f43f5e')}
      <circle cx="50" cy="50" r="2.2" fill="#f43f5e" />
    </svg>
  )
}

/* ---------- Aviso / Texto ---------- */
export function TextWidget({ integration }) {
  const c = integration.config || {}
  return (
    <div className={`cm-widget cm-text ${c.size || 'lg'} ${c.align === 'left' ? '' : 'center'}`} style={{ background: c.background || '#4f46e5', color: c.color || '#fff' }}>
      <div className="cm-text-deco" />
      {c.title && <h1 style={{ position: 'relative' }}>{c.title}</h1>}
      {c.message && <p style={{ position: 'relative' }}>{c.message}</p>}
    </div>
  )
}

/* ---------- Página web ---------- */
export function WebpageWidget({ integration }) {
  const c = integration.config || {}
  const [k, setK] = useState(0)
  useEffect(() => {
    if (!c.reload_minutes) return
    const t = setInterval(() => setK((x) => x + 1), c.reload_minutes * 60000)
    return () => clearInterval(t)
  }, [c.reload_minutes])
  return <iframe key={k} className="cm-frame" src={c.url} title={integration.name} allow="autoplay; fullscreen" referrerPolicy="no-referrer" />
}

/* ---------- YouTube ---------- */
export function YoutubeWidget({ integration, muted }) {
  const c = integration.config || {}
  const src = useMemo(() => {
    const mute = c.muted || muted ? 1 : 0
    const common = `autoplay=1&mute=${mute}&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3`
    if (c.video_id) return `https://www.youtube.com/embed/${c.video_id}?${common}&loop=1&playlist=${c.video_id}${c.list_id ? `&list=${c.list_id}` : ''}`
    return `https://www.youtube.com/embed/videoseries?list=${c.list_id}&${common}&loop=1`
  }, [c.video_id, c.list_id, c.muted, muted])
  return <iframe className="cm-frame" style={{ background: '#000' }} src={src} title={integration.name} allow="autoplay; encrypted-media; fullscreen" />
}
