# Especificações por SKU — origem dos parâmetros

Gerado em **14/08/2026** a partir de `Copy of Indicadores Qualidade.xlsx`
(abas `Indicadores Kombucha` e `Indicadores Refri e Chá`).

- **alvo = média** dos registros históricos do produto (decisão do dono)
- **min/max = faixa observada** no histórico (mínimo e máximo registrados)
- `produtos.json` guarda só `{min, alvo, max}`; esta tabela é a auditoria (n e σ)
- Produtos sem registro na planilha ficam com `null` → o formulário registra sem validar

| SKU | Produto | Indicador: n · média (min–max) · σ |
|---|---|---|
| CH001 | Chá Verde Pêssego | pH: n=14 med=3.25 (3.09–3.6) σ=0.12 brix: n=14 med=5.34 (3.9–6) σ=0.77 carbonatacao: n=18 med=1.54 (1.5–1.7) σ=0.09 |
| CH002 | Chá Hibisco Morango | pH: n=27 med=3.18 (2.9–3.5) σ=0.14 brix: n=27 med=5.93 (4–7.3) σ=0.84 carbonatacao: n=29 med=1.57 (1.5–2) σ=0.12 |
| CH003 | Chá Camomila Maracujá | pH: n=9 med=2.91 (2.8–3.19) σ=0.12 brix: n=9 med=4.42 (4–5) σ=0.44 carbonatacao: n=11 med=1.55 (1.5–1.7) σ=0.09 |
| CH004 | Chá Mate Limão | pH: n=7 med=3.77 (3.72–3.83) σ=0.03 brix: n=7 med=2.34 (2–3) σ=0.33 carbonatacao: n=7 med=1.5 (1.5–1.5) σ=0 ⚠σ=0 |
| FX001 | Komb Frutas Vermelhas | pH: n=39 med=3.23 (2.8–3.64) σ=0.21 brix: n=39 med=3.77 (2–5.5) σ=0.84 carbonatacao: n=39 med=1.6 (1.5–2.4) σ=0.18 abv: n=19 med=0.53 (0.1–1.82) σ=0.44 |
| FX002 | Komb Abacaxi Gengibre | pH: n=29 med=3.4 (2.8–3.75) σ=0.21 brix: n=29 med=4.04 (2.8–6) σ=0.79 carbonatacao: n=31 med=1.59 (1.5–2.2) σ=0.16 abv: n=21 med=0.39 (0.18–1.2) σ=0.24 |
| FX003 | Komb Maçã Gengibre | pH: n=17 med=3.38 (3–3.7) σ=0.2 brix: n=17 med=4.12 (3–6) σ=1.06 carbonatacao: n=21 med=1.6 (1.5–2.2) σ=0.21 abv: n=12 med=0.31 (0.12–0.58) σ=0.14 |
| FX006 | Komb Mirtilo Morango | pH: n=24 med=3.26 (2.7–3.64) σ=0.19 brix: n=24 med=3.77 (3–6) σ=0.88 carbonatacao: n=25 med=1.61 (1.5–2.2) σ=0.18 abv: n=14 med=0.41 (0.2–0.75) σ=0.18 |
| FX007 | Komb Pink Lemonade | pH: n=30 med=3.08 (2.4–3.43) σ=0.25 brix: n=30 med=3.95 (3–7) σ=0.97 carbonatacao: n=33 med=1.61 (1.5–2.2) σ=0.17 abv: n=18 med=0.43 (0.1–1.75) σ=0.37 |
| RF001 | Refri Limão Siciliano | pH: n=36 med=3.35 (3–3.66) σ=0.14 brix: n=36 med=4.28 (3–5) σ=0.57 carbonatacao: n=39 med=1.55 (1.5–2) σ=0.11 |
| RF002 | Refri Frutas Vermelhas | pH: n=18 med=3.47 (3.31–3.8) σ=0.12 brix: n=17 med=4.74 (4–5) σ=0.39 carbonatacao: n=23 med=1.57 (1.5–2) σ=0.13 |
| RF003 | Refri Guaraná Açaí | pH: n=21 med=3.67 (3.3–3.79) σ=0.12 brix: n=21 med=3.8 (3–4.6) σ=0.52 carbonatacao: n=22 med=1.61 (1.5–2.2) σ=0.21 |
| RF004 | Refri Uva | pH: n=9 med=3.36 (3.03–3.59) σ=0.2 brix: n=8 med=4.59 (4–5) σ=0.5 carbonatacao: n=9 med=1.5 (1.5–1.5) σ=0 ⚠σ=0 |
| RF005 | Refri Laranja | pH: n=10 med=3.64 (3.33–3.9) σ=0.24 brix: n=10 med=4.49 (4–6) σ=0.74 carbonatacao: n=10 med=1.5 (1.5–1.5) σ=0 ⚠σ=0 |
| RTM001 | Refri Limão Mônica | pH: n=5 med=3.37 (3.36–3.39) σ=0.01 brix: n=5 med=4.18 (3.5–5) σ=0.54 carbonatacao: n=5 med=1.5 (1.5–1.5) σ=0 ⚠σ=0 |
| RTM002 | Refri Uva Mônica | pH: n=6 med=3.4 (3.2–3.53) σ=0.12 brix: n=6 med=4.37 (4–5) σ=0.47 carbonatacao: n=6 med=1.5 (1.5–1.5) σ=0 ⚠σ=0 |
| RTM003 | Refri Laranja Mônica | pH: n=5 med=3.83 (3.76–3.94) σ=0.07 brix: n=5 med=4.1 (4–4.5) σ=0.22 carbonatacao: n=5 med=1.5 (1.5–1.5) σ=0 ⚠σ=0 |

## ⚠ Avisos

- **Carbonatação com σ=0** (sempre 1,50 nos registros): CH004, RF004, RF005, RTM001, RTM002, RTM003.
  Parece meta copiada, não medida — validar com a Qualidade antes de confiar na faixa.
- **ABV** só existe para kombuchas (FX*) e com preenchimento parcial; refri/chá ficam `null`.
- **Faixas observadas** podem conter outliers (ex.: Brix até 7 em FX007). A Qualidade pode
  estreitar à vontade — é só editar `produtos.json`.
