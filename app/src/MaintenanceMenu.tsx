import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, findNodeHandle, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Device, DeviceConfig, Diagnostics, deviceEvents } from './native'
import { testServer } from './server'

export type PlayerStatus = {
  paired?: boolean
  screenName?: string | null
  online?: boolean
  token?: string | null
  lastSeen?: number
}

type Props = {
  config: DeviceConfig
  status: PlayerStatus
  onClose: () => void
  onConfigChanged: () => void
  onReload: () => void
  onUnpair: () => void
  onSyncMedia: () => Promise<void>
  onCheckUpdates: () => Promise<string>
}

const fmtBytes = (b?: any) => {
  const n = Number(b) || 0
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(0)} MB`
  return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} GB`
}
const fmtTime = (s?: any) => {
  const n = Number(s) || 0
  const d = Math.floor(n / 86400), h = Math.floor((n % 86400) / 3600), m = Math.floor((n % 3600) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m}min`
}

function MenuButton({ label, detail, onPress, first, danger, disabled }: { label: string; detail?: string; onPress: () => void; first?: boolean; danger?: boolean; disabled?: boolean }) {
  const [focused, setFocused] = useState(false)
  const ref = useRef<View>(null)
  // O foco do controle vem do nativo (o RN padrão não emite foco em botões)
  useEffect(() => {
    const sub = deviceEvents.addListener('cmFocus', (e: { tag: number }) => setFocused(e.tag === findNodeHandle(ref.current)))
    let t: ReturnType<typeof setTimeout> | undefined
    if (first) t = setTimeout(() => { const tag = findNodeHandle(ref.current); if (tag) Device.focusView(tag) }, 150)
    return () => { sub.remove(); if (t) clearTimeout(t) }
  }, [first])
  return (
    <Pressable
      ref={ref}
      focusable={!disabled}
      disabled={disabled}
      hasTVPreferredFocus={first}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[s.btn, focused && s.btnFocus, danger && focused && s.btnDanger, disabled && { opacity: 0.4 }]}
    >
      <Text style={[s.btnText, focused && s.btnTextFocus]}>{label}</Text>
      {!!detail && <Text style={[s.btnDetail, focused && { color: '#e0e7ff' }]}>{detail}</Text>}
    </Pressable>
  )
}

function Row({ k, v, warn }: { k: string; v?: any; warn?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowKey}>{k}</Text>
      <Text style={[s.rowVal, warn && { color: '#fbbf24' }]} numberOfLines={2}>{v == null || v === '' ? '—' : String(v)}</Text>
    </View>
  )
}

export default function MaintenanceMenu({ config, status, onClose, onConfigChanged, onReload, onUnpair, onSyncMedia, onCheckUpdates }: Props) {
  const [diag, setDiag] = useState<Diagnostics | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [editServer, setEditServer] = useState(false)
  const [server, setServer] = useState(config.serverUrl)
  const [serverOk, setServerOk] = useState<boolean | null>(null)

  const loadDiag = () => Device.getDiagnostics().then(setDiag).catch(() => {})
  useEffect(() => {
    loadDiag()
    testServer(config.serverUrl).then(setServerOk)
    const t = setInterval(loadDiag, 3000)
    return () => clearInterval(t)
  }, [config.serverUrl])

  const run = async (key: string, fn: () => Promise<any>, done?: string) => {
    setBusy(key)
    setMsg(null)
    try {
      const r = await fn()
      setMsg(typeof r === 'string' ? r : done || 'Pronto.')
    } catch (e: any) {
      setMsg(`Erro: ${e?.message || e}`)
    } finally {
      setBusy(null)
      onConfigChanged()
      loadDiag()
    }
  }

  const askConfirm = (key: string, fn: () => void) => {
    if (confirm === key) { setConfirm(null); fn() } else { setConfirm(key); setMsg('Pressione de novo para confirmar.') }
  }

  const saveServer = async () => {
    let url = server.trim().replace(/\/+$/, '')
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    setBusy('server')
    const ok = await testServer(url)
    setBusy(null)
    if (!ok) { setMsg(`Não foi possível conectar em ${url}. Confira o endereço e a internet.`); return }
    await Device.setServerUrl(url)
    setEditServer(false)
    setMsg('Servidor alterado. Se a TV era de outro servidor, cadastre-a novamente.')
    onConfigChanged()
    onReload()
  }

  return (
    <View style={s.overlay}>
      <View style={s.panel}>
        <View style={s.header}>
          <Text style={s.title}>Menu de manutenção</Text>
          <Text style={s.subtitle}>CloudiMídia Player {config.appVersion} · player {config.playerVersion}</Text>
        </View>
        <View style={s.body}>
          <ScrollView style={s.left} contentContainerStyle={{ paddingBottom: 24 }}>
            {editServer ? (
              <View style={s.serverBox}>
                <Text style={s.label}>Endereço do servidor</Text>
                <TextInput
                  style={s.input}
                  value={server}
                  onChangeText={setServer}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  onSubmitEditing={saveServer}
                  autoFocus
                  selectTextOnFocus
                  placeholder="https://cloudi.com.br/midia"
                  placeholderTextColor="#64748b"
                />
                <MenuButton label={busy === 'server' ? 'Testando…' : 'Salvar e conectar'} onPress={saveServer} />
                <MenuButton label="Usar o padrão (cloudi.com.br/midia)" onPress={() => setServer('https://cloudi.com.br/midia')} />
                <MenuButton label="Cancelar" onPress={() => { setEditServer(false); setServer(config.serverUrl) }} />
              </View>
            ) : (
              <>
                <MenuButton first label="Voltar à exibição" onPress={onClose} />
                <MenuButton
                  label={`Abrir ao ligar o aparelho: ${config.autostart ? 'LIGADO' : 'DESLIGADO'}`}
                  detail={config.autostart ? 'Abre sozinho ao ligar e reabre se fechar' : 'O app só abre manualmente'}
                  onPress={() => run('autostart', () => Device.setAutostart(!config.autostart), !config.autostart ? 'Abertura automática ligada.' : 'Abertura automática desligada.')}
                />
                {config.autostart && config.needsOverlayPermission && !config.homeEnabled && (
                  <MenuButton
                    label="⚠ Permitir que o app abra sozinho"
                    detail="Ative “Sobrepor a outros apps” para este app (Android 10+)"
                    onPress={() => Device.openSystemSettings('overlay')}
                  />
                )}
                {config.needsInstallPermission && (
                  <MenuButton
                    label="⚠ Permitir atualizações do app"
                    detail="Ative “Instalar apps desconhecidos” para este app"
                    onPress={() => Device.openSystemSettings('install')}
                  />
                )}
                <MenuButton
                  label={`Usar como tela inicial: ${config.homeEnabled ? 'SIM' : 'NÃO'}`}
                  detail="O aparelho liga direto no player (modo mais seguro)"
                  onPress={() => run('home', () => Device.setHomeEnabled(!config.homeEnabled), !config.homeEnabled ? 'Escolha “CloudiMídia Player” como tela inicial padrão.' : 'Tela inicial restaurada.')}
                />
                <MenuButton label="Recarregar exibição" onPress={() => { onReload(); onClose() }} />
                <MenuButton label={busy === 'sync' ? 'Sincronizando…' : 'Baixar mídias agora'} detail="Salva vídeos e imagens no aparelho" onPress={() => run('sync', onSyncMedia, 'Download das mídias iniciado.')} />
                <MenuButton label={busy === 'update' ? 'Procurando…' : 'Procurar atualizações'} detail="Do player e do aplicativo" onPress={() => run('update', onCheckUpdates)} />
                <MenuButton label="Trocar servidor" detail={config.serverUrl} onPress={() => setEditServer(true)} />
                <MenuButton label="Configurações de rede (Wi-Fi)" onPress={() => Device.openSystemSettings('wifi')} />
                <MenuButton label="Configurações do Android" onPress={() => Device.openSystemSettings('settings')} />
                <MenuButton danger label={confirm === 'clear' ? 'Confirmar: apagar mídias salvas' : 'Apagar mídias salvas'} onPress={() => askConfirm('clear', () => run('clear', async () => { await Device.clearMedia(); await onSyncMedia() }, 'Mídias apagadas; baixando de novo.'))} />
                <MenuButton danger label={confirm === 'unpair' ? 'Confirmar: desvincular esta TV' : 'Desvincular esta TV'} detail="Volta a mostrar o código de cadastro" onPress={() => askConfirm('unpair', () => { onUnpair(); onClose() })} />
                <MenuButton danger label={confirm === 'restart' ? 'Confirmar: reiniciar o app' : 'Reiniciar o app'} onPress={() => askConfirm('restart', () => Device.restartApp())} />
                <MenuButton danger label={confirm === 'exit' ? 'Confirmar: sair do app' : 'Sair do app'} detail="Não reabre sozinho até ligar o aparelho de novo" onPress={() => askConfirm('exit', () => Device.exitApp())} />
              </>
            )}
          </ScrollView>

          <ScrollView style={s.right}>
            {!!msg && <Text style={s.msg}>{msg}</Text>}
            {busy && busy !== 'server' && <ActivityIndicator color="#a5b4fc" style={{ marginBottom: 12 }} />}
            <Text style={s.section}>Esta TV</Text>
            <Row k="Nome" v={status.paired ? status.screenName : 'Ainda não cadastrada'} warn={!status.paired} />
            <Row k="Servidor" v={config.serverUrl} />
            <Row k="Conexão" v={serverOk == null ? 'testando…' : serverOk ? 'Conectado' : 'Sem acesso ao servidor (exibindo offline)'} warn={serverOk === false} />
            <Text style={s.section}>Aparelho</Text>
            <Row k="Rede" v={diag ? `${diag.network}${diag.wifi_signal != null ? ` (sinal ${diag.wifi_signal}/4)` : ''} · IP ${diag.ip || '—'}` : '…'} />
            <Row k="Modelo" v={diag?.model} />
            <Row k="Android" v={diag?.android} />
            <Row k="Memória livre" v={diag ? `${fmtBytes(diag.mem_free)} de ${fmtBytes(diag.mem_total)}` : '…'} warn={!!diag?.mem_low} />
            <Row k="Espaço livre" v={diag ? `${fmtBytes(diag.storage_free)} de ${fmtBytes(diag.storage_total)}` : '…'} />
            <Row k="Mídias salvas" v={diag ? `${diag.cache_files} arquivos · ${fmtBytes(diag.cache_bytes)}${Number(diag.cache_downloading) ? ` · baixando ${diag.cache_downloading}` : ''}` : '…'} />
            <Row k="Ligado há" v={diag ? fmtTime(diag.uptime) : '…'} />
            <Row k="Atualizações" v={config.needsInstallPermission ? 'Falta permissão para instalar' : 'Liberadas'} warn={config.needsInstallPermission} />
            <Row k="Abrir sozinho" v={config.autostart ? (config.canLaunchFromBackground ? 'Ativo' : 'Ativo, mas falta permissão do Android') : 'Desligado'} warn={config.autostart && !config.canLaunchFromBackground} />
            {Array.isArray(diag?.events) && diag!.events.length > 0 && (
              <>
                <Text style={s.section}>Últimos eventos</Text>
                {(diag!.events as string[]).slice(-6).reverse().map((e, i) => <Text key={i} style={s.event}>{e}</Text>)}
              </>
            )}
            <Text style={s.hint}>Abra este menu segurando OK por 2 segundos ou com a tecla MENU do controle.</Text>
          </ScrollView>
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,23,0.92)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 1180, height: '100%', maxHeight: 680, backgroundColor: '#0f172a', borderRadius: 20, borderWidth: 1, borderColor: '#312e81', overflow: 'hidden' },
  header: { paddingHorizontal: 28, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#1e293b', backgroundColor: '#1e1b4b' },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#a5b4fc', fontSize: 14, marginTop: 2 },
  body: { flex: 1, flexDirection: 'row' },
  left: { flex: 1.1, padding: 18, borderRightWidth: 1, borderRightColor: '#1e293b' },
  right: { flex: 1, padding: 22 },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginBottom: 6, backgroundColor: '#111c33', borderWidth: 2, borderColor: 'transparent' },
  btnFocus: { backgroundColor: '#4f46e5', borderColor: '#a5b4fc' },
  btnDanger: { backgroundColor: '#be123c', borderColor: '#fda4af' },
  btnText: { color: '#e2e8f0', fontSize: 17, fontWeight: '600' },
  btnTextFocus: { color: '#fff' },
  btnDetail: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  section: { color: '#818cf8', fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  row: { flexDirection: 'row', paddingVertical: 5 },
  rowKey: { width: 130, color: '#94a3b8', fontSize: 15 },
  rowVal: { flex: 1, color: '#f1f5f9', fontSize: 15, fontWeight: '600' },
  event: { color: '#cbd5e1', fontSize: 12, marginBottom: 3 },
  msg: { color: '#fde68a', fontSize: 16, fontWeight: '600', backgroundColor: '#422006', padding: 12, borderRadius: 10, marginBottom: 12 },
  hint: { color: '#64748b', fontSize: 13, marginTop: 18 },
  serverBox: { gap: 4 },
  label: { color: '#cbd5e1', fontSize: 15, marginBottom: 6 },
  input: { backgroundColor: '#fff', color: '#0f172a', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 18, marginBottom: 10 },
})
