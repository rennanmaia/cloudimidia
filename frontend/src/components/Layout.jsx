import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Tv, CalendarClock, ListVideo, Image, Puzzle, BarChart3, Users, Settings, Shield,
  LogOut, UserCircle2, ChevronsUpDown, Check, Plus, Menu, Building2, X, MonitorPlay,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { ROLE_LABELS } from '../lib/format'
import { Avatar, cn, PageLoader } from './ui'

export function Logo({ className, light }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 shadow-md shadow-brand-500/30">
        <MonitorPlay className="size-5 text-white" />
      </div>
      <span className={cn('text-lg font-extrabold tracking-tight', light ? 'text-white' : 'text-slate-900')}>
        Cloud<span className="text-brand-600">Mídia</span>
      </span>
    </div>
  )
}

function useNav() {
  const { can, isGuest, canCreate, user } = useAuth()
  return [
    { to: '/', label: 'Início', icon: LayoutDashboard, end: true },
    { to: '/tvs', label: 'TVs', icon: Tv },
    { to: '/grade', label: 'Programação', icon: CalendarClock },
    { to: '/playlists', label: 'Playlists', icon: ListVideo },
    { to: '/midias', label: 'Mídias', icon: Image, show: !isGuest || canCreate },
    { to: '/integracoes', label: 'Integrações', icon: Puzzle },
    { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
    { to: '/equipe', label: 'Equipe', icon: Users, show: !isGuest },
    { to: '/configuracoes', label: 'Configurações', icon: Settings, show: can('admin') },
    { to: '/admin', label: 'Plataforma', icon: Shield, show: !!user?.is_superadmin, section: true },
  ].filter((i) => i.show !== false)
}

function OrgLogo({ org, className }) {
  if (org?.logo_url) return <img src={org.logo_url} alt="" className={cn('size-8 rounded-lg object-contain bg-white ring-1 ring-slate-200', className)} />
  return (
    <span className={cn('flex size-8 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-white', className)}>
      {(org?.name || '?').slice(0, 2).toUpperCase()}
    </span>
  )
}

function OrgSwitcher({ compact }) {
  const { organizations, org, switchOrg } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  useEffect(() => {
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl text-left transition',
          compact ? 'max-w-[60vw] px-1.5 py-1 hover:bg-slate-100' : 'bg-white px-2.5 py-2 ring-1 ring-slate-200 hover:ring-slate-300 shadow-sm'
        )}
      >
        <OrgLogo org={org} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">{org?.name || 'Selecione'}</span>
          {!compact && <span className="block truncate text-xs text-slate-500">{org ? (org.role ? ROLE_LABELS[org.role] : 'Acesso a TVs específicas') : '—'}</span>}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className={cn('absolute z-40 mt-2 w-72 rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-slate-200 animate-pop', compact ? 'left-0' : 'left-0 right-0 w-auto')}>
          <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Suas organizações</p>
          <div className="max-h-72 overflow-y-auto scrollbar-thin">
            {organizations.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { switchOrg(o.id); setOpen(false); navigate('/') }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-slate-50"
              >
                <OrgLogo org={o} className="size-7" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{o.name}</span>
                  <span className="block text-xs text-slate-500">{o.role ? ROLE_LABELS[o.role] : 'Convidado'}</span>
                </span>
                {org?.id === o.id && <Check className="size-4 text-brand-600" />}
              </button>
            ))}
          </div>
          <div className="mt-1 border-t border-slate-100 pt-1">
            <button
              type="button"
              onClick={() => { setOpen(false); navigate('/nova-organizacao') }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              <Plus className="size-4" /> Nova organização
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function NavItem({ item, onClick }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
          isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon className={cn('size-[18px]', isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')} />
          {item.label}
        </>
      )}
    </NavLink>
  )
}

function UserBlock({ onNavigate }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-2.5 rounded-xl p-2">
      <button type="button" onClick={() => { navigate('/perfil'); onNavigate?.() }} className="flex min-w-0 flex-1 items-center gap-2.5 text-left rounded-lg">
        <Avatar name={user?.name} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-800">{user?.name}</span>
          <span className="block truncate text-xs text-slate-500">{user?.email}</span>
        </span>
      </button>
      <button type="button" title="Sair" onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600">
        <LogOut className="size-4" />
      </button>
    </div>
  )
}

