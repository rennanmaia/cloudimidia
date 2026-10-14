import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Copy, CheckCircle2, Tv, Plus, Monitor, Smartphone, ArrowRight, RefreshCcw, CalendarPlus, Clock } from 'lucide-react'
import { InstallLinkPanel } from '../../components/InstallLink'
import { api, TV_URL } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useFetch } from '../../lib/hooks'
import { useToast } from '../../components/feedback'
import { Button, Card, Field, Input, PageHeader, Segmented, Select, cn } from '../../components/ui'

function CodeInput({ value, onChange, error }) {
  const ref = useRef(null)
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')
  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={!value}
        aria-label="Código da TV"
        className="absolute inset-0 h-full w-full opacity-0"
      />
      <div className="grid grid-cols-6 gap-2 sm:gap-3">
        {digits.map((d, i) => {
          const active = i === Math.min(value.length, 5)
          return (
            <div
              key={i}
              className={cn(
                'flex aspect-[4/5] items-center justify-center rounded-2xl bg-white text-3xl font-bold text-slate-900 ring-2 transition sm:text-4xl',
                error ? 'ring-rose-300' : active ? 'ring-brand-500 shadow-lg shadow-brand-500/20' : d.trim() ? 'ring-slate-300' : 'ring-slate-200'
              )}
            >
              {d.trim()}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PairScreen() {
  const { orgId, can } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const replaceId = params.get('replace') ? Number(params.get('replace')) : null
  const [code, setCode] = useState(params.get('code')?.replace(/\D/g, '').slice(0, 6) || '')
  // now = TV ligada na frente (código); later = cadastro prévio, conecta depois
  const [mode, setMode] = useState(params.get('modo') === 'depois' && !replaceId ? 'later' : 'now')
  const [form, setForm] = useState({ name: '', location: '', group_ids: [], default_playlist_id: '', rotation: 0 })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)
  const [install, setInstall] = useState(null)
  const { data: groups } = useFetch(`orgs/${orgId}/groups`)
  const { data: playlists } = useFetch(`orgs/${orgId}/playlists`)
  const { data: screens } = useFetch(replaceId ? `orgs/${orgId}/screens/${replaceId}` : null)

  useEffect(() => { if (!can('editor')) navigate('/tvs', { replace: true }) }, [can, navigate])

  const copy = async () => {
    try { await navigator.clipboard.writeText(TV_URL); toast.success('Endereço copiado') } catch { toast.info(TV_URL) }
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      const fields = { ...form, default_playlist_id: form.default_playlist_id || null }
      if (mode === 'later') {
        const d = await api.post(`orgs/${orgId}/screens`, fields)
        setInstall(d.install)
        setDone(d.screen)
      } else {
        const body = replaceId ? { code, replace_screen_id: replaceId } : { code, ...fields }
        const d = await api.post(`orgs/${orgId}/screens/pair`, body)
        setInstall(null)
        setDone(d.screen)
      }
    } catch (err) {
      setErrors(err.errors || {})
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  const reset = () => { setDone(null); setInstall(null); setCode(''); setForm({ ...form, name: '', location: '' }) }

  if (done && install) {
    return (
      <div className="mx-auto max-w-lg py-6 animate-pop">
        <div className="text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-100"><Clock className="size-8 text-amber-600" /></div>
          <h1 className="mt-4 text-2xl font-bold">TV cadastrada!</h1>
          <p className="mt-2 text-slate-500"><b>{done.name}</b> está aguardando instalação. Você já pode montar a programação dela — quando o aparelho for conectado, ele começa a exibir na hora.</p>
        </div>
        <Card className="mt-6">
          <p className="mb-3 font-semibold text-slate-900">Envie o link de instalação</p>
          <InstallLinkPanel screen={done} install={install} />
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">Outra opção: abra <b>{TV_URL}</b> na TV e, na página desta TV, use <b>Conectar com código</b>.</p>
        </Card>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="secondary" icon={Plus} onClick={reset}>Cadastrar outra</Button>
          <Button iconRight={ArrowRight} onClick={() => navigate(`/tvs/${done.id}`)}>Ver a TV</Button>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md py-10 text-center animate-pop">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-100"><CheckCircle2 className="size-10 text-emerald-600" /></div>
        <h1 className="mt-5 text-2xl font-bold">TV conectada! 🎉</h1>
        <p className="mt-2 text-slate-500"><b>{done.name}</b> já está vinculada. Em poucos segundos ela começará a exibir a programação.</p>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="secondary" icon={Plus} onClick={reset}>Adicionar outra</Button>
          <Button iconRight={ArrowRight} onClick={() => navigate(`/tvs/${done.id}`)}>Ver a TV</Button>
        </div>
      </div>
    )
  }

  const toggleGroup = (id) => setForm((f) => ({ ...f, group_ids: f.group_ids.includes(id) ? f.group_ids.filter((g) => g !== id) : [...f.group_ids, id] }))

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        back="/tvs"
        title={replaceId ? (screens?.screen && !screens.screen.paired ? 'Conectar aparelho' : 'Trocar aparelho da TV') : 'Adicionar TV'}
        description={replaceId ? `O aparelho assumirá a programação de "${screens?.screen?.name || '…'}".` : 'Leva menos de um minuto.'}
      />

      {!replaceId && (
        <div className="mb-5 grid gap-2 sm:grid-cols-2">
          {[
            ['now', Monitor, 'A TV está ligada aqui', 'Conecto agora com o código que aparece na tela.'],
            ['later', CalendarPlus, 'Cadastrar agora, instalar depois', 'Já deixo a programação pronta e envio um link para quem vai instalar.'],
          ].map(([v, Icon, label, desc]) => (
            <button key={v} type="button" onClick={() => setMode(v)} className={cn('flex gap-3 rounded-2xl p-3.5 text-left ring-1 transition', mode === v ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-slate-200 hover:ring-slate-300')}>
              <Icon className={cn('mt-0.5 size-5 shrink-0', mode === v ? 'text-brand-600' : 'text-slate-400')} />
              <span>
                <span className="block text-sm font-semibold text-slate-900">{label}</span>
                <span className="block text-xs text-slate-500">{desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {mode === 'now' && <Card className="mb-5 bg-gradient-to-br from-slate-900 to-brand-900 text-white ring-0">
        <div className="flex gap-4">
          <div className="hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 sm:flex"><Monitor className="size-6" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">1. Na TV, abra o navegador e acesse:</p>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/10 p-1.5 pl-3 ring-1 ring-white/15">
              <code className="min-w-0 flex-1 truncate text-sm text-brand-100">{TV_URL}</code>
              <button type="button" onClick={copy} className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/25"><Copy className="size-3.5" /> Copiar</button>
            </div>
            <p className="mt-3 text-sm text-slate-300">
              Funciona em Smart TVs, TV Box Android, Chromecast com Google TV, Fire TV ou um computador ligado à TV. A tela mostrará um <b className="text-white">código de 6 números</b> e um QR Code — escaneie com o celular para abrir esta página já preenchida.
            </p>
          </div>
        </div>
      </Card>}

      <form onSubmit={submit} className="space-y-5">
        {mode === 'now' && (
          <Card>
            <p className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><Smartphone className="size-[18px] text-brand-600" /> 2. Digite o código que aparece na TV</p>
            <CodeInput value={code} onChange={setCode} error={errors.code} />
            {errors.code && <p className="mt-2 text-sm text-rose-600">{errors.code}</p>}
          </Card>
        )}

        {!replaceId && (
          <Card className="space-y-4">
            <p className="flex items-center gap-2 font-semibold text-slate-900"><Tv className="size-[18px] text-brand-600" /> {mode === 'now' ? '3. Identifique a TV' : 'Dados da TV'}</p>
            <Field label="Nome da TV" error={errors.name}>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Recepção – Academia Fit Centro" />
            </Field>
            <Field label="Local" optional>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ex.: Av. Paulista, 1000 – 2º andar" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Playlist padrão" optional hint="Exibida quando não houver outra programação.">
                <Select value={form.default_playlist_id} onChange={(e) => setForm({ ...form, default_playlist_id: e.target.value })}>
                  <option value="">Nenhuma</option>
                  {playlists?.playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label="Posição da tela">
                <Segmented
                  className="w-full"
                  value={form.rotation}
                  onChange={(rotation) => setForm({ ...form, rotation })}
                  options={[{ value: 0, label: 'Horizontal' }, { value: 90, label: 'Vertical' }]}
                />
              </Field>
            </div>
            {groups?.groups.length > 0 && (
              <Field label="Grupos" optional hint="Usados para segmentar a programação.">
                <div className="flex flex-wrap gap-2">
                  {groups.groups.map((g) => {
                    const on = form.group_ids.includes(g.id)
                    return (
                      <button key={g.id} type="button" onClick={() => toggleGroup(g.id)} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition', on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200')}>
                        <span className="size-2 rounded-full" style={{ background: on ? '#fff' : g.color }} />{g.name}
                      </button>
                    )
                  })}
                </div>
              </Field>
            )}
          </Card>
        )}

        <Button type="submit" size="lg" className="w-full" icon={replaceId ? RefreshCcw : mode === 'later' ? CalendarPlus : Plus} loading={saving} disabled={mode === 'now' && code.length !== 6}>
          {replaceId ? 'Conectar aparelho' : mode === 'later' ? 'Cadastrar e gerar link de instalação' : 'Cadastrar TV'}
        </Button>
        {replaceId && (
          <p className="text-center text-sm text-slate-500">
            Sem acesso à TV agora? <Link to={`/tvs/${replaceId}`} className="font-semibold text-brand-600">Gere um link de instalação</Link> na página da TV.
          </p>
        )}
      </form>
    </div>
  )
}
