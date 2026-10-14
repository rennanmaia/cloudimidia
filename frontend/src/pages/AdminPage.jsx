import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Shield, Building2, Users, Tv, HardDrive, PlayCircle, Wifi, Pencil, LogIn, KeyRound, Ban, CheckCircle2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useDebounced, useFetch } from '../lib/hooks'
import { formatBytes, formatDate, timeAgo } from '../lib/format'
import { useConfirm, useToast } from '../components/feedback'
import { Avatar, Badge, Button, Card, Field, IconButton, Input, Modal, PageHeader, PageLoader, SearchInput, Stat, Tabs } from '../components/ui'

export default function AdminPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState('orgs')
  const { data: stats } = useFetch(user?.is_superadmin ? 'admin/stats' : null)
  if (!user?.is_superadmin) return <Navigate to="/" replace />
  return (
    <div>
      <PageHeader title="Plataforma" description="Administração de clientes, limites e usuários do sistema." />
      {stats ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <Stat label="Organizações" value={stats.organizations} icon={Building2} />
          <Stat label="Usuários" value={stats.users} icon={Users} color="sky" />
          <Stat label="TVs" value={stats.screens} icon={Tv} color="amber" hint={`${stats.screens_online} online`} />
          <Stat label="Armazenamento" value={formatBytes(stats.storage_bytes)} icon={HardDrive} color="rose" />
          <Stat label="Exibições 24h" value={stats.plays_24h.toLocaleString('pt-BR')} icon={PlayCircle} color="green" />
        </div>
      ) : <PageLoader />}
      <Tabs className="mb-5 w-fit" value={tab} onChange={setTab} tabs={[{ value: 'orgs', label: 'Organizações', icon: Building2 }, { value: 'users', label: 'Usuários', icon: Users }]} />
      {tab === 'orgs' ? <Orgs /> : <UsersTab />}
    </div>
  )
}

