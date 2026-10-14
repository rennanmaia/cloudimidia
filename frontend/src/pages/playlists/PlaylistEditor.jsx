import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, Trash2, Plus, Image as ImageIcon, Puzzle, Save, MonitorPlay, Copy, Settings2, Clock, PanelBottom, Paintbrush, Music, Film, ListVideo, VolumeX, Volume2, Maximize, Minimize,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useFetch } from '../../lib/hooks'
import { formatDuration, plural } from '../../lib/format'
import { INTEGRATION_TYPES, defaultDurationFor } from '../../lib/integrationTypes'
import { useConfirm, useToast } from '../../components/feedback'
import { Badge, Button, Card, CardTitle, EmptyState, ErrorState, Field, IconButton, Input, Modal, PageHeader, PageLoader, Select, cn } from '../../components/ui'
import MediaPicker from '../../components/MediaPicker'
import { MediaThumb } from '../media/MediaPage'
import { PlaylistPreviewModal } from '../../components/Preview'
import FooterEditor, { DEFAULT_FOOTER, SLOT_TYPES } from './FooterEditor'

const uid = () => Math.random().toString(36).slice(2)
const REMOTE = ['rss', 'weather', 'sports', 'currency']

function SortableItem({ item, index, integration, onChange, onRemove, readOnly }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.uid, disabled: readOnly })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const T = item.type === 'integration' ? INTEGRATION_TYPES[item.kind] : null
  const def = defaultDurationFor(item)
  const isVideo = item.kind === 'video'
  const fit = item.settings?.fit || (isVideo ? 'contain' : 'cover')
  return (
    <li ref={setNodeRef} style={style} className={cn('flex items-center gap-2 rounded-2xl bg-white p-2 ring-1 ring-slate-200 sm:gap-3', isDragging && 'z-10 shadow-xl ring-brand-300')}>
      {!readOnly && (
        <button type="button" className="flex h-12 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 active:cursor-grabbing" {...attributes} {...listeners} aria-label="Arrastar">
          <GripVertical className="size-5" />
        </button>
      )}
      <span className="w-5 shrink-0 text-center text-xs font-semibold text-slate-400">{index + 1}</span>
      {item.type === 'media' ? (
        <MediaThumb media={item.media} className="h-12 w-20 shrink-0 rounded-lg" />
      ) : (
        <span className={cn('flex h-12 w-20 shrink-0 items-center justify-center rounded-lg', T?.color)}>{T && <T.icon className="size-6" />}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">{item.type === 'media' ? (isVideo ? 'Vídeo' : 'Imagem') : T?.label}</span>
          {!readOnly && (item.type === 'media') && (
            <button type="button" onClick={() => onChange({ settings: { ...item.settings, fit: fit === 'cover' ? 'contain' : 'cover' } })} className="flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200" title="Preencher a tela ou mostrar inteira">
              {fit === 'cover' ? <><Maximize className="size-3" />Preencher</> : <><Minimize className="size-3" />Inteira</>}
            </button>
          )}
          {!readOnly && isVideo && (
            <button type="button" onClick={() => onChange({ settings: { ...item.settings, muted: !item.settings?.muted } })} className="flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200">
              {item.settings?.muted ? <><VolumeX className="size-3" />Sem som</> : <><Volume2 className="size-3" />Com som</>}
            </button>
          )}
          {integration && REMOTE.includes(integration.type) && <Badge color="sky">Automático</Badge>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <div className="relative w-[4.5rem]">
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            disabled={readOnly}
            value={item.duration ?? ''}
            placeholder={def ? String(def) : 'fim'}
            onChange={(e) => onChange({ duration: e.target.value ? Number(e.target.value) : null })}
            className="h-9 pr-6 text-right text-sm"
            title={isVideo ? 'Duração em segundos (vazio = até o fim do vídeo)' : 'Duração em segundos'}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">s</span>
        </div>
        {!readOnly && <IconButton icon={Trash2} label="Remover" size="sm" variant="danger-ghost" onClick={onRemove} />}
      </div>
    </li>
  )
}

function IntegrationPicker({ open, onClose, integrations, onSelect }) {
  const navigate = useNavigate()
  const usable = integrations.filter((i) => i.type !== 'music')
  return (
    <Modal open={open} onClose={onClose} title="Adicionar conteúdo automático" description="Notícias, clima, jogos, cotações, avisos e mais.">
      {usable.length === 0 ? (
        <EmptyState icon={Puzzle} title="Nenhuma integração criada" description="Crie integrações (ex.: notícias do g1, clima da sua cidade) para usar nas playlists." action={<Button icon={Plus} onClick={() => navigate('/integracoes')}>Criar integração</Button>} />
      ) : (
        <div className="space-y-2">
          {usable.map((i) => {
            const T = INTEGRATION_TYPES[i.type]
            return (
              <button key={i.id} type="button" onClick={() => { onSelect(i); onClose() }} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left ring-1 ring-slate-200 transition hover:bg-brand-50 hover:ring-brand-200">
                <span className={cn('flex size-10 items-center justify-center rounded-xl', T.color)}><T.icon className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{i.name}</span>
                  <span className="block text-xs text-slate-500">{T.label}</span>
                </span>
                <Plus className="size-4 text-slate-400" />
              </button>
            )
          })}
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => navigate('/integracoes')}>Criar nova integração</Button>
        </div>
      )}
    </Modal>
  )
}

export default function PlaylistEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { orgId, canCreate, org } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const { data, error, loading, reload } = useFetch(`orgs/${orgId}/playlists/${id}`)
  const { data: intData } = useFetch(`orgs/${orgId}/integrations`)
  const [state, setState] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [picker, setPicker] = useState(null)
  const [preview, setPreview] = useState(false)
  const [footerOpen, setFooterOpen] = useState(false)

  useEffect(() => {
    if (!data) return
    const p = data.playlist
    setState({
      name: p.name,
      description: p.description || '',
      transition: p.transition,
      footer: p.footer || { ...DEFAULT_FOOTER, enabled: false },
      music_integration_id: p.music_integration_id || '',
      items: p.items.map((it) => ({ ...it, uid: uid(), settings: Array.isArray(it.settings) ? {} : it.settings || {} })),
    })
    setDirty(false)
  }, [data])

  useEffect(() => {
    if (!dirty) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const integrations = useMemo(() => intData?.integrations || [], [intData])
  const intById = useMemo(() => Object.fromEntries(integrations.map((i) => [i.id, i])), [integrations])

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!state) return <PageLoader />

  const readOnly = !data.playlist.can_edit
  const set = (patch) => { setState((s) => ({ ...s, ...patch })); setDirty(true) }
  const setItems = (fn) => { setState((s) => ({ ...s, items: fn(s.items) })); setDirty(true) }

  const addMedia = (list) => setItems((items) => [...items, ...list.map((m) => ({ uid: uid(), type: 'media', kind: m.type, name: m.name, media: m, duration: m.type === 'image' ? 10 : null, settings: {} }))])
  const addIntegration = (i) => setItems((items) => [...items, { uid: uid(), type: 'integration', kind: i.type, name: i.name, integration_id: i.id, duration: INTEGRATION_TYPES[i.type]?.defaultDuration ?? 15, settings: {} }])

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    setItems((items) => arrayMove(items, items.findIndex((i) => i.uid === active.id), items.findIndex((i) => i.uid === over.id)))
  }

  const total = state.items.reduce((acc, it) => acc + (it.duration || defaultDurationFor(it) || 0), 0)

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`orgs/${orgId}/playlists/${id}`, {
        name: state.name,
        description: state.description,
        transition: state.transition,
        footer: state.footer,
        music_integration_id: state.music_integration_id || null,
        items: state.items.map((it) => ({ type: it.type, media_id: it.media?.id, integration_id: it.integration_id, duration: it.duration, settings: it.settings })),
      })
      toast.success('Playlist salva — as TVs atualizam em instantes')
      setDirty(false)
      reload(true)
    } catch (e) {
      toast.error(e)
    } finally {
      setSaving(false)
    }
  }

  const duplicate = async () => {
    try {
      const d = await api.post(`orgs/${orgId}/playlists/${id}/duplicate`)
      toast.success('Playlist duplicada')
      navigate(`/playlists/${d.id}`)
    } catch (e) {
      toast.error(e)
    }
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Excluir playlist?', message: `"${state.name}" será excluída. As mídias continuam na biblioteca.`, danger: true, confirmLabel: 'Excluir' }))) return
    try {
      await api.del(`orgs/${orgId}/playlists/${id}`)
      toast.success('Playlist excluída')
      navigate('/playlists')
    } catch (e) {
      toast.error(e)
    }
  }

  const previewPlaylist = {
    id: Number(id),
    name: state.name,
    transition: state.transition,
    footer: state.footer,
    music_integration_id: null,
    items: state.items.map((it, k) => ({ ...it, id: k + 1 })),
  }
  const previewIntegrations = Object.fromEntries(integrations.map((i) => [i.id, { ...i, has_data: REMOTE.includes(i.type) }]))

  const buildFooterPreview = (footer) => ({
    version: 'footer-preview',
    screen: { id: 0, name: 'Prévia', is_active: true, muted: true, rotation: 0 },
    organization: { name: org?.name, logo_url: org?.logo_url, timezone: data.timezone },
    default_playlist_id: previewPlaylist.id,
    schedules: [],
    playlists: { [previewPlaylist.id]: { ...previewPlaylist, footer } },
    integrations: previewIntegrations,
  })
  const footerSlots = state.footer?.enabled ? state.footer.slots : []
  const musicOptions = integrations.filter((i) => i.type === 'music')
  const used = data.playlist.used_in

  return (
    <div className="pb-20 lg:pb-0">
      <PageHeader
        back="/playlists"
        title={state.name || 'Playlist'}
        description={`${plural(state.items.length, 'item', 'itens')} · ${formatDuration(total)} por ciclo`}
        actions={
          <>
            <Button variant="secondary" icon={MonitorPlay} onClick={() => setPreview(true)} disabled={!state.items.length}>Prévia</Button>
            {!readOnly && <span className="hidden lg:block"><Button icon={Save} loading={saving} disabled={!dirty} onClick={save}>Salvar</Button></span>}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          {!readOnly && (
            <div className="mb-4 grid grid-cols-2 gap-2">
              <Button variant="secondary" size="lg" icon={ImageIcon} onClick={() => setPicker('media')}>Fotos e vídeos</Button>
              <Button variant="secondary" size="lg" icon={Puzzle} onClick={() => setPicker('integration')}>Automáticos</Button>
            </div>
          )}
          {state.items.length === 0 ? (
            <Card><EmptyState icon={ListVideo} title="Playlist vazia" description="Adicione fotos, vídeos ou conteúdos automáticos (notícias, clima, jogos, avisos)." /></Card>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={state.items.map((i) => i.uid)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {state.items.map((it, i) => (
                    <SortableItem
                      key={it.uid}
                      item={it}
                      index={i}
                      readOnly={readOnly}
                      integration={it.integration_id ? intById[it.integration_id] : null}
                      onChange={(patch) => setItems((items) => items.map((x) => (x.uid === it.uid ? { ...x, ...patch } : x)))}
                      onRemove={() => setItems((items) => items.filter((x) => x.uid !== it.uid))}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
          {state.items.length > 1 && !readOnly && <p className="mt-3 text-center text-xs text-slate-400">Arraste pelo ⋮⋮ para reordenar. Duração em segundos — vídeo sem duração toca até o fim.</p>}
        </div>

        <div className="space-y-5">
          <Card>
            <CardTitle icon={Settings2}>Configurações</CardTitle>
            <div className="space-y-4">
              <Field label="Nome"><Input disabled={readOnly} value={state.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Transição entre itens">
                <Select disabled={readOnly} value={state.transition} onChange={(e) => set({ transition: e.target.value })}>
                  <option value="fade">Esmaecer (suave)</option>
                  <option value="slide">Deslizar</option>
                  <option value="zoom">Zoom</option>
                  <option value="none">Corte seco</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle icon={PanelBottom} action={!readOnly && <Button size="sm" variant="subtle" icon={Paintbrush} onClick={() => setFooterOpen(true)}>Personalizar</Button>}>Barra inferior</CardTitle>
            {footerSlots.length === 0 ? (
              <p className="text-sm text-slate-500">Desligada — a playlist ocupa a tela inteira. Adicione notícias, relógio, clima, cotações, logo ou uma imagem de patrocinador.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {footerSlots.map((sl, i) => {
                  const def = SLOT_TYPES[sl.type]
                  return <span key={i} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium', def.color)}><def.icon className="size-3.5" />{def.label}</span>
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle icon={Music}>Música ambiente</CardTitle>
            <Field hint={musicOptions.length ? 'Toca ao fundo; pausa automaticamente em vídeos com som.' : 'Crie uma integração de “Música ambiente” para usar aqui.'}>
              <Select disabled={readOnly} value={state.music_integration_id} onChange={(e) => set({ music_integration_id: e.target.value ? Number(e.target.value) : '' })}>
                <option value="">Sem música</option>
                {musicOptions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </Select>
            </Field>
          </Card>

          <Card>
            <CardTitle icon={Clock}>Onde é exibida</CardTitle>
            {used.schedules.length + used.screens.length === 0 ? (
              <p className="text-sm text-slate-500">Ainda não está em nenhuma TV. <button type="button" className="font-medium text-brand-600" onClick={() => navigate('/grade?nova=1&playlist=' + id)}>Programar agora</button></p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {used.schedules.map((s) => <li key={'s' + s.id} className="flex items-center gap-2 text-slate-700"><Clock className="size-4 text-slate-400" />{s.name}</li>)}
                {used.screens.map((s) => <li key={'t' + s.id} className="flex items-center gap-2 text-slate-700"><Film className="size-4 text-slate-400" />Padrão: {s.name}</li>)}
              </ul>
            )}
          </Card>

          <div className="flex gap-2">
            {canCreate && <Button variant="secondary" icon={Copy} className="flex-1" onClick={duplicate}>Duplicar</Button>}
            {!readOnly && <Button variant="danger-ghost" icon={Trash2} className="flex-1" onClick={remove}>Excluir</Button>}
          </div>
        </div>
      </div>

      {!readOnly && dirty && (
        <div className="fixed inset-x-0 bottom-16 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur safe-bottom lg:hidden">
          <Button size="lg" className="w-full" icon={Save} loading={saving} onClick={save}>Salvar alterações</Button>
        </div>
      )}

      <MediaPicker open={picker === 'media'} onClose={() => setPicker(null)} onSelect={addMedia} />
      <IntegrationPicker open={picker === 'integration'} onClose={() => setPicker(null)} integrations={integrations} onSelect={addIntegration} />
      <FooterEditor open={footerOpen} onClose={() => setFooterOpen(false)} value={state.footer} onApply={(footer) => set({ footer })} integrations={integrations} buildPreview={buildFooterPreview} />
      <PlaylistPreviewModal open={preview} onClose={() => setPreview(false)} playlist={previewPlaylist} integrations={previewIntegrations} timezone={data.timezone} />
    </div>
  )
}
