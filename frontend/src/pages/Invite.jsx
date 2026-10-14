import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Building2, Tv, CheckCircle2, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ROLE_LABELS, SCREEN_ROLE_LABELS } from '../lib/format'
import { Button, PageLoader, Segmented } from '../components/ui'
import { useToast } from '../components/feedback'
import { AuthShell, LoginForm, RegisterForm } from './AuthPages'

export default function Invite() {
  const { token } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, loading: authLoading, refresh, switchOrg, logout } = useAuth()
  const [inv, setInv] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('register')
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    api.get(`invitations/${token}`, { auth: false })
      .then((d) => { setInv(d.invitation); setMode(d.invitation.has_account ? 'login' : 'register') })
      .catch((e) => setError(e.message))
  }, [token])

  const accept = async () => {
    setAccepting(true)
    try {
      const d = await api.post(`invitations/${token}/accept`)
      await refresh()
      switchOrg(d.organization_id)
      toast.success('Convite aceito! Bem-vindo(a).')
      navigate('/', { replace: true })
    } catch (e) {
      toast.error(e)
      setAccepting(false)
    }
  }

  // Após criar conta ou entrar, aceita automaticamente
  const [autoAccept, setAutoAccept] = useState(false)
  useEffect(() => {
    if (autoAccept && user) accept()
  }, [autoAccept, user]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <AuthShell>
        <div className="text-center">
          <XCircle className="mx-auto size-12 text-rose-500" />
          <h1 className="mt-4 text-xl font-bold">Convite indisponível</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <Button className="mt-6" variant="secondary" onClick={() => navigate('/')}>Ir para o início</Button>
        </div>
      </AuthShell>
    )
  }
  if (!inv || authLoading) return <PageLoader />

  const what = inv.scope === 'org'
    ? <>como <b>{ROLE_LABELS[inv.role]}</b> da organização</>
    : <>para {inv.role === 'editor' ? 'programar' : 'acompanhar'} {inv.screens.length > 1 ? 'as TVs' : 'a TV'}</>

  return (
    <AuthShell>
      <div className="mb-6 rounded-2xl bg-gradient-to-br from-brand-50 to-purple-50 p-5 ring-1 ring-brand-100">
        <div className="flex items-center gap-3">
          {inv.organization_logo ? (
            <img src={inv.organization_logo} alt="" className="size-12 rounded-xl bg-white object-contain ring-1 ring-slate-200" />
          ) : (
            <span className="flex size-12 items-center justify-center rounded-xl bg-white ring-1 ring-brand-100"><Building2 className="size-6 text-brand-600" /></span>
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-600">Convite</p>
            <h1 className="truncate text-lg font-bold text-slate-900">{inv.organization_name}</h1>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-600">
          <b>{inv.invited_by_name || 'Alguém'}</b> convidou você {what}
          {inv.scope === 'screens' && ':'}
        </p>
        {inv.scope === 'screens' && (
          <ul className="mt-2 space-y-1">
            {inv.screens.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-sm font-medium text-slate-800"><Tv className="size-4 text-brand-500" /> {s.name}</li>
            ))}
            <li className="text-xs text-slate-500">Permissão: {SCREEN_ROLE_LABELS[inv.role]}</li>
          </ul>
        )}
      </div>

      {user ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Você está conectado como <b>{user.email}</b>.</p>
          <Button size="lg" className="w-full" icon={CheckCircle2} loading={accepting} onClick={accept}>Aceitar convite</Button>
          <Button variant="ghost" className="w-full" onClick={logout}>Usar outra conta</Button>
        </div>
      ) : (
        <div className="space-y-5">
          <Segmented
            className="w-full"
            value={mode}
            onChange={setMode}
            options={[{ value: 'register', label: 'Criar conta' }, { value: 'login', label: 'Já tenho conta' }]}
          />
          {mode === 'register' ? (
            <RegisterForm inviteToken={token} defaultEmail={inv.email} onSuccess={() => setAutoAccept(true)} />
          ) : (
            <LoginForm defaultEmail={inv.email} onSuccess={() => setAutoAccept(true)} />
          )}
        </div>
      )}
    </AuthShell>
  )
}
