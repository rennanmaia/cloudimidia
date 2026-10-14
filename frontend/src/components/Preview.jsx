import { useCallback, useMemo } from 'react'
import { MonitorPlay } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useFetch } from '../lib/hooks'
import Stage from '../player/Stage'
import { Modal, PageLoader, ErrorState, cn } from './ui'

export function PreviewFrame({ manifest, portrait, className }) {
  const { orgId } = useAuth()
  const fetchData = useCallback((id) => api.get(`orgs/${orgId}/integrations/${id}/data`), [orgId])
  return (
    <div className={cn('mx-auto overflow-hidden rounded-xl bg-black shadow-xl ring-1 ring-slate-900/10', portrait ? 'aspect-[9/16] max-h-[70dvh]' : 'aspect-video w-full', className)}>
      {manifest && <Stage manifest={manifest} fetchData={fetchData} />}
    </div>
  )
}

export function ScreenPreviewModal({ screen, open, onClose }) {
  const { orgId } = useAuth()
  const { data, error, loading, reload } = useFetch(open ? `orgs/${orgId}/screens/${screen.id}/manifest` : null)
  const portrait = screen.rotation === 90 || screen.rotation === 270
  return (
    <Modal open={open} onClose={onClose} size={portrait ? 'md' : 'xl'} title={<span className="flex items-center gap-2"><MonitorPlay className="size-5 text-brand-600" /> Prévia: {screen.name}</span>} description="Simulação do que a TV está exibindo agora, conforme a programação.">
      {loading ? <PageLoader /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        data && (data.screen.is_active
          ? <PreviewFrame manifest={{ ...data, screen: { ...data.screen, muted: true } }} portrait={portrait} />
          : <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-900 text-slate-400">TV desativada — a tela fica preta.</div>)
      )}
    </Modal>
  )
}

export function PlaylistPreviewModal({ playlist, integrations, timezone, open, onClose }) {
  const manifest = useMemo(() => {
    if (!playlist) return null
    return {
      version: `preview-${Date.now()}`,
      screen: { id: 0, name: 'Prévia', is_active: true, muted: true, rotation: 0 },
      organization: { timezone: timezone || 'America/Sao_Paulo' },
      default_playlist_id: playlist.id,
      schedules: [],
      playlists: { [playlist.id]: playlist },
      integrations: integrations || {},
    }
  }, [playlist, integrations, timezone, open]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={open} onClose={onClose} size="xl" title={`Prévia: ${playlist?.name || ''}`} description="Veja como a playlist aparece na TV (sem som).">
      {open && <PreviewFrame manifest={manifest} />}
    </Modal>
  )
}
