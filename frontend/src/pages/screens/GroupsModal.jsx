import { useState } from 'react'
import { Plus, Pencil, Trash2, Layers, Check } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useFetch } from '../../lib/hooks'
import { plural } from '../../lib/format'
import { useConfirm, useToast } from '../../components/feedback'
import { Button, ColorPicker, EmptyState, Field, IconButton, Input, Modal, PageLoader, cn } from '../../components/ui'

export default function GroupsModal({ open, onClose, screens, onChanged }) {
  const { orgId } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const { data, loading, reload } = useFetch(open ? `orgs/${orgId}/groups` : null)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  const startNew = () => setEditing({ name: '', color: '#6366f1', screen_ids: [] })
  const startEdit = (g) => setEditing({ ...g, screen_ids: screens.filter((s) => s.groups.some((x) => x.id === g.id)).map((s) => s.id) })

  const save = async () => {
    setSaving(true)
    try {
      const body = { name: editing.name, color: editing.color, screen_ids: editing.screen_ids }
      if (editing.id) await api.put(`orgs/${orgId}/groups/${editing.id}`, body)
      else await api.post(`orgs/${orgId}/groups`, body)
      toast.success('Grupo salvo')
      setEditing(null)
      reload()
      onChanged?.()
    } catch (e) {
      toast.error(e)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (g) => {
    if (!(await confirm({ title: 'Excluir grupo?', message: `O grupo "${g.name}" será removido. As TVs não são apagadas, mas deixam de receber programações destinadas a este grupo.`, danger: true, confirmLabel: 'Excluir' }))) return
    try {
      await api.del(`orgs/${orgId}/groups/${g.id}`)
      toast.success('Grupo excluído')
      reload()
      onChanged?.()
    } catch (e) {
      toast.error(e)
    }
  }

  const toggleScreen = (id) => setEditing((e) => ({ ...e, screen_ids: e.screen_ids.includes(id) ? e.screen_ids.filter((x) => x !== id) : [...e.screen_ids, id] }))

  return (
    <Modal
      open={open}
      onClose={() => { setEditing(null); onClose() }}
      title={editing ? (editing.id ? 'Editar grupo' : 'Novo grupo') : 'Grupos de TVs'}
      description={editing ? null : 'Agrupe TVs por local, cliente ou público para programar várias de uma vez (segmentação).'}
      footer={editing ? (
        <>
          <Button variant="secondary" onClick={() => setEditing(null)}>Voltar</Button>
          <Button onClick={save} loading={saving} disabled={!editing.name.trim()}>Salvar grupo</Button>
        </>
      ) : null}
    >
      {editing ? (
        <div className="space-y-5">
          <Field label="Nome do grupo">
            <Input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex.: Academias, Zona Sul, Recepções" />
          </Field>
          <Field label="Cor"><ColorPicker value={editing.color} onChange={(color) => setEditing({ ...editing, color })} /></Field>
          <Field label={`TVs do grupo (${editing.screen_ids.length})`}>
            {screens.length === 0 ? <p className="text-sm text-slate-500">Nenhuma TV cadastrada ainda.</p> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {screens.map((s) => {
                  const on = editing.screen_ids.includes(s.id)
                  return (
                    <button key={s.id} type="button" onClick={() => toggleScreen(s.id)} className={cn('flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm ring-1 transition', on ? 'bg-brand-50 ring-brand-300' : 'ring-slate-200 hover:bg-slate-50')}>
                      <span className={cn('flex size-5 items-center justify-center rounded-md ring-1', on ? 'bg-brand-600 ring-brand-600 text-white' : 'ring-slate-300')}>{on && <Check className="size-3.5" />}</span>
                      <span className="truncate font-medium">{s.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </Field>
        </div>
      ) : loading ? <PageLoader /> : (
        <div className="space-y-3">
          {data?.groups.length === 0 ? (
            <EmptyState icon={Layers} title="Nenhum grupo ainda" description="Ex.: crie o grupo “Academias” para exibir uma campanha em todas as TVs de academias." />
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
              {data?.groups.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="size-3.5 rounded-full" style={{ background: g.color }} />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium text-slate-800">{g.name}</span>
                    <span className="text-xs text-slate-500">{plural(g.screens_count, 'TV', 'TVs')}</span>
                  </span>
                  <IconButton icon={Pencil} label="Editar" size="sm" onClick={() => startEdit(g)} />
                  <IconButton icon={Trash2} label="Excluir" size="sm" variant="danger-ghost" onClick={() => remove(g)} />
                </li>
              ))}
            </ul>
          )}
          <Button variant="subtle" icon={Plus} className="w-full" onClick={startNew}>Novo grupo</Button>
        </div>
      )}
    </Modal>
  )
}
