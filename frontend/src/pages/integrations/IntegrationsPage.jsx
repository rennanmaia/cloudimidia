import { useState } from 'react'
import { Puzzle, Plus, Pencil, Trash2, MonitorPlay, Layers } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useFetch } from '../../lib/hooks'
import { INTEGRATION_TYPES } from '../../lib/integrationTypes'
import { plural } from '../../lib/format'
import { useConfirm, useToast } from '../../components/feedback'
import { Button, Card, EmptyState, ErrorState, IconButton, Modal, PageHeader, PageLoader, cn } from '../../components/ui'
import { PreviewFrame } from '../../components/Preview'
import IntegrationForm from './IntegrationForm'

function describe(i, leagues) {
  const c = i.config || {}
  switch (i.type) {
    case 'rss': return c.url?.replace(/^https?:\/\//, '')
    case 'weather': return c.city
    case 'sports': return c.title || leagues?.[c.league]
    case 'currency': return (c.pairs || []).map((p) => p.split('-')[0]).join(', ')
    case 'clock': return c.style === 'analog' ? 'Ponteiros' : 'Digital'
    case 'text': return c.title || c.message
    case 'webpage': case 'youtube': return c.url
    case 'music': return c.source === 'library' ? plural((c.media_ids || []).length, 'música', 'músicas') : 'Rádio online'
    default: return ''
  }
}

export default function IntegrationsPage() {
  const { orgId, canCreate } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const { data, error, loading, reload } = useFetch(`orgs/${orgId}/integrations`)
  const [form, setForm] = useState({ open: false, integration: null })
  const [preview, setPreview] = useState(null)

  const remove = async (i) => {
    const msg = i.usage_count ? `Ela está em uso em ${plural(i.usage_count, 'playlist', 'playlists')} e será removida delas.` : 'Esta ação não pode ser desfeita.'
    if (!(await confirm({ title: `Excluir "${i.name}"?`, message: msg, danger: true, confirmLabel: 'Excluir' }))) return
    try {
      await api.del(`orgs/${orgId}/integrations/${i.id}`)
      toast.success('Integração excluída')
      reload(true)
    } catch (e) {
      toast.error(e)
    }
  }

  const list = data?.integrations || []

  return (
    <div>
      <PageHeader
        title="Integrações"
        description="Conteúdo que se atualiza sozinho: notícias, clima, jogos, cotações, avisos e música."
        actions={canCreate && <Button icon={Plus} onClick={() => setForm({ open: true, integration: null })}>Nova integração</Button>}
      />

      {loading && !data ? <PageLoader /> : error ? <ErrorState error={error} onRetry={reload} /> : list.length === 0 ? (
        <>
          <EmptyState icon={Puzzle} title="Nenhuma integração ainda" description="Escolha um tipo abaixo para começar. Depois, adicione nas suas playlists." />
          {canCreate && (
            <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(INTEGRATION_TYPES).map(([type, T]) => (
                <button key={type} type="button" onClick={() => setForm({ open: true, integration: null, type })} className="flex items-start gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200 transition hover:shadow-md">
                  <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', T.color)}><T.icon className="size-5" /></span>
                  <span><span className="block font-semibold text-slate-800">{T.label}</span><span className="block text-sm text-slate-500">{T.description}</span></span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((i) => {
            const T = INTEGRATION_TYPES[i.type] || INTEGRATION_TYPES.text
            return (
              <Card key={i.id} className="flex flex-col">
                <div className="flex items-start gap-3">
                  <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', T.color)}><T.icon className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-slate-900">{i.name}</h3>
                    <p className="text-xs font-medium text-slate-500">{T.label}</p>
                    <p className="mt-1 truncate text-sm text-slate-500">{describe(i, data.sports_leagues)}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="flex items-center gap-1 text-xs text-slate-500"><Layers className="size-3.5" />{i.usage_count ? `Em ${plural(i.usage_count, 'playlist', 'playlists')}` : 'Não usada'}</span>
                  <div className="flex gap-0.5">
                    {i.type !== 'music' && <IconButton icon={MonitorPlay} label="Prévia" size="sm" onClick={() => setPreview(i)} />}
                    {i.can_edit && <IconButton icon={Pencil} label="Editar" size="sm" onClick={() => setForm({ open: true, integration: i })} />}
                    {i.can_edit && <IconButton icon={Trash2} label="Excluir" size="sm" variant="danger-ghost" onClick={() => remove(i)} />}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <IntegrationFormLauncher form={form} setForm={setForm} leagues={data?.sports_leagues} onSaved={() => reload(true)} />

      <Modal open={!!preview} onClose={() => setPreview(null)} size="xl" title={`Prévia: ${preview?.name || ''}`}>
        {preview && (
          <PreviewFrame manifest={{
            version: `p${preview.id}`,
            screen: { is_active: true, muted: true },
            organization: { timezone: 'America/Sao_Paulo' },
            default_playlist_id: 1,
            schedules: [],
            playlists: { 1: { id: 1, transition: 'none', items: [{ id: 1, type: 'integration', kind: preview.type, integration_id: preview.id, duration: 3600, name: preview.name }] } },
            integrations: { [preview.id]: { ...preview, has_data: ['rss', 'weather', 'sports', 'currency'].includes(preview.type) } },
          }} />
        )}
      </Modal>
    </div>
  )
}

/** Abre o formulário já no tipo escolhido quando vindo dos atalhos */
function IntegrationFormLauncher({ form, setForm, leagues, onSaved }) {
  const integration = form.integration || (form.type ? { id: null, type: form.type, name: INTEGRATION_TYPES[form.type].label, config: {}, _new: true } : null)
  return (
    <IntegrationFormWrapper
      open={form.open}
      onClose={() => setForm({ open: false, integration: null })}
      integration={integration}
      leagues={leagues}
      onSaved={onSaved}
    />
  )
}

function IntegrationFormWrapper({ integration, ...props }) {
  // Para atalhos de "novo" com tipo pré-selecionado, o formulário trata como criação
  if (integration?._new) return <IntegrationForm {...props} integration={null} presetType={integration.type} />
  return <IntegrationForm {...props} integration={integration} />
}
