# Back-end de Qualidade — fichas, especificações e sincronização

**Worker:** novo ou extensão do `devi-dashboard-worker`
**Repo:** `almadalucas10/devi-dashboard`
**Complementa:** `dashboard-qualidade-arquitetura.md`

---

## 1. Princípio

**A OP não é criada no tablet.** Ela já existe no Omie — o tablet a encontra e anexa dados de qualidade a ela.

```
PCP planeja na planilha
        ↓
Alguém abre a OP no Omie        →  #527 · KFV · 4.464 un · 12/08
        ↓
Worker lê (já faz isso hoje, para o casamento do calendário)
        ↓
Tablet lista as fichas do dia
        ↓
Operador toca → cabeçalho já preenchido → digita só o que mediu
```

O passo manual de duplicar e renomear a aba do template desaparece.

---

## 2. Estrutura de dados

### 2.1 Ficha

Chave: o número da OP. Uma ficha por OP.

```json
{
  "op": "2026/00527",
  "sku": "FX001",
  "sigla": "KFV",
  "familia": "kombucha",
  "dataProducao": "2026-08-12",
  "quantidadePrevista": 4464,
  "lote": "527",
  "validade": "2027-04-12",

  "blocos": {
    "carbonatacao": [
      { "hora": "09:30", "temperatura": 4.2, "pressaoCilindro": 3.5,
        "pressaoTanque": 2.1, "registradoEm": "..." }
    ],
    "preEnvase": {
      "pH": 3.28, "brix": 4.6, "carbonatacao": 1.6,
      "responsavel": "MB", "registradoEm": "..."
    },
    "recravacao": { "altura": 2.58, "espessura": 1.06,
                    "transpasse": 0.84, "registradoEm": "..." },
    "estoque": [
      { "hora": "17:30", "quantidade": 4080, "tipo": "Lata", "responsavel": "MB" }
    ]
  },

  "naoConformidades": [
    { "bloco": "recravacao", "campo": "transpasse", "valor": 0.78,
      "spec": { "min": 0.80, "max": 0.90 } }
  ],

  "indiceColeta": { "pH": true, "brix": true, "carbonatacao": true,
                    "recravacao": true, "abv": false },
  "status": "completa",
  "atualizadoEm": "2026-08-12T16:02:11Z"
}
```

### 2.2 Armazenamento

R2, uma chave por ficha:

```
qualidade/fichas/2026/00527.json
qualidade/indice/2026-08.json      ← agregado do mês, para o painel
qualidade/spec/produtos.json
qualidade/spec/recravacao.json
```

O agregado mensal evita ler 12 fichas a cada carregamento do painel.

---

## 3. Especificações — configuráveis

**Nunca no código.** Mudam com fornecedor, revisão de processo e decisão da Qualidade.

```json
// qualidade/spec/recravacao.json
{
  "sleek269": {
    "altura":     { "min": 2.50, "alvo": 2.60, "max": 2.65 },
    "espessura":  { "min": 1.00, "alvo": 1.05, "max": 1.10 },
    "transpasse": { "min": 0.80, "alvo": 0.85, "max": 0.90 }
  }
}
```

```json
// qualidade/spec/produtos.json — preenchido em 14/08/2026
// alvo = média da planilha de indicadores · min/max = faixa observada no histórico
// Auditoria (n e σ) em spec/produtos-estatisticas.md
{
  "FX001": {
    "nome": "Komb Frutas Vermelhas",
    "familia": "kombucha",
    "pH":   { "min": 2.80, "alvo": 3.23, "max": 3.64 },
    "brix": { "min": 2.00, "alvo": 3.77, "max": 5.50 },
    "carbonatacao": { "min": 1.50, "alvo": 1.60, "max": 2.40 },
    "abv":  { "min": 0.10, "alvo": 0.53, "max": 1.82 }
  }
}
```

**Campo nulo = sem validação.** O formulário registra o valor e mostra aviso de "sem especificação cadastrada", em vez de aprovar em silêncio.

Origem dos parâmetros: `Copy of Indicadores Qualidade.xlsx` (abas `Indicadores Kombucha` e
`Indicadores Refri e Chá`). **alvo = média** dos registros, **min/max = faixa observada**.
A Qualidade pode estreitar as faixas à vontade — é só editar `produtos.json`. Avisos do
levantamento: carbonatação com σ=0 (sempre 1,50) em CH004/RF004/RF005/RTM001/RTM002/RTM003 —
parece meta copiada, não medida; e ABV só existe para kombuchas (FX*), com preenchimento parcial.

---

## 4. Endpoints

### 4.1 Listar fichas do dia

```
GET /api/qualidade/fichas?data=2026-08-13
```

```json
{ "fichas": [
  { "op": "2026/00527", "sigla": "KFV", "familia": "kombucha",
    "status": "parcial", "blocosPreenchidos": 3, "blocosTotal": 5,
    "temNaoConformidade": true }
] }
```

Deriva das OPs do Omie, não de uma lista própria. Uma OP aberta hoje aparece automaticamente.

### 4.2 Abrir ficha

```
GET /api/qualidade/ficha/2026-00527
```

Se ainda não existir, o Worker **monta o esqueleto** a partir da OP do Omie — cabeçalho preenchido, blocos vazios conforme a família.

### 4.3 Salvar bloco

```
PATCH /api/qualidade/ficha/2026-00527/bloco/recravacao
```

