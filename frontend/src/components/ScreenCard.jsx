import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Tv, PlayCircle, MapPin, Power, PlugZap } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { timeAgo } from '../lib/format'
import { useToast } from './feedback'
import { OnlineBadge, Toggle, cn } from './ui'

export function useScreenToggle(onChange) {
  const { orgId } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  const toggle = async (screen, value) => {
    setBusy(screen.id)
    try {
      const d = await api.put(`orgs/${orgId}/screens/${screen.id}`, { is_active: value })
      onChange?.(d.screen)
      toast.success(value ? `"${screen.name}" ativada` : `"${screen.name}" desativada`)
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }
  return [toggle, busy]
}

export function ScreenCard({ screen, onToggle, busy }) {
  const status = !screen.paired ? 'pending' : !screen.is_active ? 'off' : screen.online ? 'on' : 'offline'
  return (
    <Link
      to={`/tvs/${screen.id}`}
      className="group block overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div
        className={cn(
          'relative flex aspect-[16/8] items-center justify-center overflow-hidden',
          status === 'on' && 'bg-gradient-to-br from-slate-800 to-slate-900',
          status === 'offline' && 'bg-gradient-to-br from-slate-200 to-slate-300',
          status === 'off' && 'bg-slate-100',
          status === 'pending' && 'bg-[repeating-linear-gradient(135deg,#fffbeb_0_10px,#fef3c7_10px_20px)]'
        )}
      >
        {status === 'on' && <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.45),transparent_60%)]" />}
        <div className={cn('relative flex flex-col items-center gap-1.5 px-4 text-center', status === 'on' ? 'text-white' : status === 'pending' ? 'text-amber-700' : 'text-slate-500')}>
          {status === 'on' ? <PlayCircle className="size-7 text-brand-300" /> : status === 'off' ? <Power className="size-7" /> : status === 'pending' ? <PlugZap className="size-7" /> : <Tv className="size-7" />}
          <span className="line-clamp-1 text-xs font-medium opacity-90">
            {status === 'on' ? (screen.now_playing || 'Exibindo') : status === 'off' ? 'TV desativada' : status === 'pending' ? (screen.install_link_active ? 'Link de instalação enviado' : 'Conecte o aparelho') : `Visto ${timeAgo(screen.last_seen_at)}`}
          </span>
        </div>
        <div className="absolute left-3 top-3"><OnlineBadge online={screen.online} active={screen.is_active} paired={screen.paired} /></div>
      </div>
      <div className="flex items-center gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-slate-900 group-hover:text-brand-700">{screen.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
            {screen.location ? <><MapPin className="size-3 shrink-0" />{screen.location}</> : (screen.default_playlist_name || 'Sem playlist padrão')}
          </p>
          {screen.groups?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {screen.groups.slice(0, 3).map((g) => (
                <span key={g.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  <span className="size-1.5 rounded-full" style={{ background: g.color }} />{g.name}
                </span>
              ))}
            </div>
          )}
        </div>
        {screen.can_operate && onToggle && (
          <div onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
            <Toggle checked={screen.is_active} disabled={busy === screen.id} onChange={(v) => onToggle(screen, v)} />
          </div>
        )}
      </div>
    </Link>
  )
}

export function ScreenRow({ screen, onToggle, busy }) {
  return (
    <Link to={`/tvs/${screen.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', screen.is_active && screen.online ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400')}>
        <Tv className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">{screen.name}</span>
        <span className="block truncate text-xs text-slate-500">
          {!screen.paired ? 'Aguardando instalação' : !screen.is_active ? 'Desativada' : screen.online ? (screen.now_playing ? `▶ ${screen.now_playing}` : 'Online') : `Offline · visto ${timeAgo(screen.last_seen_at)}`}
        </span>
      </span>
      {screen.can_operate && onToggle ? (
        <span onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
          <Toggle size="sm" checked={screen.is_active} disabled={busy === screen.id} onChange={(v) => onToggle(screen, v)} />
        </span>
      ) : (
        <OnlineBadge online={screen.online} active={screen.is_active} paired={screen.paired} />
      )}
    </Link>
  )
}
