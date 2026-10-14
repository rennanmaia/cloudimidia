import { Newspaper, CloudSun, Trophy, TrendingUp, Clock, MessageSquareText, Globe, Youtube, Music } from 'lucide-react'

export const INTEGRATION_TYPES = {
  rss: { label: 'Notícias', description: 'Manchetes de portais via RSS (G1, Folha, UOL…)', icon: Newspaper, color: 'bg-rose-100 text-rose-600', defaultDuration: 40, ticker: true },
  weather: { label: 'Previsão do tempo', description: 'Clima atual e próximos dias da sua cidade', icon: CloudSun, color: 'bg-sky-100 text-sky-600', defaultDuration: 15 },
  sports: { label: 'Resultados de jogos', description: 'Placares e agenda de campeonatos', icon: Trophy, color: 'bg-emerald-100 text-emerald-600', defaultDuration: 20 },
  currency: { label: 'Cotações', description: 'Dólar, euro, bitcoin e outras moedas', icon: TrendingUp, color: 'bg-amber-100 text-amber-600', defaultDuration: 15 },
  clock: { label: 'Relógio', description: 'Data e hora em tela cheia', icon: Clock, color: 'bg-slate-200 text-slate-700', defaultDuration: 10 },
  text: { label: 'Aviso / Mensagem', description: 'Comunicados internos e mensagens (TV corporativa)', icon: MessageSquareText, color: 'bg-indigo-100 text-indigo-600', defaultDuration: 12, ticker: true },
  webpage: { label: 'Página web', description: 'Exibe um site ou painel (dashboard)', icon: Globe, color: 'bg-cyan-100 text-cyan-700', defaultDuration: 30 },
  youtube: { label: 'YouTube', description: 'Vídeo, playlist ou transmissão ao vivo', icon: Youtube, color: 'bg-red-100 text-red-600', defaultDuration: 60 },
  music: { label: 'Música ambiente', description: 'Rádio online ou músicas da sua biblioteca', icon: Music, color: 'bg-fuchsia-100 text-fuchsia-600', background: true },
}

/** Fontes de notícias prontas, por região. Várias URLs = manchetes misturadas por horário. */
export const RSS_PRESET_GROUPS = [
  {
    group: 'Santarém e região (TV Tapajós)',
    items: [
      { name: 'g1 + ge Santarém e Região', source: 'TV Tapajós', urls: ['https://g1.globo.com/rss/g1/pa/santarem-regiao/', 'https://ge.globo.com/rss/ge/pa/santarem-regiao/'] },
      { name: 'g1 Santarém e Região', source: 'g1 Santarém', urls: ['https://g1.globo.com/rss/g1/pa/santarem-regiao/'] },
      { name: 'ge Santarém e Região', source: 'ge Santarém', urls: ['https://ge.globo.com/rss/ge/pa/santarem-regiao/'] },
    ],
  },
  {
    group: 'Pará',
    items: [
      { name: 'g1 Pará', source: 'g1 Pará', urls: ['https://g1.globo.com/rss/g1/pa/para/'] },
      { name: 'ge Pará', source: 'ge Pará', urls: ['https://ge.globo.com/rss/ge/pa/'] },
      { name: 'g1 + ge Pará', source: 'g1 + ge Pará', urls: ['https://g1.globo.com/rss/g1/pa/para/', 'https://ge.globo.com/rss/ge/pa/'] },
    ],
  },
  {
    group: 'Nacionais',
    items: [
      { name: 'g1 - Últimas notícias', source: 'g1', urls: ['https://g1.globo.com/rss/g1/'] },
      { name: 'ge - Esportes', source: 'ge', urls: ['https://ge.globo.com/rss/ge/'] },
      { name: 'g1 - Economia', source: 'g1 Economia', urls: ['https://g1.globo.com/rss/g1/economia/'] },
      { name: 'g1 - Tecnologia', source: 'g1 Tecnologia', urls: ['https://g1.globo.com/rss/g1/tecnologia/'] },
      { name: 'Folha - Em cima da hora', source: 'Folha', urls: ['https://feeds.folha.uol.com.br/emcimadahora/rss091.xml'] },
      { name: 'Agência Brasil', source: 'Agência Brasil', urls: ['https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml'] },
      { name: 'BBC News Brasil', source: 'BBC Brasil', urls: ['https://feeds.bbci.co.uk/portuguese/rss.xml'] },
      { name: 'CNN Brasil', source: 'CNN Brasil', urls: ['https://www.cnnbrasil.com.br/feed/'] },
    ],
  },
]

export const CURRENCY_OPTIONS = [
  ['USD-BRL', 'Dólar'], ['EUR-BRL', 'Euro'], ['GBP-BRL', 'Libra'], ['ARS-BRL', 'Peso argentino'],
  ['BTC-BRL', 'Bitcoin'], ['ETH-BRL', 'Ethereum'], ['JPY-BRL', 'Iene'], ['CNY-BRL', 'Yuan'],
]

export function defaultDurationFor(item) {
  if (item.type === 'media') {
    if (item.kind === 'image') return 10
    return item.media?.duration ? Math.round(item.media.duration) : null
  }
  return INTEGRATION_TYPES[item.kind]?.defaultDuration ?? 15
}
