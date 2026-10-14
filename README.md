# CloudMídia

Sistema web para gerenciar TVs de **mídia indoor**, **TV corporativa** e conteúdo automático (notícias, clima, resultados de jogos, cotações, avisos e música ambiente). Feito para ser operado pelo celular e vendido como SaaS: cada cliente cria a sua organização e gerencia as próprias TVs.

- **Backend:** PHP 8.1+ puro (sem dependências) + MySQL/MariaDB — `api/`
- **Painel:** React + Vite + Tailwind, responsivo (celular primeiro) — código em `frontend/`, build em `public/`
- **Player da TV:** página web que roda em qualquer navegador (Smart TV, TV Box Android, Fire TV, Chromecast com Google TV, mini PC) — `/tv`

## Funcionalidades

| Área | O que faz |
|---|---|
| **Organizações** | Um usuário pode ter várias empresas; troca rápida no topo do menu. Limites de TVs e armazenamento por organização. |
| **Equipe e permissões** | Papéis *Proprietário, Administrador, Editor, Visualizador* + **acesso a TVs específicas** (ex.: o dono do estabelecimento programa só a TV dele). Convites por link (WhatsApp/e-mail). |
| **TVs** | Cadastro por **código de 6 dígitos ou QR Code**, ligar/desligar, som, rotação (TV em pé), playlist padrão, status online em tempo real, “exibindo agora”, comandos remotos (identificar, atualizar, reiniciar), troca de aparelho, prévia ao vivo. |
| **Grupos (segmentação)** | Agrupe TVs (por local, cliente, público) e programe o grupo inteiro de uma vez. |
| **Mídias** | Fotos, vídeos e músicas. Envio em partes (arquivos grandes e 4G), miniaturas e duração geradas no navegador. |
| **Playlists** | Arrastar e soltar (funciona no toque), duração por item, preencher/mostrar inteira, som do vídeo, transições, rodapé de notícias/avisos, música ambiente, prévia. |
| **Programação (grade)** | Por dia da semana, horário (inclusive atravessando a meia-noite), período de datas e prioridade. **Campanhas intercaladas**: anúncios inseridos a cada N itens da programação. Visão em lista e grade semanal. |
| **Integrações** | Notícias (RSS — g1, Folha, BBC…), previsão do tempo (Open-Meteo), resultados de jogos (Brasileirão, Libertadores, Champions, NBA…), cotações (dólar, euro, bitcoin), relógio, avisos, página web, YouTube, música ambiente (rádio online ou biblioteca). |
| **Relatórios** | Comprovação de exibição por conteúdo, por TV e por dia; exportação CSV para enviar ao anunciante. |
| **Plataforma (superadmin)** | Lista de clientes, limites de plano, suspensão, usuários, senha temporária. |

O player continua exibindo a última programação recebida se a internet cair, troca de conteúdo sozinho conforme a grade (sem depender do servidor naquele instante) e se reinicia de madrugada para manter a TV estável.

## Instalação local (XAMPP)

1. Coloque a pasta em `C:\xampp\htdocs\cloudimidia` e inicie **Apache** e **MySQL**.
2. Crie o banco:
   ```sql
   CREATE DATABASE cloudimidia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. Copie `api/config.example.php` para `api/config.php` e ajuste o acesso ao banco (no XAMPP o padrão já funciona: `root` sem senha).
4. Acesse **http://localhost/cloudimidia** — na primeira vez aparece a **Configuração inicial**, que cria as tabelas e a conta de administrador da plataforma.

> O build do painel já está em `public/`. Só é preciso Node.js para alterar o frontend.

## Ligando uma TV

1. No navegador da TV, abra **`http://SEU-ENDERECO/cloudimidia/tv`** (ex.: `http://192.168.0.10/cloudimidia/tv` na rede local).
2. A TV mostra um código de 6 números e um QR Code.
3. No celular: **TVs → Adicionar TV**, digite o código (ou escaneie o QR Code) e dê um nome. Pronto — em segundos a TV começa a exibir.

