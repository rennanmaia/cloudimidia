import { useMemo, useState } from 'react'
import { BarChart3, PlayCircle, Clock, Tv, Download, Image as ImageIcon, Film, Puzzle } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useFetch } from '../lib/hooks'
import { formatDateTime, formatDuration } from '../lib/format'
import { INTEGRATION_TYPES } from '../lib/integrationTypes'
import { Card, CardTitle, EmptyState, ErrorState, Input, PageHeader, PageLoader, Segmented, Select, Stat } from '../components/ui'

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function range(preset) {
  const to = new Date()
  const from = new Date()
  if (preset === '7') from.setDate(to.getDate() - 6)
  if (preset === '30') from.setDate(to.getDate() - 29)
  if (preset === 'month') from.setDate(1)
  return { from: iso(from), to: iso(to) }
}

function DayChart({ days }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...days.map((d) => d.plays))
  const ticks = [max, Math.round(max / 2), 0]
  const label = (day) => new Date(day + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const every = Math.ceil(days.length / 10)
  return (
    <div className="relative">
      <div className="flex h-56 gap-2">
        <div className="flex flex-col justify-between pb-6 text-right text-[11px] text-slate-400">
          {ticks.map((t, i) => <span key={i}>{t.toLocaleString('pt-BR')}</span>)}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
            {ticks.map((_, i) => <div key={i} className="border-t border-slate-100" />)}
          </div>
          <div className="absolute inset-x-0 top-0 bottom-6 flex items-end gap-[2px]">
            {days.map((d, i) => (
              <div
                key={d.day}
                className="flex h-full flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onTouchStart={() => setHover(i)}
              >
                <div
                  className="w-full max-w-7 rounded-t-[4px] bg-brand-500 transition-opacity"
                  style={{ height: `${(d.plays / max) * 100}%`, minHeight: d.plays ? 2 : 0, opacity: hover === null || hover === i ? 1 : 0.45 }}
                />
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex gap-[2px]">
            {days.map((d, i) => (
              <span key={d.day} className="flex-1 truncate text-center text-[10px] text-slate-400">{i % every === 0 ? label(d.day) : ''}</span>
            ))}
          </div>
          {hover !== null && days[hover] && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
              style={{ left: `${((hover + 0.5) / days.length) * 100}%` }}
            >
              <b>{label(days[hover].day)}</b><br />
              {days[hover].plays.toLocaleString('pt-BR')} exibições · {formatDuration(days[hover].seconds)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const { orgId, isGuest } = useAuth()
  const [preset, setPreset] = useState('7')
  const [custom, setCustom] = useState(range('7'))
  const [screen, setScreen] = useState('')
  const [group, setGroup] = useState('')
  const r = preset === 'custom' ? custom : range(preset)
  const { data, error, loading, reload } = useFetch(`orgs/${orgId}/reports/plays?from=${r.from}&to=${r.to}&screen_id=${screen}&group_id=${group}`)
  const { data: screens } = useFetch(`orgs/${orgId}/screens`)
  const { data: groups } = useFetch(isGuest ? null : `orgs/${orgId}/groups`)

  const exportCsv = () => {
    const rows = [['Conteúdo', 'Tipo', 'Exibições', 'Tempo total (s)', 'TVs', 'Última exibição']]
    data.by_content.forEach((c) => rows.push([c.name, c.type, c.plays, c.seconds, c.screens, formatDateTime(c.last_played)]))
    rows.push([])
    rows.push(['TV', '', 'Exibições', 'Tempo total (s)'])
    data.by_screen.forEach((s) => rows.push([s.name, '', s.plays, s.seconds]))
    const csv = rows.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `exibicoes_${data.from}_${data.to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const typeIcon = useMemo(() => ({ image: ImageIcon, video: Film }), [])

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Comprovação de exibição: quantas vezes e por quanto tempo cada conteúdo passou nas TVs."
        actions={data?.by_content.length > 0 && <button type="button" onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"><Download className="size-4" />Exportar CSV</button>}
      />

      <Card className="mb-5 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Segmented className="overflow-x-auto no-scrollbar" value={preset} onChange={setPreset} options={[{ value: 'today', label: 'Hoje' }, { value: '7', label: '7 dias' }, { value: '30', label: '30 dias' }, { value: 'month', label: 'Este mês' }, { value: 'custom', label: 'Período' }]} />
          <div className="grid flex-1 grid-cols-2 gap-2 lg:flex lg:justify-end">
            <Select value={screen} onChange={(e) => setScreen(e.target.value)} className="h-10 lg:w-52">
              <option value="">Todas as TVs</option>
              {screens?.screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            {!isGuest && (
              <Select value={group} onChange={(e) => setGroup(e.target.value)} className="h-10 lg:w-44">
                <option value="">Todos os grupos</option>
                {groups?.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            )}
          </div>
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2 sm:w-96">
            <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="h-10" />
            <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="h-10" />
          </div>
        )}
      </Card>

      {loading && !data ? <PageLoader /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            <Stat label="Exibições" value={data.summary.plays.toLocaleString('pt-BR')} icon={PlayCircle} />
            <Stat label="Tempo no ar" value={formatDuration(data.summary.seconds)} icon={Clock} color="sky" />
            <Stat label="TVs com exibição" value={data.summary.screens} icon={Tv} color="green" />
          </div>

          <Card>
            <CardTitle icon={BarChart3}>Exibições por dia</CardTitle>
            <DayChart days={data.by_day} />
          </Card>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card padded={false} className="overflow-hidden lg:col-span-2">
              <div className="p-4 sm:p-5"><CardTitle className="mb-0">Por conteúdo</CardTitle></div>
              {data.by_content.length === 0 ? <EmptyState icon={PlayCircle} title="Sem exibições no período" description="Os registros aparecem conforme as TVs exibem o conteúdo." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr><th className="px-5 py-2.5">Conteúdo</th><th className="px-3 py-2.5 text-right">Exibições</th><th className="px-3 py-2.5 text-right">Tempo</th><th className="px-5 py-2.5 text-right">TVs</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.by_content.map((c, i) => {
                        const Icon = typeIcon[c.type] || INTEGRATION_TYPES[c.type]?.icon || Puzzle
                        return (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-5 py-2.5"><span className="flex items-center gap-2 font-medium text-slate-800"><Icon className="size-4 shrink-0 text-slate-400" /><span className="truncate">{c.name}</span></span></td>
                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{c.plays.toLocaleString('pt-BR')}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{formatDuration(c.seconds)}</td>
                            <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">{c.screens}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card>
              <CardTitle icon={Tv}>Por TV</CardTitle>
              {data.by_screen.length === 0 ? <p className="text-sm text-slate-500">Sem dados.</p> : (
                <ul className="space-y-3">
                  {data.by_screen.map((s) => (
                    <li key={s.id}>
                      <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate font-medium text-slate-700">{s.name}</span><span className="tabular-nums text-slate-500">{s.plays.toLocaleString('pt-BR')}</span></div>
                      <div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(s.plays / data.by_screen[0].plays) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
