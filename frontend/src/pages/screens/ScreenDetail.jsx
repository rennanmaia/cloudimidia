import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  RotateCw, ScanEye, RefreshCw, Pencil, Trash2, MonitorPlay, Volume2, VolumeX, Power, CalendarClock, Plus, UserPlus,
  Cpu, Clock, MapPin, ListVideo, Replace, Users, PlayCircle, Radio, PlugZap, Link2, KeyRound,
} from 'lucide-react'
import InstallLinkModal from '../../components/InstallLink'
import AppDevicePanel from '../../components/AppDevicePanel'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useFetch } from '../../lib/hooks'
import { describeDays, describeTime, formatDateTime, SCREEN_ROLE_LABELS, timeAgo } from '../../lib/format'
import { scheduleMatches, zonedNow } from '../../lib/schedule'
import { useConfirm, useToast } from '../../components/feedback'
import { Avatar, Badge, Button, Card, CardTitle, ErrorState, Field, IconButton, Input, Modal, OnlineBadge, PageHeader, PageLoader, Select, Textarea, Toggle, cn } from '../../components/ui'
import { ScreenPreviewModal } from '../../components/Preview'
import InviteModal from '../../components/InviteModal'

export default function ScreenDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { orgId, can, isGuest } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const { data, error, loading, reload, setData } = useFetch(`orgs/${orgId}/screens/${id}`, { interval: 10000 })
  const { data: playlists } = useFetch(`orgs/${orgId}/playlists`)
  const [busy, setBusy] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const [invite, setInvite] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={reload} />
  const { screen, schedules, access, timezone } = data
  const canOp = screen.can_operate

  const update = async (patch, msg) => {
    setBusy(Object.keys(patch)[0])
    try {
      const d = await api.put(`orgs/${orgId}/screens/${screen.id}`, patch)
      setData((x) => ({ ...x, screen: d.screen }))
      if (msg) toast.success(msg)
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  const command = async (cmd, msg) => {
    setBusy(cmd)
    try {
      await api.post(`orgs/${orgId}/screens/${screen.id}/command`, { command: cmd })
      toast.success(msg)
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Remover esta TV?', message: `"${screen.name}" será desvinculada e voltará a exibir o código de cadastro. Programações exclusivas desta TV ficarão sem destino.`, danger: true, confirmLabel: 'Remover TV' }))) return
    try {
      await api.del(`orgs/${orgId}/screens/${screen.id}`)
      toast.success('TV removida')
      navigate('/tvs')
    } catch (e) {
      toast.error(e)
    }
  }

  const removeAccess = async (a) => {
    if (!(await confirm({ title: 'Remover acesso?', message: `${a.name} não poderá mais acessar esta TV.`, danger: true, confirmLabel: 'Remover' }))) return
    try {
      await api.del(`orgs/${orgId}/screen-access/${a.id}`)
      reload()
    } catch (e) {
      toast.error(e)
    }
  }

  // Qual programação está valendo agora
  const now = zonedNow(timezone)
  const live = schedules.filter((s) => scheduleMatches(s, now))
  const liveReplace = live.filter((s) => s.mode === 'replace').sort((a, b) => b.priority - a.priority || b.id - a.id)[0]
  const liveInserts = live.filter((s) => s.mode === 'insert')
  const currentSource = liveReplace ? `Programação “${liveReplace.name}” → ${liveReplace.playlist_name}` : screen.default_playlist_name ? `Playlist padrão → ${screen.default_playlist_name}` : 'Nada programado (exibe relógio)'

  return (
    <div>
      <PageHeader
        back="/tvs"
        title={screen.name}
        description={screen.location}
        actions={
          <>
            <Button variant="secondary" icon={MonitorPlay} onClick={() => setPreview(true)}>Prévia</Button>
            {canOp && <IconButton icon={Pencil} label="Editar" variant="secondary" onClick={() => setEditOpen(true)} />}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="min-w-0 space-y-5 lg:col-span-3">
          {!screen.paired && (
            <Card className="bg-amber-50 ring-amber-200">
              <div className="flex gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><PlugZap className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-amber-900">Aguardando instalação</p>
                  <p className="mt-0.5 text-sm text-amber-800">
                    Esta TV já pode ter programação, mas ainda não tem um aparelho conectado.
                    {screen.install_link_active && <> Há um link de instalação válido até {formatDateTime(screen.install_expires_at)}.</>}
                  </p>
                  {can('editor') && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button size="sm" icon={Link2} onClick={() => setInstallOpen(true)}>{screen.install_link_active ? 'Link de instalação' : 'Gerar link de instalação'}</Button>
                      <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => navigate(`/tvs/adicionar?replace=${screen.id}`)}>Conectar com código</Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Status ao vivo */}
          <Card padded={false} className="overflow-hidden">
            <div className={cn('relative p-5 sm:p-6', screen.is_active && screen.online ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-brand-900 text-white' : 'bg-slate-100')}>
              {screen.is_active && screen.online && <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(129,140,248,0.35),transparent_50%)]" />}
              <div className="relative flex items-start justify-between gap-3">
                <OnlineBadge online={screen.online} active={screen.is_active} paired={screen.paired} />
                <span className={cn('text-xs', screen.is_active && screen.online ? 'text-slate-300' : 'text-slate-500')}>
                  {screen.paired ? `Último sinal ${timeAgo(screen.last_seen_at)}` : 'Aparelho não conectado'}
                </span>
              </div>
              <div className="relative mt-6">
                <p className={cn('text-xs font-medium uppercase tracking-wide', screen.is_active && screen.online ? 'text-brand-200' : 'text-slate-500')}>Exibindo agora</p>
                <p className="mt-1 flex items-center gap-2 text-xl font-bold">
                  {!screen.paired ? <span className="text-slate-500">Nenhum aparelho conectado</span> : screen.is_active ? (screen.online ? <><PlayCircle className="size-6 text-brand-300" />{screen.now_playing || '—'}</> : <span className="text-slate-500">TV sem conexão</span>) : <span className="text-slate-500">TV desativada (tela preta)</span>}
                </p>
                <p className={cn('mt-2 text-sm', screen.is_active && screen.online ? 'text-slate-300' : 'text-slate-500')}>{currentSource}</p>
                {liveInserts.length > 0 && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-amber-500"><Radio className="size-4" /> Campanhas intercaladas: {liveInserts.map((s) => s.name).join(', ')}</p>
                )}
              </div>
            </div>

            {canOp && (
              <div className="divide-y divide-slate-100">
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className={cn('flex size-10 items-center justify-center rounded-xl', screen.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400')}><Power className="size-5" /></span>
                    <div>
                      <p className="font-semibold text-slate-900">TV {screen.is_active ? 'ativada' : 'desativada'}</p>
                      <p className="text-xs text-slate-500">{screen.is_active ? 'Exibindo a programação' : 'A tela fica preta até reativar'}</p>
                    </div>
                  </div>
                  <Toggle checked={screen.is_active} disabled={busy === 'is_active'} onChange={(v) => update({ is_active: v }, v ? 'TV ativada' : 'TV desativada')} />
                </div>
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">{screen.muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}</span>
                    <div>
                      <p className="font-semibold text-slate-900">Som</p>
                      <p className="text-xs text-slate-500">{screen.muted ? 'Vídeos e música sem som' : 'Vídeos e música com som'}</p>
                    </div>
                  </div>
                  <Toggle checked={!screen.muted} disabled={busy === 'muted'} onChange={(v) => update({ muted: !v }, v ? 'Som ativado' : 'Som desativado')} />
                </div>
                <div className="px-5 py-4">
                  <Field label="Playlist padrão" hint="Exibida quando nenhuma programação da grade estiver valendo.">
                    <Select value={screen.default_playlist_id || ''} disabled={busy === 'default_playlist_id'} onChange={(e) => update({ default_playlist_id: e.target.value || null }, 'Playlist padrão alterada')}>
                      <option value="">Nenhuma (exibe relógio)</option>
                      {playlists?.playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="px-5 py-4">
                  <Field label="Posição da tela" hint="Use “vertical” quando a TV estiver instalada em pé.">
                    <Select value={screen.rotation} disabled={busy === 'rotation'} onChange={(e) => update({ rotation: Number(e.target.value) }, 'Posição atualizada')}>
                      <option value={0}>Horizontal</option>
                      <option value={90}>Vertical (girada para a direita)</option>
                      <option value={270}>Vertical (girada para a esquerda)</option>
                      <option value={180}>Horizontal invertida</option>
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-2 px-5 py-4">
                  {[
                    ['identify', ScanEye, 'Identificar', 'O nome aparecerá na tela por 12 segundos'],
                    ['refresh', RefreshCw, 'Atualizar', 'Atualização de conteúdo enviada'],
                    ['reload', RotateCw, 'Reiniciar', 'A TV vai recarregar o player'],
                  ].map(([cmd, Icon, label, msg]) => (
                    <button key={cmd} type="button" disabled={busy === cmd || !screen.paired} onClick={() => command(cmd, msg)} className="flex flex-col items-center gap-1.5 rounded-2xl bg-slate-50 px-2 py-3 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-brand-50 hover:text-brand-700 hover:ring-brand-200 disabled:opacity-50">
                      <Icon className={cn('size-5', busy === cmd && 'animate-spin')} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Programação */}
          <Card>
            <CardTitle icon={CalendarClock} action={canOp && <Button size="sm" variant="subtle" icon={Plus} onClick={() => navigate(`/grade?nova=1&tv=${screen.id}`)}>Programar</Button>}>
              Programação desta TV
            </CardTitle>
            {schedules.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Nenhuma programação. A TV exibe a playlist padrão o tempo todo.</p>
            ) : (
              <ul className="space-y-2">
                {schedules.map((s) => {
                  const isLive = live.some((l) => l.id === s.id) && (s.mode === 'insert' || s.id === liveReplace?.id)
                  return (
                    <li key={s.id} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1', isLive ? 'bg-emerald-50/60 ring-emerald-200' : 'ring-slate-200', !s.is_active && 'opacity-60')}>
                      <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-800">
                          {s.name}
                          {isLive && <Badge color="green" dot>No ar</Badge>}
                          {s.mode === 'insert' && <Badge color="amber">Campanha</Badge>}
                          {!s.is_active && <Badge>Pausada</Badge>}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          <ListVideo className="mr-1 inline size-3" />{s.playlist_name} · {describeDays(s.days)} · {describeTime(s)}
                          {s.via_group && ` · via grupo ${s.via_group}`}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <Button variant="ghost" size="sm" className="mt-3" to={`/grade?tv=${screen.id}`}>Ver na grade semanal</Button>
          </Card>
        </div>

        <div className="min-w-0 space-y-5 lg:col-span-2">
          {screen.is_app && <AppDevicePanel screen={screen} onReload={reload} />}
          <Card>
            <CardTitle icon={Cpu}>Informações</CardTitle>
            <dl className="space-y-3 text-sm">
              {screen.location && <Info icon={MapPin} label="Local" value={screen.location} />}
              <Info icon={Clock} label="Último sinal" value={screen.last_seen_at ? formatDateTime(screen.last_seen_at) : 'Nunca'} />
              <Info icon={MonitorPlay} label="Resolução" value={screen.device.resolution || '—'} />
              <Info icon={Cpu} label="Aparelho" value={screen.device.platform || '—'} />
              {screen.last_ip && <Info icon={Radio} label="IP" value={screen.last_ip} />}
              <Info icon={Clock} label="Cadastrada em" value={formatDateTime(screen.created_at)} />
            </dl>
            {screen.groups.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-4">
                {screen.groups.map((g) => (
                  <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"><span className="size-2 rounded-full" style={{ background: g.color }} />{g.name}</span>
                ))}
              </div>
            )}
            {screen.notes && <p className="mt-4 whitespace-pre-line rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{screen.notes}</p>}
          </Card>

          {can('admin') && (
            <Card>
              <CardTitle icon={Users} action={<Button size="sm" variant="subtle" icon={UserPlus} onClick={() => setInvite(true)}>Convidar</Button>}>
                Acesso exclusivo
              </CardTitle>
              <p className="-mt-2 mb-3 text-xs text-slate-500">Pessoas que gerenciam apenas esta TV (ex.: o dono do estabelecimento).</p>
              {access.length === 0 ? <p className="text-sm text-slate-500">Ninguém além da equipe.</p> : (
                <ul className="space-y-2">
                  {access.map((a) => (
                    <li key={a.id} className="flex items-center gap-3">
                      <Avatar name={a.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="truncate text-xs text-slate-500">{SCREEN_ROLE_LABELS[a.role]}</p>
                      </div>
                      <IconButton icon={Trash2} label="Remover acesso" size="sm" variant="danger-ghost" onClick={() => removeAccess(a)} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {can('admin') && (
            <Card className="ring-rose-100">
              <CardTitle>Zona de risco</CardTitle>
              <div className="space-y-2">
                {screen.paired && <Button variant="secondary" icon={Replace} className="w-full justify-start" onClick={() => navigate(`/tvs/adicionar?replace=${screen.id}`)}>Trocar aparelho (com código)</Button>}
                {screen.paired && <Button variant="secondary" icon={Link2} className="w-full justify-start" onClick={() => setInstallOpen(true)}>Link para instalar aparelho novo</Button>}
                <Button variant="danger-ghost" icon={Trash2} className="w-full justify-start" onClick={remove}>Remover TV</Button>
              </div>
            </Card>
          )}
          {isGuest && !canOp && <p className="text-center text-xs text-slate-500">Você tem acesso somente de visualização a esta TV.</p>}
        </div>
      </div>

      <EditScreenModal open={editOpen} onClose={() => setEditOpen(false)} screen={screen} onSaved={(s) => setData((x) => ({ ...x, screen: s }))} />
      <ScreenPreviewModal open={preview} onClose={() => setPreview(false)} screen={screen} />
      <InviteModal open={invite} onClose={() => { setInvite(false); reload() }} presetScreenIds={[screen.id]} />
      <InstallLinkModal open={installOpen} onClose={() => setInstallOpen(false)} screen={screen} onChanged={() => reload(true)} />
    </div>
  )
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-4 shrink-0 text-slate-400" />
      <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-slate-800">{value}</dd>
    </div>
  )
}

function EditScreenModal({ open, onClose, screen, onSaved }) {
  const { orgId, can } = useAuth()
  const toast = useToast()
  const { data: groups } = useFetch(open && can('editor') ? `orgs/${orgId}/groups` : null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  if (open && !form) setForm({ name: screen.name, location: screen.location || '', notes: screen.notes || '', group_ids: screen.groups.map((g) => g.id) })
  if (!open && form) setForm(null)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = { name: form.name, location: form.location, notes: form.notes }
      if (can('editor')) body.group_ids = form.group_ids
      const d = await api.put(`orgs/${orgId}/screens/${screen.id}`, body)
      onSaved(d.screen)
      toast.success('TV atualizada')
      onClose()
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Editar TV" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="edit-screen" loading={saving}>Salvar</Button></>}>
      {form && (
        <form id="edit-screen" onSubmit={save} className="space-y-4">
          <Field label="Nome"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Local" optional><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          {can('editor') && groups?.groups.length > 0 && (
            <Field label="Grupos">
              <div className="flex flex-wrap gap-2">
                {groups.groups.map((g) => {
                  const on = form.group_ids.includes(g.id)
                  return (
                    <button key={g.id} type="button" onClick={() => setForm({ ...form, group_ids: on ? form.group_ids.filter((x) => x !== g.id) : [...form.group_ids, g.id] })} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1', on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200')}>
                      <span className="size-2 rounded-full" style={{ background: on ? '#fff' : g.color }} />{g.name}
                    </button>
                  )
                })}
              </div>
            </Field>
          )}
          <Field label="Observações" optional hint="Ex.: contato do local, horário de funcionamento, modelo da TV.">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </form>
      )}
    </Modal>
  )
}
