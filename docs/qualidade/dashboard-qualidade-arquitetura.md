# Dashboard de Qualidade — proposta de arquitetura

**Empresa:** Dêvi Produções de Bebidas
**Base:** análise de `Copy_of_Indicadores_Qualidade.xlsx`, `Controle_de_Qualidade.xlsx` e `PC2_Controle_de_Fabricação_v2.xlsx`

Visão geral das três frentes. Cada uma vira um documento próprio de implementação depois.

---

## 1. O diagnóstico que orienta tudo

### 1.1 As fichas digitais estão vazias

O `PC2` tem **235 fichas de lote**, nomeadas por OP — `528 CCM`, `527 KFV`, `498 KPL`. Batem exatamente com as OPs do dashboard de PCP.

**Nenhuma tem medição preenchida.** Só o cabeçalho (lote, produto, data, validade), que vem do template. pH, Brix, carbonatação, temperatura, altura, largura e transpasse estão em branco em todas.

O fluxo real é: gerar → imprimir → preencher à mão → arquivar o papel. O que chega ao `Indicadores_Qualidade` é transcrição manual e seletiva.

### 1.2 O efeito disso é mensurável

| Indicador | Preenchimento |
|---|---|
| pH e Brix do produto | ~95 % |
| ABV | 75 % |
| **Recravação** | **2 % (kombucha) · 8 % (refri)** |

E a série do Índice de Coleta de ABV em 2025 mostra a erosão: 100 %, 70 %, "Estragado", "Estragado", 75 %, 100 %, 100 %, 75 %, 25 %, **0 %**. Ninguém decidiu parar de medir — foi se perdendo.

**Nenhum painel corrige isso.** Enquanto a captura for papel, o dashboard exibe o que alguém teve tempo de transcrever.

### 1.3 O que já existe e é valioso

- **Chave natural pronta:** a ficha se chama `527 KFV`, o dashboard mostra `#527`. O vínculo qualidade ↔ produção já existe.
- **Quase 3 anos de histórico** — 296 fermentações, 161 kombuchas, 197 refri/chá.
- **Estrutura de documentos madura:** PC04 a PC13 cobrem limpeza, temperatura, filtro, manutenção, calibração, pasteurização, ocorrência de pragas.
- **Análise de vida de prateleira:** 7 dias, 30 dias, 6 meses — na aba `Tabela de Análises Lote Interno`.

---

## 2. Frente A — Captura no tablet

**A peça que destrava as outras duas.**

### 2.1 Princípio

O operador abre o formulário pelo número da OP. O cabeçalho já vem preenchido — produto, volume previsto, data. Ele digita só o que mediu.

```
┌─────────────────────────────────┐
│  OP 527 · KFV                   │
│  Kombucha Frutas Vermelhas      │
│  12/08/2026 · 4.464 un          │
├─────────────────────────────────┤
│  ● Carbonatação        3 de 3   │
│  ● Pré-envase          ✓        │
│  ● Recravação          2 de 3   │
│  ○ Estoque                      │
└─────────────────────────────────┘
```

### 2.2 Validação no ato

É a diferença principal em relação ao papel. Ao digitar `2,72` na altura da recravação, o campo fica vermelho imediatamente — máximo 2,65. O operador remede antes de sair da máquina.

No papel, isso só apareceria semanas depois, se aparecesse.

### 2.3 Blocos do formulário

Espelham o template atual, sem reinventar:

| Bloco | Campos | Observação |
|---|---|---|
| Carbonatação | horário, temperatura, pressão cilindro, pressão tanque | **N leituras** — confirmar quantas ocorrem |
| Pré-envase | pH, Brix, carbonatação, responsável | validação contra spec |
| Recravação | 1 lata × altura, espessura, transpasse | validação contra spec |
| Estoque | data, quantidade, tipo | |

### 2.4 Recravação — decisão (14/08/2026)

**1 medição por lote** — uma lata, uma única vez, logo após o fechamento. Altura,
espessura e transpasse da mesma lata.

Isso substitui a proposta anterior de **3 latas (início/meio/fim)**, que rastreava
deriva ao longo do lote — o modo de falha típico de recravadeira de bancada — mas
custava 3× o esforço por lote. Se a prática voltar a medir mais de uma lata, o bloco
aceita múltiplas leituras sem quebrar o resto.

### 2.5 Nomenclatura

Padronizar como **altura / espessura / transpasse**. "Largura" não é o termo do setor, e hoje as duas abas usam ordem invertida — a aba Kombucha registra altura 1,06 e largura 2,60, que está trocado em relação à física da recravação.

---

## 3. Frente B — Back-end

### 3.1 Arquitetura

Mesmo desenho do PCP, que já funciona:

```
Tablet (formulário)
      │
      ▼
Cloudflare Worker  ──►  R2 (dados de qualidade)
      │
      ├──► Omie (leitura: OP, lote, SKU)
      └──► Planilha de especificações
```

Reaproveita infraestrutura, cron e padrões já estabelecidos.

