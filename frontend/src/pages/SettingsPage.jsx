import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Upload, Trash2, Save, AlertTriangle, Activity } from 'lucide-react'
import { api, request } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useFetch } from '../lib/hooks'
import { formatBytes, timeAgo } from '../lib/format'
import { useToast } from '../components/feedback'
import { Button, Card, CardTitle, Field, Input, Modal, PageHeader, ProgressBar, Select } from '../components/ui'

const TIMEZONES = [
  'America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Belem', 'America/Fortaleza', 'America/Recife',
  'America/Bahia', 'America/Porto_Velho', 'America/Boa_Vista', 'America/Rio_Branco', 'America/Noronha', 'America/Campo_Grande',
  'America/Araguaina', 'America/Maceio', 'America/Santarem', 'America/Argentina/Buenos_Aires', 'America/Santiago',
  'America/Bogota', 'America/Lima', 'America/Mexico_City', 'America/New_York', 'Europe/Lisbon', 'UTC',
]

export default function SettingsPage() {
  const { orgId, org, reloadOrg, refresh, can } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [form, setForm] = useState({ name: org.name, timezone: org.timezone })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [del, setDel] = useState({ open: false, name: '' })
  const { data: act } = useFetch(`orgs/${orgId}/activity`)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put(`orgs/${orgId}`, form)
      await Promise.all([reloadOrg(), refresh()])
      toast.success('Configurações salvas')
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  const uploadLogo = async (file) => {
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      await api.post(`orgs/${orgId}/logo`, fd)
      await Promise.all([reloadOrg(), refresh()])
      toast.success('Logo atualizado')
    } catch (e) {
      toast.error(e)
    } finally {
      setUploading(false)
    }
  }
  const removeLogo = async () => {
    try {
      await api.del(`orgs/${orgId}/logo`)
      await Promise.all([reloadOrg(), refresh()])
    } catch (e) {
      toast.error(e)
    }
  }
  const confirmDelete = async () => {
    try {
      await request(`orgs/${orgId}`, { method: 'DELETE', body: { confirm_name: del.name } })
      toast.success('Organização excluída')
      await refresh()
      navigate('/')
    } catch (e) {
      toast.error(e)
    }
  }

  const usage = org.usage
  const maxBytes = org.max_storage_mb ? org.max_storage_mb * 1048576 : null

  return (
    <div className="max-w-4xl">
      <PageHeader title="Configurações" description="Dados da organização, marca e plano." />
      <div className="space-y-5">
        <Card>
          <CardTitle icon={Building2}>Organização</CardTitle>
          <form onSubmit={save} className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
                {org.logo_url ? <img src={org.logo_url} alt="" className="h-full w-full object-contain" /> : <Building2 className="size-8 text-slate-300" />}
              </div>
              <div className="space-y-2">
                <p className="text-sm text-slate-500">O logo aparece nas TVs (rodapé e tela de espera).</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" icon={Upload} loading={uploading} onClick={() => fileRef.current?.click()}>Enviar logo</Button>
                  {org.logo_url && <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={removeLogo}>Remover</Button>}
                </div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadLogo(e.target.files[0])} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Fuso horário" hint="Usado na grade de programação de todas as TVs.">
                <Select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                  {[...new Set([form.timezone, ...TIMEZONES])].map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
                </Select>
              </Field>
            </div>
            <div className="flex justify-end"><Button type="submit" icon={Save} loading={saving}>Salvar</Button></div>
          </form>
        </Card>

        <Card>
          <CardTitle>Plano e uso</CardTitle>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 flex justify-between text-sm"><span className="text-slate-600">TVs</span><span className="font-medium">{usage.screens}{org.max_screens != null ? ` de ${org.max_screens}` : ' (ilimitado)'}</span></div>
              <ProgressBar value={org.max_screens ? usage.screens / org.max_screens : 0.03} />
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-sm"><span className="text-slate-600">Armazenamento</span><span className="font-medium">{formatBytes(usage.storage_bytes)}{maxBytes ? ` de ${formatBytes(maxBytes)}` : ' (ilimitado)'}</span></div>
              <ProgressBar value={maxBytes ? usage.storage_bytes / maxBytes : 0.03} color="bg-purple-500" />
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">Precisa de mais TVs ou espaço? Fale com o suporte da plataforma.</p>
        </Card>

        <Card>
          <CardTitle icon={Activity}>Histórico de atividades</CardTitle>
          <ul className="max-h-80 space-y-2.5 overflow-y-auto scrollbar-thin">
            {act?.activity.map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-300" />
                <span className="min-w-0 flex-1 text-slate-700">{a.description}<span className="block text-xs text-slate-400">{a.user_name || 'Sistema'} · {timeAgo(a.created_at)}</span></span>
              </li>
            ))}
            {act?.activity.length === 0 && <li className="text-sm text-slate-500">Nada por aqui ainda.</li>}
          </ul>
        </Card>

        {can('owner') && (
          <Card className="ring-rose-200">
            <CardTitle icon={AlertTriangle}>Zona de risco</CardTitle>
            <p className="mb-4 text-sm text-slate-600">Excluir a organização apaga todas as TVs, mídias, playlists, programações e relatórios. Não há como desfazer.</p>
            <Button variant="danger" icon={Trash2} onClick={() => setDel({ open: true, name: '' })}>Excluir organização</Button>
          </Card>
        )}
      </div>

      <Modal
        open={del.open}
        onClose={() => setDel({ open: false, name: '' })}
        title="Excluir organização"
        footer={<><Button variant="secondary" onClick={() => setDel({ open: false, name: '' })}>Cancelar</Button><Button variant="danger" disabled={del.name !== org.name} onClick={confirmDelete}>Excluir definitivamente</Button></>}
      >
        <p className="mb-3 text-sm text-slate-600">Para confirmar, digite <b>{org.name}</b>:</p>
        <Input value={del.name} onChange={(e) => setDel({ ...del, name: e.target.value })} />
      </Modal>
    </div>
  )
}
