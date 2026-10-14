import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, X, CheckCircle2, AlertCircle, FileVideo, FileImage, FileAudio } from 'lucide-react'
import { uploadChunked } from '../lib/api'
import { extractMeta, mediaKind } from '../lib/media'
import { formatBytes } from '../lib/format'
import { cn, ProgressBar } from './ui'

export const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,.m4v,audio/mpeg,audio/mp4,audio/ogg,audio/wav,.mp3,.m4a,.aac'

/** Fila de envio de arquivos com 2 envios simultâneos */
export function useUploader(orgId, onUploaded) {
  const [queue, setQueue] = useState([])
  const items = useRef([])
  const running = useRef(0)
  const handles = useRef({})
  const cb = useRef(onUploaded)
  cb.current = onUploaded

  const sync = () => setQueue(items.current.map((x) => ({ ...x })))
  const patch = (id, p) => {
    const it = items.current.find((x) => x.id === id)
    if (it) Object.assign(it, p)
    sync()
  }
  const remove = (id) => {
    items.current = items.current.filter((x) => x.id !== id)
    sync()
  }

  const pump = useCallback(() => {
    for (const item of items.current) {
      if (running.current >= 2) break
      if (item.status !== 'waiting') continue
      running.current++
      item.status = 'uploading'
      ;(async () => {
        try {
          const { meta, thumbnail } = await extractMeta(item.file)
          if (item.status !== 'uploading') throw Object.assign(new Error('Envio cancelado.'), { status: -1 })
          const h = uploadChunked(orgId, item.file, { meta, thumbnail, onProgress: (p) => patch(item.id, { progress: p }) })
          handles.current[item.id] = h
          const res = await h.promise
          patch(item.id, { status: 'done', progress: 1 })
          cb.current?.(res.media)
          setTimeout(() => remove(item.id), 2500)
        } catch (e) {
          patch(item.id, { status: e.status === -1 ? 'cancelled' : 'error', error: e.message })
        } finally {
          running.current--
          delete handles.current[item.id]
          pump()
        }
      })()
    }
    sync()
  }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = useCallback((files) => {
    const added = [...files].map((file) => ({
      id: Math.random().toString(36).slice(2),
      file,
      kind: mediaKind(file),
      status: mediaKind(file) ? 'waiting' : 'error',
      error: mediaKind(file) ? null : 'Formato não suportado',
      progress: 0,
    }))
    items.current = [...items.current, ...added]
    pump()
  }, [pump])

  const cancel = (id) => {
    const it = items.current.find((x) => x.id === id)
    if (!it) return
    if (it.status === 'uploading') {
      it.status = 'cancelling'
      handles.current[id]?.cancel()
    } else {
      remove(id)
    }
  }
  const dismiss = (id) => remove(id)

  return { queue, addFiles, cancel, dismiss, busy: queue.some((x) => x.status === 'uploading' || x.status === 'waiting') }
}

export function UploadQueue({ queue, cancel, dismiss }) {
  if (!queue.length) return null
  const icons = { image: FileImage, video: FileVideo, audio: FileAudio }
  return (
    <div className="space-y-2">
      {queue.map((it) => {
        const Icon = icons[it.kind] || Upload
        return (
          <div key={it.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200 animate-fade-in">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Icon className="size-[18px]" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-slate-800">{it.file.name}</p>
                <span className="shrink-0 text-xs text-slate-500">
                  {it.status === 'uploading' ? `${Math.round(it.progress * 100)}%` : it.status === 'waiting' ? 'Na fila' : formatBytes(it.file.size)}
                </span>
              </div>
              {it.status === 'error' || it.status === 'cancelled' ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-rose-600"><AlertCircle className="size-3.5" />{it.error}</p>
              ) : it.status === 'done' ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="size-3.5" />Enviado</p>
              ) : (
                <ProgressBar value={it.progress} className="mt-1.5 h-1.5" />
              )}
            </div>
            {it.status !== 'done' && (
              <button type="button" onClick={() => (it.status === 'uploading' || it.status === 'waiting' ? cancel(it.id) : dismiss(it.id))} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Cancelar">
                <X className="size-4" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function DropZone({ onFiles, compact, accept = ACCEPT, children }) {
  const [over, setOver] = useState(false)
  const input = useRef(null)
  useEffect(() => {
    if (compact) return
    const prevent = (e) => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', prevent) }
  }, [compact])
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files) }}
      onClick={() => input.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition',
        compact ? 'px-4 py-5' : 'px-6 py-10',
        over ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:border-brand-400 hover:bg-brand-50/40'
      )}
    >
      <input ref={input} type="file" multiple accept={accept} className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
      {children || (
        <>
          <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-600"><Upload className="size-6" /></span>
          <p className="font-semibold text-slate-800">Toque para escolher ou arraste arquivos aqui</p>
          <p className="mt-1 text-sm text-slate-500">Fotos (JPG, PNG, WEBP), vídeos (MP4, WEBM) e músicas (MP3, M4A)</p>
        </>
      )}
    </div>
  )
}
