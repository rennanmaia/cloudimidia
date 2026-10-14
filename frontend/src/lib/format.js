/** Datas da API vêm em UTC no formato "YYYY-MM-DD HH:MM:SS" */
export function parseDate(s) {
  if (!s) return null
  if (s instanceof Date) return s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00')
  return new Date(s.replace(' ', 'T') + (s.includes('Z') || s.includes('+') ? '' : 'Z'))
}

export function formatDateTime(s) {
  const d = parseDate(s)
  return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}

export function formatDate(s) {
  const d = parseDate(s)
  return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

export function timeAgo(s) {
  const d = parseDate(s)
  if (!d) return 'nunca'
  const sec = Math.round((Date.now() - d.getTime()) / 1000)
  if (sec < 45) return 'agora mesmo'
  const min = Math.round(sec / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const days = Math.round(h / 24)
  if (days < 30) return `há ${days} dia${days > 1 ? 's' : ''}`
  return formatDate(s)
}

export function formatBytes(b) {
  if (!b) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)))
  return `${(b / 1024 ** i).toFixed(i > 1 ? 1 : 0).replace('.', ',')} ${u[i]}`
}

export function formatDuration(sec) {
  sec = Math.round(sec || 0)
  if (sec < 60) return `${sec}s`
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h) return `${h}h ${String(m).padStart(2, '0')}min`
  return s ? `${m}min ${String(s).padStart(2, '0')}s` : `${m}min`
}

export const ROLE_LABELS = { owner: 'Proprietário', admin: 'Administrador', editor: 'Editor', viewer: 'Visualizador' }
export const ROLE_DESCRIPTIONS = {
  owner: 'Controle total, inclusive excluir a organização',
  admin: 'Gerencia TVs, equipe e configurações',
  editor: 'Gerencia conteúdo, playlists e programação',
  viewer: 'Apenas visualiza',
}
export const SCREEN_ROLE_LABELS = { editor: 'Pode programar', viewer: 'Só visualiza' }

export const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const DAYS_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export function describeDays(days) {
  const d = [...(days || [])].sort()
  if (d.length === 7) return 'Todos os dias'
  if (d.join() === '1,2,3,4,5') return 'Segunda a sexta'
  if (d.join() === '0,6') return 'Fins de semana'
  return d.map((x) => DAYS_SHORT[x]).join(', ')
}

export function describeTime(s) {
  if (!s.start_time || !s.end_time) return 'Dia todo'
  return `${s.start_time} às ${s.end_time}`
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
}
