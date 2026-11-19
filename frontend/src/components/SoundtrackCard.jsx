import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Music2, Save, Youtube, Radio, CheckCircle2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useFetch } from '../lib/hooks'
import { useToast } from './feedback'
import { Badge, Button, Card, CardTitle, Field, Input, Segmented, Select, Toggle, cn } from './ui'

const DEFAULTS = { enabled: false, url: '', volume: 60, shuffle: true, pause_on_ad_sound: true, video_mode: 'off', video_every: 5, video_for: 20, corner: 'br' }

/** Reconhece a plataforma pelo link (o servidor confere de novo ao salvar). */
export function detectSource(url) {
  const u = (url || '').trim()
  if (!u) return null
  if (/^spotify:/i.test(u) || /open\.spotify\.com\//i.test(u)) return { provider: 'spotify', label: 'Spotify', limited: true }
  if (/deezer\.(com|page\.link)|link\.deezer\.com/i.test(u)) return { provider: 'deezer', label: 'Deezer', limited: true }
  if (/(youtube\.com|youtu\.be|music\.youtube\.com)/i.test(u)) {
    const list = /[?&]list=([\w-]+)/.exec(u)?.[1]
    return { provider: 'youtube', label: list && !list.startsWith('RD') ? 'Playlist do YouTube' : 'Vídeo do YouTube', video: true }
  }
  if (/soundcloud\.com/i.test(u)) return { provider: 'soundcloud', label: 'SoundCloud' }
  if (/^https?:\/\//i.test(u)) return { provider: 'stream', label: 'Rádio / áudio online' }
  return null
}

const ICONS = { youtube: Youtube, stream: Radio }

/** Trilha sonora da TV: música de fundo enquanto as propagandas passam. */
export default function SoundtrackCard({ screen, onSaved }) {
  const { orgId } = useAuth()
  const toast = useToast()
  // A página recarrega a TV a cada 10 s: só volta o formulário se a trilha salva mudar de fato
  const savedKey = JSON.stringify(screen.soundtrack || null)
  const initial = useMemo(() => (screen.soundtrack ? { ...DEFAULTS, ...screen.soundtrack, enabled: true } : DEFAULTS), [savedKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState(initial)
  const [others, setOthers] = useState([])
  const [saving, setSaving] = useState(false)
  const { data: list } = useFetch(`orgs/${orgId}/screens`)
  useEffect(() => { setForm(initial) }, [initial])

  const set = (p) => setForm((f) => ({ ...f, ...p }))
  const src = detectSource(form.url)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const otherScreens = (list?.screens || []).filter((s) => s.id !== screen.id && s.can_operate)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form, enabled: form.enabled && !!form.url.trim() }
    try {
      await api.put(`orgs/${orgId}/screens/${screen.id}`, { soundtrack: payload })
      if (others.length) await api.post(`orgs/${orgId}/screens/soundtrack`, { screen_ids: others, soundtrack: payload })
      toast.success(payload.enabled
        ? `Trilha sonora salva${others.length ? ` nesta e em mais ${others.length} TV${others.length > 1 ? 's' : ''}` : ''}. A TV troca em até 1 minuto.`
        : 'Trilha sonora desligada')
      setOthers([])
      onSaved?.()
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  const Icon = ICONS[src?.provider] || Music2
  return (
    <Card>
      <CardTitle icon={Music2}>Trilha sonora</CardTitle>
      <p className="-mt-2 mb-4 text-sm text-slate-500">Música de fundo tocando no estabelecimento enquanto as propagandas passam. Sem internet, a TV continua só com as propagandas.</p>
      <form onSubmit={save} className="space-y-4">
        <Toggle label="Tocar trilha sonora nesta TV" checked={form.enabled} onChange={(v) => set({ enabled: v })} />
        {form.enabled && (
          <>
            <Field label="Link da trilha" hint="Playlist ou vídeo do YouTube, SoundCloud, Spotify, Deezer ou endereço de uma rádio online.">
              <Input value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://www.youtube.com/playlist?list=…" inputMode="url" />
            </Field>
            {src && (
              <p className="flex items-center gap-2 text-sm text-slate-700">
                <Icon className="size-4 text-slate-500" />Reconhecido: <Badge color={src.limited ? 'amber' : 'green'}>{src.label}</Badge>
              </p>
            )}
            {src?.limited && (
              <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                <AlertTriangle className="mt-px size-4 shrink-0" />
                O {src.label} só toca trechos de 30 segundos de cada música quando não há uma conta conectada, e a TV não tem como entrar numa conta. Para músicas inteiras, use uma playlist do YouTube, do SoundCloud ou uma rádio online.
              </p>
            )}

            <Field label={`Volume: ${form.volume}%`}>
              <input type="range" min={0} max={100} value={form.volume} onChange={(e) => set({ volume: Number(e.target.value) })} className="w-full accent-brand-600" />
            </Field>
            <div className="space-y-3">
              {['youtube', 'soundcloud'].includes(src?.provider) && <Toggle label="Ordem aleatória" checked={form.shuffle} onChange={(v) => set({ shuffle: v })} />}
              <Toggle label="Pausar quando a propaganda tiver som" description="A música volta sozinha quando o vídeo com som termina." checked={form.pause_on_ad_sound} onChange={(v) => set({ pause_on_ad_sound: v })} />
            </div>

            {src?.video && (
              <div className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <Field label="Mostrar o vídeo de vez em quando">
                  <Segmented className="w-full" value={form.video_mode} onChange={(v) => set({ video_mode: v })} options={[{ value: 'off', label: 'Não' }, { value: 'small', label: 'Pequeno' }, { value: 'medium', label: 'Médio' }]} />
                </Field>
                {form.video_mode !== 'off' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="A cada">
                        <Select value={form.video_every} onChange={(e) => set({ video_every: Number(e.target.value) })}>
                          {[1, 2, 3, 5, 10, 15, 30].map((n) => <option key={n} value={n}>{n} min</option>)}
                        </Select>
                      </Field>
                      <Field label="Por">
                        <Select value={form.video_for} onChange={(e) => set({ video_for: Number(e.target.value) })}>
                          {[10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} s</option>)}
                        </Select>
                      </Field>
                    </div>
                    <Field label="Canto da tela">
                      <CornerPicker value={form.corner} onChange={(v) => set({ corner: v })} size={form.video_mode} />
                    </Field>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {otherScreens.length > 0 && (form.enabled || screen.soundtrack) && (
          <details className="rounded-xl ring-1 ring-slate-200">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-slate-700">Aplicar também em outras TVs {others.length > 0 && <Badge color="brand">{others.length}</Badge>}</summary>
            <ul className="max-h-48 space-y-1 overflow-y-auto px-3 pb-3 scrollbar-thin">
              {otherScreens.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="size-4 accent-brand-600" checked={others.includes(s.id)} onChange={(e) => setOthers((o) => (e.target.checked ? [...o, s.id] : o.filter((x) => x !== s.id)))} />
                    <span className="truncate">{s.name}</span>
                    {s.soundtrack && <Music2 className="size-3.5 text-slate-400" title="Já tem trilha sonora" />}
                  </label>
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="text-xs text-slate-500">Música tocada em estabelecimento comercial precisa de licença de execução pública (ECAD). Os termos do YouTube, Spotify e Deezer são para uso pessoal; para uso comercial, prefira rádios e serviços de música ambiente licenciados.</p>

        <div className="flex items-center justify-end gap-2">
          {!dirty && screen.soundtrack && <span className="mr-auto flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="size-3.5" />Ativa nesta TV</span>}
          <Button type="submit" icon={Save} loading={saving} disabled={!dirty && !others.length}>Salvar</Button>
        </div>
      </form>
    </Card>
  )
}

/** Miniatura da tela para escolher o canto do vídeo. */
function CornerPicker({ value, onChange, size }) {
  const corners = [['tl', 'top-[8%] left-[4%]'], ['tr', 'top-[8%] right-[4%]'], ['bl', 'bottom-[8%] left-[4%]'], ['br', 'bottom-[8%] right-[4%]']]
  return (
    <div className="relative mx-auto aspect-video w-full max-w-xs overflow-hidden rounded-lg bg-slate-800 ring-1 ring-slate-300">
      <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">propaganda</span>
      {corners.map(([c, pos]) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Canto ${c}`}
          className={cn('absolute aspect-video rounded transition', pos, size === 'medium' ? 'w-[34%]' : 'w-[22%]', value === c ? 'bg-brand-500 ring-2 ring-white' : 'bg-white/15 hover:bg-white/30')}
        />
      ))}
    </div>
  )
}
