# Dashboard PCP — Comportamento Validado da API Omie

> Última atualização: 2026-08-08
> Fonte: investigação direta na documentação oficial (developer.omie.com.br e app.omie.com.br/api/v1)

---

## 1. Limitações críticas da API Omie

### `nQtdeProduzida` NÃO é retornada em consultas de OP

A API de Ordens de Produção (`/produtos/op/`) **não devolve a quantidade real produzida** em nenhum endpoint de consulta:

| Método | `nQtde` (prevista) | `nQtdeProduzida` (real) |
|---|---|---|
| `ListarOrdemProducao` | ✅ `identificacao.nQtde` | ❌ Não retorna |
| `ConsultarOrdemProducao` | ✅ `identificacao.nQtde` | ❌ Não retorna |
| `ConcluirOrdemProducao` | — | ⚠️ Só como **entrada**, nunca na resposta |

**Decisão:** Usamos `ListarOrdemProducao` com `cConcluida: "S"` e `identificacao.nQtde` como fonte do realizado para tendência e ranking. A data de conclusão (`outrasInf.dConclusao`) determina o mês.

**Trade-off:** A quantidade é a **prevista da OP**, não a efetivamente produzida. Se uma OP de 1000 latas produziu 950, mostramos 1000. Esse valor bate com os relatórios do Omie e é a melhor aproximação disponível via API.

### Vínculo Movimento ↔ OP é frágil

O `ListarMovimentoEstoque` (`/estoque/consulta/`) retorna `numPedido` como campo textual — a ligação com o `cNumOP` da OP é frágil e não garantida. A abordagem anterior (filtrar `codOrigem=OPE + operacao=28`) foi **descontinuada** por inconsistência com os relatórios oficiais.

---

## 2. Inventário de Endpoints Omie

### Produtos

| Endpoint | Método | Uso no projeto | Performance |
|---|---|---|---|
| `/geral/produtos/` | `ListarProdutos` | `construirCacheProdutos_()` | ⚠️ Pesado, paginado. Delay de 300ms entre páginas. |
| `/geral/produtos/` | `ConsultarProduto` | Fallback para SKUs fora da listagem | Individual. Delay de 400ms entre chamadas. |

### Clientes

| Endpoint | Método | Uso | Nota |
|---|---|---|---|
| `/geral/clientes/` | `ListarClientesResumido` | `construirCacheClientes_()` | ✅ Payload ~90% menor que `ListarClientes`. Retorna só `codigo_cliente`, `razao_social`, `nome_fantasia`, `cnpj_cpf`. |
| `/geral/clientes/` | `ConsultarCliente` | Fallback para cliente fora do cache | Individual, raro. |

### Pedidos

| Endpoint | Método | Uso | Nota |
|---|---|---|---|
| `/produtos/pedidoetapas/` | `ListarEtapasPedido` | `buscarFilaDePedidos()` — obtém etapas e status faturamento/cancelamento | Filtro 90 dias, ordenado por DATAHORA decrescente |
| `/produtos/pedido/` | `ListarPedidos` | `buscarFilaDePedidos()` — obtém detalhes em **lote** | ✅ Substituiu N× `ConsultarPedido`. Filtro `filtrar_por_data_de/ate`. Resposta na chave `pedido_venda_produto`. |
| `/produtos/pedido/` | `ConsultarPedido` | Fallback para pedidos não encontrados no `ListarPedidos` | Raro. Só acionado se o pedido não veio no batch. |

### Estoque

| Endpoint | Método | Uso | Nota |
|---|---|---|---|
| `/estoque/consulta/` | `ListarPosEstoque` | `buscarEstoque()` — posição de **todos** SKUs em 1 chamada | ✅ Substituiu 17× `PosicaoEstoque`. Usa `lista_produtos` com `cCodigo`. Campo `nSaldo` (não `saldo`). |
| `/estoque/consulta/` | `PosicaoEstoque` | Fallback individual | Só acionado se SKU não veio no batch. Campo `saldo` (não `nSaldo`). |
| `/estoque/movestoque/` | `ListarMovimentos` | `buscarMovimentosEstoqueSKUsAtivos_()` — movimentos para calendário | Filtro por `codigo_local_estoque`. |

### Ordens de Produção

| Endpoint | Método | Uso | Nota |
|---|---|---|---|
| `/produtos/op/` | `ListarOrdemProducao` | `buscarOPsConcluidas_()` — **fonte da verdade** para ranking/tendência | `cConcluida: "S"`, filtro `dDtConclusaoDe/Ate`. Mapa reverso `codigo_produto → SKU`. |

---

## 3. Estratégia de Rate Limit (429)

### Backoff

