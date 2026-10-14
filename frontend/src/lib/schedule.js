/**
 * Resolução da grade de programação — compartilhada entre o player da TV e o painel.
 * Os horários das programações estão no fuso da organização.
 */
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function zonedNow(timeZone, date = new Date()) {
  let parts
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    }).formatToParts(date)
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    }).formatToParts(date)
  }
  const get = (t) => parts.find((p) => p.type === t)?.value
  const hour = get('hour') === '24' ? '00' : get('hour')
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hour}:${get('minute')}`,
    minutes: Number(hour) * 60 + Number(get('minute')),
    dow: WEEKDAYS[get('weekday')] ?? date.getDay(),
  }
}

export function scheduleMatches(s, now) {
  if (!s.is_active) return false
  if (s.start_date && now.date < s.start_date) return false
  if (s.end_date && now.date > s.end_date) return false
  const days = s.days || []
  if (!s.start_time || !s.end_time) return days.includes(now.dow)
  const t = now.time
  if (s.start_time < s.end_time) return days.includes(now.dow) && t >= s.start_time && t < s.end_time
  // Atravessa a meia-noite (ex.: 22:00 às 02:00)
  if (t >= s.start_time) return days.includes(now.dow)
  if (t < s.end_time) return days.includes((now.dow + 6) % 7)
  return false
}

/** Retorna a playlist base e as campanhas de inserção ativas agora. */
export function resolveProgram(manifest, date = new Date()) {
  const now = zonedNow(manifest?.organization?.timezone || 'America/Sao_Paulo', date)
  const playlists = manifest?.playlists || {}
  const matching = (manifest?.schedules || []).filter((s) => scheduleMatches(s, now) && playlists[s.playlist_id])
  const replace = matching
    .filter((s) => s.mode === 'replace')
    .sort((a, b) => b.priority - a.priority || b.id - a.id)[0]
  const inserts = matching.filter((s) => s.mode === 'insert').sort((a, b) => b.priority - a.priority || a.id - b.id)
  const basePlaylistId = replace ? replace.playlist_id : manifest?.default_playlist_id
  return {
    now,
    base: basePlaylistId && playlists[basePlaylistId]
      ? { playlistId: basePlaylistId, scheduleId: replace?.id ?? null, scheduleName: replace?.name ?? null }
      : null,
    inserts,
  }
}

export function programSignature(program) {
  return `${program.base?.playlistId ?? '-'}:${program.base?.scheduleId ?? '-'}|${program.inserts.map((s) => s.id).join(',')}`
}