### Cadastrar antes de instalar

Em **Adicionar TV → Cadastrar agora, instalar depois** você cria a TV (nome, local, grupos, playlist) sem o aparelho e já monta a programação. Depois, conecte de um destes jeitos:

- **Link de instalação:** envie o link gerado (WhatsApp/e-mail) para quem vai instalar; ao abri-lo no navegador da TV, ela se conecta sozinha. O link vale para uma única instalação e expira em 7 dias. Por segurança ele não é exibido de novo: na página da TV dá para gerar outro (o anterior deixa de funcionar) ou cancelar.
- **Código:** abra `/tv` na TV e, na página da TV no painel, use **Conectar com código**.

O mesmo link serve para trocar o aparelho de uma TV que já está funcionando (menu *Zona de risco*).

Dicas para TVs:
- **TV Box / Fire TV / Google TV:** use um navegador em modo quiosque (ex.: *Fully Kiosk Browser*) apontando para `/tv` e configurado para abrir ao ligar.
- **Mini PC / Raspberry Pi:** `chrome --kiosk --autoplay-policy=no-user-gesture-required http://SEU-ENDERECO/cloudimidia/tv`
- Sem a flag de autoplay, alguns navegadores só liberam o som após um clique/tecla do controle (o vídeo toca sem som até lá).

## Publicando em produção

Requisitos: Apache com `mod_rewrite` (ou equivalente), PHP 8.1+ com `pdo_mysql` e `curl`, MySQL 5.7+/MariaDB 10.3+.

1. Envie todos os arquivos **exceto** `frontend/node_modules` (a pasta `frontend/` inteira é opcional no servidor).
2. Crie `api/config.php` com os dados do banco e, de preferência, `app_url` com o endereço público (ex.: `https://tv.suaempresa.com.br`).
3. Garanta permissão de escrita em `uploads/` e `storage/`.
4. Use **HTTPS** (necessário para recursos como manter a tela ligada e para acesso pelo celular fora da rede).
5. Para enviar e-mails (recuperação de senha e convites), ative `mail_enabled` e configure o `sendmail`/SMTP do servidor. Sem isso, os links ficam em `storage/logs/mail.log` e os convites podem ser compartilhados pelo botão de WhatsApp/copiar link.
6. Em Nginx, reproduza as regras dos arquivos `.htaccess` (raiz, `api/`, `uploads/`, `storage/`).

Para vender: deixe `allow_registration => true` para que clientes criem a própria conta e ajuste `default_max_screens` / `default_max_storage_mb` (limites do plano inicial). Os limites de cada cliente podem ser alterados em **Plataforma**.

## Desenvolvimento do frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173 (painel) e http://localhost:5173/tv.html (player); /api é encaminhado ao XAMPP
npm run build   # gera ../public
```

Variável opcional `BACKEND_URL` muda o destino do proxy (padrão `http://localhost/cloudimidia`).

## Estrutura

```
api/            API REST (index.php = rotas; controllers/; lib/)
database/       schema.sql
frontend/       código do painel e do player (React)
public/         build do frontend (servido pelo Apache)
uploads/        mídias enviadas (por organização)
storage/        temporários e logs (bloqueado para acesso web)
```

### Principais rotas da API

| Rota | Uso |
|---|---|
| `POST auth/login`, `POST auth/register`, `GET auth/me` | autenticação (token Bearer) |
| `GET/POST orgs`, `GET orgs/{id}` | organizações e permissões do usuário |
| `orgs/{id}/screens`, `.../screens/pair`, `.../screens/{id}/command` | TVs, pareamento e comandos |
| `orgs/{id}/media`, `.../media/upload` | biblioteca e envio em partes |
| `orgs/{id}/playlists`, `orgs/{id}/schedules`, `orgs/{id}/integrations` | conteúdo e grade |
| `orgs/{id}/members`, `orgs/{id}/invitations` | equipe |
| `orgs/{id}/reports/plays` | comprovação de exibição |
| `player/register`, `player/poll`, `player/manifest`, `player/heartbeat` | usados pela TV (cabeçalho `X-Device-Token`) |
| `admin/*` | administração da plataforma |




