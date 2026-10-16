import { useState } from 'react'
import { KeyRound, CheckCircle2, AlertTriangle, RefreshCw, Trash2, ExternalLink, Pencil, Eye, EyeOff } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useFetch } from '../lib/hooks'
import { formatDateTime, timeAgo } from '../lib/format'
import { useConfirm, useToast } from './feedback'
import { Badge, Button, Card, CardTitle, Field, Input, Modal, PageLoader } from './ui'

/** Chaves de APIs externas usadas pelas integrações (ex.: FutDigital). */
export default function CredentialsCard() {
  const { orgId } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const { data, loading, reload } = useFetch(`orgs/${orgId}/credentials`)
  const [editing, setEditing] = useState(null)
  const [secret, setSecret] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(null)

  const save = async (e) => {
    e.preventDefault()
    setBusy('save')
    try {
      const r = await api.put(`orgs/${orgId}/credentials/${editing.provider}`, { secret: secret.trim() })
      toast.success(`Chave do ${editing.name} validada: ${r.message}`)
      setEditing(null)
      setSecret('')
      reload(true)
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(null)
    }
  }

  const test = async (c) => {
    setBusy('test-' + c.provider)
    try {
      const r = await api.post(`orgs/${orgId}/credentials/${c.provider}/test`)
      r.status === 'ok' ? toast.success(`Chave funcionando: ${r.status_message}`) : toast.error(`A chave falhou: ${r.status_message}`)
      reload(true)
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (c) => {
    if (!(await confirm({ title: `Remover a chave do ${c.name}?`, message: 'As integrações que usam este serviço param de atualizar até uma nova chave ser cadastrada.', danger: true, confirmLabel: 'Remover' }))) return
    try {
      await api.del(`orgs/${orgId}/credentials/${c.provider}`)
      toast.success('Chave removida')
      reload(true)
    } catch (err) {
      toast.error(err)
    }
  }

  return (
    <Card>
      <CardTitle icon={KeyRound}>Chaves de integrações</CardTitle>
      <p className="-mt-2 mb-4 text-sm text-slate-500">
        Chaves de acesso a serviços externos. Ficam guardadas criptografadas e nunca são exibidas por inteiro.
      </p>
      {loading && !data ? <PageLoader /> : (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {data?.credentials.map((c) => (
            <li key={c.provider} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                  {c.name}
                  {!c.configured ? <Badge>Não cadastrada</Badge> : c.status === 'ok' ? <Badge color="green"><CheckCircle2 className="size-3" />Funcionando</Badge> : <Badge color="red"><AlertTriangle className="size-3" />Com erro</Badge>}
                  <a href={c.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-600" title="Site do serviço"><ExternalLink className="size-3.5" /></a>
                </p>
                <p className="mt-0.5 text-sm text-slate-500">{c.description}</p>
                {c.configured && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">{c.hint}</code>
                    {' · '}{c.status_message}
                    {c.checked_at && <> · testada {timeAgo(c.checked_at)}</>}
                    {c.updated_by_name && <> · alterada por {c.updated_by_name} em {formatDateTime(c.updated_at)}</>}
                  </p>
                )}
              </div>
              {data.can_manage && (
                <div className="flex shrink-0 gap-2">
                  {c.configured && <Button size="sm" variant="secondary" icon={RefreshCw} loading={busy === 'test-' + c.provider} onClick={() => test(c)}>Testar</Button>}
                  <Button size="sm" variant={c.configured ? 'secondary' : 'primary'} icon={c.configured ? Pencil : KeyRound} onClick={() => { setEditing(c); setSecret(''); setShow(false) }}>
                    {c.configured ? 'Trocar' : 'Cadastrar'}
                  </Button>
                  {c.configured && <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => remove(c)}>Remover</Button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.configured ? 'Trocar' : 'Cadastrar'} chave do ${editing.name}` : ''}
        description="A chave é testada no serviço antes de ser salva."
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" form="cred-form" loading={busy === 'save'} disabled={!secret.trim()}>Validar e salvar</Button></>}
      >
        <form id="cred-form" onSubmit={save} className="space-y-3">
          <Field label="Chave de acesso" hint={editing?.provider === 'futdigital' ? 'Chave de parceiro do FutDigital (começa com fdk_).' : undefined}>
            <div className="relative">
              <Input autoFocus required type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} className="pr-11 font-mono" placeholder="fdk_…" />
              <button type="button" tabIndex={-1} onClick={() => setShow((v) => !v)} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:text-slate-600">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
            </div>
          </Field>
          {editing?.configured && <p className="text-xs text-slate-500">A chave atual (<code>{editing.hint}</code>) será substituída.</p>}
        </form>
      </Modal>
    </Card>
  )
}
