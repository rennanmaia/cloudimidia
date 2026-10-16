import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Image as ImageIcon, Newspaper, MessageSquareText, CloudSun, Clock, TrendingUp, Trophy,
  Goal, ArrowUp, ArrowDown, Trash2, Plus, AlertTriangle, LayoutTemplate,
} from 'lucide-react'
import { Button, ColorPicker, Field, IconButton, Input, Modal, Segmented, Select, Textarea, Toggle, cn } from '../../components/ui'
import MediaPicker from '../../components/MediaPicker'
import { PreviewFrame } from '../../components/Preview'

export const SLOT_TYPES = {
  logo: { label: 'Logo da empresa', icon: Building2, color: 'bg-slate-100 text-slate-700' },
  image: { label: 'Imagem fixa', hint: 'Patrocinador, selo, QR Code…', icon: ImageIcon, color: 'bg-sky-100 text-sky-700' },
  news: { label: 'Notícias', hint: 'Manchetes rolando', icon: Newspaper, color: 'bg-rose-100 text-rose-600', integration: 'rss' },
  text: { label: 'Mensagens', hint: 'Avisos e promoções', icon: MessageSquareText, color: 'bg-indigo-100 text-indigo-600' },
  weather: { label: 'Previsão do tempo', icon: CloudSun, color: 'bg-cyan-100 text-cyan-700', integration: 'weather' },
  clock: { label: 'Relógio', icon: Clock, color: 'bg-slate-100 text-slate-700' },
  currency: { label: 'Cotações', icon: TrendingUp, color: 'bg-amber-100 text-amber-700', integration: 'currency' },
  sports: { label: 'Placar dos jogos', icon: Trophy, color: 'bg-emerald-100 text-emerald-700', integration: 'sports' },
  futdigital: { label: 'Placar FutDigital', hint: 'Jogos do FutDigital rolando', icon: Goal, color: 'bg-lime-100 text-lime-700', integration: 'futdigital' },
}

const INTEGRATION_LABEL = { futdigital: 'FutDigital', rss: 'notícias', weather: 'previsão do tempo', currency: 'cotações', sports: 'resultados de jogos' }

export const DEFAULT_FOOTER = { enabled: true, size: 'md', speed: 'normal', background: '#111827', color: '#ffffff', accent: '#6366f1', slots: [] }

const TEMPLATES = [
  { name: 'Notícias', slots: ['logo', 'news', 'clock'] },
  { name: 'Completa', slots: ['logo', 'news', 'weather', 'clock'] },
  { name: 'Patrocinador', slots: ['image', 'text', 'clock'] },
  { name: 'Mercado', slots: ['currency', 'news', 'clock'] },
  { name: 'Esportes', slots: ['logo', 'sports', 'clock'] },
  { name: 'Só relógio e clima', slots: ['logo', 'weather', 'clock'] },
]

const DARK = ['#111827', '#0f172a', '#1e1b4b', '#312e81', '#7f1d1d', '#14532d', '#ffffff', '#f1f5f9']

function newSlot(type, integrations) {
  const def = SLOT_TYPES[type]
  const slot = { type }
  if (def.integration) slot.integration_id = integrations.find((i) => i.type === def.integration)?.id ?? null
  if (type === 'text') Object.assign(slot, { text: '', label: 'Avisos', scroll: true })
  if (type === 'news') slot.label = ''
  if (type === 'clock') slot.show_date = true
  return slot
}

export function slotProblem(slot, integrations) {
  const def = SLOT_TYPES[slot.type]
  if (def?.integration && !integrations.some((i) => i.id === slot.integration_id)) return `Escolha a fonte de ${INTEGRATION_LABEL[def.integration]}.`
  if (slot.type === 'image' && !slot.media) return 'Escolha a imagem.'
  if (slot.type === 'text' && !slot.text?.trim()) return 'Escreva a mensagem.'
  return null
}

