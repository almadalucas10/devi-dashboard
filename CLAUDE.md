# Dashboard PCP — Bebidas (TV Dashboard)

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

### Deploy do Apps Script
```bash
cd C:\Users\almad\Downloads\dashboard
npm init -y && npm install @google/clasp
npx clasp push
npx clasp deploy --description "descrição das mudanças"
rm -rf node_modules package.json package-lock.json
```

### Deploy do Cloudflare
```bash
cd C:\Users\almad\Downloads\dashboard
npx wrangler pages deploy . --project-name=dashboard
```

### Testar função remotamente (se Web App configurado com `doGet`)
```
https://script.google.com/macros/s/<deployment-id>/exec?run=testarOPsConcluidas
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
