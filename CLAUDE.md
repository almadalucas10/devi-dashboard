# Dashboard PCP — Bebidas (TV Dashboard)

> **Repo:** https://github.com/almadalucas10/devi-dashboard

Dashboard de produção para TV, integrando Google Sheets (planejamento PCP) + Omie API (dados reais de produção, estoque e pedidos).

## Arquitetura

```
Apps Script (backend)          Cloudflare Pages (frontend)
├── apps_script_dashboard_api.gs  →  index.html (dashboard TV)
├── appsscript.json                └── https://dashboard.almadalucas.workers.dev
└── Google Sheets (dados)
      ├── Dashboard (planejado)
      ├── Produção por Lote (calendário)
      ├── Realizado Mensal por SKU
      ├── _DashboardCache (CSV publicado)
      ├── _IndicadoresOmie (CSV publicado)
      ├── _RankingOmie (CSV publicado)
      ├── _FilaOmie
      └── _EstoqueOmie
```

O backend (Apps Script) roda triggers automáticos que puxam dados do Omie e escrevem em abas ocultas da planilha. Essas abas são publicadas como CSV. O frontend (HTML estático no Cloudflare) lê os CSVs e renderiza o dashboard.

## Comandos

### Deploy automatizado (recomendado)
```bash
./deploy.sh "descrição das mudanças"
```
Faz tudo: git push, clasp push, wrangler deploy (Worker + Pages), dispara sync.

### Deploy manual por etapa
```bash
# Só Apps Script
cd /home/almadalucas/Área de trabalho/dashboard
npx clasp push

# Só Cloudflare Worker
cd worker && npx wrangler deploy

# Só Cloudflare Pages
cd .. && rm -rf node_modules package.json package-lock.json && npx wrangler pages deploy . --project-name=dashboard

# Disparar sync manual
curl -X POST https://devi-dashboard-worker.almadalucas.workers.dev/api/sync
```

### Sync manual (equivale a ?run= do Apps Script)
```bash
# Sync completo
curl -X POST https://devi-dashboard-worker.almadalucas.workers.dev/api/sync

# Ver dados
curl https://devi-dashboard-worker.almadalucas.workers.dev/api/omie
```

## Funções disponíveis no `?run=`

- `diagnosticarMaio` — quebra de produção de maio por SKU
- `testarOPsConcluidas` — totais por SKU + tendência 8 meses
- `testarFilaDePedidos` — fila de pedidos atual
- `testarEstoque` — posição de estoque dos 17 SKUs
- `atualizarRankingAutomatico` — força atualização do ranking
- `atualizarFilaAutomatico` — força atualização da fila
- `atualizarEstoqueAutomatico` — força atualização do estoque

## Endpoints Omie usados

| Endpoint | Método | Função |
|---|---|---|
| `/produtos/op/` | `ListarOrdemProducao` | Fonte da verdade para ranking/tendência (OPs concluídas) |
| `/produtos/pedido/` | `ListarPedidos` | Detalhes dos pedidos em lote |
| `/produtos/pedidoetapas/` | `ListarEtapasPedido` | Etapas e status faturamento/cancelamento |
| `/estoque/consulta/` | `ListarPosEstoque` | Posição de estoque em lote (todos SKUs) |
| `/geral/clientes/` | `ListarClientesResumido` | Cache de nomes (payload leve) |
| `/geral/produtos/` | `ListarProdutos` | Cache de produtos (codigo_produto, descricao) |

## Limitações conhecidas da API Omie

- **`nQtdeProduzida` não é retornada** em nenhum endpoint de consulta de OP. Usamos `identificacao.nQtde` (prevista) como aproximação.
- **Rate limit não documentado.** Backoff exponencial (2s→4s→8s→16s) + `Retry-After` header + delays de 300ms entre páginas resolve.
- **Vínculo movimento ↔ OP é frágil** (textual via `numPedido`). Abordagem com `ListarMovimentoEstoque` + filtro `codOrigem=OPE` foi descontinuada.

## Contexto completo

Ver `context/features.md` — documenta todas as decisões de arquitetura, mapeamentos SKU↔planilha, estratégia de rate limit, e lições aprendidas.

## Sistema de Qualidade — formulário do tablet

- **Ficha da OP** (`docs/qualidade/ficha-qualidade-com-insumos.html` + worker `/api/qualidade/*`): mostra **todos** os itens da OP (itensDetalhes) com nome/código reais resolvidos via `ConsultarProduto { codigo_produto }` e saldo de **todos** os itens via `PosicaoEstoque` (local ALMOXARIFADO `3125326654`). Critério: o operador pesa/conferência tudo que a OP consome — **não filtrar por lista monitorada** (intencional; o `itensDetalhes` só traz `nIdProdutoMalha` + `nQtde`, sem nome/código).
- **Painel de Insumos** (dashboard, `worker/src/insumos.js`): lista **curada** (~38 itens com indicador de cobertura/consumo). Critério diferente da ficha — **intencional**, não unificar.
- Saldo vem da mesma fonte nos dois (mesmo local de estoque + `PosicaoEstoque`).
- Caches de qualidade (`qualidade-ficha-*`, `qualidade-fichas`) são invalidadas automaticamente no `deploy.sh` após deploy do worker (passo 3.1).
- Debug: `GET /api/qualidade/ficha/:nCodOP?raw=1` devolve o retorno bruto do Omie.

## Anexo automático da ficha na OP (Omie)

Ao concluir a ficha, o formulário chama `POST /api/qualidade/ficha/:nCodOP` e o worker anexa o PDF da ficha na OP. Fatos verificados com o Omie (14/08/2026):

- **`cTabela` da OP = `"ordem-producao"`** (descoberto anexando um arquivo na interface e lendo com `ListarAnexo`). `nId` = `nCodOP` da OP.
- **`cArquivo` = conteúdo compactado em ZIP (método store) e convertido em base64** — não é só base64.
- **`cMd5` = MD5 da STRING base64** (do `cArquivo`), não dos bytes do zip — verificado por tentativa (`Esperado o MD5` no erro do Omie).
- `ListarAnexo` exige `cTabela` (senão erro "preenchimento obrigatório"); retorna `listaAnexos` com `nIdAnexo`.
- Substituição: `ExcluirAnexo` (por `nIdAnexo`) + `IncluirAnexo`. O worker só substitui anexos com prefixo `ficha-qualidade-` — nunca apaga arquivos anexados à mão (ex.: `TESTE.txt`).
- `ObterAnexo` devolve `cLinkDownload` (link do PDF para o painel).
- Debug da descoberta: `GET /api/qualidade/debug/anexos?nId=NCODOP&cTabela=ordem-producao`.