function SlotSettings({ slot, set, integrations, onPickImage }) {
  const navigate = useNavigate()
  const def = SLOT_TYPES[slot.type]
  if (def.integration) {
    const options = integrations.filter((i) => i.type === def.integration)
    return (
      <div className="space-y-2">
        {options.length === 0 ? (
          <p className="text-xs text-amber-700">
            Nenhuma integração de {INTEGRATION_LABEL[def.integration]} criada.{' '}
            <button type="button" className="font-semibold underline" onClick={() => navigate('/integracoes')}>Criar agora</button>
          </p>
        ) : (
          <Select value={slot.integration_id || ''} onChange={(e) => set({ integration_id: Number(e.target.value) || null })} className="h-9 text-sm">
            <option value="">Selecione…</option>
            {options.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        )}
        {slot.type === 'news' && <Input value={slot.label || ''} onChange={(e) => set({ label: e.target.value })} placeholder="Título da faixa (opcional, ex.: Últimas)" className="h-9 text-sm" />}
      </div>
    )
  }
  if (slot.type === 'image') {
    return (
      <div className="flex items-center gap-3">
        {slot.media && <img src={slot.media.url} alt="" className="h-10 max-w-32 rounded-md bg-slate-100 object-contain ring-1 ring-slate-200" />}
        <Button size="sm" variant="secondary" icon={ImageIcon} onClick={onPickImage}>{slot.media ? 'Trocar' : 'Escolher imagem'}</Button>
      </div>
    )
  }
  if (slot.type === 'text') {
    return (
      <div className="space-y-2">
        <Textarea value={slot.text || ''} onChange={(e) => set({ text: e.target.value })} className="min-h-16 text-sm" placeholder={'Uma mensagem por linha\nEx.: Promoção de inverno: 30% off'} />
        <div className="flex items-center gap-3">
          <Input value={slot.label || ''} onChange={(e) => set({ label: e.target.value })} placeholder="Título (opcional)" className="h-9 flex-1 text-sm" />
          <Toggle size="sm" checked={slot.scroll !== false} onChange={(v) => set({ scroll: v })} />
          <span className="text-xs text-slate-500">{slot.scroll !== false ? 'Rolando' : 'Alternando'}</span>
        </div>
      </div>
    )
  }
  if (slot.type === 'clock') {
    return <Toggle size="sm" label="Mostrar a data" checked={slot.show_date !== false} onChange={(v) => set({ show_date: v })} />
  }
  if (slot.type === 'logo') {
    return <p className="text-xs text-slate-500">Usa o logo cadastrado em Configurações (ou o nome da empresa).</p>
  }
  return null
}

export default function FooterEditor({ open, onClose, value, onApply, integrations, buildPreview }) {
  const [draft, setDraft] = useState(DEFAULT_FOOTER)
  const [adding, setAdding] = useState(false)
  const [picker, setPicker] = useState(null)
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft({ ...DEFAULT_FOOTER, ...(value || {}), slots: [...(value?.slots || [])] })
      setShowErrors(false)
      setAdding(false)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const setSlot = (i, patch) => setDraft((d) => ({ ...d, slots: d.slots.map((s, k) => (k === i ? { ...s, ...patch } : s)) }))
  const move = (i, dir) => setDraft((d) => {
    const slots = [...d.slots]
    const j = i + dir
    if (j < 0 || j >= slots.length) return d
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
    return { ...d, slots }
  })
  const remove = (i) => setDraft((d) => ({ ...d, slots: d.slots.filter((_, k) => k !== i) }))
  const add = (type) => { setDraft((d) => ({ ...d, enabled: true, slots: [...d.slots, newSlot(type, integrations)] })); setAdding(false) }
  const applyTemplate = (t) => setDraft((d) => ({ ...d, enabled: true, slots: t.slots.map((type) => newSlot(type, integrations)) }))

  const problems = draft.slots.map((s) => slotProblem(s, integrations))
  const valid = !draft.enabled || problems.every((p) => !p)
  const apply = () => {
    if (!valid) { setShowErrors(true); return }
    onApply(draft)
    onClose()
  }

  // Prévia mostra só os elementos já completos
  const previewFooter = { ...draft, slots: draft.slots.filter((_, i) => !problems[i]) }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      title="Barra inferior"
      description="Monte a faixa que aparece embaixo da tela enquanto a playlist toca."
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={apply}>Aplicar</Button></>}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="order-2 space-y-5 lg:order-1">
          <Toggle label="Exibir barra inferior" description="Desligue para a playlist ocupar a tela inteira." checked={draft.enabled} onChange={(v) => set({ enabled: v })} />

          {draft.enabled && (
            <>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700"><LayoutTemplate className="size-4 text-slate-400" />Começar de um modelo</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATES.map((t) => (
                    <button key={t.name} type="button" onClick={() => applyTemplate(t)} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-brand-50 hover:text-brand-700 hover:ring-brand-200">
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Elementos (da esquerda para a direita)</p>
                <ul className="space-y-2">
                  {draft.slots.map((s, i) => {
                    const def = SLOT_TYPES[s.type]
                    const err = showErrors && problems[i]
                    return (
                      <li key={i} className={cn('rounded-2xl bg-white p-3 ring-1', err ? 'ring-rose-300' : 'ring-slate-200')}>
                        <div className="flex items-center gap-2">
                          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', def.color)}><def.icon className="size-4" /></span>
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{def.label}</span>
                          <IconButton icon={ArrowUp} label="Mover para a esquerda" size="sm" disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-30" />
                          <IconButton icon={ArrowDown} label="Mover para a direita" size="sm" disabled={i === draft.slots.length - 1} onClick={() => move(i, 1)} className="disabled:opacity-30" />
                          <IconButton icon={Trash2} label="Remover" size="sm" variant="danger-ghost" onClick={() => remove(i)} />
                        </div>
                        <div className="mt-2 pl-10">
                          <SlotSettings slot={s} set={(p) => setSlot(i, p)} integrations={integrations} onPickImage={() => setPicker(i)} />
                          {err && <p className="mt-1.5 flex items-center gap-1 text-xs text-rose-600"><AlertTriangle className="size-3.5" />{err}</p>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {draft.slots.length < 8 && (
                  adding ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-200 sm:grid-cols-4">
                      {Object.entries(SLOT_TYPES).map(([type, def]) => (
                        <button key={type} type="button" onClick={() => add(type)} className="flex flex-col items-center gap-1.5 rounded-xl bg-white p-2.5 text-center text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:ring-brand-300">
                          <span className={cn('flex size-8 items-center justify-center rounded-lg', def.color)}><def.icon className="size-4" /></span>
                          {def.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Button variant="subtle" icon={Plus} className="mt-2 w-full" onClick={() => setAdding(true)}>Adicionar elemento</Button>
                  )
                )}
              </div>

              <div className="space-y-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="text-sm font-semibold text-slate-800">Aparência</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Altura">
                    <Segmented className="w-full" value={draft.size} onChange={(size) => set({ size })} options={[{ value: 'sm', label: 'Fina' }, { value: 'md', label: 'Média' }, { value: 'lg', label: 'Grossa' }]} />
                  </Field>
                  <Field label="Velocidade do texto">
                    <Segmented className="w-full" value={draft.speed} onChange={(speed) => set({ speed })} options={[{ value: 'slow', label: 'Lenta' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Rápida' }]} />
                  </Field>
                </div>
                <Field label="Cor de fundo"><ColorPicker value={draft.background} onChange={(background) => set({ background, color: ['#ffffff', '#f1f5f9'].includes(background) ? '#0f172a' : '#ffffff' })} colors={DARK} /></Field>
                <Field label="Cor de destaque" hint="Linha superior e títulos das faixas."><ColorPicker value={draft.accent} onChange={(accent) => set({ accent })} /></Field>
                <Field label="Cor do texto"><ColorPicker value={draft.color} onChange={(color) => set({ color })} colors={['#ffffff', '#0f172a', '#fde047', '#a5b4fc']} /></Field>
              </div>
            </>
          )}
        </div>

        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-0">
            <p className="mb-2 text-sm font-medium text-slate-700">Prévia</p>
            <PreviewFrame manifest={buildPreview(previewFooter)} />
            <p className="mt-2 text-xs text-slate-500">A prévia usa os itens da playlist e dados reais das integrações.</p>
          </div>
        </div>
      </div>

      <MediaPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        types={['image']}
        title="Imagem da barra inferior"
        onSelect={(list) => list[0] && setSlot(picker, { media: { id: list[0].id, name: list[0].name, url: list[0].url }, media_id: list[0].id })}
      />
    </Modal>
  )
}
