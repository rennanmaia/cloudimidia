import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, Music2, Pause, Play, SkipBack, SkipForward, Square, Volume1, Volume2, WifiOff } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useFetch } from '../../lib/hooks'
import { useToast } from '../../components/feedback'
import { Button, Card, ErrorState, PageLoader, cn } from '../../components/ui'

const STATES = {
  playing: { label: 'Tocando', color: 'text-emerald-600', dot: 'bg-emerald-500 animate-pulse' },
  paused: { label: 'Pausada', color: 'text-amber-600', dot: 'bg-amber-500' },
  ad: { label: 'Pausada durante a propaganda com som', color: 'text-amber-600', dot: 'bg-amber-500' },
  stopped: { label: 'Parada', color: 'text-slate-500', dot: 'bg-slate-400' },
  loading: { label: 'Carregando…', color: 'text-slate-500', dot: 'bg-slate-400 animate-pulse' },
  offline: { label: 'TV sem internet: só propagandas', color: 'text-rose-600', dot: 'bg-rose-500' },
  error: { label: 'Falhou, tentando de novo em instantes', color: 'text-rose-600', dot: 'bg-rose-500' },
  muted: { label: 'TV no mudo', color: 'text-slate-500', dot: 'bg-slate-400' },
}

const PROVIDER_LABELS = { youtube: 'YouTube', soundcloud: 'SoundCloud', spotify: 'Spotify', deezer: 'Deezer', stream: 'Rádio online' }