function Orgs() {
  const { switchOrg } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const { data, loading, reload } = useFetch(`admin/orgs?q=${encodeURIComponent(dq)}`)
  const [edit, setEdit] = useState(null)

  const save = async () => {
    try {
      await api.put(`admin/orgs/${edit.id}`, { status: edit.status, max_screens: edit.max_screens, max_storage_mb: edit.max_storage_mb })
      toast.success('Organização atualizada')
      setEdit(null)
      reload(true)
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <>
      <SearchInput value={q} onChange={setQ} placeholder="Buscar organização" className="mb-4 sm:w-72" />
      {loading && !data ? <PageLoader /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data?.organizations.map((o) => (
            <Card key={o.id} className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-800 text-sm font-bold text-white">
                {o.logo_url ? <img src={o.logo_url} alt="" className="h-full w-full bg-white object-contain" /> : o.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-semibold">{o.name}{o.status === 'suspended' && <Badge color="red">Suspensa</Badge>}</p>
                <p className="truncate text-xs text-slate-500">{o.owner_email || '—'} · desde {formatDate(o.created_at)}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span className="flex items-center gap-1"><Tv className="size-3.5" />{o.screens_count}{o.max_screens != null ? `/${o.max_screens}` : ''} TVs</span>
                  <span className="flex items-center gap-1"><Wifi className="size-3.5" />{o.online_count} online</span>
                  <span className="flex items-center gap-1"><Users className="size-3.5" />{o.members_count}</span>
                  <span className="flex items-center gap-1"><HardDrive className="size-3.5" />{formatBytes(o.storage_bytes)}{o.max_storage_mb != null ? ` / ${formatBytes(o.max_storage_mb * 1048576)}` : ''}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row">
                <IconButton icon={LogIn} label="Acessar" size="sm" onClick={() => { switchOrg(o.id); navigate('/') }} />
                <IconButton icon={Pencil} label="Editar" size="sm" onClick={() => setEdit({ ...o, max_screens: o.max_screens ?? '', max_storage_mb: o.max_storage_mb ?? '' })} />
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.name} description="Limites do plano desta organização." footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Máximo de TVs" hint="Vazio = ilimitado"><Input type="number" min={0} value={edit.max_screens} onChange={(e) => setEdit({ ...edit, max_screens: e.target.value })} /></Field>
              <Field label="Armazenamento (MB)" hint="Vazio = ilimitado"><Input type="number" min={0} value={edit.max_storage_mb} onChange={(e) => setEdit({ ...edit, max_storage_mb: e.target.value })} /></Field>
            </div>
            <Button variant={edit.status === 'active' ? 'danger-ghost' : 'success'} icon={edit.status === 'active' ? Ban : CheckCircle2} onClick={() => setEdit({ ...edit, status: edit.status === 'active' ? 'suspended' : 'active' })}>
              {edit.status === 'active' ? 'Suspender organização' : 'Reativar organização'} {edit.status === 'suspended' && '(suspensa)'}
            </Button>
            {edit.status === 'suspended' && <p className="text-xs text-rose-600">Ao salvar, a equipe perde o acesso e as TVs ficam com a tela preta.</p>}
          </div>
        )}
      </Modal>
    </>
  )
}

function UsersTab() {
  const { user: me } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const { data, loading, reload } = useFetch(`admin/users?q=${encodeURIComponent(dq)}`)
  const [temp, setTemp] = useState(null)

  const update = async (u, patch, msg) => {
    try {
      const d = await api.put(`admin/users/${u.id}`, patch)
      if (d.temp_password) setTemp({ user: u, password: d.temp_password })
      else toast.success(msg)
      reload(true)
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <>
      <SearchInput value={q} onChange={setQ} placeholder="Buscar por nome ou e-mail" className="mb-4 sm:w-72" />
      {loading && !data ? <PageLoader /> : (
        <Card padded={false} className="divide-y divide-slate-100">
          {data?.users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={u.name} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {u.name}
                  {u.is_superadmin && <Badge color="purple"><Shield className="size-3" />Admin</Badge>}
                  {u.status === 'blocked' && <Badge color="red">Bloqueado</Badge>}
                </p>
                <p className="truncate text-xs text-slate-500">{u.email} · {u.orgs_count} org. · último acesso {timeAgo(u.last_login_at)}</p>
              </div>
              {u.id !== me.id && (
                <div className="flex gap-1">
                  <IconButton icon={KeyRound} label="Gerar senha temporária" size="sm" onClick={async () => (await confirm({ title: 'Gerar senha temporária?', message: `A senha atual de ${u.name} deixará de funcionar.`, confirmLabel: 'Gerar' })) && update(u, { reset_password: true })} />
                  <IconButton icon={Shield} label={u.is_superadmin ? 'Remover admin' : 'Tornar admin'} size="sm" onClick={() => update(u, { is_superadmin: !u.is_superadmin }, 'Permissão alterada')} />
                  <IconButton icon={u.status === 'active' ? Ban : CheckCircle2} label={u.status === 'active' ? 'Bloquear' : 'Desbloquear'} size="sm" variant={u.status === 'active' ? 'danger-ghost' : 'ghost'} onClick={() => update(u, { status: u.status === 'active' ? 'blocked' : 'active' }, 'Status alterado')} />
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      <Modal open={!!temp} onClose={() => setTemp(null)} title="Senha temporária" footer={<Button onClick={() => setTemp(null)}>Fechar</Button>}>
        {temp && (
          <div className="space-y-3 text-sm">
            <p>Envie esta senha para <b>{temp.user.name}</b> ({temp.user.email}). Peça para trocá-la no perfil após entrar.</p>
            <code className="block rounded-xl bg-slate-100 p-3 text-center text-lg font-bold tracking-wider">{temp.password}</code>
          </div>
        )}
      </Modal>
    </>
  )
}
