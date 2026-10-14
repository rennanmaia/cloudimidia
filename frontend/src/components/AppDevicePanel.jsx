import { useEffect, useRef, useState } from 'react'
import {
  Smartphone, Camera, RotateCw, Download, HardDrive, Trash2, Power, Wifi, Cable, MemoryStick, Clock, Package, AlertTriangle, Loader2,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatBytes, formatDateTime, timeAgo } from '../lib/format'
import { useConfirm, useToast } from './feedback'
import { Badge, Card, CardTitle, ProgressBar, cn } from './ui'

const fmtUptime = (s) => {
  s = Number(s) || 0
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m}min`
}

function Metric({ icon: Icon, label, value, warn, children }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/70">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Icon className="size-3.5" />{label}</p>
      <p className={cn('mt-1 text-sm font-semibold', warn ? 'text-amber-700' : 'text-slate-800')}>{value}</p>
      {children}
    </div>
  )
}

/** Seção da TV quando ela roda o app CloudiMídia Player (Android). */
export default function AppDevicePanel({ screen, onReload }) {
  const { orgId } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(null)
  const [waitingShot, setWaitingShot] = useState(false)
  const shotAt = useRef(screen.screenshot_at)
  const d = screen.diagnostics || {}

  // Aguarda a captura chegar (o app envia no próximo contato, em até ~15s)
  useEffect(() => {
    if (!waitingShot) return
    if (screen.screenshot_at && screen.screenshot_at !== shotAt.current) {
      setWaitingShot(false)
      shotAt.current = screen.screenshot_at
      return
    }
    const poll = setInterval(() => onReload(true), 3000)
    const stop = setTimeout(() => { setWaitingShot(false); toast.error('A TV não enviou a captura. Ela está online?') }, 45000)
    return () => { clearInterval(poll); clearTimeout(stop) }
  }, [waitingShot, screen.screenshot_at]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (command, msg, opts = {}) => {
    if (opts.confirm && !(await confirm(opts.confirm))) return
    setBusy(command)
    try {
      await api.post(`orgs/${orgId}/screens/${screen.id}/command`, { command })
      if (command === 'screenshot') { shotAt.current = screen.screenshot_at; setWaitingShot(true) }
      toast.success(msg)
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  const memUsed = d.mem_total ? 1 - d.mem_free / d.mem_total : 0
  const diskUsed = d.storage_total ? 1 - d.storage_free / d.storage_total : 0
  const netIcon = d.network === 'cabo' ? Cable : Wifi
  const offline = !screen.online

  const actions = [
    ['screenshot', Camera, 'Capturar tela', 'Pedido de captura enviado'],
    ['sync_media', Download, 'Baixar mídias', 'A TV vai baixar as mídias que faltam'],
    ['update_app', Package, 'Atualizar app', 'A TV vai procurar e instalar a versão mais recente'],
    ['restart_app', RotateCw, 'Reiniciar app', 'O app vai reiniciar', { title: 'Reiniciar o app da TV?', message: 'A tela fica preta por alguns segundos.' }],
    ['clear_media', Trash2, 'Apagar mídias salvas', 'As mídias serão apagadas e baixadas de novo', { title: 'Apagar as mídias salvas na TV?', message: 'Ela volta a baixar tudo; até terminar, depende da internet.', danger: true, confirmLabel: 'Apagar' }],
    d.autostart === false
      ? ['autostart_on', Power, 'Ativar abrir ao ligar', 'Abertura automática ativada']
      : ['autostart_off', Power, 'Desativar abrir ao ligar', 'Abertura automática desativada', { title: 'Desativar a abertura automática?', message: 'A TV não abrirá o app sozinha ao ligar nem se ele fechar.', danger: true, confirmLabel: 'Desativar' }],
  ]

  return (
    <Card>
      <CardTitle icon={Smartphone} action={<Badge color="brand">App {d.app_version || screen.device.player_version?.replace('app-', '')}</Badge>}>
        Aplicativo da TV
      </CardTitle>

      {/* Captura de tela */}
      <div className="relative mb-4 overflow-hidden rounded-xl bg-slate-900 ring-1 ring-slate-200">
        {screen.screenshot_url ? (
          <img src={screen.screenshot_url} alt="Captura da tela da TV" className="aspect-video w-full object-contain" />
        ) : (
          <div className="flex aspect-video items-center justify-center text-sm text-slate-400">Nenhuma captura ainda</div>
        )}
        {waitingShot && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/70 text-sm font-medium text-white">
            <Loader2 className="size-5 animate-spin" /> Aguardando a TV enviar a captura…
          </div>
        )}
      </div>
      {screen.screenshot_at && <p className="-mt-2 mb-4 text-xs text-slate-500">Captura de {formatDateTime(screen.screenshot_at)} · vídeos podem aparecer pretos na captura.</p>}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {actions.map(([cmd, Icon, label, msg, conf]) => (
          <button
            key={cmd}
            type="button"
            disabled={!!busy || offline || (cmd === 'screenshot' && waitingShot)}
            onClick={() => send(cmd, msg, { confirm: conf })}
            className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-brand-50 hover:text-brand-700 hover:ring-brand-200 disabled:opacity-50"
          >
            {busy === cmd ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Icon className="size-4 shrink-0" />}
            {label}
          </button>
        ))}
      </div>
      {offline && <p className="mb-4 text-xs text-amber-700">A TV está offline: os comandos serão executados quando ela voltar a se conectar.</p>}

      {screen.diagnostics ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Metric icon={netIcon} label="Rede" value={`${d.network || '—'}${d.wifi_signal != null ? ` · sinal ${d.wifi_signal}/4` : ''}`}>
              {d.ip && <p className="text-xs text-slate-500">IP {d.ip}</p>}
            </Metric>
            <Metric icon={Clock} label="Ligada há" value={fmtUptime(d.uptime)}>
              <p className="text-xs text-slate-500">app aberto há {fmtUptime(d.app_uptime)}</p>
            </Metric>
            <Metric icon={MemoryStick} label="Memória livre" value={`${formatBytes(d.mem_free)} de ${formatBytes(d.mem_total)}`} warn={d.mem_low}>
              <ProgressBar value={memUsed} className="mt-1.5 h-1.5" />
            </Metric>
            <Metric icon={HardDrive} label="Espaço livre" value={`${formatBytes(d.storage_free)} de ${formatBytes(d.storage_total)}`} warn={diskUsed > 0.9}>
              <ProgressBar value={diskUsed} className="mt-1.5 h-1.5" color="bg-purple-500" />
            </Metric>
            <Metric
              icon={Download}
              label="Mídias salvas no aparelho"
              value={`${d.cache_files ?? 0} arquivos · ${formatBytes(d.cache_bytes)}`}
              warn={d.cache_missing > 0}
            >
              <p className="text-xs text-slate-500">{d.cache_missing > 0 ? `${d.cache_missing} ainda baixando — sem internet, elas não tocariam` : 'Tudo pronto para exibir sem internet'}</p>
            </Metric>
            <Metric icon={Power} label="Abrir ao ligar" value={d.autostart ? (d.can_autostart ? 'Ativo' : 'Ativo, falta permissão') : 'Desligado'} warn={d.autostart && !d.can_autostart}>
              {d.home_app && <p className="text-xs text-slate-500">Usado como tela inicial</p>}
            </Metric>
          </div>
          {d.autostart && !d.can_autostart && (
            <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
              <AlertTriangle className="size-4 shrink-0" />
              Para abrir sozinha ao ligar, alguém no local precisa abrir o menu do app (segurar OK) e permitir “Sobrepor a outros apps” ou usar o app como tela inicial.
            </p>
          )}
          {d.can_install === false && (
            <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
              <AlertTriangle className="size-4 shrink-0" />
              Para atualizar o app à distância, alguém no local precisa abrir o menu do app (segurar OK) → “Permitir atualizações do app” (uma única vez).
            </p>
          )}
          <dl className="mt-4 space-y-1 text-xs text-slate-500">
            <div className="flex gap-2"><dt className="w-24 shrink-0">Aparelho</dt><dd className="text-slate-700">{d.model} · Android {d.android}</dd></div>
            <div className="flex gap-2"><dt className="w-24 shrink-0">Versões</dt><dd className="text-slate-700">app {d.app_version} ({d.app_version_code}) · player {d.player_version} · WebView {d.webview || '—'}</dd></div>
            <div className="flex gap-2"><dt className="w-24 shrink-0">Atualizado</dt><dd className="text-slate-700">{d.reported_at ? timeAgo(d.reported_at) : '—'}</dd></div>
          </dl>
          {Array.isArray(d.events) && d.events.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-brand-600">Últimos eventos do aparelho ({d.events.length})</summary>
              <ul className="mt-2 space-y-1 rounded-xl bg-slate-50 p-3 font-mono text-[11px] text-slate-600">
                {[...d.events].reverse().map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-500">As estatísticas aparecem alguns segundos após o app se conectar.</p>
      )}
    </Card>
  )
}
