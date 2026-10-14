import { useEffect, useState } from 'react'
import { Copy, Check, MessageCircle, Mail, Building2, Tv } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useFetch } from '../lib/hooks'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../lib/format'
import { useToast } from './feedback'
import { Button, Field, Input, Modal, Segmented, cn } from './ui'

export function ShareLink({ link, email, orgName, message, subject = 'Convite CloudMídia' }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.info(link)
    }
  }
  const msg = encodeURIComponent(message || `Olá! Você foi convidado(a) para gerenciar TVs${orgName ? ` de ${orgName}` : ''} no CloudMídia. Acesse: ${link}`)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-1.5 pl-3 ring-1 ring-slate-200">
        <code className="min-w-0 flex-1 truncate text-xs text-slate-600">{link}</code>
        <Button size="sm" variant={copied ? 'success' : 'secondary'} icon={copied ? Check : Copy} onClick={copy}>{copied ? 'Copiado' : 'Copiar'}</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a href={`https://wa.me/?text=${msg}`} target="_blank" rel="noreferrer" className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-sm font-semibold text-white hover:brightness-95">
          <MessageCircle className="size-4" /> WhatsApp
        </a>
        <a href={`mailto:${email || ''}?subject=${encodeURIComponent(subject)}&body=${msg}`} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
          <Mail className="size-4" /> E-mail
        </a>
      </div>
    </div>
  )
}

/** Convite para a organização inteira ou para TVs específicas. */
export default function InviteModal({ open, onClose, onInvited, presetScreenIds }) {
  const { orgId, org, can } = useAuth()
  const toast = useToast()
  const { data: screensData } = useFetch(open ? `orgs/${orgId}/screens` : null)
  const [form, setForm] = useState({ email: '', scope: 'org', role: 'editor', screen_ids: [] })
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (open) {
      setResult(null)
      setForm({ email: '', scope: presetScreenIds?.length ? 'screens' : 'org', role: 'editor', screen_ids: presetScreenIds || [] })
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const d = await api.post(`orgs/${orgId}/invitations`, form)
      setResult(d.invitation)
      onInvited?.()
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  const roles = form.scope === 'org' ? ['viewer', 'editor', 'admin', ...(can('owner') ? ['owner'] : [])] : ['editor', 'viewer']
  const toggleScreen = (id) => setForm((f) => ({ ...f, screen_ids: f.screen_ids.includes(id) ? f.screen_ids.filter((x) => x !== id) : [...f.screen_ids, id] }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={result ? 'Convite criado!' : 'Convidar pessoa'}
      description={result ? `Envie o link para ${result.email}. Ele vale por 7 dias.` : 'A pessoa recebe um link para criar a conta (ou entrar) e aceitar o acesso.'}
      footer={result ? <Button onClick={onClose}>Concluir</Button> : (
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="invite-form" loading={saving}>Gerar convite</Button>
        </>
      )}
    >
      {result ? <ShareLink link={result.link} email={result.email} orgName={org?.name} /> : (
        <form id="invite-form" onSubmit={submit} className="space-y-5">
          <Field label="E-mail da pessoa">
            <Input type="email" required autoFocus value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="pessoa@empresa.com" />
          </Field>
          <Field label="Acesso a">
            <Segmented
              className="w-full"
              value={form.scope}
              onChange={(scope) => setForm({ ...form, scope, role: 'editor' })}
              options={[{ value: 'org', label: 'Toda a organização', icon: Building2 }, { value: 'screens', label: 'TVs específicas', icon: Tv }]}
            />
          </Field>
          {form.scope === 'screens' && (
            <Field label={`Quais TVs? (${form.screen_ids.length})`}>
              <div className="grid max-h-56 gap-2 overflow-y-auto scrollbar-thin sm:grid-cols-2">
                {screensData?.screens.map((s) => {
                  const on = form.screen_ids.includes(s.id)
                  return (
                    <button key={s.id} type="button" onClick={() => toggleScreen(s.id)} className={cn('flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium ring-1 transition', on ? 'bg-brand-50 text-brand-800 ring-brand-300' : 'text-slate-700 ring-slate-200 hover:bg-slate-50')}>
                      <Tv className={cn('size-4', on ? 'text-brand-600' : 'text-slate-400')} />
                      <span className="truncate">{s.name}</span>
                    </button>
                  )
                })}
              </div>
            </Field>
          )}
          <Field label="Permissão">
            <div className="space-y-2">
              {roles.map((r) => (
                <label key={r} className={cn('flex cursor-pointer items-start gap-3 rounded-xl px-3.5 py-3 ring-1 transition', form.role === r ? 'bg-brand-50 ring-brand-300' : 'ring-slate-200 hover:bg-slate-50')}>
                  <input type="radio" name="role" className="mt-1 accent-brand-600" checked={form.role === r} onChange={() => setForm({ ...form, role: r })} />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">
                      {form.scope === 'org' ? ROLE_LABELS[r] : r === 'editor' ? 'Pode programar' : 'Só visualiza'}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {form.scope === 'org' ? ROLE_DESCRIPTIONS[r] : r === 'editor' ? 'Liga/desliga, troca a playlist, envia mídias e monta a grade destas TVs' : 'Acompanha o status e a programação destas TVs'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
        </form>
      )}
    </Modal>
  )
}
