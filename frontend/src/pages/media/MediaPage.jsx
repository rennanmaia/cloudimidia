import { useEffect, useState } from 'react'
import { Image as ImageIcon, Film, Music, Upload, Trash2, Save, Play, HardDrive, Layers } from 'lucide-react'
import { api, setServerChunk } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useDebounced, useFetch } from '../../lib/hooks'
import { formatBytes, formatDateTime, formatDuration, plural } from '../../lib/format'
import { useConfirm, useToast } from '../../components/feedback'
import { Badge, Button, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, ProgressBar, SearchInput, Tabs, cn } from '../../components/ui'
import { DropZone, UploadQueue, useUploader } from '../../components/uploader'

export const TYPE_META = {
  image: { label: 'Imagem', icon: ImageIcon, color: 'sky' },
  video: { label: 'Vídeo', icon: Film, color: 'purple' },
  audio: { label: 'Áudio', icon: Music, color: 'amber' },
}

export function MediaThumb({ media, className }) {
  const Icon = TYPE_META[media.type]?.icon || ImageIcon
  const src = media.thumb_url || (media.type === 'image' ? media.url : null)
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden bg-slate-100', className)}>
      {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /> : (
        <div className={cn('flex h-full w-full items-center justify-center', media.type === 'audio' ? 'bg-gradient-to-br from-amber-100 to-fuchsia-100' : 'bg-slate-200')}>
          <Icon className="size-8 text-slate-400" />
        </div>
      )}
      {media.type === 'video' && <span className="absolute inset-0 flex items-center justify-center"><span className="flex size-9 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm"><Play className="ml-0.5 size-4 fill-white text-white" /></span></span>}
    </div>
  )
}

