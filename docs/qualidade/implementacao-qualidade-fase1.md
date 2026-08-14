# Sistema de Qualidade — implementação, fase 1

**Repo:** `almadalucas10/devi-dashboard` · **Worker:** `devi-dashboard-worker`
**Referências:** `backend-qualidade.md` (especificação completa) · `api-omie-mapa-servicos.md` (endpoints)
**Protótipos:** `formulario-qualidade-tablet.html` · `painel-qualidade.html`

Este documento cobre o que pode ser construído **agora**, com os endpoints já verificados.
O que depende de decisão da Qualidade está isolado na seção 8 e não bloqueia nada.

---

## 1. O problema que estamos resolvendo

O `PC2_Controle_de_Fabricação` tem **235 fichas de lote**, nomeadas por OP — `528 CCM`, `527 KFV`.
**Nenhuma tem medição preenchida.** Só o cabeçalho, que vem do template.

O fluxo real é: gerar → imprimir → preencher à mão → arquivar o papel. O que chega aos
indicadores é transcrição manual e seletiva.

Efeito mensurável:

| Indicador | Preenchimento |
|---|---|
| pH e Brix | ~95 % |
| ABV | 75 % |
| **Recravação** | **2 % kombucha · 8 % refri** |

E a série do Índice de Coleta de ABV em 2025 mostra a erosão: 100 %, 70 %, 75 %, 25 %, **0 %**.
Ninguém decidiu parar de medir — foi se perdendo.

**A captura digital é a peça que destrava.** Nenhum painel corrige transcrição seletiva.

---

## 2. Antes de escrever código — três verificações

Cada uma custa minutos e evita retrabalho.

### 2.1 `ConsultarOrdemProducao` já traz os itens?

```js
const r = await omie('produtos/op/', 'ConsultarOrdemProducao', { nCodOP: 0 });
console.log('itens:', JSON.stringify(r.itens));
console.log('itensDetalhes:', JSON.stringify(r.itensDetalhes));
```

**A quantidade está em `itensDetalhes.nQtde`, não em `itens`.** Confirmado na documentação.

O Worker já consome esse serviço para o casamento do calendário — os arrays provavelmente
já chegam e estão sendo descartados.

### 2.2 Qual o `cTabela` para Ordem de Produção

Não está documentado. Descobrir assim:

1. Anexar qualquer arquivo numa OP pela interface do ERP
2. Chamar `ListarAnexo` com o `nId` daquela OP
3. O retorno traz o `cTabela` correto

```js
await omie('geral/anexo/', 'ListarAnexo', { nPagina: 1, nRegPorPagina: 50, nId: NCODOP });
```

Registrar o valor encontrado no `CLAUDE.md`.

### 2.3 `estoque/resumo/` funciona para matéria-prima?

Se funcionar, substitui as **38 chamadas individuais** de `PosicaoEstoque` por ciclo.
O `ListarPosEstoque` não funciona para MP — mas `estoque/resumo/` ainda não foi testado.

Ganho potencial alto, custo de teste baixo.

---

## 3. Estrutura de dados

### 3.1 Ficha — uma por OP

```json
{
  "op": "2026/00527",
  "nCodOP": 0,
  "sku": "FX001",
  "sigla": "KFV",
  "familia": "kombucha",
  "dataProducao": "2026-08-12",
  "quantidadePrevista": 4464,

  "blocos": {
    "carbonatacao": [ { "hora": "09:30", "temperatura": 4.2,
                        "pressaoCilindro": 3.5, "pressaoTanque": 2.1 } ],
    "preEnvase": { "pH": 3.28, "brix": 4.6, "carbonatacao": 1.6, "responsavel": "MB" },
    "recravacao": { "altura": 2.58, "espessura": 1.06, "transpasse": 0.84 },
    "estoque": [ { "hora": "17:30", "quantidade": 4080, "tipo": "Lata", "responsavel": "MB" } ]
  },

  "naoConformidades": [
    { "bloco": "recravacao", "campo": "transpasse", "valor": 0.78,
      "spec": { "min": 0.80, "max": 0.90 } }
  ],
  "indiceColeta": { "pH": true, "brix": true, "carbonatacao": true,
                    "recravacao": true, "abv": false },
  "status": "completa",
  "atualizadoEm": "..."
}
```

### 3.2 R2

```
qualidade/fichas/2026/00527.json
qualidade/indice/2026-08.json          agregado do mês, para o painel
qualidade/spec/recravacao.json
qualidade/spec/produtos.json
```

O agregado mensal evita ler 12 fichas a cada carregamento do painel.

