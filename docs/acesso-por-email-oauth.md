# Login por e-mail @devikombucha.com (Google OAuth)

Troca do acesso por senha/aberto por **Sign in with Google** restrito ao domínio
`@devikombucha.com` em todos os projetos:
- Dashboard, painel de qualidade e portal de fichas (`devi-dashboard`)
- Portal de etiquetas (`devi-etiquetas-portal`)
- Espelho de ponto / portal do RH (`devi-espelho-worker`)

## Pré-requisito (necessário, feito no Google Cloud Console — não dá para automatizar)
É preciso criar um **Client OAuth** de tipo "Web" no **Google Cloud Console** do
domínio `@devikombucha.com` (Google Workspace) e configurar a **tela de consentimento**.

### Passo 1 — Projeto e tela de consentimento
1. Acesse https://console.cloud.google.com com a conta admin do Workspace.
2. Crie/abra um projeto (ex.: `devi-auth`).
3. **APIs & Serviços → Tela de consentimento OAuth** → External (ou Internal, se for Workspace admin).
4. Marque `devikombucha.com` como **domínio verificado** (já é Workspace).
5. Escopos: `openid`, `email`, `profile` (não-sensíveis).

### Passo 2 — Criar o Client ID
1. **APIs & Serviços → Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**.
2. **URIs de redirecionamento autorizados** (adicionar todos os que serão usados):
```
https://dashboard.devikombucha.com/oauth/callback
https://dashboard.devikombucha-*.pages.dev/oauth/callback
https://devi-etiquetas-portal.pages.dev/oauth/callback
https://devi-espelho-worker.almadalucas.workers.dev/admin/oauth/callback
# (+ o domínio pages.dev real do espelho, se houver)
```
3. Anote **Client ID** e **Client Secret**.

> ⚠️ Preencha as URIs de redirect com os domínios/hostnames que existem de verdade.
> O `GOOGLE_REDIRECT_URI` de cada projeto precisa estar entre essas URIs.

## Passo 3 — Configurar as variáveis em cada projeto

Secrets/vars que os códigos esperam:

| Variável | Dashboard/Painel/Fichas (Pages) | Portal etiquetas (Pages) | Espelho (Worker) |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | ✅ | ✅ | ✅ |
| `GOOGLE_CLIENT_SECRET` | ✅ | ✅ | ✅ |
| `GOOGLE_REDIRECT_URI` | ✅ | ✅ | ✅ (`.../admin/oauth/callback`) |
| `AUTH_SECRET` | ✅ (≥32 chars) | ✅ | ✅ |

- **Pages Functions** (`devi-dashboard`, `devi-etiquetas-portal`): as variáveis entram
  em **Settings → Variables** de cada projeto Pages (ou em `wrangler.toml` de Pages).
- **Worker** (`devi-espelho-worker`): `wrangler secret put` para
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, e `GOOGLE_REDIRECT_URI`.

## Passo 4 — Fail-safe
Enquanto `GOOGLE_CLIENT_ID` não estiver configurado, o código **não bloqueia o acesso**
(comporta-se como antes — seguro para fazer o deploy sem derrubar ninguém).
Assim que `GOOGLE_CLIENT_ID` for configurado, o login passa a exigir conta
`@devikombucha.com`.

## Notas
- O espelho **mantém** o login por senha (`ADMIN_SENHA`) como alternativa; o botão
  "Entrar com Google" aparece junto quando `GOOGLE_CLIENT_ID` está configurado.
- O domínio é validado **fail-closed**: só e-mails `@devikombucha.com` (claim `hd`)
  entram, mesmo que o Google Autentique um e-mail de outro domínio.