export default function MediaPage() {
  const { orgId, canCreate } = useAuth()
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const path = `orgs/${orgId}/media?type=${type}&q=${encodeURIComponent(dq)}`
  const { data, error, loading, reload, setData } = useFetch(path)
  const [selected, setSelected] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const uploader = useUploader(orgId, (m) => {
    if (!type || type === m.type) setData((d) => d && ({ ...d, media: [m, ...d.media], usage: { ...d.usage, storage_bytes: d.usage.storage_bytes + m.size_bytes } }))
  })

  useEffect(() => { if (uploader.queue.length) setShowUpload(true) }, [uploader.queue.length])

  useEffect(() => { if (data?.max_chunk_bytes) setServerChunk(data.max_chunk_bytes) }, [data?.max_chunk_bytes])
  const media = data?.media || []
  const maxBytes = data?.max_storage_mb ? data.max_storage_mb * 1048576 : null

  return (
    <div>
      <PageHeader
        title="Mídias"
        description="Fotos, vídeos e músicas usados nas playlists."
        actions={canCreate && <Button icon={Upload} onClick={() => setShowUpload((s) => !s)}>Enviar arquivos</Button>}
      />

      {data && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200/70">
          <HardDrive className="size-5 text-slate-400" />
          <div className="flex-1">
            <div className="mb-1 flex justify-between text-xs"><span className="font-medium text-slate-600">Armazenamento</span><span className="text-slate-500">{formatBytes(data.usage.storage_bytes)}{maxBytes ? ` de ${formatBytes(maxBytes)}` : ''}</span></div>
            <ProgressBar value={maxBytes ? data.usage.storage_bytes / maxBytes : 0.02} className="h-1.5" />
          </div>
        </div>
      )}

      {canCreate && (showUpload || (data && media.length === 0 && !q && !type)) && (
        <div className="mb-6 space-y-3">
          <DropZone onFiles={uploader.addFiles} />
          <UploadQueue {...uploader} />
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={type}
          onChange={setType}
          tabs={[
            { value: '', label: 'Todas' },
            { value: 'image', label: 'Imagens', icon: ImageIcon },
            { value: 'video', label: 'Vídeos', icon: Film },
            { value: 'audio', label: 'Músicas', icon: Music },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nome" className="sm:w-64" />
      </div>

      {loading && !data ? <PageLoader /> : error ? <ErrorState error={error} onRetry={reload} /> : media.length === 0 ? (
        <EmptyState icon={ImageIcon} title={q || type ? 'Nada encontrado' : 'Sua biblioteca está vazia'} description={q || type ? 'Tente outro filtro.' : 'Envie fotos e vídeos para montar suas playlists. No celular, você pode escolher direto da galeria.'} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {media.map((m) => {
            const T = TYPE_META[m.type]
            return (
              <button key={m.id} type="button" onClick={() => setSelected(m)} className="group overflow-hidden rounded-2xl bg-white text-left ring-1 ring-slate-200/70 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="relative">
                  <MediaThumb media={m} className="aspect-video" />
                  {m.duration && <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">{formatDuration(m.duration)}</span>}
                  {m.usage_count > 0 && <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700"><Layers className="size-3" />{m.usage_count}</span>}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-sm font-medium text-slate-800 group-hover:text-brand-700">{m.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500"><T.icon className="size-3" />{formatBytes(m.size_bytes)}{m.width ? ` · ${m.width}×${m.height}` : ''}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <MediaModal
        media={selected}
        onClose={() => setSelected(null)}
        onChanged={(m) => { setData((d) => ({ ...d, media: d.media.map((x) => (x.id === m.id ? { ...x, ...m } : x)) })); setSelected(null) }}
        onDeleted={(m) => { setData((d) => ({ ...d, media: d.media.filter((x) => x.id !== m.id), usage: { ...d.usage, storage_bytes: d.usage.storage_bytes - m.size_bytes } })); setSelected(null) }}
      />
    </div>
  )
}

function MediaModal({ media, onClose, onChanged, onDeleted }) {
  const { orgId } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (media) setName(media.name) }, [media])
  if (!media) return null

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`orgs/${orgId}/media/${media.id}`, { name })
      toast.success('Mídia renomeada')
      onChanged({ ...media, name })
    } catch (e) {
      toast.error(e)
    } finally {
      setSaving(false)
    }
  }
  const remove = async () => {
    const msg = media.usage_count > 0
      ? `Esta mídia está em ${plural(media.usage_count, 'playlist', 'playlists')} e será removida delas. Excluir mesmo assim?`
      : 'O arquivo será apagado permanentemente.'
    if (!(await confirm({ title: `Excluir "${media.name}"?`, message: msg, danger: true, confirmLabel: 'Excluir' }))) return
    try {
      await api.del(`orgs/${orgId}/media/${media.id}`)
      toast.success('Mídia excluída')
      onDeleted(media)
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={media.name}
      footer={media.can_edit && (
        <>
          <Button variant="danger-ghost" icon={Trash2} onClick={remove} className="sm:mr-auto">Excluir</Button>
          <Button icon={Save} loading={saving} disabled={!name.trim() || name === media.name} onClick={save}>Salvar nome</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl bg-slate-900">
          {media.type === 'image' && <img src={media.url} alt="" className="mx-auto max-h-[50dvh] object-contain" />}
          {media.type === 'video' && <video src={media.url} poster={media.thumb_url || undefined} controls playsInline className="mx-auto max-h-[50dvh] w-full" />}
          {media.type === 'audio' && <div className="p-6"><audio src={media.url} controls className="w-full" /></div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge color={TYPE_META[media.type].color}>{TYPE_META[media.type].label}</Badge>
          <Badge>{formatBytes(media.size_bytes)}</Badge>
          {media.width && <Badge>{media.width}×{media.height}</Badge>}
          {media.duration && <Badge>{formatDuration(media.duration)}</Badge>}
          <Badge>{plural(media.usage_count, 'playlist', 'playlists')}</Badge>
        </div>
        <p className="text-xs text-slate-500">Enviado por {media.uploader_name || '—'} em {formatDateTime(media.created_at)}</p>
        {media.can_edit && (
          <Field label="Nome">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  )
}
