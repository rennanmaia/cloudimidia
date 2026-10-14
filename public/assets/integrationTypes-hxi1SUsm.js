import{M as i}from"./music-rfHzVfYx.js";import{c as a}from"./smartphone-pRahKwXv.js";import{C as r}from"./clock-C7m2hu23.js";import{C as s}from"./cloud-sun-B6ddmUBT.js";import{Y as n}from"./index-BuGUy1Xs.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=a("Globe",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",key:"13o1zl"}],["path",{d:"M2 12h20",key:"9i4pu4"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const c=a("MessageSquareText",[["path",{d:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",key:"1lielz"}],["path",{d:"M13 8H7",key:"14i4kc"}],["path",{d:"M17 12H7",key:"16if0g"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=a("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=a("Trophy",[["path",{d:"M6 9H4.5a2.5 2.5 0 0 1 0-5H6",key:"17hqa7"}],["path",{d:"M18 9h1.5a2.5 2.5 0 0 0 0-5H18",key:"lmptdp"}],["path",{d:"M4 22h16",key:"57wxv0"}],["path",{d:"M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22",key:"1nw9bq"}],["path",{d:"M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22",key:"1np0yb"}],["path",{d:"M18 2H6v7a6 6 0 0 0 12 0V2Z",key:"u46fv3"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=a("Youtube",[["path",{d:"M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17",key:"1q2vi4"}],["path",{d:"m10 15 5-3-5-3z",key:"1jp15x"}]]),m={rss:{label:"Notícias",description:"Manchetes de portais via RSS (G1, Folha, UOL…)",icon:n,color:"bg-rose-100 text-rose-600",defaultDuration:40,ticker:!0},weather:{label:"Previsão do tempo",description:"Clima atual e próximos dias da sua cidade",icon:s,color:"bg-sky-100 text-sky-600",defaultDuration:15},sports:{label:"Resultados de jogos",description:"Placares e agenda de campeonatos",icon:d,color:"bg-emerald-100 text-emerald-600",defaultDuration:20},currency:{label:"Cotações",description:"Dólar, euro, bitcoin e outras moedas",icon:u,color:"bg-amber-100 text-amber-600",defaultDuration:15},clock:{label:"Relógio",description:"Data e hora em tela cheia",icon:r,color:"bg-slate-200 text-slate-700",defaultDuration:10},text:{label:"Aviso / Mensagem",description:"Comunicados internos e mensagens (TV corporativa)",icon:c,color:"bg-indigo-100 text-indigo-600",defaultDuration:12,ticker:!0},webpage:{label:"Página web",description:"Exibe um site ou painel (dashboard)",icon:l,color:"bg-cyan-100 text-cyan-700",defaultDuration:30},youtube:{label:"YouTube",description:"Vídeo, playlist ou transmissão ao vivo",icon:p,color:"bg-red-100 text-red-600",defaultDuration:60},music:{label:"Música ambiente",description:"Rádio online ou músicas da sua biblioteca",icon:i,color:"bg-fuchsia-100 text-fuchsia-600",background:!0}},f=[{name:"g1 - Últimas notícias",url:"https://g1.globo.com/rss/g1/"},{name:"ge - Esportes",url:"https://ge.globo.com/rss/ge/"},{name:"g1 - Economia",url:"https://g1.globo.com/rss/g1/economia/"},{name:"g1 - Tecnologia",url:"https://g1.globo.com/rss/g1/tecnologia/"},{name:"Folha - Em cima da hora",url:"https://feeds.folha.uol.com.br/emcimadahora/rss091.xml"},{name:"Agência Brasil",url:"https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml"},{name:"BBC News Brasil",url:"https://feeds.bbci.co.uk/portuguese/rss.xml"},{name:"CNN Brasil",url:"https://www.cnnbrasil.com.br/feed/"}],x=[["USD-BRL","Dólar"],["EUR-BRL","Euro"],["GBP-BRL","Libra"],["ARS-BRL","Peso argentino"],["BTC-BRL","Bitcoin"],["ETH-BRL","Ethereum"],["JPY-BRL","Iene"],["CNY-BRL","Yuan"]];function M(e){var o,t;return e.type==="media"?e.kind==="image"?10:(o=e.media)!=null&&o.duration?Math.round(e.media.duration):null:((t=m[e.kind])==null?void 0:t.defaultDuration)??15}export{x as C,m as I,f as R,M as d};
