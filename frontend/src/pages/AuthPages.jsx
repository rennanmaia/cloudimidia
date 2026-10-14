import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Tv, CalendarClock, Smartphone, Newspaper, Eye, EyeOff, CheckCircle2, ArrowRight, Mail } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Field, Input, cn } from '../components/ui'
import { Logo } from '../components/Layout'

export function AuthShell({ children, title, subtitle }) {
  return (
    <div className="flex min-h-dvh">
      <div className="relative hidden w-[46%] overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-purple-600 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-purple-400/20 blur-3xl" />
        <Logo light className="relative [&_span_span]:text-brand-200" />
        <div className="relative my-auto max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">Todas as suas TVs, em um só lugar.</h2>
          <p className="mt-4 text-lg text-brand-100">Mídia indoor, TV corporativa, notícias e resultados de jogos — programados e controlados direto do seu celular.</p>
          <ul className="mt-10 space-y-4">
            {[
              [Tv, 'Cadastre uma TV em segundos com um código'],
              [CalendarClock, 'Grade de programação por horário, dia e grupo de TVs'],
              [Newspaper, 'Notícias, clima, placares e cotações automáticos'],
              [Smartphone, 'Ligue, desligue e troque o conteúdo pelo celular'],
            ].map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-3 text-brand-50">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20"><Icon className="size-[18px]" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-brand-200">© {new Date().getFullYear()} CloudMídia</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          {title && <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>}
          {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function PasswordInput(props) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} autoComplete="current-password" {...props} className="pr-11" />
      <button type="button" tabIndex={-1} onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:text-slate-600">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

function FormError({ error }) {
  if (!error) return null
  return <div className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>
}

export function LoginForm({ onSuccess, defaultEmail = '' }) {
  const { login } = useAuth()
  const [form, setForm] = useState({ email: defaultEmail, password: '' })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await api.post('auth/login', form, { auth: false })
      await login(data.token)
      onSuccess?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError error={error} />
      <Field label="E-mail">
        <Input type="email" autoComplete="email" required autoFocus={!defaultEmail} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="voce@empresa.com" />
      </Field>
      <Field label={<span className="flex justify-between w-full">Senha <Link to="/esqueci-senha" className="font-medium text-brand-600 hover:text-brand-700">Esqueci minha senha</Link></span>}>
        <PasswordInput required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading} iconRight={ArrowRight}>Entrar</Button>
    </form>
  )
}

export function Login() {
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  useEffect(() => {
    api.get('setup/status', { auth: false }).then((s) => {
      if (s.needs_setup) navigate('/setup', { replace: true })
      setStatus(s)
    }).catch(() => setStatus({ allow_registration: true }))
  }, [navigate])
  return (
    <AuthShell title="Bem-vindo de volta" subtitle="Entre para gerenciar suas TVs.">
      <LoginForm />
      {status?.allow_registration !== false && (
        <p className="mt-8 text-center text-sm text-slate-500">
          Ainda não tem conta? <Link to="/cadastro" className="font-semibold text-brand-600 hover:text-brand-700">Criar conta grátis</Link>
        </p>
      )}
    </AuthShell>
  )
}

export function RegisterForm({ inviteToken, defaultEmail = '', onSuccess }) {
  const { login } = useAuth()
  const [form, setForm] = useState({ name: '', email: defaultEmail, password: '', organization_name: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setErrors({})
    try {
      const body = { ...form }
      if (inviteToken) { body.invite_token = inviteToken; delete body.organization_name }
      const data = await api.post('auth/register', body, { auth: false })
      await login(data.token)
      onSuccess?.()
    } catch (err) {
      setError(err.message)
      setErrors(err.errors || {})
    } finally {
      setLoading(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError error={error} />
      <Field label="Seu nome" error={errors.name}>
        <Input required autoComplete="name" value={form.name} onChange={set('name')} placeholder="Maria Silva" autoFocus />
      </Field>
      {!inviteToken && (
        <Field label="Nome da sua empresa" error={errors.organization_name} hint="Você poderá criar outras empresas depois.">
          <Input required value={form.organization_name} onChange={set('organization_name')} placeholder="Ex.: Mídia Indoor Centro" />
        </Field>
      )}
      <Field label="E-mail" error={errors.email}>
        <Input type="email" required autoComplete="email" value={form.email} onChange={set('email')} placeholder="voce@empresa.com" />
      </Field>
      <Field label="Senha" error={errors.password} hint="Mínimo de 6 caracteres.">
        <PasswordInput required minLength={6} autoComplete="new-password" value={form.password} onChange={set('password')} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading} iconRight={ArrowRight}>Criar conta</Button>
    </form>
  )
}

export function Register() {
  return (
    <AuthShell title="Crie sua conta" subtitle="Comece a gerenciar suas TVs em poucos minutos.">
      <RegisterForm />
      <p className="mt-8 text-center text-sm text-slate-500">
        Já tem conta? <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">Entrar</Link>
      </p>
    </AuthShell>
  )
}

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.post('auth/forgot', { email }, { auth: false })
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  return (
    <AuthShell title="Esqueceu a senha?" subtitle="Enviaremos um link para você criar uma nova senha.">
      {sent ? (
        <div className="rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <Mail className="mb-2 size-6" />
          Se o e-mail <b>{email}</b> estiver cadastrado, você receberá as instruções em instantes. Confira também a caixa de spam.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <FormError error={error} />
          <Field label="E-mail">
            <Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={loading}>Enviar link</Button>
        </form>
      )}
      <p className="mt-8 text-center text-sm"><Link to="/login" className="font-semibold text-brand-600">Voltar para o login</Link></p>
    </AuthShell>
  )
}

export function ResetPassword() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.post('auth/reset', { token, password }, { auth: false })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  return (
    <AuthShell title="Criar nova senha">
      {done ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            <CheckCircle2 className="size-5" /> Senha alterada com sucesso!
          </div>
          <Button size="lg" className="w-full" onClick={() => navigate('/login')}>Ir para o login</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <FormError error={error} />
          <Field label="Nova senha" hint="Mínimo de 6 caracteres.">
            <PasswordInput required minLength={6} autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={loading}>Salvar nova senha</Button>
        </form>
      )}
    </AuthShell>
  )
}

export function Setup() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', organization_name: '' })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  useEffect(() => {
    api.get('setup/status', { auth: false })
      .then((s) => (s.needs_setup ? setChecking(false) : navigate('/login', { replace: true })))
      .catch((e) => { setError(e.message); setChecking(false) })
  }, [navigate])
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await api.post('setup', form, { auth: false })
      await login(data.token)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  if (checking) return null
  return (
    <AuthShell title="Configuração inicial" subtitle="Crie a conta de administrador da plataforma.">
      <form onSubmit={submit} className="space-y-4">
        <FormError error={error} />
        <Field label="Seu nome"><Input required value={form.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Nome da sua empresa"><Input required value={form.organization_name} onChange={set('organization_name')} /></Field>
        <Field label="E-mail"><Input type="email" required value={form.email} onChange={set('email')} /></Field>
        <Field label="Senha" hint="Mínimo de 6 caracteres."><PasswordInput required minLength={6} value={form.password} onChange={set('password')} /></Field>
        <Button type="submit" size="lg" className={cn('w-full')} loading={loading}>Concluir configuração</Button>
      </form>
    </AuthShell>
  )
}

export function useNextParam() {
  const [params] = useSearchParams()
  return params.get('next')
}
