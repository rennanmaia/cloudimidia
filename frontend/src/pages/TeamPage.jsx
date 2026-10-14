import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Users, Tv, Mail, Trash2, Link2, LogOut, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useFetch } from '../lib/hooks'
import { ROLE_DESCRIPTIONS, ROLE_LABELS, SCREEN_ROLE_LABELS, formatDate, timeAgo } from '../lib/format'
import { useConfirm, useToast } from '../components/feedback'
import { Avatar, Badge, Button, Card, CardTitle, ErrorState, IconButton, Modal, PageHeader, PageLoader, Select } from '../components/ui'
import InviteModal, { ShareLink } from '../components/InviteModal'

export default function TeamPage() {
  const { orgId, org, can, refresh, user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useFetch(`orgs/${orgId}/members`)
  const { data: inv, reload: reloadInv } = useFetch(can('admin') ? `orgs/${orgId}/invitations` : null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [share, setShare] = useState(null)

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const changeRole = async (m, role) => {
    try {
      await api.put(`orgs/${orgId}/members/${m.id}`, { role })
      toast.success(`${m.name} agora é ${ROLE_LABELS[role]}`)
      reload(true)
    } catch (e) {
      toast.error(e)
    }
  }
  const removeMember = async (m) => {
    const self = m.is_me
    if (!(await confirm({ title: self ? 'Sair da organização?' : `Remover ${m.name}?`, message: self ? 'Você perderá o acesso a esta organização.' : 'A pessoa perderá o acesso a esta organização.', danger: true, confirmLabel: self ? 'Sair' : 'Remover' }))) return
    try {
      await api.del(`orgs/${orgId}/members/${m.id}`)
      if (self) {
        await refresh()
        navigate('/')
      } else {
        toast.success('Membro removido')
        reload(true)
      }
    } catch (e) {
      toast.error(e)
    }
  }
  const changeGuest = async (g, role) => {
    try {
      await api.put(`orgs/${orgId}/screen-access/${g.id}`, { role })
      reload(true)
    } catch (e) {
      toast.error(e)
    }
  }
  const removeGuest = async (g) => {
    if (!(await confirm({ title: 'Remover acesso?', message: `${g.name} não poderá mais acessar a TV "${g.screen_name}".`, danger: true, confirmLabel: 'Remover' }))) return
    try {
      await api.del(`orgs/${orgId}/screen-access/${g.id}`)
      reload(true)
    } catch (e) {
      toast.error(e)
    }
  }
  const revoke = async (i) => {
    try {
      await api.del(`orgs/${orgId}/invitations/${i.id}`)
      toast.success('Convite cancelado')
      reloadInv(true)
    } catch (e) {
      toast.error(e)
    }
  }

  const roleOptions = (m) => {
    const opts = ['viewer', 'editor', 'admin']
    if (can('owner')) opts.push('owner')
    else if (m.role === 'owner') return ['owner']
    return opts
  }

  return (
    <div>
      <PageHeader
        title="Equipe"
        description={`Quem pode gerenciar ${org?.name}.`}
        actions={can('admin') && <Button icon={UserPlus} onClick={() => setInviteOpen(true)}>Convidar pessoa</Button>}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardTitle icon={Users}>Membros ({data.members.length})</CardTitle>
            <ul className="-mx-1 divide-y divide-slate-100">
              {data.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-1 py-3">
                  <Avatar name={m.name} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-medium text-slate-900">{m.name}{m.is_me && <Badge color="brand">Você</Badge>}</p>
                    <p className="truncate text-sm text-slate-500">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {can('admin') && !m.is_me ? (
                      <Select value={m.role} onChange={(e) => changeRole(m, e.target.value)} className="h-9 w-40 text-sm" disabled={m.role === 'owner' && !can('owner')}>
                        {roleOptions(m).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </Select>
                    ) : (
                      <Badge color={m.role === 'owner' ? 'purple' : m.role === 'admin' ? 'brand' : 'slate'}>{ROLE_LABELS[m.role]}</Badge>
                    )}
                    {(m.is_me || (can('admin') && (m.role !== 'owner' || can('owner')))) && (
                      <IconButton icon={m.is_me ? LogOut : Trash2} label={m.is_me ? 'Sair' : 'Remover'} size="sm" variant="danger-ghost" onClick={() => removeMember(m)} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle icon={Tv}>Acesso a TVs específicas ({data.guests.length})</CardTitle>
            <p className="-mt-2 mb-3 text-sm text-slate-500">Pessoas que gerenciam só algumas TVs — por exemplo, o dono do estabelecimento onde a TV está instalada.</p>
            {data.guests.length === 0 ? <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">Ninguém com acesso restrito.</p> : (
              <ul className="-mx-1 divide-y divide-slate-100">
                {data.guests.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-3 px-1 py-3">
                    <Avatar name={g.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{g.name}</p>
                      <p className="flex items-center gap-1 truncate text-sm text-slate-500"><Tv className="size-3.5" />{g.screen_name}</p>
                    </div>
                    {can('admin') ? (
                      <div className="flex items-center gap-1">
                        <Select value={g.role} onChange={(e) => changeGuest(g, e.target.value)} className="h-9 w-40 text-sm">
                          <option value="editor">{SCREEN_ROLE_LABELS.editor}</option>
                          <option value="viewer">{SCREEN_ROLE_LABELS.viewer}</option>
                        </Select>
                        <IconButton icon={Trash2} label="Remover" size="sm" variant="danger-ghost" onClick={() => removeGuest(g)} />
                      </div>
                    ) : <Badge>{SCREEN_ROLE_LABELS[g.role]}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {can('admin') && inv?.invitations.length > 0 && (
            <Card>
              <CardTitle icon={Mail}>Convites pendentes ({inv.invitations.length})</CardTitle>
              <ul className="-mx-1 divide-y divide-slate-100">
                {inv.invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-1 py-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-amber-100 text-amber-600"><Mail className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{i.email}</p>
                      <p className="truncate text-xs text-slate-500">
                        {i.scope === 'org' ? ROLE_LABELS[i.role] : `${SCREEN_ROLE_LABELS[i.role]}: ${i.screens.map((s) => s.name).join(', ')}`}
                        {' · '}enviado {timeAgo(i.created_at)} · expira {formatDate(i.expires_at)}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" icon={Link2} onClick={() => setShare(i)}>Link</Button>
                    <IconButton icon={Trash2} label="Cancelar convite" size="sm" variant="danger-ghost" onClick={() => revoke(i)} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardTitle icon={ShieldCheck}>Permissões</CardTitle>
          <dl className="space-y-3">
            {['owner', 'admin', 'editor', 'viewer'].map((r) => (
              <div key={r}>
                <dt className="text-sm font-semibold text-slate-800">{ROLE_LABELS[r]}</dt>
                <dd className="text-sm text-slate-500">{ROLE_DESCRIPTIONS[r]}</dd>
              </div>
            ))}
            <div className="border-t border-slate-100 pt-3">
              <dt className="text-sm font-semibold text-slate-800">Acesso a TV específica</dt>
              <dd className="text-sm text-slate-500">Vê e programa somente as TVs liberadas, com as próprias mídias e playlists.</dd>
            </div>
          </dl>
          {user?.is_superadmin && <p className="mt-4 text-xs text-slate-400">Como administrador da plataforma, você tem acesso total a todas as organizações.</p>}
        </Card>
      </div>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} onInvited={() => reloadInv(true)} />
      <Modal open={!!share} onClose={() => setShare(null)} title="Link do convite" description={share ? `Para ${share.email}` : ''}>
        {share && <ShareLink link={share.link} email={share.email} orgName={org?.name} />}
      </Modal>
    </div>
  )
}
