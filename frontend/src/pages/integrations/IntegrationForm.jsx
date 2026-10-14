import { useEffect, useState } from 'react'
import { Search, MapPin, CheckCircle2, Music, Radio, Library, Plus, X, FlaskConical } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useDebounced } from '../../lib/hooks'
import { INTEGRATION_TYPES, RSS_PRESET_GROUPS, CURRENCY_OPTIONS } from '../../lib/integrationTypes'
import { useToast } from '../../components/feedback'
import { Button, ColorPicker, Field, Input, Modal, Segmented, Select, Textarea, Toggle, cn } from '../../components/ui'
import MediaPicker from '../../components/MediaPicker'
import { PreviewFrame } from '../../components/Preview'

const DEFAULT_CONFIG = {
  rss: { url: '', urls: [''], max_items: 10, item_duration: 10, show_images: true, source_name: '' },
  weather: { city: '', latitude: null, longitude: null },
  sports: { league: 'soccer/bra.1', title: '' },
  currency: { pairs: ['USD-BRL', 'EUR-BRL', 'BTC-BRL'] },
  clock: { style: 'digital', show_date: true, background: '#0f172a', color: '#ffffff', label: '' },
  text: { title: '', message: '', background: '#4f46e5', color: '#ffffff', align: 'center', size: 'lg' },
  webpage: { url: '', reload_minutes: 0 },
  youtube: { url: '', muted: true },
  music: { source: 'stream', stream_url: '', media_ids: [], volume: 60, shuffle: true },
}