function MoreSheet({ open, onClose, items }) {
  const { logout } = useAuth()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 pb-6 shadow-2xl animate-slide-up safe-bottom">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-semibold">Menu</span>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="size-5" /></button>
        </div>
        <div className="mb-3"><OrgSwitcher /></div>
        <div className="grid grid-cols-3 gap-2">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              onClick={onClose}
              className={({ isActive }) =>
                cn('flex flex-col items-center gap-1.5 rounded-2xl p-3 text-xs font-medium ring-1 transition', isActive ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'text-slate-600 ring-slate-200 hover:bg-slate-50')
              }
            >
              <it.icon className="size-5" />
              {it.label}
            </NavLink>
          ))}
          <NavLink to="/perfil" onClick={onClose} className="flex flex-col items-center gap-1.5 rounded-2xl p-3 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
            <UserCircle2 className="size-5" /> Meu perfil
          </NavLink>
          <button type="button" onClick={logout} className="flex flex-col items-center gap-1.5 rounded-2xl p-3 text-xs font-medium text-rose-600 ring-1 ring-rose-100">
            <LogOut className="size-5" /> Sair
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Layout() {
  const { org, organizations, orgLoading, user } = useAuth()
  const nav = useNav()
  const location = useLocation()
  const [more, setMore] = useState(false)

  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])

  const free = ['/nova-organizacao', '/perfil', '/admin'].some((p) => location.pathname.startsWith(p))
  const needsOrg = !organizations.length && !free
  const bottom = nav.filter((i) => ['/', '/tvs', '/grade', '/playlists'].includes(i.to))
  const rest = nav.filter((i) => !bottom.includes(i))

  return (
    <div className="min-h-dvh">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200/80 bg-white/80 backdrop-blur lg:flex">
        <div className="px-5 pt-5 pb-4"><Logo /></div>
        {organizations.length > 0 && <div className="px-3 pb-3"><OrgSwitcher /></div>}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1 scrollbar-thin">
          {organizations.length > 0 && nav.map((item) => (
            <div key={item.to}>
              {item.section && <div className="mx-3 my-3 border-t border-slate-100" />}
              <NavItem item={item} />
            </div>
          ))}
          {!organizations.length && user?.is_superadmin && <NavItem item={{ to: '/admin', label: 'Plataforma', icon: Shield }} />}
        </nav>
        <div className="border-t border-slate-100 p-2"><UserBlock /></div>
      </aside>

      {/* Topo (celular) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/90 px-3 backdrop-blur lg:hidden">
        {organizations.length > 0 ? <OrgSwitcher compact /> : <Logo />}
        <NavLink to="/perfil" className="rounded-full"><Avatar name={user?.name} size="sm" /></NavLink>
      </header>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:py-8 lg:pb-10">
          {needsOrg ? <NoOrg /> : (orgLoading && !org) ? <PageLoader /> : (
            <Suspense fallback={<PageLoader />}>
              <Outlet key={org?.id} />
            </Suspense>
          )}
        </div>
      </main>

      {/* Navegação inferior (celular) */}
      {organizations.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur safe-bottom lg:hidden">
          <div className="grid grid-cols-5">
            {bottom.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                className={({ isActive }) => cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', isActive ? 'text-brand-600' : 'text-slate-500')}
              >
                <it.icon className="size-[22px]" />
                {it.label}
              </NavLink>
            ))}
            <button type="button" onClick={() => setMore(true)} className={cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', rest.some((r) => location.pathname.startsWith(r.to)) ? 'text-brand-600' : 'text-slate-500')}>
              <Menu className="size-[22px]" /> Mais
            </button>
          </div>
        </nav>
      )}
      <MoreSheet open={more} onClose={() => setMore(false)} items={rest} />
    </div>
  )
}

function NoOrg() {
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-brand-50"><Building2 className="size-8 text-brand-600" /></div>
      <h1 className="text-xl font-bold">Você ainda não participa de nenhuma organização</h1>
      <p className="mt-2 text-sm text-slate-500">Crie a sua empresa de mídia indoor para começar a cadastrar TVs, ou peça a alguém para convidar você.</p>
      <button type="button" onClick={() => navigate('/nova-organizacao')} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow hover:bg-brand-700">
        <Plus className="size-4" /> Criar organização
      </button>
    </div>
  )
}
