import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarClock, Plus, List, CalendarDays, Pencil, Trash2, ListVideo, Tv, Layers, Megaphone, CalendarRange } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useFetch } from '../../lib/hooks'
import { DAYS_SHORT, describeDays, describeTime, formatDate } from '../../lib/format'
import { scheduleMatches, zonedNow } from '../../lib/schedule'
import { useConfirm, useToast } from '../../components/feedback'
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, PageHeader, PageLoader, Segmented, Select, Toggle, cn } from '../../components/ui'
import ScheduleForm from './ScheduleForm'

const toMin = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : 0)

function WeekGrid({ schedules, timezone, onEdit }) {
  const now = zonedNow(timezone)
  const allDay = schedules.filter((s) => s.is_active && !s.start_time)
  const timed = schedules.filter((s) => s.is_active && s.start_time)

  // Blocos por dia, com faixas (lanes) para sobreposições
  const days = DAYS_SHORT.map((_, d) => {
    const blocks = []
    timed.forEach((s) => {
      const a = toMin(s.start_time)
      const b = toMin(s.end_time)
      if (a < b) { if (s.days.includes(d)) blocks.push({ s, a, b }) } else {
        if (s.days.includes(d)) blocks.push({ s, a, b: 1440 })
        if (s.days.includes((d + 6) % 7)) blocks.push({ s, a: 0, b })
      }
    })
    blocks.sort((x, y) => x.a - y.a)
    const lanes = []
    blocks.forEach((bl) => {
      let lane = lanes.findIndex((end) => end <= bl.a)
      if (lane === -1) { lane = lanes.length; lanes.push(0) }
      lanes[lane] = bl.b
      bl.lane = lane
    })
    blocks.forEach((bl) => { bl.lanes = Math.max(1, lanes.length) })
    return blocks
  })

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const H = 36 // px por hora
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold text-slate-600">
            <div />
            {DAYS_SHORT.map((d, i) => (
              <div key={i} className={cn('py-2.5', i === now.dow && 'text-brand-700')}>
                {d}{i === now.dow && <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] text-white">hoje</span>}
              </div>
            ))}
          </div>
          {allDay.length > 0 && (
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-slate-200">
              <div className="py-1.5 pr-2 text-right text-[10px] font-medium uppercase text-slate-400">Dia todo</div>
              {DAYS_SHORT.map((_, d) => (
                <div key={d} className="space-y-1 border-l border-slate-100 p-1">
                  {allDay.filter((s) => s.days.includes(d)).map((s) => (
                    <button key={s.id} type="button" onClick={() => onEdit(s)} className={cn('block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-semibold text-white', s.mode === 'insert' && 'bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.18)_0_6px,transparent_6px_12px)]')} style={{ backgroundColor: s.color }}>
                      {s.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="relative grid grid-cols-[56px_repeat(7,1fr)]" style={{ height: H * 24 }}>
            <div className="relative">
              {hours.map((h) => <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-slate-400" style={{ top: h * H }}>{h > 0 && `${String(h).padStart(2, '0')}:00`}</div>)}
            </div>
            {days.map((blocks, d) => (
              <div key={d} className={cn('relative border-l border-slate-100', d === now.dow && 'bg-brand-50/30')}>
                {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-slate-100" style={{ top: h * H }} />)}
                {blocks.map((bl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onEdit(bl.s)}
                    className={cn('absolute overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight text-white shadow-sm ring-1 ring-white/50 transition hover:brightness-110', bl.s.mode === 'insert' && 'bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.18)_0_6px,transparent_6px_12px)]')}
                    style={{ top: (bl.a / 60) * H, height: Math.max(18, ((bl.b - bl.a) / 60) * H - 2), left: `calc(${(bl.lane / bl.lanes) * 100}% + 2px)`, width: `calc(${100 / bl.lanes}% - 4px)`, backgroundColor: bl.s.color }}
                  >
                    <b className="block truncate">{bl.s.name}</b>
                    <span className="block truncate opacity-90">{bl.s.start_time}–{bl.s.end_time}</span>
                  </button>
                ))}
                {d === now.dow && <div className="absolute inset-x-0 z-10 border-t-2 border-rose-500" style={{ top: (now.minutes / 60) * H }}><span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-rose-500" /></div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function SchedulesPage() {
  const { orgId, can, isGuest, org } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const screenFilter = params.get('tv') || ''
  const [view, setView] = useState(() => (window.innerWidth >= 1024 ? 'week' : 'list'))
  const { data, error, loading, reload, setData } = useFetch(`orgs/${orgId}/schedules${screenFilter ? `?screen_id=${screenFilter}` : ''}`)
  const { data: screensData } = useFetch(`orgs/${orgId}/screens`)
  const { data: groupsData } = useFetch(isGuest ? null : `orgs/${orgId}/groups`)
  const { data: playlistsData } = useFetch(`orgs/${orgId}/playlists`)
  const [form, setForm] = useState({ open: false, schedule: null, preset: null })

  const canCreate = can('editor') || Object.values(org?.guest_screens || {}).includes('editor')

  useEffect(() => {
    if (params.get('nova') === '1') {
      const preset = {}
      if (params.get('tv')) preset.targets = [{ type: 'screen', id: Number(params.get('tv')) }]
      if (params.get('playlist')) preset.playlist_id = Number(params.get('playlist'))
      setForm({ open: true, schedule: null, preset })
      params.delete('nova')
      params.delete('playlist')
      setParams(params, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const schedules = data?.schedules || []
  const timezone = data?.timezone || org?.timezone
  const now = useMemo(() => zonedNow(timezone), [timezone, data]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (s, v) => {
    setData((d) => ({ ...d, schedules: d.schedules.map((x) => (x.id === s.id ? { ...x, is_active: v } : x)) }))
    try {
      await api.put(`orgs/${orgId}/schedules/${s.id}`, { is_active: v })
      toast.success(v ? 'Programação ativada' : 'Programação pausada')
    } catch (e) {
      toast.error(e)
      reload(true)
    }
  }
  const remove = async (s) => {
    if (!(await confirm({ title: 'Excluir programação?', message: `"${s.name}" deixará de ser exibida nas TVs.`, danger: true, confirmLabel: 'Excluir' }))) return
    try {
      await api.del(`orgs/${orgId}/schedules/${s.id}`)
      toast.success('Programação excluída')
      reload(true)
    } catch (e) {
      toast.error(e)
    }
  }
  const edit = (s) => s.can_edit && setForm({ open: true, schedule: s, preset: null })

  return (
    <div>
      <PageHeader
        title="Programação"
        description="Defina o que cada TV exibe, em quais dias e horários."
        actions={canCreate && <Button icon={Plus} onClick={() => setForm({ open: true, schedule: null, preset: screenFilter ? { targets: [{ type: 'screen', id: Number(screenFilter) }] } : null })}>Nova programação</Button>}
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={screenFilter} onChange={(e) => { e.target.value ? params.set('tv', e.target.value) : params.delete('tv'); setParams(params, { replace: true }) }} className="sm:w-72">
          <option value="">Todas as TVs</option>
          {screensData?.screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'Lista', icon: List }, { value: 'week', label: 'Semana', icon: CalendarDays }]} />
      </div>

      {loading && !data ? <PageLoader /> : error ? <ErrorState error={error} onRetry={reload} /> : schedules.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nenhuma programação"
          description="Sem programação, cada TV exibe sua playlist padrão o tempo todo. Crie programações para trocar o conteúdo por horário, dia da semana ou período — por TV ou por grupo."
          action={canCreate && <Button icon={Plus} onClick={() => setForm({ open: true, schedule: null, preset: null })}>Criar programação</Button>}
        />
      ) : view === 'week' ? (
        <>
          <WeekGrid schedules={schedules} timezone={timezone} onEdit={edit} />
          <p className="mt-3 text-xs text-slate-500">Blocos listrados são campanhas intercaladas. Horários no fuso {timezone}. Toque em um bloco para editar.</p>
        </>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => {
            const live = scheduleMatches(s, now)
            return (
              <Card key={s.id} padded={false} className={cn('flex overflow-hidden', !s.is_active && 'opacity-60')}>
                <div className="w-1.5 shrink-0" style={{ background: s.color }} />
                <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{s.name}</h3>
                      {live && <Badge color="green" dot>No ar agora</Badge>}
                      {s.mode === 'insert' && <Badge color="amber"><Megaphone className="size-3" />A cada {s.insert_every} itens</Badge>}
                      {s.priority > 10 && <Badge color="red">Prioridade {s.priority >= 100 ? 'máxima' : 'alta'}</Badge>}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><ListVideo className="size-4 text-slate-400" />{s.playlist_name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {describeDays(s.days)} · {describeTime(s)}
                      {(s.start_date || s.end_date) && <span className="ml-1 inline-flex items-center gap-1"><CalendarRange className="size-3.5" />{s.start_date ? formatDate(s.start_date) : '…'} até {s.end_date ? formatDate(s.end_date) : '…'}</span>}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.targets.map((t) => (
                        <span key={t.type + t.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {t.type === 'group' ? <Layers className="size-3" style={{ color: t.color }} /> : <Tv className="size-3" />}{t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  {s.can_edit && (
                    <div className="flex items-center gap-1 self-end sm:self-center">
                      <Toggle checked={s.is_active} onChange={(v) => toggle(s, v)} />
                      <IconButton icon={Pencil} label="Editar" onClick={() => edit(s)} />
                      <IconButton icon={Trash2} label="Excluir" variant="danger-ghost" onClick={() => remove(s)} />
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ScheduleForm
        open={form.open}
        onClose={() => setForm({ open: false, schedule: null, preset: null })}
        schedule={form.schedule}
        preset={form.preset}
        screens={screensData?.screens || []}
        groups={groupsData?.groups || []}
        playlists={playlistsData?.playlists || []}
        onSaved={() => reload(true)}
      />
    </div>
  )
}