function TypeChooser({ onChoose }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {Object.entries(INTEGRATION_TYPES).map(([type, T]) => (
        <button key={type} type="button" onClick={() => onChoose(type)} className="flex items-start gap-3 rounded-xl p-3 text-left ring-1 ring-slate-200 transition hover:bg-brand-50/50 hover:ring-brand-200">
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', T.color)}><T.icon className="size-5" /></span>
          <span>
            <span className="block text-sm font-semibold text-slate-800">{T.label}</span>
            <span className="block text-xs text-slate-500">{T.description}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function CitySearch({ value, onSelect }) {
  const { orgId } = useAuth()
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 400)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (dq.length < 2) { setResults([]); return }
    setLoading(true)
    api.get(`orgs/${orgId}/integrations/geocode?q=${encodeURIComponent(dq)}`).then((d) => setResults(d.results)).catch(() => setResults([])).finally(() => setLoading(false))
  }, [dq, orgId])
  return (
    <div className="space-y-2">
      {value.city && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
          <CheckCircle2 className="size-4" />{value.city}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={value.city ? 'Trocar cidade…' : 'Digite o nome da cidade'} className="pl-9" />
      </div>
      {loading && <p className="text-xs text-slate-500">Buscando…</p>}
      {results.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => { onSelect({ city: r.name, latitude: r.latitude, longitude: r.longitude, label: r.label }); setQ(''); setResults([]) }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50">
                <MapPin className="size-4 text-slate-400" />{r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ConfigFields({ type, config, set, leagues }) {
  const [picker, setPicker] = useState(false)
  const [tracks, setTracks] = useState([])
  // Notícias: uma ou mais fontes (config.urls); configurações antigas têm só config.url
  const urls = config.urls?.length ? config.urls : [config.url || '']
  const setUrls = (list) => set({ urls: list, url: list[0] || '' })
  switch (type) {
    case 'rss':
      return (
        <div className="space-y-4">
          <Field label="Fontes prontas" hint="As opções “g1 + ge” juntam as duas fontes numa só faixa, misturando as notícias por horário.">
            <div className="space-y-3">
              {RSS_PRESET_GROUPS.map((g) => (
                <div key={g.group}>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">{g.group}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.items.map((p) => {
                      const on = urls.join('|') === p.urls.join('|')
                      return (
                        <button key={p.name} type="button" onClick={() => set({ urls: p.urls, url: p.urls[0], source_name: p.source }, p.name)} className={cn('rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition', on ? 'bg-rose-600 text-white ring-rose-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300')}>{p.name}</button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Field>
          <Field label={urls.length > 1 ? `Endereços dos feeds RSS (${urls.length})` : 'Endereço do feed RSS'} hint="Quase todo portal de notícias tem um link RSS. Adicione mais de um para juntar fontes.">
            <div className="space-y-2">
              {urls.map((u, i) => (
                <div key={i} className="flex gap-2">
                  <Input type="url" required value={u} onChange={(e) => setUrls(urls.map((x, k) => (k === i ? e.target.value : x)))} placeholder="https://…/rss" />
                  {urls.length > 1 && <button type="button" onClick={() => setUrls(urls.filter((_, k) => k !== i))} className="rounded-lg px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remover fonte"><X className="size-4" /></button>}
                </div>
              ))}
              {urls.length < 5 && <Button size="sm" variant="ghost" icon={Plus} onClick={() => setUrls([...urls, ''])}>Adicionar outra fonte</Button>}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nº de notícias"><Input type="number" min={1} max={30} value={config.max_items} onChange={(e) => set({ max_items: Number(e.target.value) })} /></Field>
            <Field label="Segundos por notícia"><Input type="number" min={4} max={60} value={config.item_duration} onChange={(e) => set({ item_duration: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Nome da fonte exibido" optional><Input value={config.source_name} onChange={(e) => set({ source_name: e.target.value })} placeholder="Ex.: g1" /></Field>
          <Toggle label="Mostrar fotos das notícias" checked={config.show_images} onChange={(v) => set({ show_images: v })} />
        </div>
      )
    case 'weather':
      return <Field label="Cidade"><CitySearch value={config} onSelect={(c) => set({ city: c.city, latitude: c.latitude, longitude: c.longitude }, `Clima – ${c.city}`)} /></Field>
    case 'sports':
      return (
        <div className="space-y-4">
          <Field label="Campeonato">
            <Select value={config.league} onChange={(e) => set({ league: e.target.value, title: '' }, leagues[e.target.value])}>
              {Object.entries(leagues).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Título na tela" optional><Input value={config.title} onChange={(e) => set({ title: e.target.value })} placeholder={leagues[config.league]} /></Field>
        </div>
      )
    case 'currency':
      return (
        <Field label="Moedas" hint="Cotação em reais, atualizada a cada poucos minutos.">
          <div className="grid grid-cols-2 gap-2">
            {CURRENCY_OPTIONS.map(([code, label]) => {
              const on = config.pairs.includes(code)
              return (
                <button key={code} type="button" onClick={() => set({ pairs: on ? config.pairs.filter((p) => p !== code) : [...config.pairs, code] })} className={cn('rounded-xl px-3 py-2 text-left text-sm font-medium ring-1', on ? 'bg-amber-50 text-amber-800 ring-amber-300' : 'text-slate-600 ring-slate-200')}>
                  {label} <span className="text-xs opacity-60">{code.split('-')[0]}</span>
                </button>
              )
            })}
          </div>
        </Field>
      )
    case 'clock':
      return (
        <div className="space-y-4">
          <Field label="Estilo"><Segmented className="w-full" value={config.style} onChange={(style) => set({ style })} options={[{ value: 'digital', label: 'Digital' }, { value: 'analog', label: 'Ponteiros' }]} /></Field>
          <Field label="Legenda" optional><Input value={config.label} onChange={(e) => set({ label: e.target.value })} placeholder="Ex.: Horário de Brasília" /></Field>
          <Toggle label="Mostrar data" checked={config.show_date} onChange={(v) => set({ show_date: v })} />
          <Field label="Cor de fundo"><ColorPicker value={config.background} onChange={(background) => set({ background })} /></Field>
        </div>
      )
    case 'text':
      return (
        <div className="space-y-4">
          <Field label="Título"><Input value={config.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Bem-vindos!" /></Field>
          <Field label="Mensagem"><Textarea value={config.message} onChange={(e) => set({ message: e.target.value })} placeholder="Ex.: Reunião geral sexta às 10h no auditório." /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tamanho do texto">
              <Select value={config.size} onChange={(e) => set({ size: e.target.value })}><option value="md">Médio</option><option value="lg">Grande</option><option value="xl">Enorme</option></Select>
            </Field>
            <Field label="Alinhamento">
              <Select value={config.align} onChange={(e) => set({ align: e.target.value })}><option value="center">Centralizado</option><option value="left">À esquerda</option></Select>
            </Field>
          </div>
          <Field label="Cor de fundo"><ColorPicker value={config.background} onChange={(background) => set({ background })} /></Field>
          <Field label="Cor do texto"><ColorPicker value={config.color} onChange={(color) => set({ color })} colors={['#ffffff', '#0f172a', '#fde047', '#a5b4fc']} /></Field>
        </div>
      )
    case 'webpage':
      return (
        <div className="space-y-4">
          <Field label="Endereço (URL)" hint="Alguns sites bloqueiam exibição dentro de outras páginas."><Input type="url" required value={config.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" /></Field>
          <Field label="Recarregar a cada (minutos)" hint="0 = não recarregar"><Input type="number" min={0} value={config.reload_minutes} onChange={(e) => set({ reload_minutes: Number(e.target.value) })} /></Field>
        </div>
      )
    case 'youtube':
      return (
        <div className="space-y-4">
          <Field label="Link do YouTube" hint="Vídeo, playlist ou transmissão ao vivo."><Input type="url" required value={config.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" /></Field>
          <Toggle label="Sem som" checked={config.muted} onChange={(v) => set({ muted: v })} />
        </div>
      )
    case 'music':
      return (
        <div className="space-y-4">
          <Field label="Origem">
            <Segmented className="w-full" value={config.source} onChange={(source) => set({ source })} options={[{ value: 'stream', label: 'Rádio online', icon: Radio }, { value: 'library', label: 'Minhas músicas', icon: Library }]} />
          </Field>
          {config.source === 'stream' ? (
            <Field label="Endereço do streaming" hint="Link direto do áudio (MP3/AAC) da rádio online ou serviço de música ambiente licenciado.">
              <Input type="url" required value={config.stream_url} onChange={(e) => set({ stream_url: e.target.value })} placeholder="https://stream.exemplo.com/radio.mp3" />
            </Field>
          ) : (
            <Field label={`Músicas (${config.media_ids.length})`}>
              <div className="space-y-2">
                {config.media_ids.length > 0 && (
                  <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-xl ring-1 ring-slate-200">
                    {config.media_ids.map((id) => {
                      const t = tracks.find((x) => x.id === id)
                      return (
                        <li key={id} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <Music className="size-4 text-fuchsia-500" /><span className="flex-1 truncate">{t?.name || `Música #${id}`}</span>
                          <button type="button" onClick={() => set({ media_ids: config.media_ids.filter((x) => x !== id) })} className="text-slate-400 hover:text-rose-600"><X className="size-4" /></button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <Button variant="subtle" icon={Plus} onClick={() => setPicker(true)}>Escolher músicas</Button>
              </div>
              <MediaPicker open={picker} onClose={() => setPicker(false)} types={['audio']} title="Escolher músicas" onSelect={(list) => { setTracks((t) => [...t, ...list]); set({ media_ids: [...new Set([...config.media_ids, ...list.map((m) => m.id)])] }) }} />
            </Field>
          )}
          <Field label={`Volume: ${config.volume}%`}><input type="range" min={0} max={100} value={config.volume} onChange={(e) => set({ volume: Number(e.target.value) })} className="w-full accent-brand-600" /></Field>
          {config.source === 'library' && <Toggle label="Ordem aleatória" checked={config.shuffle} onChange={(v) => set({ shuffle: v })} />}
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">Lembre-se: músicas tocadas em ambientes comerciais precisam de licença (ex.: ECAD) ou de um serviço de música ambiente licenciado.</p>
        </div>
      )
    default:
      return null
  }
}

export default function IntegrationForm({ open, onClose, integration, presetType, leagues, onSaved }) {
  const { orgId } = useAuth()
  const toast = useToast()
  const [type, setType] = useState(null)
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [config, setConfig] = useState({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState(null)

  useEffect(() => {
    if (!open) return
    setTest(null)
    if (integration) {
      setType(integration.type)
      setName(integration.name)
      setNameTouched(true)
      setConfig({ ...DEFAULT_CONFIG[integration.type], ...integration.config })
    } else if (presetType) {
      setNameTouched(false)
      setType(presetType)
      setConfig({ ...DEFAULT_CONFIG[presetType] })
      setName(INTEGRATION_TYPES[presetType].label)
    } else {
      setType(null)
      setName('')
      setNameTouched(false)
    }
  }, [open, integration, presetType])

  const choose = (t) => {
    setType(t)
    setConfig({ ...DEFAULT_CONFIG[t] })
    setName(INTEGRATION_TYPES[t].label)
  }
  const set = (patch, suggestedName) => {
    setConfig((c) => ({ ...c, ...patch }))
    if (suggestedName && !nameTouched) setName(suggestedName)
    setTest(null)
  }

  const runTest = async () => {
    setTesting(true)
    try {
      const d = await api.post(`orgs/${orgId}/integrations/test`, { type, config })
      setTest(d.data)
    } catch (e) {
      toast.error(e)
    } finally {
      setTesting(false)
    }
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (integration) await api.put(`orgs/${orgId}/integrations/${integration.id}`, { name, config })
      else await api.post(`orgs/${orgId}/integrations`, { type, name, config })
      toast.success('Integração salva')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  const T = type ? INTEGRATION_TYPES[type] : null
  const remote = ['rss', 'weather', 'sports', 'currency'].includes(type)
  const localPreview = ['clock', 'text'].includes(type)

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={T ? <span className="flex items-center gap-2"><span className={cn('flex size-8 items-center justify-center rounded-lg', T.color)}><T.icon className="size-4" /></span>{integration ? 'Editar' : 'Nova'}: {T.label}</span> : 'Nova integração'}
      description={!T ? 'Escolha o tipo de conteúdo automático.' : null}
      footer={T && (
        <>
          {!integration && <Button variant="ghost" onClick={() => setType(null)} className="sm:mr-auto">Trocar tipo</Button>}
          {remote && <Button variant="secondary" icon={FlaskConical} loading={testing} onClick={runTest}>Testar</Button>}
          <Button type="submit" form="integration-form" loading={saving}>Salvar</Button>
        </>
      )}
    >
      {!T ? <TypeChooser onChoose={choose} /> : (
        <form id="integration-form" onSubmit={save} className="space-y-5">
          <Field label="Nome (para você identificar)">
            <Input required value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true) }} />
          </Field>
          <ConfigFields type={type} config={config} set={set} leagues={leagues || {}} />
          {localPreview && (
            <Field label="Prévia">
              <PreviewFrame manifest={{
                version: JSON.stringify(config),
                screen: { is_active: true, muted: true },
                organization: { timezone: 'America/Sao_Paulo' },
                default_playlist_id: 1,
                schedules: [],
                playlists: { 1: { id: 1, transition: 'none', items: [{ id: 1, type: 'integration', kind: type, integration_id: -1, duration: 3600, name }] } },
                integrations: { [-1]: { id: -1, type, name, config, has_data: false } },
              }} />
            </Field>
          )}
          {test && (
            <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
              <p className="mb-1 flex items-center gap-1.5 font-semibold"><CheckCircle2 className="size-4" />Funcionando!</p>
              {type === 'rss' && <ul className="list-disc space-y-0.5 pl-5">{test.items.slice(0, 3).map((i, k) => <li key={k}>{i.title}</li>)}</ul>}
              {type === 'weather' && <p>{test.city}: {test.current.temp}°C agora</p>}
              {type === 'sports' && <p>{test.league}: {test.events.length} jogos encontrados</p>}
              {type === 'currency' && <p>{test.quotes.map((q) => `${q.code} R$ ${q.bid.toFixed(2)}`).join(' · ')}</p>}
            </div>
          )}
        </form>
      )}
    </Modal>
  )
}
