# Sistema de Qualidade — fase 2: painel, índice e anexo na OP

**Repo:** `almadalucas10/devi-dashboard` · **Worker:** `devi-dashboard-worker`
**Referências:** `implementacao-qualidade-fase1.md` (o que está em execução) ·
`backend-qualidade.md` (especificação completa, 18 seções) ·
`api-omie-mapa-servicos.md` (mapa dos endpoints) · `painel-qualidade.html` (protótipo da TV)

Este documento é a **fase 2** — o que entra em fila assim que a fase 1 (itens 1 a 6 da ordem)
estiver rodando no chão de fábrica. Nada aqui é urgente antes disso: a fase 1 já substitui o papel.

---

## 1. O que a fase 2 entrega

| # | Entrega | Depende de | Substitui |
|---|---|---|---|
| 7 | Índice de coleta + agregado mensal no R2 | fase 1 (blocos gravando) | a aba `Indicadores` transcrita à mão |
| 8 | Painel de qualidade na TV | item 7 | a consulta manual às fichas |
| 9 | PDF da ficha → anexo na OP no Omie | verificação 2.2 (`cTabela`) | imprimir → preencher → arquivar papel |
| 10 | Observação de qualidade na OP | item 9 | transcrição manual pós-produção |

Os itens 7 e 8 são **visualização** — não mudam a captura. O item 9 é o que fecha o ciclo:
a ficha deixa de existir só no R2 e passa a ser parte do documento da OP no Omie.

---

## 2. Item 7 — Índice de coleta e agregado mensal

### 2.1 Cálculo (já definido no backend, seção 8)

```js
function indiceColeta(fichasDoMes) {
  const ind = ['pH','brix','carbonatacao','recravacao','abv'];
  const r = {};
  for (const i of ind) {
    const aplicaveis = fichasDoMes.filter(f => f.indiceColeta[i] !== undefined);
    const coletados  = aplicaveis.filter(f => f.indiceColeta[i] === true);
    r[i] = aplicaveis.length ? coletados.length / aplicaveis.length : null;
  }
  return r;
}
```

### 2.2 Agregado por mês — R2

```
qualidade/indice/2026-08.json
```

Estrutura mínima para o painel **sem ler ficha por ficha**:

```json
{
  "mes": "2026-08",
  "indiceColeta": { "pH": 0.95, "brix": 0.95, "carbonatacao": 0.80,
                    "recravacao": 0.42, "abv": 0.60 },
  "lotes": { "total": 18, "conformes": 15, "naoConformes": 2, "semDado": 1 },
  "ocorrencias": [
    { "op": "2026/00518", "sigla": "ABA", "bloco": "recravacao",
      "campo": "transpasse", "valor": 0.78,
      "spec": { "min": 0.80, "max": 0.90 }, "data": "2026-08-13" }
  ],
  "atualizadoEm": "..."
}
```

**Regra de escrita:** o agregado é recalculado a cada `PATCH /bloco/:nome` bem-sucedido
(leia o mês atual, re-agregue, grave). Recalcular 12 fichas por gravação é barato; o painel
nunca lê as fichas. Cron de reconciliação noturna opcional, se quiser blindar contra escrita perdida.

**Índice de coleta é o indicador de primeira linha do painel** — a série de ABV de 2025
(100 → 0 %) é a evidência de que sem ele visível a medição morre.

### 2.3 Endpoint

```
GET /api/qualidade/mes/2026-08   → o JSON acima
```

Já estava na fase 1 (seção 4). Aqui entra a regra do recálculo automático.

---

## 3. Item 8 — Painel de qualidade (TV)

O protótipo `painel-qualidade.html` já mostra os 6 indicadores. O que falta é a especificação
de conexão com o backend:

### 3.1 Fonte de dados

```
GET /api/qualidade/mes/:aaaa-mm   → KPIs e lista de lotes
GET /api/qualidade/fichas?data=…  → drill-down do dia (reusa o endpoint da fase 1)
```

O protótipo `painel-qualidade.html` já renderiza a partir desse payload
(dados de demonstração embutidos, com o limiar de cores abaixo).

### 3.2 Composição (do protótipo, agora com origem definida)

| Card | Valor | Origem |
|---|---|---|
| Coleta do mês | índice médio (ou por indicador) | `indiceColeta` |
| Lotes conformes | X de Y | `lotes` |
| Não-conformidades | contagem | `ocorrencias` |
| Análises vencidas | pendência do lote | `lotes` + validade da OP |

### 3.3 Regras de exibição

- **Por indicador, não só a média.** O número médio esconde a recravação a 2 %.
  Se a tela comportar, um mini-bloco por indicador (pH, Brix, carbonatação, recravação, ABV)
  com a cor do limiar da fase 1 (≥ 95 % neutro, 90–95 % âmbar, < 89 % vermelho).
- **Drill-down por toque:** tocar num lote abre a ficha correspondente
  (`GET /api/qualidade/ficha/:op`) — o painel da TV pode abrir a versão de leitura do formulário.
- **Aderência do calendário:** célula do dia com lote não-conforme ganha marcador,
  via `GET /api/qualidade/fichas?data=…` cruzado com o calendário existente.

### 3.4 Critérios de aceite

- [ ] Painel lê só o agregado mensal (nenhuma leitura de ficha individual no load)
- [ ] Índice de coleta por indicador, com cor de limiar
- [ ] Tocar num lote abre a ficha
- [ ] Marcador de não-conformidade na célula do calendário de PCP

---

