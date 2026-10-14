import { useEffect, useState } from 'react'
import { Check, Upload, Image as ImageIcon } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useFetch } from '../lib/hooks'
import { formatDuration } from '../lib/format'
import { MediaThumb } from '../pages/media/MediaPage'
import { Button, EmptyState, Modal, PageLoader, SearchInput, Tabs, cn } from './ui'
import { DropZone, UploadQueue, useUploader } from './uploader'

export default function MediaPicker({ open, onClose, onSelect, types = ['image', 'video'], title = 'Adicionar mídias', initial = [] }) {
  const { orgId, canCreate } = useAuth()
  const { data, loading, setData } = useFetch(open ? `orgs/${orgId}/media` : null)
  const [selected, setSelected] = useState([])
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const [uploading, setUploading] = useState(false)
  const uploader = useUploader(orgId, (m) => {
    setData((d) => d && ({ ...d, media: [m, ...d.media] }))
    if (types.includes(m.type)) setSelected((s) => [...s, m.id])
  })

  useEffect(() => {
    if (open) { setSelected(initial); setQ(''); setType(''); setUploading(false) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const all = (data?.media || []).filter((m) => types.includes(m.type))
  const list = all.filter((m) => (!type || m.type === type) && (!q || m.name.toLowerCase().includes(q.toLowerCase())))
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const confirm = () => {
    const byId = Object.fromEntries((data?.media || []).map((m) => [m.id, m]))
    onSelect(selected.map((id) => byId[id]).filter(Boolean))
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={title}
      footer={
        <>
          {canCreate && <Button variant="secondary" icon={Upload} className="sm:mr-auto" onClick={() => setUploading((u) => !u)}>Enviar do dispositivo</Button>}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm} disabled={!selected.length || uploader.busy}>Adicionar {selected.length > 0 && `(${selected.length})`}</Button>
        </>
      }
    >
      {(uploading || uploader.queue.length > 0) && (
        <div className="mb-4 space-y-2">
          <DropZone compact onFiles={uploader.addFiles} />
          <UploadQueue {...uploader} />
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {types.length > 1 ? (
          <Tabs value={type} onChange={setType} tabs={[{ value: '', label: 'Todas' }, ...types.map((t) => ({ value: t, label: { image: 'Imagens', video: 'Vídeos', audio: 'Músicas' }[t] }))]} />
        ) : <span />}
        <SearchInput value={q} onChange={setQ} className="sm:w-60" />
      </div>
      {loading ? <PageLoader /> : list.length === 0 ? (
        <EmptyState icon={ImageIcon} title="Nenhuma mídia" description={canCreate ? 'Envie arquivos do seu dispositivo para começar.' : 'Peça para alguém da equipe enviar arquivos.'} action={canCreate && !uploading && <Button icon={Upload} onClick={() => setUploading(true)}>Enviar arquivos</Button>} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((m) => {
            const idx = selected.indexOf(m.id)
            const on = idx >= 0
            return (
              <button key={m.id} type="button" onClick={() => toggle(m.id)} className={cn('relative overflow-hidden rounded-xl bg-white text-left ring-2 transition', on ? 'ring-brand-500' : 'ring-transparent hover:ring-slate-300')}>
                <MediaThumb media={m} className="aspect-video" />
                <span className={cn('absolute right-2 top-2 flex size-6 items-center justify-center rounded-full text-xs font-bold ring-2 ring-white', on ? 'bg-brand-600 text-white' : 'bg-black/30')}>
                  {on ? (selected.length > 1 ? idx + 1 : <Check className="size-3.5" />) : ''}
                </span>
                <div className="px-2 py-1.5">
                  <p className="truncate text-xs font-medium text-slate-800">{m.name}</p>
                  {m.duration && <p className="text-[11px] text-slate-500">{formatDuration(m.duration)}</p>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