### 3.3 Especificações — configuráveis, nunca no código

```json
// qualidade/spec/recravacao.json  — pronto, do fabricante
{
  "sleek269": {
    "altura":     { "min": 2.50, "alvo": 2.60, "max": 2.65 },
    "espessura":  { "min": 1.00, "alvo": 1.05, "max": 1.10 },
    "transpasse": { "min": 0.80, "alvo": 0.85, "max": 0.90 }
  }
}
```

```json
// qualidade/spec/produtos.json  — preenchido em 14/08/2026 (média da planilha)
{
  "FX001": { "nome": "Komb Frutas Vermelhas", "familia": "kombucha",
             "pH":   { "min": 2.80, "alvo": 3.23, "max": 3.64 },
             "brix": { "min": 2.00, "alvo": 3.77, "max": 5.50 },
             "carbonatacao": { "min": 1.50, "alvo": 1.60, "max": 2.40 },
             "abv":  { "min": 0.10, "alvo": 0.53, "max": 1.82 } }
}
```

**Campo nulo = registra sem validar, com aviso visível.** Não aprovar em silêncio.

Origem: `Copy of Indicadores Qualidade.xlsx` — **alvo = média**, **min/max = faixa observada**.
Auditoria (n, σ) em `spec/produtos-estatisticas.md`; a Qualidade pode estreitar faixas editando o arquivo.
Aviso: carbonatação com σ=0 (sempre 1,50) em CH004/RF004/RF005/RTM001/RTM002/RTM003 — conferir se é medida.

Nota: a faixa de altura é assimétrica (−0,10 / +0,05) enquanto as outras são simétricas.
Confirmar com o PCP se é intencional — implementar como está.

---

## 4. Endpoints do Worker

### `GET /api/qualidade/fichas?data=2026-08-13`

Deriva das OPs do Omie, não de cadastro próprio. OP aberta hoje aparece sozinha.

```json
{ "fichas": [
  { "op": "2026/00527", "nCodOP": 0, "sigla": "KFV", "familia": "kombucha",
    "status": "parcial", "blocosPreenchidos": 3, "blocosTotal": 5,
    "temNaoConformidade": true }
] }
```

### `GET /api/qualidade/ficha/:op`

Se não existir, monta o esqueleto a partir da OP: cabeçalho preenchido, blocos vazios
conforme a família, **e a lista de insumos** de `itensDetalhes`.

### `PATCH /api/qualidade/ficha/:op/bloco/:nome`

**Um bloco por vez** — ver seção 5.

Resposta devolve as não-conformidades detectadas no servidor, para o tablet confirmar
o que já mostrou localmente.

### `GET /api/qualidade/mes/:aaaa-mm`

Agregado para o painel: índice de coleta, lotes conformes, ocorrências.

---

## 5. Salvamento progressivo — requisito, não detalhe

A ficha é preenchida ao longo do turno inteiro:

| Bloco | Quando |
|---|---|
| Carbonatação | ao longo de horas |
| Pré-envase | antes do envase |
| Recravação | durante o envase |
| Estoque | fim do turno · **N envios** (mesmo padrão da carbonatação) |

**Cada bloco grava ao ser concluído.** Se o formulário exigir um "enviar" no final,
uma tela que dorme ou um tablet que descarrega perde o turno — e o papel volta, com razão.

O protótipo tem um botão "Salvar" no fim porque é protótipo.

**Antes de decidir sobre modo offline:** medir o sinal de wi-fi na área de envase.
Se for bom, o formulário pode ser uma página comum. Se for irregular, precisa de fila
local e app instalável — bastante trabalho a mais. É a variável que mais muda o escopo.

---

## 6. Blocos por família

```js
const BLOCOS = {
  kombucha: ['insumos','carbonatacao','preEnvase','recravacao','estoque'],
  refri:    ['insumos','carbonatacao','preEnvase','recravacao','estoque'],
  cha:      ['insumos','carbonatacao','preEnvase','recravacao','estoque'],
  barril:   ['insumos','preEnvase','estoque']
};
```

A família vem do prefixo do SKU — mesmo de-para do calendário.

`insumos` é bloco de **consulta**, não de preenchimento. Não entra na contagem de progresso.

---

## 7. Recravação — decisões já tomadas

**1 medição por lote** — uma lata, três dimensões (altura, espessura, transpasse),
uma única vez, logo após o fechamento. Decisão do dono em 14/08/2026.