- **Exponencial com jitter:** 2s → 4s → 8s → 16s (+ ruído aleatório de até 1s)
- **`Retry-After`:** se o header existir na resposta 429, obedece exatamente
- **`MAX_TENTATIVAS = 5`** por chamada

### Delays entre chamadas

| Função | Delay | Onde |
|---|---|---|
| `construirCacheProdutos_` | 300ms | Entre páginas de `ListarProdutos` |
| `construirCacheProdutos_` (fallback) | 400ms | Entre chamadas de `ConsultarProduto` |
| `buscarFilaDePedidos` | 300ms | Entre páginas de `ListarPedidos` |
| `buscarOPsConcluidas_` | 300ms | Entre páginas de `ListarOrdemProducao` |
| `atualizarCacheOmieAutomatico` | 5000ms | Entre Estoque e Ranking |

### Triggers com lock anti-concorrência

| Trigger | Lock mínimo |
|---|---|
| `atualizarFilaAutomatico` | 60s |
| `atualizarEstoqueAutomatico` | 120s |
| `atualizarRankingAutomatico` | 180s |

---

## 4. Abas de Cache e Publicação CSV

| Aba | Escrita por | Publicada como | Conteúdo |
|---|---|---|---|
| `_DashboardCache` | `atualizarCacheAutomatico` | CSV_URL | KPIs, famílias, calendário |
| `_IndicadoresOmie` | `atualizarCacheOmieAutomatico` | CSV_URL_OMIE | Fila, estoque, tendência, ranking, detalheMensal |
| `_FilaOmie` | `atualizarFilaAutomatico` | Opcional | Fila de pedidos |
| `_EstoqueOmie` | `atualizarEstoqueAutomatico` | Opcional | Estoque |
| `_RankingOmie` | `atualizarRankingAutomatico` | Publicado | Tendência, ranking, detalheMensal |

---

## 5. Arquitetura de Deploy

```
Apps Script (clasp)          Cloudflare Pages (wrangler)
├── apps_script_dashboard_api.gs  →  Triggers + Web App (doGet)
├── appsscript.json                └── index.html (TV dashboard)
└── index.html (cópia, não usado)       ├── Lê CSV_URL (DashboardCache)
                                         ├── Lê CSV_URL_OMIE (IndicadoresOmie)
                                         └── Lê CSV_RANKING (RankingOmie)
```

- **Apps Script:** `clasp push` + `clasp deploy`
- **Cloudflare:** `wrangler pages deploy . --project-name=dashboard`
- **URL da TV:** `https://dashboard.almadalucas.workers.dev`

---

## 6. Mapeamento SKU ↔ Planilha PCP

| SKU Omie | Sigla Planilha | Descrição |
|---|---|---|
| CH001 | CVP | Chá Verde com Pêssego |
| CH002 | CML | Chá de Hibisco Morango e Mirtilo |
| CH003 | CCM | Chá de Camomila com Maracujá |
| CH004 | CHM | Chá Mate com Limão Siciliano |
| FX001 | KFV | Kmb Frutas Vermelhas |
| FX002 | KABX | Kmb Abacaxi e Gengibre |
| FX003 | KMIR | Kmb Maçã e Gengibre |
| FX006 | KPL | Kmb Mirtilo e Morango |
| FX007 | KMC | Kmb Pink Lemonade |
| RF001 | RLS | Refr Natural Limão Siciliano |
| RF002 | RFV | Refr Natural Frutas Vermelhas |
| RF003 | RGA | Refr Natural Guaraná & Açaí |
| RF004 | RLA | Refr Natural Uva |
| RF005 | RUV | Refr Natural Laranja |
| RTM001 | RTMLA | Refr Natural Limão Siciliano x Mônica |
| RTM002 | RTMLS | Refr Natural Uva x Mônica |
| RTM003 | RTMUV | Refr Natural Laranja x Mônica |

---

## 7. Lições Aprendidas

1. **Sempre verificar a documentação oficial dos campos de resposta.** `nQtdeProduzida` existe como parâmetro de entrada no `ConcluirOrdemProducao` mas **não** é persistida nos retornos de consulta. Assumir que existe levaria a dados quebrados.

2. **Substituir N+1 calls por batch sempre que possível.** `ListarPedidos`, `ListarPosEstoque` e `ListarOrdemProducao` reduziram ~85 chamadas para ~5.

3. **CSV publicado é a interface mais confiável.** OAuth do Google pode falhar, redirecionamentos quebram — mas o CSV publicado (link `pub?output=csv`) sempre funciona, sem autenticação.

4. **Backoff linear não resolve 429.** O Omie não documenta limites explícitos, mas o exponencial + Retry-After + delays entre páginas resolveu 100% dos casos.
