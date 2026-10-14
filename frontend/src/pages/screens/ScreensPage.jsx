import { useMemo, useState } from 'react'
import { Plus, Tv, Layers } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { useFetch } from '../../lib/hooks'
import { Button, EmptyState, ErrorState, PageHeader, PageLoader, SearchInput, Segmented, cn } from '../../components/ui'
import { ScreenCard, useScreenToggle } from '../../components/ScreenCard'
import GroupsModal from './GroupsModal'

export default function ScreensPage() {
  const { orgId, can } = useAuth()
  const { data, error, loading, reload, setData } = useFetch(`orgs/${orgId}/screens`, { interval: 15000 })
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [group, setGroup] = useState(null)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [toggle, busy] = useScreenToggle((s) => setData((d) => ({ screens: d.screens.map((x) => (x.id === s.id ? s : x)) })))

  const screens = data?.screens || []
  const groups = useMemo(() => {
    const m = new Map()
    screens.forEach((s) => s.groups.forEach((g) => m.set(g.id, g)))
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [screens])

  const filtered = screens.filter((s) => {
    if (q && !`${s.name} ${s.location || ''}`.toLowerCase().includes(q.toLowerCase())) return false
    if (group && !s.groups.some((g) => g.id === group)) return false
    if (status === 'online') return s.paired && s.is_active && s.online
    if (status === 'offline') return s.paired && s.is_active && !s.online
    if (status === 'off') return s.paired && !s.is_active
    if (status === 'pending') return !s.paired
    return true
  })
  const counts = {
    online: screens.filter((s) => s.paired && s.is_active && s.online).length,
    offline: screens.filter((s) => s.paired && s.is_active && !s.online).length,
    off: screens.filter((s) => s.paired && !s.is_active).length,
    pending: screens.filter((s) => !s.paired).length,
  }

  return (
    <div>
      <PageHeader
        title="TVs"
        description="Ligue, desligue e acompanhe suas telas em tempo real."
        actions={
          <>
            {can('editor') && <Button variant="secondary" icon={Layers} onClick={() => setGroupsOpen(true)}>Grupos</Button>}
            {can('editor') && <Button icon={Plus} to="/tvs/adicionar">Adicionar TV</Button>}
          </>
        }
      />

      {loading && !data ? <PageLoader /> : error ? <ErrorState error={error} onRetry={reload} /> : screens.length === 0 ? (
        <EmptyState
          icon={Tv}
          title="Nenhuma TV por aqui"
          description="Abra o player no navegador da TV para ver um código de 6 números e cadastre-a aqui mesmo, pelo celular."
          action={can('editor') && <Button icon={Plus} to="/tvs/adicionar">Adicionar primeira TV</Button>}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput value={q} onChange={setQ} placeholder="Buscar TV ou local" className="sm:w-72" />
            <Segmented
              className="overflow-x-auto no-scrollbar"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: `Todas ${screens.length}` },
                { value: 'online', label: `Online ${counts.online}` },
                { value: 'offline', label: `Offline ${counts.offline}` },
                { value: 'off', label: `Desligadas ${counts.off}` },
                ...(counts.pending ? [{ value: 'pending', label: `A instalar ${counts.pending}` }] : []),
              ]}
            />
          </div>
          {groups.length > 0 && (
            <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
              <button type="button" onClick={() => setGroup(null)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition', !group ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300')}>
                Todos os grupos
              </button>
              {groups.map((g) => (
                <button key={g.id} type="button" onClick={() => setGroup(group === g.id ? null : g.id)} className={cn('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition', group === g.id ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300')}>
                  <span className="size-2 rounded-full" style={{ background: g.color }} />{g.name}
                </button>
              ))}
            </div>
          )}
          {filtered.length === 0 ? (
            <EmptyState icon={Tv} title="Nenhuma TV encontrada" description="Ajuste os filtros para ver outras TVs." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((s) => <ScreenCard key={s.id} screen={s} onToggle={toggle} busy={busy} />)}
            </div>
          )}
        </>
      )}
      <GroupsModal open={groupsOpen} onClose={() => setGroupsOpen(false)} screens={screens} onChanged={reload} />
    </div>
  )
}