O sistema da TV já faz a parte dele sozinho. O player lembra que foi cadastrado, reconecta quando a internet volta e se recupera de falhas. Falta só fazer o aparelho abrir o navegador direto no endereço /tv quando liga. Como fazer isso depende do aparelho.

TV Box Android, Google TV / Chromecast ou Fire TV (recomendado)
Use o Fully Kiosk Browser, um navegador feito para painéis e TVs. Ele está na Play Store; no Fire TV, instale pelo app Downloader.

Instale o Fully e abra.
Em Settings, ajuste:
Web Content Settings → Start URL: http://SEU-ENDERECO/cloudimidia/tv
Device Management → Launch on Boot: ligado. É isso que faz ele abrir sozinho.
Device Management → Keep Screen On: ligado.
Web Content Settings → Autoplay Videos: ligado. Libera o som sem precisar apertar o controle.
Kiosk Mode: ligado, se quiser impedir que alguém saia do app.
Reinicie o aparelho para testar. Ele deve abrir direto na programação.
Algumas funções, como o modo quiosque, estão na versão paga (licença única por aparelho, barata). Para só abrir sozinho, a versão gratuita costuma bastar.

Mini PC com Windows
Configure o Windows para entrar automaticamente sem senha (netplwiz → desmarque "exigir senha") e desative suspensão e desligamento da tela nas opções de energia.
Pressione Win + R, digite shell:startup e crie ali um atalho com este destino:

"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-session-crashed-bubble http://SEU-ENDERECO/cloudimidia/tv
Raspberry Pi (Raspberry Pi OS)
Em sudo raspi-config, ative o login automático na área de trabalho e desligue o Screen Blanking.
Edite ~/.config/labwc/autostart (versões recentes do sistema) e adicione:

chromium-browser --kiosk --noerrdialogs --disable-infobars --autoplay-policy=no-user-gesture-required http://SEU-ENDERECO/cloudimidia/tv &
Smart TV usando o navegador próprio (Samsung, LG)
O navegador dessas TVs não abre sozinho ao ligar. Há duas saídas:

Ligar um TV Box barato na entrada HDMI e seguir o primeiro método. É o caminho mais confiável e o que recomendo.
TVs da linha comercial/sinalização (Samsung Smart Signage, LG webOS Signage) têm a opção de abrir um endereço ao ligar, chamada "URL Launcher" ou semelhante.
Dicas para a TV ligar sozinha também
Volta de energia: muitas TVs têm a opção "ligar ao restaurar energia" (Power On Mode / Auto Power On). Junto com o aparelho abrindo sozinho, a TV volta ao ar depois de uma queda de luz sem ninguém mexer.
HDMI-CEC (Anynet+, SimpLink, Bravia Sync): ative na TV e no TV Box para a TV ligar junto com o aparelho.
Endereço fixo: se o servidor estiver na rede local, deixe o IP dele fixo. Se o IP mudar, todas as TVs perdem o endereço.
Não apague os dados do navegador da TV. O vínculo com o cadastro fica guardado nele. Se apagar, basta conectar de novo pelo código ou pelo link de instalação.
Se quiser ir além
Posso preparar um aplicativo Android próprio (TV Box, Google TV, Fire TV). Ele abriria sozinho ao ligar sem depender do Fully, seria instalado com um único arquivo .apk e levaria a sua marca, o que ajuda a vender o sistema. Outra opção é colocar horário de ligar e desligar a tela na grade de programação. Quer que eu faça algum dos dois?