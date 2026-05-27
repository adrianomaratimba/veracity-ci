# Guia de Publicação — Google Play Store & Apple App Store

## Visão Geral

O Veracity pode ser publicado como:

- **Android** → Trusted Web Activity (TWA), um wrapper nativo que abre o PWA diretamente no Chrome. Arquivo de saída: `.aab` para upload na Play Store.
- **iOS** → Capacitor (wrapper nativo WebView). O build é feito remotamente pelo Codemagic (Mac virtual na nuvem) — nenhum Mac local é necessário.

---

## PARTE 1 — Google Play Store (TWA)

### Pré-requisitos

| Ferramenta | Versão mínima | Instalação |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| Java JDK | 17+ | https://adoptium.net |
| Android SDK | Lastest | https://developer.android.com/studio#command-tools |
| Bubblewrap CLI | lastest | `npm install -g @bubblewrap/cli` |

### Passo 1 — Criar conta de desenvolvedor Google Play

1. Acesse https://play.google.com/console e crie uma conta de desenvolvedor (taxa única de US$ 25).
2. Crie um novo aplicativo: **"Data Veracity"** → categoria **Business** → idioma **Português (Brasil)**.

### Passo 2 — Configurar o URL de produção

1. Abra `android/twa-manifest.json`.
2. Substitua `veracity.replit.app` pelo URL real de produção do seu app:
   ```json
   "host": "SEU-DOMINIO.replit.app",
   "fullScopeUrl": "https://SEU-DOMINIO.replit.app/",
   "iconUrl": "https://SEU-DOMINIO.replit.app/icon-512.png",
   "webManifestUrl": "https://SEU-DOMINIO.replit.app/manifest.json"
   ```
3. Faça o mesmo em `android/app/src/main/AndroidManifest.xml` (campo `android:host`).

### Passo 3 — Gerar o keystore de upload

```bash
keytool -genkey -v \
  -keystore upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias upload \
  -dname "CN=Data Veracity, OU=Mobile, O=Sua Empresa, L=Vitoria, ST=ES, C=BR"
```

> **Guarde o arquivo `.jks` e as senhas em local seguro — perder o keystore torna impossível atualizar o app na Play Store.**

### Passo 4 — Extrair o SHA-256 fingerprint

```bash
keytool -list -v -keystore upload-keystore.jks -alias upload
```

Copie o valor `SHA256:` (ex: `A1:B2:C3:...`).

### Passo 5 — Configurar o Digital Asset Link

1. No servidor Veracity (variável de ambiente ou diretamente no código), configure o endpoint `/.well-known/assetlinks.json` com o seu SHA-256:
   - O endpoint já está configurado no backend. Edite a variável no código em `server/routes.ts`, procure por `SHA256_FINGERPRINT_PLACEHOLDER` e substitua pelo seu fingerprint real.
   
   Formato esperado no arquivo:
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "br.com.dataveracity.app",
       "sha256_cert_fingerprints": ["A1:B2:C3:..."]
     }
   }]
   ```

2. Faça deploy do app com esse endpoint ativo.
3. Verifique: https://SEU-DOMINIO.replit.app/.well-known/assetlinks.json

### Passo 6 — Gerar os ícones Android

```bash
chmod +x scripts/generate-icons.sh
./scripts/generate-icons.sh
```

### Passo 7 — Build do AAB

```bash
export KEYSTORE_PATH=/caminho/para/upload-keystore.jks
export KEYSTORE_PASSWORD=sua_senha_keystore
export KEY_ALIAS=upload
export KEY_PASSWORD=sua_senha_key

