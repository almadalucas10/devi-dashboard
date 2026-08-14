# Melhorias — Planilha de Indicadores e Dashboard de Qualidade

Levantamento em **14/08/2026** sobre `Copy of Indicadores Qualidade.xlsx` (7 abas, ~4.000
registros) e os protótipos do dashboard (`painel-qualidade.html`, `ficha-qualidade-com-insumos.html`).
Cada item tem o achado que o justifica — nada aqui é opinião solta.

---

## 1. Achados na planilha (com evidência)

### 1.1 Carbonatação com σ = 0 em 6 SKUs — valor parece copiado, não medido
CH004, RF004, RF005, RTM001, RTM002 e RTM003 têm **todos os registros idênticos (1,50)**.
`σ=0` em 26 linhas (ver `spec/Especificacoes_Qualidade_para_validar.xlsx`, aba Resumo).
Se o operador digita sempre 1,50, o indicador é inútil — e a faixa `1,50–1,50` em
`produtos.json` vai acusar NC em qualquer medição real diferente disso.

### 1.2 ABV só existe para kombuchas e a coleta erodiu até 0%
A coluna ABV é preenchida **só nas kombuchas** (refri/chá ficam nulos) e a coleta mensal
2025 despencou: 25 → 12 → *(Estragado)* → 75 → 100 → 100 → 75 → **25 → 0 → 75 → 0** (Dez/25).
Ninguém decidiu parar de medir — parou de ser transcrito. É o mesmo padrão que o ABV
mostrou em 2025 (índice de coleta ABV: 100 → 0 %).

### 1.3 A coleta (padronização) também caiu a zero em refri/chá
Índice de Padronização mensal — Refri/Chá: Out/25 77 % → Nov/25 **28 %** → Dez/25 **0 %**.
Kombucha: Fev/26 começa em **12,5 %** e depois volta a 100 %. A transcrição é intermitente:
quando falta tempo, a aba é a primeira a ficar para trás.

### 1.4 Faixas observadas têm outliers
Ex.: Brix de FX007 (Pink Lemonade) vai até **7,0** no histórico; pH de FX001 até 3,64.
Min/máx observados viram faixas largas. **P5–P95** dá faixa mais justa (ex.: FX001 Brix 2,95–5,0
contra 2,0–5,5 observados). A planilha de validação traz os dois para a Qualidade decidir.

### 1.5 Nomenclatura da recravação inconsistente nas abas
Aba Kombucha registra "Altura 1,06 e Largura 2,60" — trocado em relação à física
(altura ≈ 2,60 mm, espessura ≈ 1,06 mm). Decisão registrada: **altura / espessura / transpasse**,
1 medição por lote.

### 1.6 Dados órfãos fora dos 17 SKUs
Tangerina (kombucha), Refresco (Acerola/Limão), Água (Camu Camu/Limão), Chá Frutas Vermelhas
e Refri Hibiscos aparecem na planilha mas não têm SKU ativo no dashboard. Não quebram nada,
mas poluem as listas e o de-para.

---

## 2. Melhorias na planilha (priorizadas)

| # | Melhoria | Por quê | Esforço |
|---|---|---|---|
| P1 | **Validação de dados + obrigatórios** (produto/sabor por lista; células numéricas obrigatórias; bloquear texto `*`) | Elimina `*`, "Barril" e texto no lugar de número na origem | Baixo (nativo do Sheets) |
| P2 | **Definir política do ABV** — medir em toda kombucha ou tirar do índice | Série 2025 mostra que sem medição o indicador morre; hoje 25 % de coleta | Decisão |
| P3 | **Conferir carbonatação** (é medida ou digitada?) | σ=0 em 6 SKUs invalida a faixa e o índice | Decisão + medição |
| P4 | **Espelhar specs em `produtos.json`** (fonte única) | `Especificacoes_Qualidade_para_validar.xlsx` foi **gerada** de `produtos.json` — a Qualidade valida lá, o agente implementa daqui | Feito |
| P5 | **Usar P5–P95** em vez de min/máx observados nas faixas | Outliers alargam a faixa e deixam NC passar | Baixo |
| P6 | **Template novo de recravação** (1 lata × altura/espessura/transpasse) | Alinha com a decisão e com o formulário digital | Baixo |

---

## 3. Melhorias no dashboard de qualidade (priorizadas)

| # | Melhoria | Status |
|---|---|---|
| D1 | **Índice de coleta por indicador com limiar** (≥95 % neutro · 90–95 % âmbar · <90 % vermelho) | ✔ no protótipo |
| D2 | **Evolução mensal da coleta visível** (série real Jan/25–Jul/26) | ✔ agora no protótipo |
| D3 | **`semDado` explícito** — lote sem análise ≠ conforme (badge âmbar) | ✔ no protótipo |
| D4 | **Drill-down lote → ficha** (toque no lote abre a ficha) | ✔ agora no protótipo |
| D5 | **Pareto de ocorrências** por bloco/campo | Pendente — entrar com volume real de NC |
| D6 | **Marcador de NC na célula do calendário PCP** | Fase 2 (já especificado) |
| D7 | **Alerta de σ=0 / "meta copiada"** na ficha (carbonatação) | Sugerido — registrar no payload como aviso |

---

## 4. Recomendações que dependem de decisão (não bloqueiam)

- Faixas finais: **P5–P95** ou min/máx observados (planilha de validação traz ambos)
- ABV: medir sempre ou remover do índice
- Carbonatação: confirmar se é medida; enquanto não for, considerar tirar do índice de coleta
  (hoje 92 % "coletado" de um valor copiado não significa nada)
- Padronização mensal <50 % (Nov/25, Dez/25, Fev/26) → revisar rotina de transcrição antes
  de confiar em qualquer tendência

Ferramentas: `_gera_xlsx.js` regenera a planilha de validação; `_calc_produtos.js` regenera
`produtos.json` e a auditoria; `_check_produtos.js` confere HTML ↔ `produtos.json`.
