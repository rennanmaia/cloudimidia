import { Link } from 'react-router-dom'
import { Tv, Wifi, PlayCircle, ListVideo, CalendarClock, Plus, Upload, ArrowRight, Activity, HardDrive, CheckCircle2, Circle } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useFetch } from '../lib/hooks'
import { formatBytes, timeAgo } from '../lib/format'
import { Button, Card, CardTitle, EmptyState, ErrorState, PageLoader, ProgressBar, Stat, cn } from '../components/ui'
import { ScreenRow, useScreenToggle } from '../components/ScreenCard'

export default function Dashboard() {
  const { orgId, org, user, can, isGuest } = useAuth()
  const { data, error, loading, reload, setData } = useFetch(`orgs/${orgId}/dashboard`, { interval: 20000 })
  const [toggle, busy] = useScreenToggle((s) => setData((d) => ({ ...d, screens: d.screens.map((x) => (x.id === s.id ? s : x)) })))

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const { stats, screens, usage, limits, activity } = data
  const firstName = user?.name?.split(' ')[0]
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  const steps = [
    { done: stats.screens > 0, label: 'Cadastre sua primeira TV', to: '/tvs/adicionar' },
    { done: (stats.media ?? 0) > 0, label: 'Envie fotos e vídeos', to: '/midias' },
    { done: (stats.playlists ?? 0) > 0, label: 'Monte uma playlist', to: '/playlists' },
    { done: (stats.schedules ?? 0) > 0 || screens.some((s) => s.default_playlist_id), label: 'Programe o que cada TV exibe', to: '/grade' },
  ]
  const showSteps = !isGuest && can('editor') && steps.some((s) => !s.done)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{greet}, {firstName} 👋</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{org?.name}</h1>
        </div>
        <div className="flex gap-2">
          {can('editor') && <span className="hidden sm:block"><Button variant="secondary" icon={Upload} to="/midias">Enviar mídia</Button></span>}
          {can('editor') && <Button icon={Plus} to="/tvs/adicionar">Adicionar TV</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="TVs online" value={`${stats.screens_online}/${stats.screens}`} icon={Wifi} color="green" hint={`${stats.screens_active} ativas`} to="/tvs" />
        <Stat label="Exibições hoje" value={stats.plays_today.toLocaleString('pt-BR')} icon={PlayCircle} color="brand" to="/relatorios" />
        {!isGuest ? (
          <>
            <Stat label="Playlists" value={stats.playlists} icon={ListVideo} color="amber" hint={`${stats.media} mídias`} to="/playlists" />
            <Stat label="Programações ativas" value={stats.schedules} icon={CalendarClock} color="sky" to="/grade" />
          </>
        ) : (
          <>
            <Stat label="Suas TVs" value={stats.screens} icon={Tv} color="amber" to="/tvs" />
            <Stat label="Programação" value="Ver" icon={CalendarClock} color="sky" to="/grade" />
          </>
        )}
      </div>

      {showSteps && (
        <Card className="bg-gradient-to-br from-brand-600 to-purple-600 text-white ring-0">
          <h3 className="text-lg font-semibold">Primeiros passos</h3>
          <p className="text-sm text-brand-100">Coloque sua primeira TV no ar em poucos minutos.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <Link key={i} to={s.to} className={cn('flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition', s.done ? 'bg-white/10 text-brand-100 line-through' : 'bg-white text-slate-800 hover:bg-brand-50')}>
                {s.done ? <CheckCircle2 className="size-5 text-emerald-300" /> : <Circle className="size-5 text-brand-400" />}
                {s.label}
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle icon={Tv} action={<Link to="/tvs" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">Ver todas <ArrowRight className="size-4" /></Link>}>
            Suas TVs
          </CardTitle>
          {screens.length === 0 ? (
            <EmptyState
              icon={Tv}
              title="Nenhuma TV cadastrada"
              description="Abra o player na TV, veja o código e cadastre aqui pelo celular."
              action={can('editor') && <Button icon={Plus} to="/tvs/adicionar">Adicionar TV</Button>}
            />
          ) : (
            <div className="-mx-2 divide-y divide-slate-100">
              {screens.slice(0, 8).map((s) => <ScreenRow key={s.id} screen={s} onToggle={toggle} busy={busy} />)}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          {!isGuest && (
            <Card>
              <CardTitle icon={HardDrive}>Uso do plano</CardTitle>
              <div className="space-y-4">
                <div>
                  <div className="mb-1.5 flex justify-between text-sm"><span className="text-slate-600">TVs</span><span className="font-medium">{usage.screens}{limits.max_screens != null ? ` de ${limits.max_screens}` : ''}</span></div>
                  <ProgressBar value={limits.max_screens ? usage.screens / limits.max_screens : 0.05} />
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between text-sm"><span className="text-slate-600">Armazenamento</span><span className="font-medium">{formatBytes(usage.storage_bytes)}{limits.max_storage_mb != null ? ` de ${formatBytes(limits.max_storage_mb * 1048576)}` : ''}</span></div>
                  <ProgressBar value={limits.max_storage_mb ? usage.storage_bytes / (limits.max_storage_mb * 1048576) : 0.05} color="bg-purple-500" />
                </div>
              </div>
            </Card>
          )}
          {!isGuest && (
            <Card>
              <CardTitle icon={Activity}>Atividade recente</CardTitle>
              {activity.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma atividade ainda.</p>
              ) : (
                <ul className="space-y-3">
                  {activity.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-400" />
                      <div className="min-w-0">
                        <p className="text-sm text-slate-700">{a.description}</p>
                        <p className="text-xs text-slate-400">{a.user_name || 'Sistema'} · {timeAgo(a.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
