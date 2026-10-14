import { useState } from 'react'
import { UserCircle2, KeyRound, Building2, LogOut, Save } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ROLE_LABELS } from '../lib/format'
import { useToast } from '../components/feedback'
import { Avatar, Badge, Button, Card, CardTitle, Field, Input, PageHeader } from '../components/ui'
import { PasswordInput } from './AuthPages'

export default function ProfilePage() {
  const { user, organizations, refresh, logout, switchOrg, orgId } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ name: user.name, email: user.email })
  const [pw, setPw] = useState({ current_password: '', new_password: '' })
  const [saving, setSaving] = useState(null)

  const saveProfile = async (e) => {
    e.preventDefault()
    setSaving('profile')
    try {
      await api.put('auth/me', form)
      await refresh()
      toast.success('Perfil atualizado')
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(null)
    }
  }
  const savePassword = async (e) => {
    e.preventDefault()
    setSaving('pw')
    try {
      await api.put('auth/password', pw)
      setPw({ current_password: '', new_password: '' })
      toast.success('Senha alterada')
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Meu perfil" />
      <div className="space-y-5">
        <Card>
          <div className="mb-5 flex items-center gap-4">
            <Avatar name={user.name} size="lg" />
            <div>
              <p className="text-lg font-semibold">{user.name}</p>
              <p className="text-sm text-slate-500">{user.email}</p>
              {user.is_superadmin && <Badge color="purple" className="mt-1">Administrador da plataforma</Badge>}
            </div>
          </div>
          <CardTitle icon={UserCircle2}>Dados pessoais</CardTitle>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="E-mail"><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end"><Button type="submit" icon={Save} loading={saving === 'profile'}>Salvar</Button></div>
          </form>
        </Card>

        <Card>
          <CardTitle icon={KeyRound}>Alterar senha</CardTitle>
          <form onSubmit={savePassword} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Senha atual"><PasswordInput required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
              <Field label="Nova senha" hint="Mínimo de 6 caracteres."><PasswordInput required minLength={6} autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end"><Button type="submit" loading={saving === 'pw'}>Alterar senha</Button></div>
          </form>
        </Card>

        <Card>
          <CardTitle icon={Building2} action={<Button size="sm" variant="subtle" to="/nova-organizacao">Nova organização</Button>}>Minhas organizações</CardTitle>
          <ul className="divide-y divide-slate-100">
            {organizations.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-2.5">
                <span className="flex size-9 items-center justify-center overflow-hidden rounded-lg bg-slate-800 text-xs font-bold text-white">
                  {o.logo_url ? <img src={o.logo_url} alt="" className="h-full w-full bg-white object-contain" /> : o.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{o.name}</span>
                  <span className="text-xs text-slate-500">{o.role ? ROLE_LABELS[o.role] : 'Acesso a TVs específicas'}</span>
                </span>
                {o.id === orgId ? <Badge color="green">Atual</Badge> : <Button size="sm" variant="secondary" onClick={() => switchOrg(o.id)}>Acessar</Button>}
              </li>
            ))}
          </ul>
        </Card>

        <Button variant="danger-ghost" icon={LogOut} onClick={logout} className="w-full sm:w-auto">Sair da conta</Button>
      </div>
    </div>
  )
}
