import { useEffect, useRef, useState } from 'react'
import { useIntegrationData } from './widgets'

/*
 * Slot FutDigital: a página pronta do FutDigital (fut.digital/tv/slot.html) num iframe.
 * A página avisa o player por postMessage ({ type: 'futdigital-slot', event, ... }):
 * ready (primeira tela desenhada), empty (sem jogos), done (fim do tempo) e error (404 = slot desativado).
 * O player manda no tempo: o item dura exatamente a duração configurada, contada a partir do "ready".
 */

/** Slots fora da vez: id da integração -> até quando (ms) */
const blocked = new Map()
export const slotBlocked = (id) => (blocked.get(id) || 0) > Date.now()
const block = (id, ms) => blocked.set(id, Date.now() + ms)

const READY_TIMEOUT = 8000

export function slotUrl(config, extra = {}) {
  if (!config?.slot_url) return null
  const p = new URLSearchParams({ d: String(Math.max(5, Math.min(120, config.duration_seconds || 15))), ...extra })
  if (config.orientation && config.orientation !== 'auto') p.set('o', config.orientation)
  if (config.views?.length) p.set('v', config.views.join(','))
  if (config.per_screen) p.set('n', String(config.per_screen))
  if (config.show_qr === false) p.set('qr', '0')
  return `${config.slot_url}${config.slot_url.includes('?') ? '&' : '?'}${p}`
}

export default function FutDigitalSlotItem({ integration, fetchData, onEnd, onReady, shown, preview }) {
  const cfg = integration.config || {}
  const data = useIntegrationData(integration, fetchData)
  const frame = useRef(null)
  const [readyAt, setReadyAt] = useState(null)
  const duration = Math.max(5, Math.min(120, cfg.duration_seconds || 15))

  // Situação conhecida pelo servidor (sem gastar a inserção)
  const disabled = data?.status === 'disabled'
  const empty = data?.status === 'ok' && data.has_content === false && cfg.skip_when_empty
  useEffect(() => {
    if (preview) return
    if (disabled) {
      block(integration.id, 10 * 60000)
      onEnd({ reason: 'disabled', detail: data.message || 'Slot desativado no FutDigital' })
    } else if (empty) {
      block(integration.id, 60000)
      onEnd()
    }
  }, [disabled, empty]) // eslint-disable-line react-hooks/exhaustive-deps

  // Avisos da página
  useEffect(() => {
    const onMessage = (e) => {
      const m = e.data
      if (!m || m.type !== 'futdigital-slot' || e.source !== frame.current?.contentWindow) return
      if (m.event === 'ready') {
        if (m.has_content === false && cfg.skip_when_empty && !preview) { block(integration.id, 60000); onEnd(); return }
        setReadyAt((t) => t || Date.now())
        onReady()
      } else if (m.event === 'empty') {
        if (cfg.skip_when_empty && !preview) { block(integration.id, 60000); onEnd() }
      } else if (m.event === 'error') {
        if (preview) return
        if (Number(m.status) === 404) {
          block(integration.id, 10 * 60000)
          onEnd({ reason: 'disabled', detail: 'O slot foi desativado ou trocado no FutDigital' })
        } else {
          onEnd({ reason: 'error', detail: `A página do FutDigital falhou${m.message ? `: ${m.message}` : ''}` })
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [integration.id, cfg.skip_when_empty, preview, onEnd, onReady])

  // Sem "ready" em 8 s: pula e tenta de novo na próxima volta
  useEffect(() => {
    if (readyAt || preview) return
    const t = setTimeout(() => onEnd({ reason: 'timeout', detail: 'A página do FutDigital não respondeu em 8 s' }), READY_TIMEOUT)
    return () => clearTimeout(t)
  }, [readyAt, preview, onEnd])

  // Tempo exato da inserção, a partir do momento em que aparece
  useEffect(() => {
    if (!readyAt || !shown) return
    const t = setTimeout(() => onEnd(), duration * 1000)
    return () => clearTimeout(t)
  }, [readyAt, shown, duration, onEnd])

  const url = slotUrl(cfg, preview ? { preview: '1' } : {})
  if (!url || (!preview && (disabled || empty))) return <div className="cm-fd-slot" />
  return (
    <div className="cm-fd-slot">
      <iframe ref={frame} src={url} title="FutDigital" scrolling="no" allow="autoplay" tabIndex={-1} />
    </div>
  )
}

/**
 * Deixa a página do slot no cache do aparelho (scripts, fontes e escudos), para a entrada
 * ser imediata: abre escondida em modo prévia, que não conta exibição nem avança a sequência.
 */
export function SlotPrewarm({ integrations }) {
  const slots = Object.values(integrations || {}).filter((i) => i.type === 'futdigital_slot' && i.config?.slot_url)
  const [current, setCurrent] = useState(null)
  const key = slots.map((s) => s.config.slot_url).join('|')
  useEffect(() => {
    if (!slots.length) return
    let stop = false
    const timers = []
    const run = (i) => {
      if (stop) return
      if (i >= slots.length) { setCurrent(null); timers.push(setTimeout(() => run(0), 30 * 60000)); return }
      setCurrent(slotUrl(slots[i].config, { preview: '1', autostart: '0' }))
      timers.push(setTimeout(() => run(i + 1), 25000))
    }
    timers.push(setTimeout(() => run(0), 5000))
    return () => { stop = true; timers.forEach(clearTimeout) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!current) return null
  return <iframe src={current} title="" aria-hidden="true" tabIndex={-1} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 0, left: -10, top: -10 }} />
}
