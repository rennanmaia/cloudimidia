import { useEffect, useMemo, useState } from 'react'

const chunk = (list, n) => {
  const out = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}

/** Transforma as seções da API em páginas de tamanho fixo. */
function buildPages(data, perPage) {
  const pages = []
  for (const s of data?.sections || []) {
    if (s.type === 'matches') {
      chunk(s.matches, perPage).forEach((items) => pages.push({ kind: 'matches', view: s.view, title: s.title, items }))
    } else if (s.type === 'standings') {
      for (const g of s.groups) {
        const title = s.groups.length > 1 || g.name !== 'Classificação geral' ? `Classificação · ${g.name}` : 'Classificação'
        chunk(g.rows, 10).forEach((rows) => pages.push({ kind: 'standings', title, rows }))
      }
    } else if (s.type === 'scorers') {
      chunk(s.rows, 10).forEach((rows, k) => pages.push({ kind: 'scorers', title: 'Artilharia', rows, offset: k * 10 }))
    }
  }
  return pages
}

function useTick(ms) {
  const [, setN] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [ms])
}

function LiveClock({ match, fetchedAt }) {
  useTick(1000)
  const c = match.clock
  if (!c) return <>{match.period || 'AO VIVO'}</>
  const elapsed = c.running && fetchedAt ? Math.max(0, (Date.now() - new Date(fetchedAt).getTime()) / 1000) : 0
  const minute = Math.floor((c.seconds + elapsed) / 60) + 1
  return <>{c.label || match.period || ''} {minute}&apos;</>
}

