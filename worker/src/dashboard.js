// ============================================================================
// Dashboard Cache — calendário de duas camadas (plano CSV + execução Omie)
// ============================================================================
import { buscarOPs } from "./omie.js";
import { construirCacheProdutos } from "./kpis.js";

const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0CiPxDF_WzXooUU_b7MgoyjvnIDp3kZ3KKMeEVVXEuE2ZIl5iYIoi1EjxuEIQMQ/pub?gid=1158403049&single=true&output=csv";

const TOLERANCIA_DIAS = 3;

// Mapa sigla → SKU (extraído de constants mas duplicado pra evitar import circular)
const SIGLA_PARA_SKU = {
  CVP:"CH001",CML:"CH002",CCM:"CH003",CHM:"CH004",
  KFV:"FX001",KABX:"FX002",KMIR:"FX003",KPL:"FX006",KMC:"FX007",
  RLS:"RF001",RFV:"RF002",RGA:"RF003",RLA:"RF004",RUV:"RF005",
  RTMLA:"RTM001",RTMLS:"RTM002",RTMUV:"RTM003",
  CHMSAMS:null,CMLSAMS:null,CVPSAMS:null,RLSSAMS:null,RTMSAMS:null,"RFV/RGASAMS":null,
};

function parseDataBr(str) {
  if (!str || typeof str !== "string") return null;
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1, y = parseInt(parts[2], 10);
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

function dataParaStr(dt) {
  return `${("0"+dt.getDate()).slice(-2)}/${("0"+(dt.getMonth()+1)).slice(-2)}/${dt.getFullYear()}`;
}

// ============================================================================
// Casamento plano ↔ OP
// ============================================================================

function casarPlanoComOPs(weeksData, dayNums, ops, codParaSku, ano, mes) {
  const TOL = TOLERANCIA_DIAS;

  // Extrai todas as OPs com data e SKU
  const opsDisponiveis = [];
  for (const op of ops) {
    const ident = op.identificacao || {};
    const inf = op.infAdicionais || {};
    const outras = op.outrasInf || {};
    const dataStr = inf.dDtInicio || ident.dDtPrevisao || inf.dDtPrevisao;
    if (!dataStr) continue;
    const data = parseDataBr(dataStr);
    if (!data) continue;

    const sku = codParaSku[String(ident.nCodProduto)];
    if (!sku) continue;

    const concluida = !!(outras.dConclusao);
    opsDisponiveis.push({
      nCodOP: ident.nCodOP,
      sku,
      data,
      dataStr,
      qtde: ident.nQtde || 0,
      concluida,
      status: concluida ? "concluida" : (inf.dDtInicio ? "andamento" : "aberta"),
      consumida: false,
    });
  }

  // Constrói lotes planejados a partir do calendário
  const lotes = [];
  for (let wi = 0; wi < weeksData.length; wi++) {
    for (let di = 0; di < 7; di++) {
      const cell = weeksData[wi] && weeksData[wi][di];
      if (!cell) continue;
      const siglaCompleta = cell[0];
      if (!siglaCompleta) continue;

      // Extrai sigla base (sem sufixo como "2K", "/3")
      let siglaBase = siglaCompleta.replace(/2K$/i,"").replace(/\/3$/,"").replace(/SAMS$/i,"");
      // Tenta sigla completa primeiro, depois base
      let sku = SIGLA_PARA_SKU[siglaCompleta] || SIGLA_PARA_SKU[siglaBase];
      if (!sku) continue;

      const planejada = cell[1] || 0;
      const dayNum = dayNums[wi] && dayNums[wi][di];
      if (!dayNum) continue;
      const dataStr = `${dayNum}/${String(mes).padStart(2,"0")}/${ano}`;
      const data = parseDataBr(dataStr);
      if (!data) continue;

      lotes.push({ wi, di, sigla: siglaCompleta, sku, planejada, data, dataStr, cell });
    }
  }

  // Passada 1: casamentos exatos
  for (const lote of lotes) {
    const match = opsDisponiveis.find(op =>
      !op.consumida && op.sku === lote.sku && op.dataStr === lote.dataStr
    );
    if (match) {
      match.consumida = true;
      lote.execucao = {
        nCodOP: match.nCodOP, qtde: match.qtde, status: match.status,
        dataStr: match.dataStr, confianca: "exata",
      };
    }
  }

  // Passada 2: SKU igual, mesma semana (até 7 dias de diferença)
  for (const lote of lotes) {
    if (lote.execucao) continue;
    const candidatas = opsDisponiveis.filter(op =>
      !op.consumida && op.sku === lote.sku &&
      Math.abs(op.data - lote.data) / 86400000 <= 7
    );
    candidatas.sort((a, b) => Math.abs(a.data - lote.data) - Math.abs(b.data - lote.data));
    const match = candidatas[0];
    if (match) {
      match.consumida = true;
      lote.execucao = {
        nCodOP: match.nCodOP, qtde: match.qtde, status: match.status,
        dataStr: match.dataStr, confianca: "aproximada",
      };
    }
  }

  // Passada 3: SKU igual, qualquer data (OP de outro mês)
  for (const lote of lotes) {
    if (lote.execucao) continue;
    const match = opsDisponiveis.find(op => !op.consumida && op.sku === lote.sku);
    if (match) {
      match.consumida = true;
      lote.execucao = {
        nCodOP: match.nCodOP, qtde: match.qtde, status: match.status,
        dataStr: match.dataStr, confianca: "cross_month",
      };
    }
  }

  // Atualiza weeksData com execução
  const novasWeeksData = weeksData.map(row => [...row]);
  for (const lote of lotes) {
    const oldCell = novasWeeksData[lote.wi][lote.di];
    if (!oldCell) continue;

    // Objeto pra preservar estado na serialização JSON
    const novoCell = { sigla: oldCell[0], planejada: oldCell[1], produzida: oldCell[2] };
    if (lote.execucao) {
      novoCell.execucao = lote.execucao;
      if (lote.execucao.status === "concluida") {
        novoCell.estado = "op_concluida";
        novoCell.produzida = lote.execucao.qtde;
      } else if (lote.execucao.status === "andamento") {
        novoCell.estado = "op_andamento";
      } else {
        novoCell.estado = "op_aberta";
      }
      if (lote.execucao.confianca === "aproximada") novoCell.confianca = "aproximada";
      if (lote.planejada > 0 && Math.abs(lote.execucao.qtde - lote.planejada) > lote.planejada * 0.1) {
        novoCell.estado = "divergencia_qtde";
      }
    } else {
      const sigla = oldCell[0] || "";
      if (/FERIADO|MANUTEN|INVENTÁRIO/i.test(sigla)) {
        novoCell.estado = "nao_produtivo";
      } else {
        novoCell.estado = "planejado_sem_op";
      }
    }
    // Compatibilidade: expor como [0],[1],[2] pra quem espera array
    novoCell[0] = novoCell.sigla;
    novoCell[1] = novoCell.planejada;
    novoCell[2] = novoCell.produzida;
    novasWeeksData[lote.wi][lote.di] = novoCell;
  }

  // Detecta OPs não consumidas (op_sem_plano)
  const opsNaoConsumidas = opsDisponiveis.filter(op => !op.consumida && op.data.getMonth() + 1 === mes);

  const lotesComExec = lotes.filter(l => l.execucao).length;

  return {
    weeksData: novasWeeksData,
    opsSemPlano: opsNaoConsumidas,
    _lotesCount: lotes.length,
    _lotesComExec: lotesComExec,
  };
}

// ============================================================================
// Dashboard Cache
// ============================================================================

export async function buildDashboardCache(env) {
  const hoje = new Date();
  const ano = hoje.getFullYear(), mes = hoje.getMonth() + 1;
  const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  const data = {
    mesLabel: nomes[hoje.getMonth()],
    geradoEm: new Date().toISOString(),
    planejado: null, realizado: null, eficiencia: null,
    extraLabel: null, extraValue: null,
    mes: { planejado: null, realizado: null, eficiencia: null, pendentes: null },
    familias: [], tendencia: null, skuMensal: null,
    calGrid: null,
  };

  // 1. Plano: lê CSV publicado
  try {
    const res = await fetch(SHEETS_CSV_URL, { cf: { cacheTtl: 0 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let raw = (await res.text()).trim();
    if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1).replace(/""/g, '"');
    const dashData = JSON.parse(raw);
    if (dashData.calGrid) {
      data.calGrid = dashData.calGrid;
      console.log(`✅ Plano: ${dashData.calGrid.weeksData.flat().filter(Boolean).length} células`);
    }
  } catch (e) {
    console.warn(`⚠️ Plano CSV: ${e.message}`);
    return data;
  }

  // 2. Execução: busca OPs e casa com o plano
  try {
    const cacheProd = await construirCacheProdutos(env);
    // Mapa: codigo_produto (Omie) → SKU (nosso)
    const codParaSku = {};
    for (const sku of Object.keys(cacheProd)) {
      const cp = cacheProd[sku];
      if (cp && cp.codigo_produto) codParaSku[String(cp.codigo_produto)] = sku;
    }

    const abertas = await buscarOPs(env, { cConcluida: "N" });
    const dInicio = `01/${String(mes).padStart(2,"0")}/${ano}`;
    const dFim = `${String(new Date(ano, mes, 0).getDate()).padStart(2,"0")}/${String(mes).padStart(2,"0")}/${ano}`;
    const concluidas = await buscarOPs(env, { dDtConclusaoDe: dInicio, dDtConclusaoAte: dFim, cConcluida: "S" });

    const todas = [...abertas, ...concluidas];
    console.log(`🔍 OPs: ${abertas.length} abertas + ${concluidas.length} concluídas = ${todas.length} total`);

    // Debug: SKUs dos lotes vs SKUs das OPs
    if (todas.length > 0) {
      const opsSkus = new Set();
      for (const op of todas) {
        const ident = op.identificacao || {};
        const s = codParaSku[String(ident.nCodProduto)];
        if (s) opsSkus.add(s);
      }
      console.log(`🔍 SKUs nas OPs: ${[...opsSkus].join(", ")}`);
    }
    // Depois do matching, loga também os SKUs dos lotes
    const lotesSkus = new Set();
    for (const row of data.calGrid.weeksData) {
      for (const cell of row) {
        if (!cell || !cell[0]) continue;
        const siglaCompleta = cell[0];
        let siglaBase = siglaCompleta.replace(/2K$/i,"").replace(/\/3$/,"").replace(/SAMS$/i,"");
        const sku = SIGLA_PARA_SKU[siglaCompleta] || SIGLA_PARA_SKU[siglaBase];
        if (sku) lotesSkus.add(sku);
      }
    }
    console.log(`🔍 SKUs no calendário: ${[...lotesSkus].join(", ")}`);

    const resultado = casarPlanoComOPs(
      data.calGrid.weeksData, data.calGrid.dayNums, todas, codParaSku, ano, mes
    );
    data.calGrid.weeksData = resultado.weeksData;
    // Coleta SKUs pra debug
    const opsSkusSet = new Set();
    for (const op of todas) {
      const id = (op.identificacao || {}).nCodProduto;
      const s = codParaSku[String(id)];
      if (s) opsSkusSet.add(s);
    }
    const lotesSkusSet = new Set();
    for (const row of data.calGrid.weeksData) {
      for (const cell of row) {
        if (!cell || !cell[0]) continue;
        const siglaCompleta = cell[0];
        let siglaBase = siglaCompleta.replace(/2K$/i,"").replace(/\/3$/,"").replace(/SAMS$/i,"");
        const sku = SIGLA_PARA_SKU[siglaCompleta] || SIGLA_PARA_SKU[siglaBase];
        if (sku) lotesSkusSet.add(sku);
      }
    }

    data._debug = {
      opsTotal: todas.length,
      opsSkus: [...opsSkusSet],
      lotesSkus: [...lotesSkusSet],
      opsNoMapa: todas.filter(op => {
        const id = (op.identificacao || {}).nCodProduto;
        return codParaSku[String(id)];
      }).length,
      chavesNoMapa: Object.keys(codParaSku).length,
      lotesCriados: resultado._lotesCount || 0,
      lotesComExec: resultado._lotesComExec || 0,
      cellsComEstado: resultado.weeksData.flat().filter(c => c && c.estado).length,
    };

    // Conta estados
    const estados = {};
    for (const row of resultado.weeksData) {
      for (const cell of row) {
        if (cell && cell.estado) estados[cell.estado] = (estados[cell.estado] || 0) + 1;
      }
    }
    const semOP = estados["planejado_sem_op"] || 0;
    const semPlano = resultado.opsSemPlano.length;
    console.log(`✅ Execução: ${Object.entries(estados).map(([k,v])=>`${k}=${v}`).join(", ")}`);
    if (semOP > 0) console.log(`⚠️  ${semOP} célula(s) sem OP`);
    if (semPlano > 0) console.log(`⚠️  ${semPlano} OP(s) sem plano`);
  } catch (e) {
    console.warn(`⚠️ Execução Omie: ${e.message}`);
  }

  return data;
}
