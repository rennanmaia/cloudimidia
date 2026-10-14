import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ArrowRight } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/feedback'
import { Button, Card, Field, Input, PageHeader } from '../components/ui'

export default function NewOrgPage() {
  const { refresh, switchOrg, organizations } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const d = await api.post('orgs', { name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      await refresh()
      switchOrg(d.organization.id)
      toast.success('Organização criada!')
      navigate('/')
    } catch (err) {
      toast.error(err)
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader back={organizations.length ? true : undefined} title="Nova organização" description="Cada organização tem suas próprias TVs, mídias, equipe e programação — ideal para gerenciar várias empresas de mídia indoor ou clientes separados." />
      <Card>
        <form onSubmit={submit} className="space-y-5">
          <div className="flex justify-center"><span className="flex size-16 items-center justify-center rounded-2xl bg-brand-50"><Building2 className="size-8 text-brand-600" /></span></div>
          <Field label="Nome da organização">
            <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Mídia Indoor Zona Sul" />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={saving} iconRight={ArrowRight}>Criar organização</Button>
        </form>
      </Card>
    </div>
  )
}
