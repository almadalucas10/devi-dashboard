# Sistema de Qualidade — Dêvi (pacote de protótipos e specs)

Pacote recuperado da conversa de planejamento (14/08/2026) e refinado. Contém o que o
agente precisa para implementar o sistema de qualidade do dashboard (repo `devi-dashboard`).

## Protótipos (HTML, abrir no navegador)

| Arquivo | O que é |
|---|---|
| `ficha-qualidade-com-insumos.html` | Formulário do tablet — **inicia na lista de OPs abertas** (toque abre a ficha; `?op=` abre direto). Specs por SKU, recravação 1×, insumos com conferência, estoque N envios, NC e payload |
| `painel-qualidade.html` | Dashboard da TV — coleta por indicador com limiar, evolução mensal real, lotes/ocorrências/vida de prateleira, drill-down |
| `formulario-qualidade-tablet.html` | v1 (substituída) — histórico |

## Specs (fonte única — o agente implementa daqui)

| Arquivo | Conteúdo |
|---|---|
| `implementacao-qualidade-fase1.md` | Contrato de implementação — fase 1 (itens 1–6 substituem o papel) |
| `backend-qualidade.md` | Especificação completa (18 seções) |
| `fase2-painel-e-anexo.md` | Fase 2 — painel, índice, PDF/anexo na OP |
| `spec/produtos.json` | Parâmetros por SKU: pH/Brix/carbonatação/ABV — **alvo = média da planilha**, min/max = faixa observada |
| `spec/produtos-estatisticas.md` | Auditoria dos números (n, σ por SKU) |
| `spec/Especificacoes_Qualidade_para_validar.xlsx` | Planilha para a **Qualidade validar** (alvo, min/max, P5/P95, n, σ, avisos) |
| `melhorias-planilha-dashboard.md` | Pesquisa de melhorias com evidência nos dados |

## Decisões tomadas (14/08/2026)

- **Recravação: 1 medição por lote** (altura/espessura/transpasse da mesma lata)
- **Faixas de produto: alvo = média** da planilha de indicadores; min/max = faixa observada
  (revisão da Qualidade pendente — usar a planilha de validação)
- **Insumos: bloco de consulta** com conferência do operador (não bloqueia a ficha)
- **Estoque: N envios** por ficha (mesmo padrão da carbonatação), tipo livre
- **Família: derivada do SKU** (sem seletor manual)

## Integração com o worker (repo `devi-dashboard`)

Implementado em **14/08/2026** — `worker/src/qualidade.js` + rotas em `worker/src/index.js`:

- `GET /api/qualidade/fichas?data=` — OPs abertas do dia (ListarOrdemProducao, cConcluida=N) com `sku` resolvido via ListarProdutos
- `GET /api/qualidade/ficha/:op?saldo=0` — `ConsultarOrdemProducao` → `itensDetalhes` (fonte verdadeira); fallback: explosão `ESTRUTURAS` × qtd da OP; saldo do almoxarifado (PosicaoEstoque, local 3125326654) em lotes de 4 — `?saldo=0` desliga (mais rápido)

O formulário usa o endpoint quando servido pelo worker (fallback para o mock em `file://`).
**Antes de confiar:** validar com uma OP real (1) se `itensDetalhes` vem no retorno e
(2) se a lista vem "curta" (base sem explodir) — ver `formulacoes.md`.

## Como rodar os testes

```bash
cd /tmp/qatest && npm init -y && npm i jsdom xlsx
NODE_PATH=/tmp/qatest/node_modules node tools/_teste-ficha.js   # 76 testes
NODE_PATH=/tmp/qatest/node_modules node tools/_teste-painel.js  # 29 testes
NODE_PATH=/tmp/qatest/node_modules node tools/_check_produtos.js # HTML ↔ produtos.json
```

## Regenerar dados (se a planilha de indicadores mudar)

```bash
NODE_PATH=/tmp/qatest/node_modules node tools/_calc_produtos.js  # produtos.json + auditoria
NODE_PATH=/tmp/qatest/node_modules node tools/_gera_xlsx.js       # planilha de validação
```