## 4. Item 9 — PDF da ficha → anexo na OP

É o item que fecha o ciclo e o que mais tem armadilha. Fatos **já verificados** na documentação:

| Fato | Status |
|---|---|
| `cArquivo` exige o conteúdo **compactado (zip)** e depois **base64** — não é só base64 | ✅ confirmado na doc |
| `IncluirAnexo` em `geral/anexo/` | ✅ endpoint existe |
| `ObterAnexo` devolve `cLinkDownload` — dá para linkar o PDF no painel | ✅ confirmado |
| `ExcluirAnexo` existe — substituir versão = excluir + incluir | ✅ confirmado |
| O `cTabela` de Ordem de Produção **não está documentado** | ❌ pendente — ver 4.2 |

### 4.1 Fluxo

```
PATCH /bloco/:nome  (ficha completa, status "completa")
        ↓
Worker gera o PDF da ficha (estrutura = ficha atual, não o template antigo)
        ↓
compacta em ZIP → base64
        ↓
IncluirAnexo na OP  (cTabela = valor descoberto na verificação 2.2)
        ↓
registra o UUID/`nId` do anexo na ficha do R2   →   reabrir/substituir vira delete+insert
```

**Regra:** o PDF é gerado **uma vez**, no fechamento da ficha (último bloco gravado).
Não gerar a cada PATCH. Se a ficha for corrigida depois, regenerar e substituir o anexo
(`ExcluirAnexo` + `IncluirAnexo`), mantendo um único anexo de ficha por OP.

### 4.2 Pré-requisito — descobrir o `cTabela` (verificação 2.2 da fase 1)

1. Anexar qualquer arquivo numa OP pela interface do ERP
2. Chamar `ListarAnexo` com o `nId` daquela OP
3. O retorno traz o `cTabela` correto

```js
await omie('geral/anexo/', 'ListarAnexo', { nPagina: 1, nRegPorPagina: 50, nId: NCODOP });
```

Registrar o valor no `CLAUDE.md`. **Sem isso, o item 9 não sai do papel** — mas nada disso
bloqueia os itens 7 e 8.

### 4.3 Endpoints novos

```
POST /api/qualidade/ficha/:op/pdf        → gera PDF, anexa na OP, devolve { ok, anexoId, link? }
GET  /api/qualidade/ficha/:op/anexo      → { anexoId, linkDownload } (via ObterAnexo)
```

### 4.4 Critérios de aceite

- [ ] PDF gerado a partir da ficha (mesmo layout digital, não o template do Excel)
- [ ] Arquivo chega zipado+base64 no `IncluirAnexo`
- [ ] Anexo único por OP (substituição = excluir + incluir)
- [ ] `cLinkDownload` disponível para o painel
- [ ] `cTabela` descoberto e registrado no `CLAUDE.md`

---

## 5. Item 10 — Observação de qualidade na OP

Fatos verificados que simplificam este item:

- **`ConcluirOrdemProducao` aceita `nQtdeProduzida` + `cObsConclusao` juntos** — a quantidade
  real e a linha de sinalização de qualidade entram na própria conclusão, sem
  `AlterarOrdemProducao` separado.
- **`hConclusao`** existe no retorno da OP — dá a hora exata da conclusão (resolve a questão
  do lote antecipado que divergia no calendário).

**Proposta:** quando a ficha fecha com não-conformidade, a observação da OP recebe uma linha
padronizada — `"NC recravacao transpasse 0.78 (spec 0.80-0.90)"` — via `cObsConclusao` se a OP
for concluída na sequência, ou `AlterarOrdemProducao` se ainda estiver aberta.

Decisão a confirmar com o PCP: **a observação entra só em NC, ou em toda ficha?**
Recomendação: só em NC — linha ruidosa em toda OP dificulta a leitura do histórico.

---

## 6. Decisões que continuam abertas (nada disso bloqueia a fase 2)

| Decisão | Dono | Efeito se ficar para depois |
|---|---|---|
| Faixas de pH, Brix, carbonatação e ABV | Qualidade | campos registram sem validar (já implementado na fase 1) |
| Quantas leituras de carbonatação por lote | Qualidade | bloco já aceita N linhas dinâmicas |
| Lote sem OP: bloquear ou permitir | PCP + Qualidade | fase 1 implementa **bloquear** com exceção manual |
| Carbonatação é medida ou digitada? (mínimo histórico = 1,50 exato e σ = 0 em 6 produtos) | Qualidade | validade do indicador |
| Sinal de wi-fi na área de envase | Fábrica | decide se o formulário precisa de modo offline (PWA + fila) |
| Confirmar assimetria da faixa de altura (−0,10 / +0,05) | PCP | implementado como está, só documentar |

---

## 7. Ordem de trabalho sugerida

| # | Item | Nota |
|---|---|---|
| 1 | Terminar a fase 1 (itens 1–6) | pré-requisito de tudo |
| 2 | Verificação 2.2: descobrir o `cTabela` | custa minutos, destrava o item 9 |
| 3 | Item 7: agregado + recálculo no PATCH | pequeno, alto valor |
| 4 | Item 8: painel na TV conectado ao agregado | usa o protótipo pronto |
| 5 | Item 9: PDF + anexo | depende do passo 2 |
| 6 | Item 10: observação na OP | depois do 9 |

**Regra de parada:** se a fase 1 estiver atrasada ou a recravação ainda não for medida,
a fase 2 (7–8) pode entrar mesmo assim — o índice de coleta de 2 % na TV é exatamente
o que cria a pressão para medir.
