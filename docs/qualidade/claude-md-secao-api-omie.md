# Trecho para o CLAUDE.md

Colar no `CLAUDE.md` do repositório. Substituir a seção de API Omie existente, se houver.

O mapa completo dos 148 serviços fica em `api-omie-mapa-servicos.md` — não colar aqui,
porque o `CLAUDE.md` é lido a cada sessão e serviços que o projeto não usa só gastam contexto.

---

```markdown
## API Omie

Base: `https://app.omie.com.br/api/v1/` · **somente POST** (a Omie não suporta GET) · JSON ou SOAP.
Listagens são paginadas (`pagina`, `total_de_paginas`, `registros`, `total_de_registros`).
Manter backoff exponencial para HTTP 429.

### Endpoints em uso

| Serviço | Endpoint | Uso no projeto |
|---|---|---|
| Ordens de Produção | `produtos/op/` | calendário, casamento plano×execução |
| Consulta Estoque | `estoque/consulta/` | `PosicaoEstoque` individual |
| Movimento Estoque | `estoque/movestoque/` | produção real via OPE/operação 28 |
| Locais de Estoque | `estoque/local/` | CD-DÊVI e almoxarifado |
| Pedidos de Venda | `produtos/pedido/` | fila e demanda agregada |
| Pedidos de Venda - Etapas | `produtos/pedidoetapas/` | etapa "A faturar" |
| Clientes | `geral/clientes/` | nome do cliente na fila |
| Produtos - Estrutura | `geral/malha/` | ficha técnica / explosão de insumos |
| Documentos Anexos | `geral/anexo/` | PDF da ficha de qualidade |

**`geral/malha/` mora no namespace `geral`, não em `produtos`.** É a Estrutura de Produto.

### Armadilhas confirmadas

- **`ListarPosEstoque` retorna saldo zero para matéria-prima.** Testado em três locais,
  72 itens, todos zerados — inclusive `estoqueMinimo`. Usar `PosicaoEstoque` individual.
- **`nQtdeProduzida` não é retornada em consulta de OP.** A quantidade real vem do
  movimento de estoque com origem `OPE` / operação 28, cruzado por `numPedido`.
- **Datas vêm como string `DD/MM/AAAA`.** Comparar sem parsing gera `NaN`, e
  `Math.abs(NaN) <= n` é `false` — a comparação falha em silêncio.
- **`nCodProduto` pode vir como number.** Normalizar com `String()` nos dois lados
  antes de comparar com o de-para.
- **Filtro de data em ISO retorna lista vazia**, sem erro. Usar formato brasileiro.

### Ordem de Produção — `produtos/op/`

Métodos: `IncluirOrdemProducao`, `AlterarOrdemProducao`, `ConsultarOrdemProducao`,
`ConcluirOrdemProducao`, `ExcluirOrdemProducao`, `ListarOrdemProducao`,
`ReverterOrdemProducao`, `UpsertOrdemProducao`.

- **`ConsultarOrdemProducao` devolve `itens` e `itensDetalhes`.**
  A quantidade necessária de cada insumo está em **`itensDetalhes.nQtde`**, não em `itens`.
- **`ListarOrdemProducao` aceita `lExibirItens`** — traz os itens já na listagem,
  dispensando consulta por OP.
- **`ConcluirOrdemProducao` aceita `nQtdeProduzida` e `cObsConclusao`** no mesmo chamado.
- **`UpsertOrdemProducao`** inclui ou altera conforme o `cCodIntOP` — resolve
  idempotência sem consulta prévia.
- Item com `cUtilizarDoEstoque = "S"` **não tem a estrutura exibida** na OP:
  o Omie entende que sai direto do estoque. A lista pode vir mais curta que a explosão completa.
- Campos úteis: `cNumOP` (visível, `2026/00527`), `nCodOP` (id interno),
  `outrasInf.cConcluida`, `outrasInf.dConclusao` e `hConclusao`.

### Anexos — `geral/anexo/`

Métodos: `IncluirAnexo`, `ConsultarAnexo`, `ListarAnexo`, `ObterAnexo`, `ExcluirAnexo`.

- **`cArquivo` exige o conteúdo compactado em zip e depois convertido em base64.**
  Enviar o PDF direto em base64 falha. `cMd5` é calculado sobre o conteúdo de `cArquivo`.
- **`cTabela` não é documentado.** Descobrir anexando um arquivo pela interface do ERP
  e consultando `ListarAnexo` pelo `nId`.
- `nId` é o **`nCodOP` interno**, não o número visível.
- `ObterAnexo` devolve `cLinkDownload` com data de expiração.
- Substituir versão = `ExcluirAnexo` + `IncluirAnexo`, ou reusar o mesmo `cCodIntAnexo`.

### Constantes do projeto

```
CODIGO_LOCAL_ESTOQUE_CD_DEVI = 3125334492
```

### Não usado, mas relevante

- **`estoque/ajuste/`** — Ajustes de Estoque. Onde ficam perdas, quebras e ajustes
  de inventário. Caminho para o KPI de perda de latas.
- **`estoque/resumo/`** — Resumo consolidado por produto. Vale testar se funciona
  para matéria-prima; se funcionar, substitui as 38 chamadas individuais de
  `PosicaoEstoque` por ciclo.

### Controle de lote

**Desativado por decisão consciente.** Ativá-lo exigiria informar lote em toda
movimentação — entrada de MP, consumo em OP, saída em pedido —, mudando a rotina
diária do ERP. A chave de rastreabilidade do projeto é o **número da OP**.

Perde-se rastreabilidade para trás dentro do ERP: de um lote acabado, chegar aos
lotes de insumo que entraram nele.
```