function when(m) {
  try {
    const d = new Date(m.scheduled_at)
    const opts = { timeZone: m.timezone || 'America/Sao_Paulo' }
    const day = d.toLocaleDateString('pt-BR', { ...opts, weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '')
    const time = d.toLocaleTimeString('pt-BR', { ...opts, hour: '2-digit', minute: '2-digit' })
    return { day, time }
  } catch {
    return { day: '', time: '' }
  }
}

function Crest({ src }) {
  return src ? <img className="cm-fd-crest" src={src} alt="" referrerPolicy="no-referrer" /> : <span className="cm-fd-crest cm-fd-crest-empty" />
}

function Match({ m, fetchedAt, showCompetition }) {
  const live = m.status === 'live'
  const finished = m.status === 'finished'
  const w = when(m)
  const score = (t) => (t.score ?? 0)
  const pens = m.home.pens != null && m.away.pens != null
  const meta = [showCompetition && m.competition, m.group || m.round || m.stage].filter(Boolean).join(' · ')
  return (
    <div className={`cm-fd-match${live ? ' live' : ''}`}>
      <div className="cm-fd-team">
        <Crest src={m.home.crest} />
        <span>{m.home.name}</span>
      </div>
      <div className="cm-fd-center">
        {live || finished ? (
          <b className="cm-fd-score">{score(m.home)} <i>×</i> {score(m.away)}</b>
        ) : (
          <b className="cm-fd-time">{w.time}</b>
        )}
        {pens && <small className="cm-fd-pens">pên. {m.home.pens}–{m.away.pens}</small>}
        <small className={`cm-fd-status${live ? ' live' : ''}`}>
          {live ? <LiveClock match={m} fetchedAt={fetchedAt} /> : finished ? 'Encerrado' : (m.status_label && m.status !== 'scheduled' ? m.status_label : w.day)}
        </small>
      </div>
      <div className="cm-fd-team away">
        <Crest src={m.away.crest} />
        <span>{m.away.name}</span>
      </div>
      {meta && <div className="cm-fd-meta">{meta}{m.venue && !live ? ` · ${m.venue}` : ''}</div>}
    </div>
  )
}

function Standings({ rows }) {
  return (
    <table className="cm-fd-table">
      <thead>
        <tr><th>#</th><th className="team">Time</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th className="form">Últimos</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.pos + r.team}>
            <td className="pos" style={r.zone ? { boxShadow: `inset 0.5cqw 0 0 ${r.zone}` } : undefined}>{r.pos}</td>
            <td className="team"><div className="cm-fd-teamcell"><Crest src={r.crest} /><span>{r.team}</span></div></td>
            <td className="pts">{r.pts}</td><td>{r.j}</td><td>{r.v}</td><td>{r.e}</td><td>{r.d}</td>
            <td>{r.sg > 0 ? `+${r.sg}` : r.sg}</td>
            <td className="form">{(r.form || []).map((f, i) => <i key={i} className={`f-${f}`} />)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Scorers({ rows, offset }) {
  return (
    <ol className="cm-fd-scorers">
      {rows.map((s, i) => (
        <li key={i}>
          <span className="rank">{offset + i + 1}º</span>
          <Crest src={s.crest} />
          <span className="name">{s.name}<small>{s.team}</small></span>
          <b>{s.goals}</b><small className="lbl">gols</small>
        </li>
      ))}
    </ol>
  )
}

/**
 * Jogos do FutDigital em páginas que se alternam.
 * Sem duração fixa na playlist, passa por todas as páginas uma vez e chama onDone.
 */
export default function FutDigitalWidget({ integration, data, onDone }) {
  const cfg = integration.config || {}
  const perPage = cfg.per_page || 6
  const pageMs = (cfg.page_duration || 10) * 1000
  const pages = useMemo(() => buildPages(data, perPage), [data, perPage])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!data) {
      // Sem dados (sem internet e sem cache): não prende a programação
      const t = onDone ? setTimeout(onDone, 20000) : null
      return () => t && clearTimeout(t)
    }
    const total = Math.max(1, pages.length)
    const t = setTimeout(() => {
      if (index + 1 >= total) {
        if (onDone) onDone()
        else setIndex(0)
      } else {
        setIndex(index + 1)
      }
    }, pageMs)
    return () => clearTimeout(t)
  }, [data, index, pages.length, pageMs, onDone])

  if (!data) return <div className="cm-loading"><div className="cm-spinner" /></div>
  const page = pages[Math.min(index, pages.length - 1)]
  const logo = data.competition?.logo || page?.items?.[0]?.competition_logo
  const allCompetitions = !data.competition

  return (
    <div className={`cm-widget cm-fd per-${perPage}`}>
      <div className="cm-fd-head">
        {logo && <img src={logo} alt="" className="cm-fd-logo" referrerPolicy="no-referrer" />}
        <div className="cm-fd-titles">
          <h2>{data.title}</h2>
          <p>{page ? page.title : 'Sem jogos no momento'}{data.competition?.city ? ` · ${data.competition.city}` : ''}</p>
        </div>
        {pages.length > 1 && <div className="cm-fd-pages">{pages.map((_, i) => <i key={i} className={i === index ? 'on' : ''} />)}</div>}
      </div>
      <div key={index} className="cm-fd-body">
        {!page && <div className="cm-fd-empty">Nenhum jogo para exibir agora.</div>}
        {page?.kind === 'matches' && (
          <div className="cm-fd-grid">
            {page.items.map((m) => <Match key={m.id} m={m} fetchedAt={data.fetched_at} showCompetition={allCompetitions} />)}
          </div>
        )}
        {page?.kind === 'standings' && <Standings rows={page.rows} />}
        {page?.kind === 'scorers' && <Scorers rows={page.rows} offset={page.offset} />}
      </div>
      <div className="cm-fd-brand">fut.digital</div>
    </div>
  )
}

/** Texto curto dos jogos para a faixa da barra inferior. */
export function futdigitalTickerItems(data) {
  const items = []
  for (const s of data?.sections || []) {
    if (s.type !== 'matches') continue
    for (const m of s.matches) {
      const h = m.home.short || m.home.name
      const a = m.away.short || m.away.name
      if (m.status === 'live') items.push(`AO VIVO ${h} ${m.home.score ?? 0} × ${m.away.score ?? 0} ${a}`)
      else if (m.status === 'finished') items.push(`${h} ${m.home.score ?? 0} × ${m.away.score ?? 0} ${a}`)
      else { const w = when(m); items.push(`${h} × ${a} · ${w.day} ${w.time}`) }
    }
  }
  return [...new Set(items)]
}