Substitui a decisão anterior de **3 latas (início/meio/fim)**, que rastreava deriva ao
longo do lote — o modo de falha típico de recravadeira de bancada — mas custava 3× o
esforço por lote. Se no futuro quiser rastrear deriva de novo, o bloco volta a aceitar
múltiplas leituras sem quebrar o resto (mudança localizada em um campo).

A recravadeira é **de bancada, mandril único** (Uniti). Não há múltiplos cabeçotes
para rastrear.

**Nomenclatura: altura / espessura / transpasse.** "Largura" não é o termo do setor,
e as duas abas atuais usam ordem invertida — a aba Kombucha registra altura 1,06 e
largura 2,60, que está trocado em relação à física da recravação.

---

## 8. O que depende da Qualidade — não bloqueia

| Item | Efeito enquanto não houver |
|---|---|
| **Revisão das faixas de pH, Brix, carbonatação, ABV** | Faixas preenchidas da planilha (média) em 14/08/2026; revisão da Qualidade pendente — não bloqueia |
| Quantas leituras de carbonatação ocorrem | Bloco aceita N linhas dinâmicas |
| Lote sem OP: bloquear ou permitir | Implementar **bloquear**, com exceção manual |
| Confirmar se carbonatação é medida | Ver nota abaixo |

As faixas por SKU foram geradas da planilha `Copy of Indicadores Qualidade.xlsx`
(média como alvo, faixa observada como min/max) — auditoria em `spec/produtos-estatisticas.md`.
A `Especificacoes_Qualidade_para_validar.xlsx` apontava 37 produtos estáveis e 22 com alerta;
a revisão da Qualidade pode estreitar faixas editando `spec/produtos.json`.

**Nota sobre carbonatação:** em seis SKUs (CH004, RF004, RF005, RTM001, RTM002, RTM003) o
desvio-padrão é **zero** — todos os registros idênticos (1,50). Isso sugere que o valor da
meta está sendo copiado, não medido. Vale confirmar antes de confiar na faixa.

---

## 9. Ordem de implementação

| # | Item | Depende de |
|---|---|---|
| 1 | Verificações da seção 2 | — |
| 2 | Estrutura R2 + `spec/recravacao.json` | — |
| 3 | `GET /fichas` e `GET /ficha/:op` | verificação 2.1 |
| 4 | Bloco de insumos na ficha | verificação 2.1 |
| 5 | `PATCH /bloco/:nome` com validação | itens 2 e 3 |
| 6 | Formulário com salvamento progressivo | item 5 |
| 7 | Índice de coleta + agregado mensal | item 5 |
| 8 | Painel | item 7 |
| 9 | PDF + `IncluirAnexo` | verificação 2.2 |

Os itens 1 a 6 já substituem o papel. Do 7 em diante é visualização.

---

## 10. Critérios de aceite — fase 1

**Verificações**
- [ ] `itensDetalhes` confirmado no retorno de `ConsultarOrdemProducao`
- [ ] `cTabela` descoberto e registrado no `CLAUDE.md`
- [ ] `estoque/resumo/` testado para matéria-prima

**Ficha**
- [ ] Criada a partir da OP, sem digitação de cabeçalho
- [ ] Lista do dia derivada das OPs do Omie
- [ ] Blocos montados conforme a família do SKU
- [ ] Insumos lidos de `itensDetalhes.nQtde`
- [ ] Saldo do almoxarifado ao lado de cada insumo
- [ ] Bloco de insumos fora da contagem de progresso

**Gravação**
- [ ] Cada bloco grava independentemente
- [ ] Validação contra spec no Worker, além do formulário
- [ ] Spec nula → registra com aviso, nunca aprova em silêncio
- [ ] Não-conformidades em campo próprio, não em texto livre
- [ ] Recravação com 1 medição por lote (altura/espessura/transpasse)

**Geral**
- [ ] Especificações em arquivo, nunca no código
- [ ] Índice de coleta calculado por indicador
- [ ] Sinal de wi-fi medido na área de envase
- [ ] Lote sem OP: comportamento definido e implementado

---

## 11. Armadilhas da API — já confirmadas

- **`itensDetalhes`, não `itens`** — a quantidade está no segundo array
- **Zip antes do base64** no `cArquivo` do `IncluirAnexo`
- **`ListarPosEstoque` retorna zero para MP** — usar `PosicaoEstoque` individual
- **Datas em `DD/MM/AAAA`** — comparar sem parsing gera `NaN` e falha em silêncio
- **`nCodProduto` pode vir como number** — normalizar com `String()`
- **`geral/malha/`** é a Estrutura de Produto, no namespace `geral`
- **Só POST**, listagens paginadas, backoff para 429

Detalhes em `api-omie-mapa-servicos.md`.