**Um bloco por vez.** É o ponto mais importante da API — ver seção 5.

Resposta devolve as não-conformidades detectadas, para o tablet confirmar o que já mostrou localmente:

```json
{ "ok": true,
  "naoConformidades": [
    { "campo": "transpasse", "valor": 0.78,
      "spec": { "min": 0.80, "max": 0.90 } }
  ] }
```

### 4.4 Agregado do mês

```
GET /api/qualidade/mes/2026-08
```

Alimenta o painel: índice de coleta, lotes conformes, ocorrências, vida de prateleira.

---

## 5. Salvamento progressivo — requisito, não detalhe

A ficha não é preenchida de uma vez:

| Bloco | Quando |
|---|---|
| Carbonatação | ao longo de horas |
| Pré-envase | antes do envase |
| Recravação | durante o envase |
| Estoque | fim do turno · **N envios** (mesmo padrão da carbonatação) |

**Cada bloco grava ao ser concluído.** Se o formulário exigir um "enviar" no final, uma tela que dorme ou um tablet que descarrega perde o turno inteiro — e o papel volta, com razão.

O protótipo tem um botão "Salvar" no fim porque é protótipo. Na versão real, cada bloco grava ao sair dele, com indicação visual de sincronizado.

### 5.1 Conexão instável

Chão de fábrica costuma ter wi-fi irregular. Se o formulário perder o preenchido numa queda, perde a confiança do operador na primeira semana.

**Requisito:** gravar localmente primeiro, sincronizar depois. Fila de pendências e indicador de estado:

```
✓ sincronizado    ⟳ enviando    ⚠ 2 blocos pendentes
```

Isso exige que o formulário seja instalável (PWA) e não uma página comum. **Vale medir o sinal na área de envase antes de decidir** — se a cobertura for boa, dá para simplificar.

---

## 6. Fichas sem OP

Hoje **7 lotes do mês não têm OP aberta**. Se a ficha depende da OP, esses lotes não têm onde ser registrados.

| Opção | Efeito |
|---|---|
| **Bloquear** | Sem OP, sem ficha. Cria pressão para abrir a OP antes de produzir — prática correta, e reduz o "7 sem OP" do calendário |
| **Permitir avulso** | Ficha criada a partir do lote planejado, pendente de vínculo. Mais flexível, mantém o problema |

**Recomendação: bloquear**, com exceção manual para quem tem permissão. Se a produção acontece sem OP, o registro de qualidade não é o lugar de resolver — mas é o que expõe.

Decisão do PCP e da Qualidade, não técnica.

---

## 7. Blocos por família

O `PC2` tem ao menos dois layouts diferentes (fichas 498 e 527 divergem). Em vez de duplicar planilha, o formulário monta os blocos conforme a família:

```js
const BLOCOS = {
  kombucha:  ['carbonatacao','preEnvase','recravacao','estoque'],
  refri:     ['carbonatacao','preEnvase','recravacao','estoque'],
  cha:       ['carbonatacao','preEnvase','recravacao','estoque'],
  barril:    ['preEnvase','estoque']   // sem recravação
};
```

A família vem do prefixo do SKU — o mesmo de-para já usado no calendário.

---

## 8. Índice de coleta

Calculado no fechamento de cada ficha e agregado por mês:

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

**É o indicador de primeira linha do painel.** A série de ABV em 2025 — 100 %, 70 %, 75 %, 25 %, 0 % — mostra o que acontece sem ele visível.

---

## 9. Integração com o painel de PCP

A chave é a OP, então os dois conversam nos dois sentidos:

- Célula do calendário ganha marcador quando o lote tem não-conformidade
- Painel de qualidade mostra o SKU e a data vindos da OP

Não exige duplicar dado — o vínculo já existe.

---

## 10. Ordem de implementação

| Ordem | Item |
|---|---|
| 1 | Estrutura R2 e arquivos de especificação |
| 2 | `GET /fichas` e `GET /ficha/:op` — leitura das OPs do Omie |
| 3 | `PATCH /bloco/:nome` com validação contra spec |
| 4 | Salvamento progressivo no formulário |
| 5 | Fila offline, se a medição de sinal indicar necessidade |
| 6 | Agregado mensal e painel |

---

## 11. Critérios de aceite

- [ ] Ficha criada a partir da OP do Omie, sem digitação de cabeçalho
- [ ] Lista do dia derivada das OPs, não de cadastro próprio
- [ ] Cada bloco grava independentemente
- [ ] Validação contra spec no Worker, além do formulário
- [ ] Campo de spec nulo → registra sem validar, com aviso visível
- [ ] Não-conformidades gravadas em campo próprio, não em texto livre
- [ ] Índice de coleta calculado por indicador
- [ ] Especificações em arquivo, nunca no código
- [ ] Blocos montados conforme a família do SKU
- [ ] Comportamento definido para lote sem OP
- [ ] Sinal de wi-fi medido na área de envase

---

## 12. Pendências que dependem da Qualidade e do PCP

| Item | Bloqueia |
|---|---|
| Faixas de pH, Brix, carbonatação e ABV | Toda validação de produto |
| Quantas leituras de carbonatação ocorrem | Desenho do bloco |
| Lote sem OP: bloquear ou permitir | Regra de criação de ficha |
| Confirmar se carbonatação é medida ou digitada | Validade do indicador |
| Sinal de rede na área de envase | Necessidade de modo offline |
