import { useEffect, useState } from 'react'
import { Tv, Layers, Repeat, Megaphone, Check } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { DAYS_SHORT } from '../../lib/format'
import { useToast } from '../../components/feedback'
import { Button, ColorPicker, Field, Input, Modal, Select, Toggle, cn } from '../../components/ui'

const EMPTY = {
  name: '', playlist_id: '', mode: 'replace', insert_every: 3, priority: 10, days: [0, 1, 2, 3, 4, 5, 6],
  all_day: true, start_time: '08:00', end_time: '18:00', start_date: '', end_date: '', is_active: true, color: '#6366f1', targets: [],
}

export default function ScheduleForm({ open, onClose, schedule, preset, screens, groups, playlists, onSaved }) {
  const { orgId, isGuest, org } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (schedule) {
      setForm({
        ...EMPTY,
        ...schedule,
        all_day: !schedule.start_time,
        start_time: schedule.start_time || '08:00',
        end_time: schedule.end_time || '18:00',
        start_date: schedule.start_date || '',
        end_date: schedule.end_date || '',
        targets: schedule.targets.map((t) => ({ type: t.type, id: t.id })),
      })
    } else {
      setForm({ ...EMPTY, ...(preset || {}) })
    }
  }, [open, schedule]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const hasTarget = (type, id) => form.targets.some((t) => t.type === type && t.id === id)
  const toggleTarget = (type, id) => set({ targets: hasTarget(type, id) ? form.targets.filter((t) => !(t.type === type && t.id === id)) : [...form.targets, { type, id }] })
  const toggleDay = (d) => set({ days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d].sort() })

  const editableScreens = isGuest ? screens.filter((s) => org?.guest_screens?.[s.id] === 'editor') : screens

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = {
        ...form,
        start_time: form.all_day ? null : form.start_time,
        end_time: form.all_day ? null : form.end_time,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      }
      if (schedule) await api.put(`orgs/${orgId}/schedules/${schedule.id}`, body)
      else await api.post(`orgs/${orgId}/schedules`, body)
      toast.success(schedule ? 'Programação atualizada' : 'Programação criada — as TVs atualizam em instantes')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={schedule ? 'Editar programação' : 'Nova programação'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="schedule-form" loading={saving}>Salvar</Button></>}
    >
      <form id="schedule-form" onSubmit={submit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome">
            <Input required autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Manhã, Campanha Loja X" />
          </Field>
          <Field label="Playlist">
            <Select required value={form.playlist_id} onChange={(e) => set({ playlist_id: Number(e.target.value) || '' })}>
              <option value="">Selecione…</option>
              {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        </div>

        <Field label="Tipo">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ['replace', Repeat, 'Programação', 'Ocupa a TV no horário escolhido (substitui a playlist padrão).'],
              ['insert', Megaphone, 'Campanha intercalada', 'Inserida entre os itens da programação — ideal para anúncios.'],
            ].map(([v, Icon, label, desc]) => (
              <button key={v} type="button" onClick={() => set({ mode: v })} className={cn('flex gap-3 rounded-xl p-3 text-left ring-1 transition', form.mode === v ? 'bg-brand-50 ring-brand-300' : 'ring-slate-200 hover:bg-slate-50')}>
                <Icon className={cn('mt-0.5 size-5 shrink-0', form.mode === v ? 'text-brand-600' : 'text-slate-400')} />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{label}</span>
                  <span className="block text-xs text-slate-500">{desc}</span>
                </span>
              </button>
            ))}
          </div>
          {form.mode === 'insert' && (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              Exibir a cada
              <Input type="number" min={1} max={50} value={form.insert_every} onChange={(e) => set({ insert_every: Number(e.target.value) })} className="h-9 w-20 text-center" />
              itens da programação
            </div>
          )}
        </Field>

        <Field label="Em quais TVs?">
          <div className="space-y-3">
            {!isGuest && groups.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400"><Layers className="size-3.5" />Grupos</p>
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => {
                    const on = hasTarget('group', g.id)
                    return (
                      <button key={g.id} type="button" onClick={() => toggleTarget('group', g.id)} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition', on ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200')}>
                        {on ? <Check className="size-3.5" /> : <span className="size-2 rounded-full" style={{ background: g.color }} />}{g.name}
                        <span className="text-xs opacity-60">{g.screens_count}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400"><Tv className="size-3.5" />TVs</p>
              <div className="flex flex-wrap gap-2">
                {editableScreens.map((s) => {
                  const on = hasTarget('screen', s.id)
                  return (
                    <button key={s.id} type="button" onClick={() => toggleTarget('screen', s.id)} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition', on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200')}>
                      {on && <Check className="size-3.5" />}{s.name}
                    </button>
                  )
                })}
                {editableScreens.length === 0 && <p className="text-sm text-slate-500">Nenhuma TV disponível.</p>}
              </div>
            </div>
          </div>
        </Field>

        <Field label="Dias da semana">
          <div className="grid grid-cols-7 gap-1.5">
            {DAYS_SHORT.map((d, i) => (
              <button key={i} type="button" onClick={() => toggleDay(i)} className={cn('h-10 rounded-xl text-sm font-semibold ring-1 transition', form.days.includes(i) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-500 ring-slate-200')}>{d}</button>
            ))}
          </div>
          <div className="mt-2 flex gap-3 text-xs font-medium text-brand-600">
            <button type="button" onClick={() => set({ days: [0, 1, 2, 3, 4, 5, 6] })}>Todos</button>
            <button type="button" onClick={() => set({ days: [1, 2, 3, 4, 5] })}>Seg a Sex</button>
            <button type="button" onClick={() => set({ days: [0, 6] })}>Fim de semana</button>
          </div>
        </Field>

        <div className="space-y-3">
          <Toggle label="Dia todo" description="Desligue para escolher um horário" checked={form.all_day} onChange={(v) => set({ all_day: v })} />
          {!form.all_day && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Das"><Input type="time" required value={form.start_time} onChange={(e) => set({ start_time: e.target.value })} /></Field>
              <Field label="Até"><Input type="time" required value={form.end_time} onChange={(e) => set({ end_time: e.target.value })} /></Field>
            </div>
          )}
          {!form.all_day && form.end_time < form.start_time && <p className="text-xs text-amber-600">Atravessa a meia-noite: termina no dia seguinte.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Início" optional hint="Deixe vazio para começar já"><Input type="date" value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} /></Field>
          <Field label="Fim" optional hint="Vazio = sem data para acabar"><Input type="date" value={form.end_date} onChange={(e) => set({ end_date: e.target.value })} /></Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prioridade" hint="Se duas programações coincidirem, vale a de maior prioridade.">
            <Select value={form.priority} onChange={(e) => set({ priority: Number(e.target.value) })}>
              <option value={5}>Baixa</option>
              <option value={10}>Normal</option>
              <option value={50}>Alta</option>
              <option value={100}>Máxima (urgente)</option>
              {![5, 10, 50, 100].includes(form.priority) && <option value={form.priority}>Personalizada ({form.priority})</option>}
            </Select>
          </Field>
          <Field label="Cor na grade"><ColorPicker value={form.color} onChange={(color) => set({ color })} colors={['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4']} /></Field>
        </div>

        <Toggle label="Programação ativa" description="Desative para pausar sem excluir" checked={form.is_active} onChange={(v) => set({ is_active: v })} />
      </form>
    </Modal>
  )
}