chmod +x scripts/build-android.sh
./scripts/build-android.sh
```

O arquivo `app-release-bundle.aab` será gerado dentro de `android/`.

### Passo 8 — Upload na Play Store

1. Play Console → seu app → **Produção** → **Criar nova versão**.
2. Faça upload do arquivo `.aab`.
3. Preencha as notas da versão em português.
4. Envie para revisão.

> O tempo de revisão do Google geralmente é de 1 a 3 dias.

---

## PARTE 2 — Apple App Store (Capacitor + Codemagic)

### Pré-requisitos locais

| Ferramenta | Versão mínima | Instalação |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| Capacitor CLI | 6+ | já incluído no package.json |

> **Nenhum Mac é necessário!** O Codemagic fará o build em um Mac virtual na nuvem.

### Passo 1 — Criar conta de desenvolvedor Apple

1. Acesse https://developer.apple.com e registre-se (taxa anual de US$ 99).
2. Aceite os termos e aguarde aprovação (geralmente 24-48 horas).

### Passo 2 — Registrar o App ID

1. Apple Developer → **Certificates, Identifiers & Profiles** → **Identifiers** → `+`.
2. Selecione **App IDs** → **App**.
3. Bundle ID: `br.com.dataveracity.app` (Explicit).
4. Habilite: **Push Notifications**, **Location Services**.
5. Registre.

### Passo 3 — Criar o app no App Store Connect

1. Acesse https://appstoreconnect.apple.com.
2. **Meus Apps** → `+` → **Novo App**.
3. Plataforma: **iOS**.
4. Nome: **Data Veracity**.
5. Bundle ID: `br.com.dataveracity.app`.
6. SKU: `dataveracity-001`.
7. Idioma principal: **Português (Brasil)**.

### Passo 4 — Criar a API Key do App Store Connect

1. App Store Connect → **Usuários e Acesso** → **Chaves** → `+`.
2. Nome: `Codemagic CI`, Acesso: **Gerente**.
3. Baixe o arquivo `.p8` (só pode ser baixado uma vez!).
4. Anote o **Key ID** e o **Issuer ID**.

### Passo 5 — Criar conta no Codemagic

1. Acesse https://codemagic.io e crie uma conta (plano gratuito inclui 500 minutos/mês).
2. **Apps** → **Add application** → conecte seu repositório GitHub/GitLab.
3. Selecione **Flutter/React Native/Other** → **Other**.

### Passo 6 — Configurar certificado de distribuição no Codemagic

1. Codemagic → seu app → **Code signing** → **iOS signing**.
2. Em **Distribution certificate**, clique em **Add**.
3. Siga as instruções para criar o certificado via Codemagic (recomendado) ou importe o seu próprio.
4. Adicione o **Provisioning Profile** para `br.com.dataveracity.app` (tipo: **App Store**).

### Passo 7 — Configurar as variáveis de ambiente no Codemagic

Vá em **App Settings** → **Environment variables** e adicione (marcando como **Secure**):

| Variável | Valor |
|---|---|
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID do passo 4 |
| `APP_STORE_CONNECT_KEY_IDENTIFIER` | Key ID do passo 4 |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Conteúdo do arquivo `.p8` |

### Passo 8 — Gerar os ícones iOS

```bash
chmod +x scripts/generate-icons.sh
./scripts/generate-icons.sh
```

Isso preencherá `ios/App/App/Assets.xcassets/AppIcon.appiconset/` com todas as resoluções.

### Passo 9 — Inicializar o projeto iOS localmente (opcional)

Se quiser inicializar o projeto iOS localmente antes de enviar para o Codemagic:

```bash
# Instalar dependências do Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/ios

# Build do frontend
npm run build

# Adicionar plataforma iOS (gera a pasta ios/)
npx cap add ios

# Sincronizar assets
npx cap sync ios

# Gerar ícones
./scripts/generate-icons.sh

# Abrir Xcode (somente em Mac)
npx cap open ios
```

> Se não tiver Mac, pule direto para o Passo 10 — o Codemagic faz isso automaticamente.

### Passo 10 — Acionar o build no Codemagic

1. Codemagic → seu app → **Start new build**.
2. Selecione o workflow: **iOS App Store Build** (definido em `codemagic.yaml`).
3. Branch: `main`.
4. Clique em **Start build**.

O Codemagic irá:
- Instalar dependências Node.js
- Compilar o frontend (Vite)
- Rodar `npx cap sync ios`
- Instalar CocoaPods
- Assinar o app com os certificados configurados
- Gerar o `.ipa`
- **Enviar automaticamente para o TestFlight**

### Passo 11 — Submeter para revisão na App Store

1. App Store Connect → seu app → **TestFlight** → aguarde o build aparecer (pode demorar 5-10 min após o Codemagic terminar).
2. Teste internamente via TestFlight.
3. Quando estiver pronto: **App Store** → **Enviar para revisão**.
4. Preencha as informações de revisão (capturas de tela, descrição, etc.).

> O tempo de revisão da Apple geralmente é de 1 a 3 dias. Para apps de pesquisa/survey, certifique-se de incluir a política de privacidade.

---

## Informações do App

| Campo | Valor |
|---|---|
| Bundle ID / Package ID | `br.com.dataveracity.app` |
| Versão inicial | `1.0.0` (versionCode 1) |
| URL de produção | `https://SEU-DOMINIO.replit.app` |
| Tema primário | `#1e40af` (azul) |
| Background | `#0f172a` (navy) |
| Orientação | Portrait (retrato) |
| Idioma principal | Português (Brasil) |

---

## Dúvidas Frequentes

**P: Preciso de Mac para publicar no iOS?**
R: Não! O Codemagic fornece Macs virtuais na nuvem para o build. Você só precisa de um Mac se quiser testar localmente no Simulator.

**P: O TWA mostrará a barra de URL do Chrome?**
R: Não, desde que o Digital Asset Links esteja configurado corretamente (Passo 5 da parte Android). O app abrirá em modo tela cheia como um app nativo.

**P: Preciso republicar sempre que o app web mudar?**
R: Não! Essa é a vantagem do TWA/Capacitor: o conteúdo é servido do seu servidor web. Apenas mudanças no shell nativo (ícones, permissões, etc.) precisam de uma nova submissão às lojas.

**P: As notificações push funcionam?**
R: O app já usa Web Push (VAPID), que funciona tanto no PWA quanto no TWA Android. No iOS com Capacitor, o Web Push requer iOS 16.4+ e o usuário precisa adicionar o app à tela inicial (PWA mode) — ou configurar o `@capacitor/push-notifications` para usar APNs.
