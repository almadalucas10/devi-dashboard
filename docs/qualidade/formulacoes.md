# Formulações por SKU — verificação (14/08/2026)

## Verificação pedida

"Comparando as formulações, falta bastante item na lista."

**Veredito: confirmado.** As receitas demo do formulário tinham 5–9 itens por SKU; a
formulação real é maior e **multinível**: a maioria das kombuchas passa pela base
`FX000` (que por sua vez tem componentes — chá verde + açúcar), por sucos `SABxx` e
pelos concentrados da família 7. O que está verificado abaixo veio da própria conversa
de planejamento (levantamento das fichas técnicas no Omie). O que está marcado como
*estimado* deve ser confirmado contra `ListarEstruturas` / `ConsultarOrdemProducao`
(`itensDetalhes`) — a fonte definitiva é a OP, não a ficha técnica.

## Fatos verificados na conversa

### Bases multinível (msg 188)

| SKU | Concentrados diretos | Subprodutos |
|---|---|---|
| FX001 | 0 | FX000, SAB04 |
| FX002 | 0 | FX000, SAB01 |
| FX006 | 0 | FX000, SAB05 |
| FX007 | 0 | FX000, SAB02, SAB03 |

`FX000` (Base Kombucha) = chá verde + açúcar *(estimado: confirmar subcomponentes)*.

### Concentrados (família 7) — 10 itens (msg 188)

| Código | Descrição | Alimenta |
|---|---|---|
| MP030 | Suco org. conc. maçã 70º Brix | FX003 |
| MP032 | Concentrado líquido de chá-mate | CH004 |
| MP034 | Suco conc. laranja | RF005, RTM003 |
| MP045 | Suco conc. uva clarificado | RF004, RTM002 |
| MPC002 | Suco conc. maçã e maracujá | CH003 |
| MPC004 | Suco conc. maçã e pêssego | CH001 |
| MPR010 | Suco conc. maçã 70 Brix | **12 SKUs ativos** |
| MPR018 | Suco conc. maçã e morango | CH002 |
| MPR021 | Suco limão conc. clarificado | **7 SKUs ativos** |
| MPR029 | Suco conc. frutas vermelhas | CH002, RF002 |

### Composição dos 38 insumos monitorados (msg 198)

17 aromas e extratos · 10 concentrados · 7 hortifruti · 2 base kombucha · 2 aditivos.
Observações: hortifruti que ficaram são **congelados/desidratados** (abacaxi orgânico e
limão siciliano orgânico saíram por serem frescos); `MP021` Gengibre é o caso a conferir
(na lista, sem indicação de congelado); `MPR002` "XINGU FRUIT" (açaí) provavelmente fica.

## Receitas no formulário (RECEITAS)

Construídas com os itens verificados acima; `*` = estimado (confirmar no Omie).

| SKU | Itens |
|---|---|
| FX001 | FX000 Base Kombucha*, SAB04 Suco Frutas Vermelhas, MP04 Morango Cong., MP03 Framboesa Cong., MP003 Amora Cong., MPR010 Conc. Maçã*, MP018 Goma, MPR013 Ácido, EMB01 Lata, EMB02 Tampa |
| FX002 | FX000 Base Kombucha*, SAB01 Suco Abacaxi, MP021 Gengibre*, MPR010 Conc. Maçã*, MPR013 Ácido, EMB01, EMB02 |
| FX003 | FX000 Base Kombucha*, MP030 Conc. Maçã, MP021 Gengibre*, MPR013 Ácido, EMB01, EMB02 |
| FX006 | FX000 Base Kombucha*, SAB05 Suco Mirtilo, MP05 Mirtilo Cong., MP04 Morango Cong., MPR010 Conc. Maçã*, EMB01, EMB02 |
| FX007 | FX000 Base Kombucha*, SAB02 Suco Limão, SAB03 Suco Maçã, MPR010 Conc. Maçã*, EMB01, EMB02 |
| CH001 | BASCH01 Base Chá Verde, MPC004 Conc. Maçã+Pêssego, MPR010 Conc. Maçã*, ARP01 Aroma Pêssego*, EMB01, EMB02 |
| CH002 | BASCH02 Base Chá Hibisco*, MPR018 Conc. Maçã+Morango, MPR029 Conc. Frutas Vermelhas, MPH02 Hibisco Desidratado*, MP04 Morango Cong., EMB01, EMB02 |
| CH003 | BASCH03 Base Chá Camomila*, MPC002 Conc. Maçã+Maracujá, MPR010 Conc. Maçã*, MPC03 Camomila Desidratada*, EMB01, EMB02 |
| CH004 | BASCH04 Base Chá Mate, MP032 Conc. Chá-Mate, MPR021 Conc. Limão, EMB01, EMB02 |
| RF001 | BASR01 Base Refrigerante*, MPR021 Conc. Limão, ARL01 Aroma Limão Siciliano*, MPR013 Ácido, MPR012 Sorbato, EMB01, EMB02 |
| RF002 | BASR01 Base Refrigerante*, MPR029 Conc. Frutas Vermelhas, MPR018 Conc. Maçã+Morango, MPR013 Ácido, MPR012 Sorbato, EMB01, EMB02 |
| RF003 | BASR01 Base Refrigerante*, MPR002 Açaí Xingu, GUA01 Extrato Guaraná*, MPR010 Conc. Maçã*, EMB01, EMB02 |
| RF004 | BASR01 Base Refrigerante*, MP045 Conc. Uva, MPR013 Ácido, EMB01, EMB02 |
| RF005 | BASR01 Base Refrigerante*, MP034 Conc. Laranja, MPR013 Ácido, EMB01, EMB02 |
| RTM001 | BASR01 Base Refrigerante*, MPR021 Conc. Limão, EMB01, EMB02 |
| RTM002 | BASR01 Base Refrigerante*, MP045 Conc. Uva, EMB01, EMB02 |
| RTM003 | BASR01 Base Refrigerante*, MP034 Conc. Laranja, EMB01, EMB02 |

