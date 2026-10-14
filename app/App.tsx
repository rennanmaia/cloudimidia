import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, StatusBar, StyleSheet, Text, View } from 'react-native'
import { WebView, WebViewMessageEvent } from 'react-native-webview'
import { Device, DeviceConfig, deviceEvents } from './src/native'
import { checkAppUpdate, checkPlayerUpdate, uploadScreenshot } from './src/server'
import MaintenanceMenu, { PlayerStatus } from './src/MaintenanceMenu'

/** O player responde a um "ping" a cada 30s; sem resposta por 2 min, a exibição é recarregada. */
const PING_EVERY = 30_000
const PING_TIMEOUT = 120_000
const UPDATE_EVERY = 6 * 3600_000

export default function App() {
  const [config, setConfig] = useState<DeviceConfig | null>(null)
  const [menu, setMenu] = useState(false)
  const [webKey, setWebKey] = useState(0)
  const [status, setStatus] = useState<PlayerStatus>({})
  const web = useRef<WebView>(null)
  const lastPong = useRef(Date.now())
  const mediaUrls = useRef<string[]>([])
  const refs = useRef({ config, status, menu })
  refs.current = { config, status, menu }

  const loadConfig = useCallback(async () => {
    const c = await Device.getConfig()
    setConfig(c)
    return c
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  const inject = (js: string) => web.current?.injectJavaScript(`try{${js}}catch(e){};true;`)
  const reload = useCallback(() => {
    lastPong.current = Date.now()
    setWebKey((k) => k + 1)
  }, [])

  // Menu de manutenção: tecla do controle (nativo) e botão "voltar"
  useEffect(() => {
    const sub = deviceEvents.addListener('cmOpenMenu', () => { loadConfig(); setMenu(true) })
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (refs.current.menu) setMenu(false)
      return true // nunca sai do app pelo "voltar"
    })
    return () => { sub.remove(); back.remove() }
  }, [loadConfig])

  // Estatísticas do aparelho (vão junto com o heartbeat do player) e verificação de travamento
  useEffect(() => {
    if (!config) return
    const sendDiag = async () => {
      try {
        const d = await Device.getDiagnostics()
        inject(`window.__cmNative&&window.__cmNative.diag(${JSON.stringify(d)})`)
      } catch { /* */ }
    }
    let n = 0
    const first = setTimeout(sendDiag, 5000)
    const diagTimer = setInterval(sendDiag, 60_000)
    const pingTimer = setInterval(() => {
      inject(`window.__cmNative&&window.__cmNative.ping(${++n})`)
      if (Date.now() - lastPong.current > PING_TIMEOUT) {
        Device.logEvent('Player sem resposta: recarregando a exibição')
        reload()
      }
    }, PING_EVERY)
    return () => { clearTimeout(first); clearInterval(diagTimer); clearInterval(pingTimer) }
  }, [config?.serverUrl, webKey, reload]) // eslint-disable-line react-hooks/exhaustive-deps

  const checkUpdates = useCallback(async (): Promise<string> => {
    const c = refs.current.config
    if (!c) return 'Aguarde…'
    const parts: string[] = []
    try {
      if (await checkPlayerUpdate(c.serverUrl, c.playerVersion)) {
        parts.push('Player atualizado.')
        await loadConfig()
        reload()
      } else parts.push('Player já está na versão mais recente.')
    } catch (e: any) { parts.push(`Player: ${e?.message || 'sem conexão'}`) }
    try {
      const rel = await checkAppUpdate(c.serverUrl, c.appVersionCode)
      parts.push(rel ? `Instalando o app ${rel.version_name}…` : 'App já está na versão mais recente.')
    } catch (e: any) { parts.push(`App: ${e?.message || 'sem conexão'}`) }
    return parts.join(' ')
  }, [loadConfig, reload])

  // Atualizações automáticas (player e app)
  useEffect(() => {
    if (!config) return
    const first = setTimeout(() => { checkUpdates().catch(() => {}) }, 20_000)
    const t = setInterval(() => { checkUpdates().catch(() => {}) }, UPDATE_EVERY)
    return () => { clearTimeout(first); clearInterval(t) }
  }, [config?.serverUrl, checkUpdates]) // eslint-disable-line react-hooks/exhaustive-deps

  const syncMedia = useCallback(async () => {
    if (mediaUrls.current.length) await Device.syncMedia(mediaUrls.current)
  }, [])

  /** Comandos enviados pelo painel que precisam do aparelho */
  const handleCommand = useCallback(async (command: string) => {
    const c = refs.current.config
    const token = refs.current.status.token
    try {
      switch (command) {
        case 'screenshot': {
          if (!c || !token) return
          const image = await Device.captureScreen()
          await uploadScreenshot(c.serverUrl, token, image)
          break
        }
        case 'restart_app': Device.restartApp(); break
        case 'update_app':
        case 'update_player': Device.logEvent(await checkUpdates()); break
        case 'sync_media': await syncMedia(); break
        case 'clear_media': await Device.clearMedia(); await syncMedia(); break
        case 'autostart_on': await Device.setAutostart(true); await loadConfig(); break
        case 'autostart_off': await Device.setAutostart(false); await loadConfig(); break
      }
      Device.logEvent(`Comando remoto executado: ${command}`)
    } catch (e: any) {
      Device.logEvent(`Comando ${command} falhou: ${e?.message || e}`)
    }
  }, [checkUpdates, syncMedia, loadConfig])

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let m: any
    try { m = JSON.parse(e.nativeEvent.data) } catch { return }
    switch (m?.type) {
      case 'pong':
        lastPong.current = Date.now()
        break
      case 'status':
        lastPong.current = Date.now()
        setStatus({ paired: !!m.paired, screenName: m.screenName ?? null, online: !!m.online, token: m.token ?? null, lastSeen: Date.now() })
        break
      case 'manifest':
        mediaUrls.current = Array.isArray(m.media) ? m.media : []
        Device.syncMedia(mediaUrls.current).catch(() => {})
        break
      case 'command':
        handleCommand(String(m.command))
        break
      case 'open_menu':
        loadConfig()
        setMenu(true)
        break
      case 'log':
        Device.logEvent(String(m.message || ''))
        break
    }
  }, [handleCommand, loadConfig])

  if (!config) return <View style={styles.black}><StatusBar hidden /></View>

  const base = `http://127.0.0.1:${config.localPort}`
  const runtime = {
    apiBase: `${config.serverUrl}/api/`,
    appBase: `${config.serverUrl}/`,
    cacheBase: `${base}/cache?u=`,
    native: true,
    appVersion: config.appVersion,
  }
  const showPermissionHint = status.paired === false && config.autostart && config.needsOverlayPermission && !config.homeEnabled && !menu

  return (
    <View style={styles.black}>
      <StatusBar hidden />
      <WebView
        key={`${webKey}-${config.serverUrl}`}
        ref={web}
        source={{ uri: `${base}/player/tv.html` }}
        injectedJavaScriptBeforeContentLoaded={`window.__CM_CONFIG__=${JSON.stringify(runtime)};true;`}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        originWhitelist={['*']}
        cacheEnabled
        androidLayerType="hardware"
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onError={() => setTimeout(reload, 3000)}
        onRenderProcessGone={() => { Device.logEvent('A exibição travou e foi reiniciada'); reload() }}
        style={styles.black}
      />
      {showPermissionHint && (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>
            Para a TV abrir sozinha ao ligar: segure OK por 2 segundos → “Permitir que o app abra sozinho” ou “Usar como tela inicial”.
          </Text>
        </View>
      )}
      {menu && (
        <MaintenanceMenu
          config={config}
          status={status}
          onClose={() => setMenu(false)}
          onConfigChanged={loadConfig}
          onReload={reload}
          onUnpair={() => inject('window.__cmNative&&window.__cmNative.unpair()')}
          onSyncMedia={syncMedia}
          onCheckUpdates={checkUpdates}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  hint: { position: 'absolute', left: 24, right: 24, bottom: 18, backgroundColor: 'rgba(120,53,15,0.92)', borderRadius: 12, padding: 12 },
  hintText: { color: '#fff', fontSize: 15, textAlign: 'center', fontWeight: '600' },
})
