# Proteção por senha do dashboard

**Frontend:** Cloudflare Pages `dashboard` · repo `almadalucas10/devi-dashboard`
**Objetivo:** exigir senha para acessar o painel, sem impedir a exibição contínua na TV da produção

---

## 1. Situação atual

`dashboard-3gm.pages.dev` está publicamente acessível. Endereços `.pages.dev` são previsíveis, e quem chegar vê:

- Carteira de pedidos com nome de cliente, quantidade e valor
- Posição de estoque de produto acabado e matéria-prima
- Plano de produção do mês

É informação comercial da empresa exposta sem barreira nenhuma.

### 1.1 Por que não usar Cloudflare Access

O Cloudflare Access exige que o domínio pertença a uma **zona ativa** na conta Cloudflare. Como o `devikombucha.com` permanece no GoDaddy, com apenas um CNAME apontando para o Pages, o Access não se aplica.

A alternativa que funciona com DNS externo é um **middleware do Pages Functions**, que roda na borda do Cloudflare independentemente de quem gerencia o DNS.

---

## 2. A restrição que define o desenho

**A TV não pode pedir senha a cada carregamento.**

O painel roda num Fire TV Stick, sem teclado, exibindo continuamente. Digitar senha no controle é inviável, e uma tela de login no chão de fábrica anula o propósito do painel.

O middleware precisa aceitar **dois caminhos de entrada**:

| Quem | Como entra |
|---|---|
| Pessoas (celular, computador) | Caixa de login padrão do navegador |
| Fire TV | URL com token, uma única vez |

Ambos resultam num cookie de longa duração — depois da primeira vez, nenhum dos dois pede nada.

---

## 3. Implementação

### 3.1 Middleware

Criar `functions/_middleware.js` na raiz do repositório:

```js
const COOKIE = 'pcp_auth';

export async function onRequest({ request, env, next }) {
  const senha = env.DASH_SENHA;

  // sem senha configurada, o painel segue aberto —
  // evita derrubar o dashboard se a variável faltar
  if (!senha) return next();

  const url = new URL(request.url);
  const cookies = request.headers.get('Cookie') || '';

  if (cookies.includes(`${COOKIE}=${senha}`)) return next();

  const liberar = () => new Response(null, {
    status: 302,
    headers: {
      'Location': url.pathname,
      'Set-Cookie': `${COOKIE}=${senha}; Path=/; Max-Age=31536000; Secure; SameSite=Lax`
    }
  });

  // entrada da TV: ?k=SENHA
  if (url.searchParams.get('k') === senha) return liberar();

  // entrada por navegador: Basic Auth
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Basic ')) {
    const [, valor] = atob(auth.slice(6)).split(':');
    if (valor === senha) return liberar();
  }

  return new Response('Acesso restrito', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Dashboard PCP Dêvi"',
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}
```

**O `Location: url.pathname` é intencional** — remove o `?k=` da barra de endereço após o primeiro acesso, para a senha não ficar visível na tela da TV nem no histórico.

### 3.2 Variável de ambiente

**Workers & Pages → `dashboard` → Settings → Variables and Secrets → Add**

| Campo | Valor |
|---|---|
| Nome | `DASH_SENHA` |
| Tipo | **Secret** (não "Text") |
| Valor | a senha escolhida |

Marcar como **Secret** faz o valor deixar de ser legível no painel depois de salvo.

**Nunca colocar a senha no código.** O repositório é público.

### 3.3 Configurar a TV

Uma única vez, no navegador do Fire TV:

```
https://dashboard.devikombucha.com/?k=SUASENHA
```

O middleware grava o cookie, limpa a URL e redireciona. **Salvar o favorito depois do redirecionamento**, já sem o `?k=` — assim a senha não fica guardada no favorito.

---

## 4. O que fica de fora

**A API do Worker permanece aberta:**

```
devi-dashboard-worker.almadalucas.workers.dev/api/omie
```

Quem tiver essa URL continua baixando o JSON completo. Ela aparece no código-fonte da página, então quem passar pela senha também a obtém.

**Isso é uma escolha, não um esquecimento.** Fechar a API exige service binding ou header secreto, o que acrescenta uma peça à arquitetura e quebra o `deploy.sh`. Fica registrado como item futuro, para quando o sistema estiver estável.

---

## 5. Riscos e limitações

**A senha viaja no cookie.** Se o cookie vazar, equivale a vazar a senha. Aceitável para uso interno; não use uma senha reaproveitada de outro sistema.

**Sem usuários individuais.** É uma senha única para todos. Não há registro de quem acessou. Se isso vier a importar, o caminho é o Cloudflare Access — que exige migrar o domínio.

**Trocar a senha desconecta todo mundo**, inclusive a TV. Ao trocar, refazer o acesso com `?k=` no Fire TV.

**O `!senha` deixa o painel aberto** se a variável não estiver configurada. É deliberado: prefere-se o painel funcionando a uma fábrica sem informação por causa de variável faltando. Se preferir o inverso, trocar por um bloqueio explícito.

---

## 6. Critérios de aceite

- [ ] `functions/_middleware.js` criado na raiz do projeto
- [ ] `DASH_SENHA` cadastrada como **Secret**, não como Text
- [ ] Senha ausente do código e do repositório
- [ ] Acesso sem credencial retorna 401 com caixa de login
- [ ] Senha correta libera e grava cookie
- [ ] `?k=SENHA` libera e **remove o parâmetro da URL**
- [ ] Segundo acesso não pede nada
- [ ] Cookie com `Secure` e `SameSite=Lax`
- [ ] Fire TV configurada e exibindo sem interrupção
- [ ] Favorito da TV salvo **sem** o `?k=`
- [ ] Testado em celular, computador e Fire TV

---

## 7. Ordem de execução

| Ordem | Onde | Ação |
|---|---|---|
| 1 | Repositório | Criar `functions/_middleware.js` |
| 2 | Cloudflare | Cadastrar `DASH_SENHA` como Secret |
| 3 | Repositório | Commit e push (dispara o deploy) |
| 4 | Navegador | Confirmar que pede senha |
| 5 | Fire TV | Acessar com `?k=` e salvar o favorito |

O passo 2 antes do 3: se o deploy sair antes da variável existir, o painel fica aberto até ela ser criada — sem quebrar nada, mas sem proteção.
