import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, CheckCircle2, KeyRound, MapPin, RefreshCw, Search, Trophy } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useDebounced } from '../../lib/hooks'
import { Button, Field, Input, Segmented, Select, Toggle, cn } from '../../components/ui'
import { slotUrl } from '../../player/FutDigitalSlotItem'

const VIEWS = { live: 'Ao vivo', results: 'Resultados do dia', upcoming: 'Próximos jogos' }

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()

/** Lista de campeonatos ou arenas para escolher, com logo e cidade. */
function SourceList({ items, selected, onPick, empty }) {
  if (!items.length) return <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 ring-1 ring-slate-200">{empty}</p>
  return (
    <ul className="grid max-h-64 gap-2 overflow-y-auto scrollbar-thin sm:grid-cols-2">
      {items.map((s) => {
        const on = s.id === selected
        return (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s)} className={cn('flex w-full items-center gap-3 rounded-xl p-2.5 text-left ring-1 transition', on ? 'bg-lime-50 ring-lime-400' : 'ring-slate-200 hover:bg-slate-50')}>
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                {s.image ? <img src={s.image} alt="" className="h-full w-full object-contain" referrerPolicy="no-referrer" /> : <Trophy className="size-5 text-slate-400" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">{clean(s.name)}</span>
                <span className="block truncate text-xs text-slate-500">{[s.city, s.extra].filter(Boolean).join(' · ') || ' '}</span>
              </span>
              {on && <CheckCircle2 className="size-4 shrink-0 text-lime-600" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Prévia da página do FutDigital (preview=1: não avança a sequência nem conta exibição). */
export function SlotPreview({ config }) {
  const [n, setN] = useState(0)
  const url = slotUrl(config, { preview: '1' })
  if (!url) return null
  const portrait = config.orientation === 'portrait'
  return (
    <div className="space-y-2">
      <div className={cn('mx-auto overflow-hidden rounded-xl bg-[#04140C] ring-1 ring-slate-200', portrait ? 'aspect-[9/16] max-w-[260px]' : 'aspect-video')}>
        <iframe key={n + url} src={url} title="Prévia do slot" className="h-full w-full border-0" />
      </div>
      <div className="flex justify-center">
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => setN((x) => x + 1)}>Ver de novo</Button>
      </div>
    </div>
  )
}

/** Campos do Slot FutDigital (tela pronta do FutDigital inserida entre as propagandas). */
export default function FutDigitalSlotFields({ config, set }) {
  const { orgId, can } = useAuth()
  const navigate = useNavigate()
  const [comps, setComps] = useState({ loading: true, configured: true, list: [], error: null })
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 400)
  const [arenas, setArenas] = useState({ loading: false, list: [], error: null })
  const sourceType = config.source_type || 'competition'

  useEffect(() => {
    api.get(`orgs/${orgId}/futdigital/competitions?status=ongoing`)
      .then((d) => setComps({ loading: false, configured: d.configured, list: d.competitions, error: null }))
      .catch((e) => setComps({ loading: false, configured: true, list: [], error: e.message }))
  }, [orgId])

  useEffect(() => {
    if (sourceType !== 'arena' || !comps.configured) return
    setArenas((a) => ({ ...a, loading: true }))
    api.get(`orgs/${orgId}/futdigital/arenas?q=${encodeURIComponent(dq)}`)
      .then((d) => setArenas({ loading: false, list: d.arenas, error: null }))
      .catch((e) => setArenas({ loading: false, list: [], error: e.message }))
  }, [orgId, dq, sourceType, comps.configured])

  if (comps.loading) return <p className="text-sm text-slate-500">Consultando o FutDigital…</p>
  if (!comps.configured) {
    return (
      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
        <p className="font-semibold">Falta a chave do FutDigital</p>
        <p className="mt-1">{can('admin') ? 'Cadastre a chave de parceiro em Configurações → Chaves de integrações.' : 'Peça a um administrador para cadastrar a chave de parceiro em Configurações.'}</p>
        {can('admin') && <Button size="sm" className="mt-3" icon={KeyRound} onClick={() => navigate('/configuracoes')}>Cadastrar chave</Button>}
      </div>
    )
  }

  const pick = (s) => set(
    { source_type: sourceType, source_id: s.id, source_name: clean(s.name), source_image: s.image || '' },
    `FutDigital – ${clean(s.name)}`,
  )
  const views = config.views || []
  const order = [...views, ...Object.keys(VIEWS).filter((v) => !views.includes(v))]
  const toggleView = (v) => set({ views: views.includes(v) ? views.filter((x) => x !== v) : order.filter((x) => x === v || views.includes(x)) })
  const move = (v, dir) => {
    const list = [...views]
    const i = list.indexOf(v)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    set({ views: list })
  }

  return (
    <div className="space-y-5">
      <p className="rounded-xl bg-lime-50 p-3 text-xs text-lime-900 ring-1 ring-lime-200">
        O FutDigital entrega a tela pronta (próximos jogos, resultados do dia e jogos ao vivo, com escudos). A cada inserção a TV mostra a parte seguinte, e o jogo ao vivo entra sempre primeiro.
      </p>
      {(comps.error || arenas.error) && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">{comps.error || arenas.error}</p>}

      <Field label="Fonte">
        <Segmented
          className="mb-2 w-full"
          value={sourceType}
          onChange={(v) => v !== sourceType && set({ source_type: v, source_id: 0, source_name: '', source_image: '' })}
          options={[{ value: 'competition', label: 'Campeonato' }, { value: 'arena', label: 'Arena' }]}
        />
        {sourceType === 'competition' ? (
          <SourceList
            items={comps.list.map((c) => ({ id: c.id, name: c.name, image: c.logo_url, city: c.city, extra: c.season }))}
            selected={Number(config.source_id)}
            onPick={pick}
            empty="Nenhum campeonato em andamento liberado para a sua chave."
          />
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar arena pelo nome" className="pl-9" />
            </div>
            {arenas.loading && !arenas.list.length ? <p className="text-xs text-slate-500">Buscando…</p> : (
              <SourceList
                items={arenas.list.map((a) => ({ id: a.id, name: a.name, image: a.image_url, city: a.city, extra: a.matches ? `${a.matches} jogos` : null }))}
                selected={Number(config.source_id)}
                onPick={pick}
                empty="Nenhuma arena encontrada com jogos dos seus campeonatos."
              />
            )}
          </div>
        )}
        {config.source_id > 0 && config.source_name && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><MapPin className="size-3.5" />Selecionado: <b className="font-medium text-slate-700">{config.source_name}</b></p>
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Formato da tela">
          <Segmented
            className="w-full"
            value={config.orientation}
            onChange={(v) => set({ orientation: v })}
            options={[{ value: 'landscape', label: 'Deitada' }, { value: 'portrait', label: 'Em pé' }, { value: 'auto', label: 'Automático' }]}
          />
        </Field>
        <Field label="Duração da inserção" hint="A TV mostra o FutDigital por exatamente esse tempo.">
          <Segmented
            className="w-full"
            value={config.duration_seconds}
            onChange={(v) => set({ duration_seconds: v })}
            options={[10, 15, 20, 30].map((s) => ({ value: s, label: `${s} s` }))}
          />
        </Field>
      </div>

      <Field label="O que mostrar" hint="A ordem vale para a sequência das telas.">
        <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {order.map((v) => {
            const on = views.includes(v)
            const i = views.indexOf(v)
            return (
              <li key={v} className="flex items-center gap-3 px-3 py-2">
                <Toggle size="sm" checked={on} onChange={() => (on && views.length === 1 ? null : toggleView(v))} />
                <span className={cn('flex-1 text-sm font-medium', on ? 'text-slate-800' : 'text-slate-400')}>{VIEWS[v]}</span>
                {on && (
                  <span className="flex gap-1">
                    <button type="button" disabled={i === 0} onClick={() => move(v, -1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Subir"><ArrowUp className="size-4" /></button>
                    <button type="button" disabled={i === views.length - 1} onClick={() => move(v, 1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Descer"><ArrowDown className="size-4" /></button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </Field>

      <Field label="Se não houver jogos">
        <Segmented
          className="w-full"
          value={config.skip_when_empty ? 'skip' : 'show'}
          onChange={(v) => set({ skip_when_empty: v === 'skip' })}
          options={[{ value: 'skip', label: 'Pular a inserção' }, { value: 'show', label: sourceType === 'arena' ? 'Mostrar a tela da arena' : 'Mostrar a tela do campeonato' }]}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Jogos por tela">
          <Select value={config.per_screen} onChange={(e) => set({ per_screen: Number(e.target.value) })}>
            <option value={0}>Padrão</option>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        <Field label="Próximos jogos de">
          <Select value={config.upcoming_days} onChange={(e) => set({ upcoming_days: Number(e.target.value) })}>
            {[1, 3, 7, 14, 30].map((n) => <option key={n} value={n}>{n === 1 ? 'Hoje' : `${n} dias`}</option>)}
          </Select>
        </Field>
        <Field label="QR Code">
          <Toggle checked={config.show_qr} onChange={(v) => set({ show_qr: v })} label={config.show_qr ? 'Mostrar' : 'Esconder'} />
        </Field>
      </div>

      <p className="text-xs text-slate-500">
        Para inserir o FutDigital a cada N propagandas, coloque-o numa playlist própria e programe na Grade como <b>inserção</b> a cada N itens.
      </p>
    </div>
  )
}
