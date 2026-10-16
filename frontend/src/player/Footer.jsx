import { useEffect, useMemo, useState } from 'react'
import { useIntegrationData, weatherInfo } from './widgets'
import { futdigitalTickerItems } from './FutDigitalWidget'

const SIZES = { sm: '7cqh', md: '9cqh', lg: '12cqh' }
const MIN_PX = { sm: 30, md: 36, lg: 46 }
const SPEED = { slow: 0.24, normal: 0.16, fast: 0.1 }
const SCROLLING = ['news', 'text', 'sports', 'futdigital']

function useNow(ms) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

function Marquee({ items, speed }) {
  if (!items.length) return <div className="cm-fmarquee" />
  const duration = Math.max(15, items.join(' ').length * (SPEED[speed] || SPEED.normal))
  return (
    <div className="cm-fmarquee">
      <div key={items.join('|')} className="cm-fmarquee-text" style={{ animationDuration: `${duration}s` }}>
        {items.map((t, i) => <span key={i}>{t}</span>)}
      </div>
    </div>
  )
}

function Label({ children }) {
  return children ? <div className="cm-flabel">{children}</div> : null
}

function NewsSlot({ slot, integration, fetchData, speed }) {
  const data = useIntegrationData(integration, fetchData)
  return (
    <>
      <Label>{slot.label || data?.source || integration?.name}</Label>
      <Marquee items={(data?.items || []).map((i) => i.title)} speed={speed} />
    </>
  )
}

function TextSlot({ slot, speed }) {
  const lines = (slot.text || '').split('\n').filter(Boolean)
  const [i, setI] = useState(0)
  useEffect(() => {
    if (slot.scroll !== false || lines.length < 2) return
    const t = setInterval(() => setI((x) => (x + 1) % lines.length), 8000)
    return () => clearInterval(t)
  }, [slot.scroll, lines.length])
  return (
    <>
      <Label>{slot.label}</Label>
      {slot.scroll === false
        ? <div key={i} className="cm-fstatic">{lines[i % Math.max(1, lines.length)]}</div>
        : <Marquee items={lines} speed={speed} />}
    </>
  )
}

function SportsSlot({ integration, fetchData, speed }) {
  const data = useIntegrationData(integration, fetchData)
  const items = (data?.events || []).map((e) => {
    const score = e.state === 'pre'
      ? new Date(e.date).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '')
      : `${e.home.score ?? 0} × ${e.away.score ?? 0}${e.state === 'in' ? ' (ao vivo)' : ''}`
    return `${e.home.abbr || e.home.name} ${score} ${e.away.abbr || e.away.name}`
  })
  return (
    <>
      <Label>{integration?.config?.title || data?.league || 'Placar'}</Label>
      <Marquee items={items} speed={speed} />
    </>
  )
}

function FutDigitalSlot({ integration, fetchData, speed }) {
  const data = useIntegrationData(integration, fetchData)
  return (
    <>
      <Label>{integration?.config?.title || data?.competition?.name || 'Placar'}</Label>
      <Marquee items={futdigitalTickerItems(data)} speed={speed} />
    </>
  )
}

function WeatherSlot({ integration, fetchData }) {
  const data = useIntegrationData(integration, fetchData)
  if (!data?.current) return null
  const info = weatherInfo(data.current.code, data.current.is_day)
  const today = data.daily?.[0]
  return (
    <>
      <info.Icon className="cm-ficon" strokeWidth={1.8} />
      <div className="cm-fstack">
        <b>{data.current.temp}°</b>
        <small>{data.city}{today ? ` · ${today.min}°/${today.max}°` : ''}</small>
      </div>
    </>
  )
}

function CurrencySlot({ integration, fetchData }) {
  const data = useIntegrationData(integration, fetchData)
  const quotes = data?.quotes || []
  const [i, setI] = useState(0)
  useEffect(() => {
    if (quotes.length < 2) return
    const t = setInterval(() => setI((x) => (x + 1) % quotes.length), 4000)
    return () => clearInterval(t)
  }, [quotes.length])
  const q = quotes[i % Math.max(1, quotes.length)]
  if (!q) return null
  const digits = q.bid >= 1000 ? 0 : q.bid < 1 ? 4 : 2
  return (
    <div key={q.code} className="cm-fstack cm-ffade">
      <b>{q.code} {q.bid.toLocaleString('pt-BR', { style: 'currency', currency: q.codein || 'BRL', minimumFractionDigits: digits, maximumFractionDigits: digits })}</b>
      <small className={q.pct >= 0 ? 'cm-up' : 'cm-down'}>{q.pct >= 0 ? '▲' : '▼'} {Math.abs(q.pct).toFixed(2).replace('.', ',')}%</small>
    </div>
  )
}

function ClockSlot({ slot, timezone }) {
  const now = useNow(1000)
  const opts = timezone ? { timeZone: timezone } : {}
  let time, date
  try {
    time = now.toLocaleTimeString('pt-BR', { ...opts, hour: '2-digit', minute: '2-digit' })
    date = now.toLocaleDateString('pt-BR', { ...opts, weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '')
  } catch {
    time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    date = now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
  }
  return slot.show_date === false
    ? <b className="cm-fclock">{time}</b>
    : <div className="cm-fstack"><b className="cm-fclock">{time}</b><small style={{ textTransform: 'capitalize' }}>{date}</small></div>
}

/** Barra inferior configurável */
export default function Footer({ footer, integrations, fetchData, org }) {
  const slots = useMemo(() => (footer?.slots || []).filter((s) => {
    if (s.type === 'logo') return !!org?.logo_url || !!org?.name
    if (s.type === 'image') return !!s.media?.url
    if (s.integration_id) return !!integrations?.[s.integration_id]
    return true
  }), [footer, integrations, org])
  if (!footer?.enabled || !slots.length) return null

  const size = footer.size || 'md'
  const style = {
    '--fh': SIZES[size],
    '--fbg': footer.background || '#111827',
    '--fc': footer.color || '#ffffff',
    '--fa': footer.accent || '#6366f1',
    minHeight: MIN_PX[size],
  }
  const hasGrow = slots.some((s) => SCROLLING.includes(s.type))

  return (
    <div className="cm-footer" style={style}>
      {slots.map((s, i) => {
        const integ = s.integration_id ? integrations[s.integration_id] : null
        const grow = SCROLLING.includes(s.type)
        let content = null
        switch (s.type) {
          case 'logo':
            content = org?.logo_url ? <img className="cm-fimg cm-flogo" src={org.logo_url} alt="" /> : <b className="cm-forg">{org?.name}</b>
            break
          case 'image': content = <img className="cm-fimg" src={s.media.url} alt="" />; break
          case 'news': content = <NewsSlot slot={s} integration={integ} fetchData={fetchData} speed={footer.speed} />; break
          case 'text': content = <TextSlot slot={s} speed={footer.speed} />; break
          case 'futdigital': content = <FutDigitalSlot integration={integ} fetchData={fetchData} speed={footer.speed} />; break
          case 'sports': content = <SportsSlot integration={integ} fetchData={fetchData} speed={footer.speed} />; break
          case 'weather': content = <WeatherSlot integration={integ} fetchData={fetchData} />; break
          case 'currency': content = <CurrencySlot integration={integ} fetchData={fetchData} />; break
          case 'clock': content = <ClockSlot slot={s} timezone={org?.timezone} />; break
          default: break
        }
        return (
          <div key={i} className={`cm-fslot cm-fslot-${s.type}${grow ? ' grow' : ''}${!hasGrow && i === slots.length - 1 ? ' push' : ''}`}>
            {content}
          </div>
        )
      })}
    </div>
  )
}