/** Controle remoto da trilha sonora da TV, para usar no celular. */
export default function RemoteControl() {
  const { id } = useParams()
  const { orgId } = useAuth()
  const toast = useToast()
  // Consulta a cada 2 s (também mantém a TV no modo de resposta rápida)
  const { data, error, loading } = useFetch(`orgs/${orgId}/screens/${id}/remote`, { interval: 2000 })
  const [pending, setPending] = useState(null)
  const [volume, setVolume] = useState(null)
  const volTimer = useRef(null)

  const state = data?.state
  const st = STATES[state?.state] || (data?.screen?.online ? STATES.loading : null)

  // O pedido foi atendido quando a situação muda (ou depois de 20 s)
  const lastState = useRef(null)
  useEffect(() => {
    const key = `${state?.state}|${state?.title}`
    if (pending && lastState.current !== null && key !== lastState.current) setPending(null)
    lastState.current = key
  }, [state?.state, state?.title, pending])
  useEffect(() => {
    if (!pending) return
    const t = setTimeout(() => setPending(null), 20000)
    return () => clearTimeout(t)
  }, [pending])
  useEffect(() => { if (volume === null && state?.volume != null) setVolume(state.volume) }, [state?.volume, volume])

  const send = async (command, value) => {
    setPending(command)
    try {
      await api.post(`orgs/${orgId}/screens/${id}/remote`, { command, value })
    } catch (e) {
      setPending(null)
      toast.error(e)
    }
  }
  const changeVolume = (v) => {
    setVolume(v)
    clearTimeout(volTimer.current)
    volTimer.current = setTimeout(() => send('volume', v), 400)
  }

  if (loading && !data) return <PageLoader />
  if (error) return <ErrorState error={error} />

  const { screen, soundtrack } = data
  const playing = state?.state === 'playing' || state?.state === 'ad' || state?.state === 'loading'
  const canSkip = !!state?.can_skip
  const disabled = !screen.online

  return (
    <div className="mx-auto max-w-md">
      <Button variant="ghost" size="sm" icon={ArrowLeft} to={`/tvs/${screen.id}`} className="mb-3">{screen.name}</Button>
      <Card className="overflow-hidden" padded={false}>
        <div className="bg-gradient-to-br from-brand-600 to-indigo-800 px-6 pb-8 pt-7 text-white">
          <p className="flex items-center gap-2 text-sm font-medium text-white/70"><Music2 className="size-4" />Trilha sonora · {PROVIDER_LABELS[soundtrack?.provider] || '—'}</p>
          <p className="mt-4 min-h-[3.5rem] text-xl font-bold leading-snug [overflow-wrap:anywhere]">
            {state?.title || (soundtrack?.provider === 'stream' ? 'Rádio online' : soundtrack ? 'Música de fundo' : 'Sem trilha sonora')}
          </p>
          {!screen.online ? (
            <p className="mt-3 flex items-center gap-2 text-sm font-medium text-rose-200"><WifiOff className="size-4" />A TV está desligada ou sem conexão</p>
          ) : st && (
            <p className="mt-3 flex items-center gap-2 text-sm font-medium text-white/90"><span className={cn('size-2 rounded-full', st.dot)} />{pending ? 'Enviando para a TV…' : st.label}</p>
          )}
          {state?.detail && <p className="mt-2 text-xs text-white/70">{state.detail}</p>}
        </div>

        {!soundtrack ? (
          <p className="p-6 text-sm text-slate-600">Configure a trilha sonora na página da TV para usar o controle.</p>
        ) : (
          <div className="space-y-7 p-6">
            <div className="flex items-center justify-center gap-4">
              <RoundButton label="Anterior" icon={SkipBack} disabled={disabled || !canSkip} onClick={() => send('prev')} />
              <RoundButton
                big
                label={playing ? 'Pausar' : 'Tocar'}
                icon={playing ? Pause : Play}
                disabled={disabled}
                busy={pending === 'play' || pending === 'pause'}
                onClick={() => send(playing ? 'pause' : 'play')}
              />
              <RoundButton label="Próxima" icon={SkipForward} disabled={disabled || !canSkip} onClick={() => send('next')} />
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                disabled={disabled || state?.state === 'stopped'}
                onClick={() => send('stop')}
                className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-95 disabled:opacity-40"
              >
                <Square className="size-4 fill-current" />Parar
              </button>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                <span>Volume</span>
                <span className="font-semibold tabular-nums text-slate-800">{volume ?? soundtrack.volume}%</span>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" aria-label="Diminuir volume" disabled={disabled} onClick={() => changeVolume(Math.max(0, (volume ?? soundtrack.volume) - 10))} className="rounded-full p-2 text-slate-500 ring-1 ring-slate-200 active:scale-95 disabled:opacity-40"><Volume1 className="size-5" /></button>
                <input type="range" min={0} max={100} step={5} disabled={disabled} value={volume ?? soundtrack.volume} onChange={(e) => changeVolume(Number(e.target.value))} className="h-2 flex-1 accent-brand-600" aria-label="Volume" />
                <button type="button" aria-label="Aumentar volume" disabled={disabled} onClick={() => changeVolume(Math.min(100, (volume ?? soundtrack.volume) + 10))} className="rounded-full p-2 text-slate-500 ring-1 ring-slate-200 active:scale-95 disabled:opacity-40"><Volume2 className="size-5" /></button>
              </div>
            </div>

            {!canSkip && <p className="text-center text-xs text-slate-500">Próxima e anterior funcionam com playlists do YouTube e do SoundCloud.</p>}
            <p className="text-center text-xs text-slate-400">Com o controle aberto, a TV responde em poucos segundos (no primeiro comando pode levar até 15 s).</p>
          </div>
        )}
      </Card>
    </div>
  )
}

function RoundButton({ icon: Icon, label, onClick, disabled, big, busy }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center rounded-full transition active:scale-95 disabled:opacity-35',
        big ? 'size-20 bg-brand-600 text-white shadow-lg shadow-brand-600/30 hover:bg-brand-700' : 'size-14 bg-slate-100 text-slate-700 hover:bg-slate-200',
        busy && 'animate-pulse',
      )}
    >
      <Icon className={cn(big ? 'size-9' : 'size-6', 'fill-current')} />
    </button>
  )
}