## Pendência para o agente

Substituir as receitas demo por `ConsultarOrdemProducao` → `itensDetalhes` (a OP ajustada
é a fonte verdadeira; a ficha técnica não sabe de exceções por OP). O endpoint
`/api/debug/estruturas` no worker já tenta `ListarEstruturas` — falta acertar o caminho
(`geral/malha/`) e cachear a estrutura 1×/dia (msg 174).

---

## Verificação de SKU × sigla (14/08/2026)

Pedido: "confira os sku e siglas, KPL aparece como Mirtilo".

**Confirmado e corrigido no formulário.** `KPL` = **Pink Lemonade** (`FX007`), não Mirtilo.
Mapa correto (produto Omie × sigla do calendário):

| SKU | Produto (Omie) | Sigla correta |
|---|---|---|
| FX003 | Komb Maçã Gengibre | **KMÇ** (calendário usa KMÇ; KMC é a variante sem cedilha) |
| FX006 | Komb Mirtilo Morango | **KMIR** |
| FX007 | Komb Pink Lemonade | **KPL** |

**Bug no de-para do repo** — `apps_script_dashboard_api.gs` linha 1098:
`"KMIR": "FX003", "KPL": "FX006", "KMC": "FX007"` está com rotação errada
(KMIR→FX006, KPL→FX007, KMC/KMÇ→FX003). Afeta o cruzamento calendário × estoque do
dashboard (casamento plano×execução por SKU). **Corrigir no repo** (só o agente/repo
pode validar o impacto; o formulário já usa o mapa certo).

---

## Investigação a fundo (14/08/2026) — fonte definitiva encontrada

**A fonte real está no repo: `worker/src/estruturas.js`** — ficha técnica exportada do
Omie (`ListarEstruturas`), com a função `explodir(sku, qtde)` que expande até as folhas.
O formulário agora **gera os insumos explodindo essa estrutura** (mesma lógica do worker),
em vez de receitas escritas à mão. O gerador é `_gera_receitas.mjs`.

O que a estrutura revelou (e que as receitas demo erravam):

| Achado | Real (estrutura) |
|---|---|
| **Rótulo** | Códigos `R*`: `RFX001`–`RFX008`, `RCH001`–`RCH004`, `RRF001`–`RRF005`, `RRTM001`–`RRTM003`, `RAS001/002` — **1 rótulo por SKU** (entram na estrutura de todos) |
| **Sorbato** | `MPR012` está em **todos os chás e refris** (CH001–CH004, RF001–RF005, RTM001–003); **kombuchas não levam sorbato** (FX001–FX008 sem MPR012) |
| **SAB03 (Pink Lemonade)** | `SAB03 = MP04 (morango) + MP03 (framboesa)` — **não é suco de maçã**; SAB02 = MP006 (limão). Pink lemonade = limão + morango/framboesa |
| **MP05 vs MP02** | `MP05` = **chá verde** (dentro da base FX000); `MP02` = **mirtilo** (dentro de SAB05) |
| **FX000 (base)** | `FX000 = MP05 (chá verde) + PRD00338 (açúcar orgânico)` — explosão multinível confirmada |
| **Outros itens** | `EMB08` filme, `MP0` CO₂, `INS024` ribbon datador, `EMB04` lata (pack água), `MPA032` ácido ascórbico — todos entram na lista |

Com isso a lista da OP ficou com **12–17 itens por SKU** (antes 5–10), incluindo rótulo,
sorbato (onde se aplica), filme, CO₂ e os aromas/extratos. Nomes de códigos sem descrição
verificada ficam com o código + sufixo `(xxx)` — o nome completo vem da tabela de produtos
do Omie em produção.

---

## Card de insumos do dashboard — itens novos adicionados (14/08/2026)

Os **29 itens que não estavam nos 37 monitorados** do card foram adicionados a
`worker/src/insumos.js` (gerados da explosão da ficha técnica real — `_gera_insumos_monitorados.mjs`):
**embalagem/produção** (EMB01 lata, EMB02 tampa, EMB08 filme, MP0 CO₂, INS024 ribbon),
**aditivos** (MPR012 sorbato, MPR013 ácido, MPR022 conservante, MPA032 ácido ascórbico),
**aromas** (MPR009, MP006, MP09) e **os 20 rótulos `R*`** (RFX/RCH/RRF/RRTM, 1 por SKU).
O card agora cobre **as 66 folhas da estrutura** (37 + 29) — nenhuma folha fica sem
monitoramento.

- **Impacto de desempenho:** `buscarEstoqueInsumos` passou de 37 para 63 itens ×
  (ConsultarProduto + PosicaoEstoque) — o sync pesado vai demorar mais (~30–60 s).
  Se apertar, priorizar no card os de maior risco (embalagem/CO₂ são 17/17) e cachear saldo.
- **Removidos por decisão do dono (14/08/2026):** `EMB08` (filme), `MP0` (CO₂) e
  `INS024` (ribbon datador) saíram do card (`insumos.js`), do mock do formulário e do
  filtro do endpoint (`qualidade.js`) — lista final: **63 insumos**.
- **Conferir:** na estrutura, `RTM002` consome `RRTM003` e `RTM003` consome `RRTM002`
  (nomes de rótulo cruzados) — validar no Omie se é dado real ou erro de exportação.
