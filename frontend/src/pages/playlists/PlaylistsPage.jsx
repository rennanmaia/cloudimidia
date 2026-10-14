import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListVideo, Plus, Clock, CalendarClock, Tv, Layers } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useFetch } from '../../lib/hooks'
import { formatDuration, plural, timeAgo } from '../../lib/format'
import { useToast } from '../../components/feedback'
import { Button, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, SearchInput, Textarea } from '../../components/ui'

function Collage({ thumbs }) {
  if (!thumbs.length) {
    return <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-brand-100 via-purple-50 to-sky-100"><ListVideo className="size-10 text-brand-300" /></div>
  }
  if (thumbs.length < 4) return <img src={thumbs[0]} alt="" className="aspect-video w-full object-cover" loading="lazy" />
  return (
    <div className="grid aspect-video grid-cols-2 grid-rows-2 gap-0.5 bg-slate-200">
      {thumbs.slice(0, 4).map((t, i) => <img key={i} src={t} alt="" className="h-full w-full object-cover" loading="lazy" />)}
    </div>
  )
}

export default function PlaylistsPage() {
  const { orgId, canCreate } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { data, error, loading, reload } = useFetch(`orgs/${orgId}/playlists`)
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)

  const create = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const d = await api.post(`orgs/${orgId}/playlists`, form)
      navigate(`/playlists/${d.id}`)
    } catch (err) {
      toast.error(err)
      setSaving(false)
    }
  }

  const list = (data?.playlists || []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <PageHeader
        title="Playlists"
        description="Sequências de fotos, vídeos e conteúdos automáticos."
        actions={canCreate && <Button icon={Plus} onClick={() => { setForm({ name: '', description: '' }); setCreating(true) }}>Nova playlist</Button>}
      />
      {loading && !data ? <PageLoader /> : error ? <ErrorState error={error} onRetry={reload} /> : data.playlists.length === 0 ? (
        <EmptyState
          icon={ListVideo}
          title="Nenhuma playlist ainda"
          description="Monte uma sequência com suas mídias, notícias, clima e avisos. Depois, programe em quais TVs e horários ela aparece."
          action={canCreate && <Button icon={Plus} onClick={() => setCreating(true)}>Criar playlist</Button>}
        />
      ) : (
        <>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar playlist" className="mb-5 sm:w-72" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((p) => (
              <button key={p.id} type="button" onClick={() => navigate(`/playlists/${p.id}`)} className="group overflow-hidden rounded-2xl bg-white text-left ring-1 ring-slate-200/70 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <Collage thumbs={p.thumbs} />
                <div className="p-4">
                  <h3 className="truncate font-semibold text-slate-900 group-hover:text-brand-700">{p.name}</h3>
                  {p.description && <p className="mt-0.5 truncate text-sm text-slate-500">{p.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Layers className="size-3.5" />{plural(p.items_count, 'item', 'itens')}</span>
                    <span className="flex items-center gap-1"><Clock className="size-3.5" />{formatDuration(p.total_duration)}</span>
                    {p.schedules_count > 0 && <span className="flex items-center gap-1 text-emerald-600"><CalendarClock className="size-3.5" />{plural(p.schedules_count, 'programação', 'programações')}</span>}
                    {p.screens_count > 0 && <span className="flex items-center gap-1 text-brand-600"><Tv className="size-3.5" />padrão em {plural(p.screens_count, 'TV', 'TVs')}</span>}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">Atualizada {timeAgo(p.updated_at)}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nova playlist"
        footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button><Button type="submit" form="new-pl" loading={saving}>Criar e editar</Button></>}
      >
        <form id="new-pl" onSubmit={create} className="space-y-4">
          <Field label="Nome"><Input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Programação manhã, Campanha Black Friday" /></Field>
          <Field label="Descrição" optional><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-20" /></Field>
        </form>
      </Modal>
    </div>
  )
}