### 3.2 Tabela de especificações — configurável

**Nunca embutir limites no código.** Especificação muda com fornecedor, formato e revisão de processo.

```json
{
  "recravacao": {
    "sleek269": {
      "altura":    { "min": 2.50, "alvo": 2.60, "max": 2.65 },
      "espessura": { "min": 1.00, "alvo": 1.05, "max": 1.10 },
      "transpasse":{ "min": 0.80, "alvo": 0.85, "max": 0.90 }
    }
  },
  "produto": {
    "FX001": { "pH": {"min": null, "max": null},
               "brix": {"min": null, "max": null},
               "carbonatacao": {"min": null, "max": null} }
  }
}
```

**Pendência:** as faixas de pH, Brix e carbonatação por produto **não existem em lugar nenhum** — nem nas fichas, nem nos indicadores, nem no Omie. Sem elas o painel mostra histórico, não conformidade.

Nota sobre a altura: a faixa é assimétrica (−0,10 / +0,05) enquanto as outras são simétricas. Vale confirmar se é intencional.

### 3.3 Sobre gravar na observação da OP no Omie

**Não recomendado.** Texto livre em campo de observação não é consultável nem validável, e não sustenta cálculo de índice ou carta de controle.

O vínculo já existe pelo **número da OP** — a ficha se chama `527 KFV`, o dashboard mostra `#527`. Basta usar essa chave.

### 3.4 Sobre especificações no Omie

A estrutura de produto guarda **composição** (quanto de cada insumo entra), não faixa de análise. Não há campo nativo para limite de pH ou Brix.

---

## 4. Frente C — Painel

### 4.1 O indicador de primeira linha

**Índice de coleta.** Enquanto a cobertura não for 100 %, ele vale mais que qualquer média — foi o que se perdeu com o ABV.

```
🧪 Coleta do mês        pH 100%   Brix 100%   Recrav 25%   ABV 0%
```

Um número visível cria pressão que a planilha nunca criou.

### 4.2 Painéis propostos

| Painel | Responde |
|---|---|
| **Coleta** | O que está sendo medido? |
| **Conformidade do lote** | Quantos lotes dentro de spec neste mês? |
| **Recravação** | Altura, espessura e transpasse contra os limites |
| **Carta de controle por produto** | pH e Brix ao longo dos lotes, com limites |
| **Ocorrências** | Observações registradas — hoje há 13 no total |
| **Vida de prateleira** | Análises de 7, 30 e 180 dias pendentes e vencidas |

### 4.3 O que os dados já mostram

**Variação alta dentro do mesmo produto.** Pink Lemonade oscila de 2,40 a 3,43 de pH (dp 0,25). Abacaxi de 2,80 a 3,75. Para bebida ácida, isso afeta sabor, cor e barreira microbiológica.

**Fermentação entre 17 °C e 38 °C.** Vinte e um graus de amplitude num processo biológico — explica boa parte da variação do tempo de fermentação, que vai de 1 a 22 dias.

**Nomes inconsistentes:** `Frutas Vermelhas` e `Frutas vermelhas`, `Limão` e `Limão `, `Camomila` e `camomila`. Precisa normalizar antes de agregar, senão o painel divide o mesmo produto em dois.

### 4.4 Integração com o PCP

Como a chave é a OP, os dois painéis conversam:

- O calendário do PCP mostra o lote do dia 12 concluído
- O painel de qualidade mostra que aquele lote teve recravação fora de spec

E vice-versa: um SKU que concentra não-conformidade aparece ligado aos seus lotes.

---

## 5. Ordem sugerida

| Ordem | Frente | Por quê |
|---|---|---|
| 1 | Formulário do tablet | Sem dado digital, o resto exibe vazio |
| 2 | Índice de coleta | Cria o hábito antes de sofisticar |
| 3 | Recravação com spec | Já tem limites definidos |
| 4 | Cartas de controle | Depende das faixas de pH e Brix |
| 5 | Vida de prateleira | Ciclo longo, menos urgente |

---

## 6. Pendências que dependem do PCP e da Qualidade

| Item | Bloqueia |
|---|---|
| **Faixas de pH, Brix e carbonatação por produto** | Toda classificação de conformidade |
| Quantas leituras de carbonatação ocorrem de fato | Desenho do formulário |
| Confirmar assimetria da faixa de altura | Regra de alerta |
| Decidir 3 latas × 1 medição vs. 1 lata × 3 medições | Estrutura de dados |
| Normalizar nomes de sabor | Qualquer agregação |
| Padronizar os dois templates do `PC2` | Leitura do histórico |

---

## 7. Resumo

| | |
|---|---|
| **Problema central** | Medição existe, mas fica no papel |
| **Evidência** | 235 fichas digitais, zero medições preenchidas |
| **Consequência** | Recravação registrada em 2 % dos lotes |
| **Peça que destrava** | Captura no tablet, com validação no ato |
| **Vínculo com o PCP** | Número da OP — já existe nos dois lados |
| **Maior lacuna de dado** | Faixas de especificação por produto |
