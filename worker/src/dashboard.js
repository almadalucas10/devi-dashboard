// ============================================================================
// Dashboard Cache — calendário via OPs da Omie (adeus Sheets!)
// ============================================================================
import { buscarOPs } from "./omie.js";
import { SKUS_ATIVOS, PLANILHA_PARA_SKU } from "./constants.js";
import { construirCacheProdutos } from "./kpis.js";

function parseDataBr(str) {
  if (!str || typeof str !== "string") return null;
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1, y = parseInt(parts[2], 10);
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

// ============================================================================
// Calendário a partir das OPs (substitui buildCalendarFromLotes)
// ============================================================================

async function buildCalendarFromOPs(env, ano, mes, cacheProd) {
  const primeiroDia = new Date(ano, mes - 1, 1);
  const ultimoDia = new Date(ano, mes, 0);
  const daysInMonth = ultimoDia.getDate();
  const wd = primeiroDia.getDay() === 0 ? 7 : primeiroDia.getDay();
  const offset = wd - 1;

  // Mapa reverso: codigo_produto (Omie) → sigla da planilha
  const codParaSigla = {};
  for (const [sigla, sku] of Object.entries(PLANILHA_PARA_SKU)) {
    if (!sku) continue;
    const cp = cacheProd[sku];
    if (cp && cp.codigo_produto) {
      codParaSigla[String(cp.codigo_produto)] = sigla;
    }
  }

  const dInicio = `01/${String(mes).padStart(2,"0")}/${ano}`;
  const dFim = `${String(daysInMonth).padStart(2,"0")}/${String(mes).padStart(2,"0")}/${ano}`;

  const abertas = await buscarOPs(env, { cConcluida: "N" });
  const concluidas = await buscarOPs(env, {
    dDtConclusaoDe: dInicio, dDtConclusaoAte: dFim, cConcluida: "S",
  });

  const todas = [...abertas, ...concluidas];

  // Mapa: dia → [{ sigla, planejada, produzida }]
  const porDia = {};
  for (let d = 1; d <= daysInMonth; d++) porDia[d] = [];

  for (const op of todas) {
    const ident = op.identificacao || {};
    const inf = op.infAdicionais || {};
    const outras = op.outrasInf || {};

    const dataStr = inf.dDtInicio || ident.dDtPrevisao || inf.dDtPrevisao;
    if (!dataStr) continue;

    const data = parseDataBr(dataStr);
    if (!data || data.getMonth() + 1 !== mes || data.getFullYear() !== ano) continue;

    const dia = data.getDate();
    if (dia < 1 || dia > daysInMonth) continue;

    // Mapeia nCodProduto → sigla via cache de produtos
    const nCodProduto = ident.nCodProduto;
    const sigla = codParaSigla[String(nCodProduto)];
    if (!sigla) continue;

    const nQtde = ident.nQtde || 0;
    const concluida = outras.dConclusao ? true : false;
    const produzida = concluida ? nQtde : null;

    // Se já tem OP nesse dia, soma (ou mantém a primeira)
    porDia[dia].push({
      sigla,
      planejada: nQtde,
      produzida,
      concluida,
    });
  }

  // Monta grid 5×7
  const dayNums = [];
  const weeksData = [];
  let day = 1;

  for (let w = 0; w < 5; w++) {
    const dnRow = [];
    const wdRow = [];
    for (let d = 0; d < 7; d++) {
      if ((w === 0 && d < offset) || day > daysInMonth) {
        dnRow.push(null);
        wdRow.push(null);
      } else {
        dnRow.push(String(day).padStart(2, "0"));
        const diaOps = porDia[day] || [];
        if (diaOps.length > 0) {
          // Pega a primeira OP do dia (mais relevante)
          const op = diaOps[0];
          wdRow.push([op.sigla, op.planejada, op.produzida]);
        } else {
          wdRow.push(null);
        }
        day++;
      }
    }
    dayNums.push(dnRow);
    weeksData.push(wdRow);
  }

  return { dayNums, weeksData };
}

// ============================================================================
// Dashboard Cache — só o essencial (calendário + mês)
// ============================================================================

export async function buildDashboardCache(env, cacheProd) {
  // Se não recebeu cache, constrói (custo extra, mas funciona standalone)
  if (!cacheProd) {
    cacheProd = await construirCacheProdutos(env);
  }

  const hoje = new Date();
  const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const mesLabel = nomes[hoje.getMonth()];

  const data = {
    mesLabel,
    geradoEm: new Date().toISOString(),
    planejado: null, realizado: null, eficiencia: null,
    extraLabel: null, extraValue: null,
    mes: { planejado: null, realizado: null, eficiencia: null, pendentes: null },
    familias: [], tendencia: null, skuMensal: null,
  };

  try {
    data.calGrid = await buildCalendarFromOPs(env, hoje.getFullYear(), hoje.getMonth() + 1, cacheProd);
    console.log(`✅ Calendário OPs: ${hoje.getMonth()+1}/${hoje.getFullYear()}`);
  } catch (e) {
    console.warn(`⚠️ Calendário OPs: ${e.message}`);
    data.calGrid = null;
  }

  return data;
}
