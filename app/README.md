# CloudiMídia Player (app Android para TVs)

App React Native para TV Box Android, Google TV / Chromecast, Fire TV e aparelhos Android em geral.
Ele exibe o mesmo player do sistema web, mas com recursos que o navegador não oferece:

| Recurso | Como funciona |
|---|---|
| **Servidor padrão** | `https://cloudi.com.br/midia` (pode ser trocado no menu de manutenção) |
| **Abre sozinho ao ligar** | `BootReceiver` (ligar o aparelho e após atualizar o app). Pode ser desligado no menu ou pelo painel |
| **Reabre se fechar/travar** | Watchdog a cada ~2 min, reinício após falha, recarga da exibição se o player parar de responder |
| **Tela inicial (opcional)** | “Usar como tela inicial” transforma o app no launcher do aparelho — o modo mais confiável |
| **Funciona sem internet** | O player vem dentro do app e é servido por um servidor local (`127.0.0.1:8765`). As mídias da programação são baixadas para o aparelho; a última programação fica salva |
| **Atualizações** | O player é atualizado automaticamente a partir do servidor; o app é atualizado pelo painel (Plataforma → App da TV) |
| **Comandos remotos** | Capturar tela, reiniciar app, atualizar app/player, baixar ou apagar mídias, ligar/desligar abertura automática (além de identificar, recarregar etc.) |
| **Estatísticas** | Rede, IP, sinal do Wi-Fi, memória, espaço, mídias salvas, tempo ligado, versões e últimos eventos — enviados a cada 15 s e exibidos na página da TV |
| **Menu de manutenção** | Segurar **OK por 2 segundos** (ou tecla MENU / 5 toques na tela em aparelhos com toque) |

## Gerar o APK

Pré-requisitos (já instalados nesta máquina em `C:\android-build`): JDK 17 e Android SDK.

```bat
cd frontend && npm run build        :: gera o player em /public (é embutido no app)
cd ..\app && npm install
build-apk.cmd                       :: gera android\app\build\outputs\apk\release\app-release.apk
```

Antes de publicar uma nova versão, aumente `versionCode` e `versionName` em `android/app/build.gradle`.

### Chave de assinatura — IMPORTANTE

O APK é assinado com a chave em `C:\android-build\keystore\cloudimidia-release.jks`
(senha em `C:\android-build\keystore\LEIA-ME.txt`, configurada em `C:\android-build\gradle-home\gradle.properties`).
**Guarde uma cópia dessa pasta em local seguro.** Sem a mesma chave, o Android não aceita atualizar o app nas TVs já instaladas.

## Publicar e instalar

1. No painel: **Plataforma → App da TV → Publicar nova versão** (envie o `app-release.apk`).
2. Instalação em aparelho novo: use o link fixo `https://SEU-SERVIDOR/api/player/app/download` (no app *Downloader* do TV Box).
3. Abra o app: aparece o código para cadastrar a TV (ou use o link de instalação gerado no painel).
4. Segure OK por 2 s → **Usar como tela inicial** (recomendado) ou **Permitir que o app abra sozinho**.

As TVs já instaladas atualizam sozinhas em até 6 horas, ou na hora pelo botão **Atualizar app** na página da TV.

### Permissões no primeiro uso (feito uma única vez, no local)

Pelo menu de manutenção (segurar OK por 2 s):

| Opção do menu | Permissão do Android | Para quê |
|---|---|---|
| **Usar como tela inicial** *(recomendado)* | — | O aparelho liga direto no player. É o modo mais à prova de falhas |
| **Permitir que o app abra sozinho** | “Sobrepor a outros apps” | Abrir ao ligar e o watchdog reabrir o app (Android 10+) |
| **Permitir atualizações do app** | “Instalar apps desconhecidos” | Atualizar o app pelo painel |

- Depois de conceder “Sobrepor a outros apps”, deixe o aparelho ligado alguns minutos: o Android grava essa permissão com atraso, e desligar logo em seguida pode desfazê-la.
- Na **primeira** atualização remota, o Android pede “Atualizar este app?” na tela. Nas seguintes (Android 12+) a atualização é silenciosa, porque o próprio app passa a constar como instalador. Em aparelhos configurados com o app como *device owner*, todas são silenciosas.
- O watchdog verifica a cada ~2 minutos; um app que saiu da tela volta em até ~5 minutos.

O painel mostra, na página de cada TV, se alguma dessas permissões está faltando.

## Testado

Em emulador Android 14 (TV 1080p): cadastro por código, troca de servidor pelo menu com o controle, exibição com barra inferior, estatísticas no painel, captura de tela remota, **exibição sem internet após reiniciar o app**, abertura ao ligar o aparelho, watchdog e atualização remota do app (1.0.0 → 1.0.1).
O emulador fica em `C:\android-build\avd` (`emulator -avd cloudi_tv`).

## Desenvolvimento

```bat
npm start                 :: Metro (JS do app)
npx react-native run-android
```

Estrutura:

```
App.tsx                         orquestra WebView do player, comandos, estatísticas e atualizações
src/MaintenanceMenu.tsx         menu de manutenção (navegável pelo controle)
src/native.ts, src/server.ts    ponte com o módulo nativo e chamadas à API
android/app/src/main/java/com/cloudimidia/player/device/
  LocalServer.kt                servidor local (player + mídias salvas, com suporte a Range para vídeo)
  MediaCache.kt                 download das mídias da programação
  PlayerBundle.kt               atualização do player a partir do servidor
  Autostart.kt                  abrir ao ligar, watchdog e modo tela inicial
  ApkInstaller.kt               atualização do app
  CloudiDeviceModule.kt         métodos expostos ao React Native (diagnóstico, captura de tela…)
```
