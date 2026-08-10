// ============================================================================
// Dashboard Cache — calendário via CSV publicado da "Produção por Lote"
// Sem dependência do Apps Script (_DashboardCache). Sem Sheets API.
// ============================================================================
import { construirCacheProdutos } from "./kpis.js";
import { buscarOPs, chamarOmie } from "./omie.js";

const LOTE_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0CiPxDF_WzXooUU_b7MgoyjvnIDp3kZ3KKMeEVVXEuE2ZIl5iYIoi1EjxuEIQMQ/pub?gid=1841448781&single=true&output=csv";

// ============================================================================
// Mapa sigla → SKU (do Cadastro de SKU)
// ============================================================================
const SIGLA_PARA_SKU = {
  CVP:"CH001",CHM:"CH002",CCM:"CH003",CML:"CH004",
  KFV:"FX001",KABX:"FX002","KMÇ":"FX003",KMC:"FX003",
  KMIR:"FX006",KPL:"FX007",
  RLS:"RF001",RFV:"RF002",RGA:"RF003",RUV:"RF004",RLA:"RF005",
  RTMLS:"RTM001",RTMUV:"RTM002",RTMLA:"RTM003",
  CVPSAMS:null,CMLSAMS:null,CHMSAMS:null,
  RLSSAMS:null,"RFV/RGASAMS":null,RTMSAMS:null,
};

function parseDataBr(str) {
  if (!str || typeof str !== "string") return null;
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0],10), m = parseInt(parts[1],10)-1, y = parseInt(parts[2],10);
  const date = new Date(y,m,d);
  if (date.getFullYear()!==y || date.getMonth()!==m || date.getDate()!==d) return null;
  return date;
}

function parseNum(str) {
  if (!str || str.trim() === "") return null;
  // Separador de milhar BR: "4.464" → 4464, "3.000" → 3000
  const limpo = String(str).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

// ============================================================================
// Calendário direto do CSV da Produção por Lote
// ============================================================================

async function buildCalendarFromCSV(ano, mes) {
  const res = await fetch(LOTE_CSV_URL, { cf: { cacheTtl: 0 } });
  if (!res.ok) throw new Error(`CSV Lote HTTP ${res.status}`);
  const text = await res.text();

  // Parse CSV manual (simples — sem lib)
  const rows = text.replace(/\r/g,"").split("\n").map(line => {
    const cols = [];
    let inQuotes = false, col = "";
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { cols.push(col); col = ""; continue; }
      col += ch;
    }
    cols.push(col);
    return cols;
  });

  // Mapa: chave "YYYY-M-D" → { sigla, planejada, produzida }
  const map = {};
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0] || !row[0].includes("/")) continue;
    const data = parseDataBr(row[0]);
    if (!data) continue;
    const sigla = String(row[1] || "").trim();
    if (!sigla) continue;
    const sufixo = String(row[2] || "").trim();
    const sufixoLimpo = sufixo.toLowerCase().includes("sem") ? "" : sufixo;
    const planejada = parseNum(row[6]) || 0;
    const produzida = parseNum(row[7]) || 0;
    const key = `${data.getFullYear()}-${data.getMonth()+1}-${data.getDate()}`;
    map[key] = { sigla, sufixo: sufixoLimpo, planejada, produzida };
  }

  // Monta grid 5×7
  const firstDay = new Date(ano, mes-1, 1);
  const wd = firstDay.getDay() === 0 ? 7 : firstDay.getDay();
  const offset = wd - 1;
  const daysInMonth = new Date(ano, mes, 0).getDate();

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
        const ds = String(day).padStart(2,"0");
        dnRow.push(ds);
        const key = `${ano}-${mes}-${day}`;
        const info = map[key];
        if (info && info.sigla) {
          const siglaCompleta = info.sigla + (info.sufixo || "");
          wdRow.push([siglaCompleta, info.planejada, info.produzida > 0 ? info.produzida : null]);
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
// Casamento plano ↔ OP (mesma lógica de antes)
// ============================================================================

function casarPlanoComOPs(weeksData, dayNums, ops, codParaSku, ano, mes) {
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
    opsDisponiveis.push({
      nCodOP: ident.nCodOP,
      cNumero: ident.cNumOP || ident.cNumero || `OP ${ident.nCodOP}`,
      sku, data, dataStr,
      qtde: ident.nQtde || 0,
      concluida: !!(op._concluida || outras.dConclusao),
      status: (op._concluida || outras.dConclusao) ? "concluida" : (inf.dDtInicio ? "andamento" : "aberta"),
      consumida: false,
    });
  }

  const lotes = [];
  for (let wi = 0; wi < weeksData.length; wi++) {
    for (let di = 0; di < 7; di++) {
      const cell = weeksData[wi] && weeksData[wi][di];
      if (!cell) continue;
      const siglaCompleta = cell[0];
      if (!siglaCompleta) continue;
      let siglaBase = siglaCompleta.replace(/2K$/i,"").replace(/\/3$/,"").replace(/SAMS$/i,"");
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

  // 3 passadas de matching
  for (const lote of lotes) {
    const match = opsDisponiveis.find(op => !op.consumida && op.sku === lote.sku && op.dataStr === lote.dataStr);
    if (match) {
      match.consumida = true;
      lote.execucao = { nCodOP: match.nCodOP, cNumero: match.cNumero, qtde: match.qtde, status: match.status, dataStr: match.dataStr, confianca: "exata" };
    }
  }
  for (const lote of lotes) {
    if (lote.execucao) continue;
    const candidatas = opsDisponiveis.filter(op => !op.consumida && op.sku === lote.sku && Math.abs(op.data - lote.data)/86400000 <= 7);
    candidatas.sort((a,b) => Math.abs(a.data-lote.data) - Math.abs(b.data-lote.data));
    if (candidatas[0]) {
      candidatas[0].consumida = true;
      lote.execucao = { nCodOP: candidatas[0].nCodOP, cNumero: candidatas[0].cNumero, qtde: candidatas[0].qtde, status: candidatas[0].status, dataStr: candidatas[0].dataStr, confianca: "aproximada" };
    }
  }
  for (const lote of lotes) {
    if (lote.execucao) continue;
    const match = opsDisponiveis.find(op => !op.consumida && op.sku === lote.sku);
    if (match) {
      match.consumida = true;
      lote.execucao = { nCodOP: match.nCodOP, cNumero: match.cNumero, qtde: match.qtde, status: match.status, dataStr: match.dataStr, confianca: "cross_month" };
    }
  }

  const novasWeeksData = weeksData.map(row => [...row]);
  for (const lote of lotes) {
    const oldCell = novasWeeksData[lote.wi][lote.di];
    if (!oldCell) continue;
    const novoCell = { sigla: oldCell[0], planejada: oldCell[1], produzida: oldCell[2] };
    if (lote.execucao) {
      novoCell.execucao = lote.execucao;
      if (lote.execucao.status === "concluida") {
        novoCell.estado = "op_concluida";
        // nQtde é a quantidade da OP (Omie não retorna produzido real no ListarOrdemProducao)
        novoCell.produzida = lote.execucao.qtde;
        // Divergência só se a OP foi aberta com quantidade diferente do plano
        if (lote.planejada > 0 && Math.abs(lote.execucao.qtde - lote.planejada) > lote.planejada * 0.1) {
          novoCell.estado = "divergencia_qtde";
        }
      } else if (lote.execucao.status === "andamento") {
        novoCell.estado = "op_andamento";
        if (lote.planejada > 0 && Math.abs(lote.execucao.qtde - lote.planejada) > lote.planejada * 0.1) {
          novoCell.estado = "divergencia_qtde";
        }
      } else {
        novoCell.estado = "op_aberta";
      }
      if (lote.execucao.confianca !== "exata") novoCell.confianca = lote.execucao.confianca;
      if (lote.planejada > 0 && Math.abs(lote.execucao.qtde - lote.planejada) > lote.planejada * 0.1) {
        novoCell.estado = "divergencia_qtde";
      }
    } else {
      if (/FERIADO|MANUTEN|INVENTÁRIO/i.test(oldCell[0]||"")) {
        novoCell.estado = "nao_produtivo";
      } else {
        novoCell.estado = "planejado_sem_op";
      }
    }
    novoCell[0] = novoCell.sigla;
    novoCell[1] = novoCell.planejada;
    novoCell[2] = novoCell.produzida;
    novasWeeksData[lote.wi][lote.di] = novoCell;
  }

  const opsNaoConsumidas = opsDisponiveis.filter(op => !op.consumida && op.data.getMonth()+1 === mes);
  const lotesComExec = lotes.filter(l => l.execucao).length;
  return { weeksData: novasWeeksData, opsSemPlano: opsNaoConsumidas, _lotesCount: lotes.length, _lotesComExec: lotesComExec };
}

// ============================================================================
// Enriquece células com OPE/28 (quantidade REAL produzida)
// Cruza numPedido do movimento OPE/28 com cNumOP da OP
// ============================================================================

async function enriquecerComRealizado(weeksData, dayNums, env, cacheProd, ano, mes) {
  const dInicio = `01/${String(mes).padStart(2,"0")}/${ano}`;
  const dFim = `${String(new Date(ano, mes, 0).getDate()).padStart(2,"0")}/${String(mes).padStart(2,"0")}/${ano}`;

  // Busca movimentos OPE/28 do mês para todos os SKUs ativos
  const realizados = [];
  for (const sku of Object.keys(cacheProd)) {
    const prod = cacheProd[sku];
    if (!prod || !prod.codigo_produto) continue;
    try {
      let pagina = 1, nTotPaginas = 1;
      do {
        const res = await chamarOmie(env, "/estoque/consulta/", "ListarMovimentoEstoque", {
          nPagina: pagina, nRegPorPagina: 100, idProd: prod.codigo_produto,
          dDtInicial: dInicio, dDtFinal: dFim,
          codigo_local_estoque: 3125334492,
        });
        nTotPaginas = res.nTotPaginas || 1;
        (res.movProdutoListar || []).forEach(mov => {
          if (mov.codOrigem !== "OPE" || mov.tipo !== "entrada" || mov.operacao !== "28") return;
          realizados.push({
            numPedido: mov.numPedido || "",
            qtde: mov.qtde || 0,
            dtMov: mov.dtMov,
            sku,
          });
        });
        pagina++;
        if (pagina <= nTotPaginas) await new Promise(r => setTimeout(r, 200));
      } while (pagina <= nTotPaginas);
    } catch (e) {
      // SKU sem movimentos — ok
    }
  }

  if (realizados.length === 0) return;

  // Cruza com células: procura cNumOP dentro do numPedido do movimento
  for (let wi = 0; wi < weeksData.length; wi++) {
    for (let di = 0; di < 7; di++) {
      const cell = weeksData[wi] && weeksData[wi][di];
      if (!cell || !cell.execucao) continue;
      const cNumOP = cell.execucao.cNumero;
      if (!cNumOP) continue;

      // Extrai o número do lote (ex: "2026/00498" → "00498")
      const partes = String(cNumOP).split("/");
      const lote = partes[partes.length - 1]; // "00498"

      // Procura movimento que referencia esse lote
      const match = realizados.find(r => {
        const np = r.numPedido || "";
        // numPedido ex: "Ordem de Produção 2026/00498"
        return np.includes(lote) || np.includes(cNumOP) || np.includes(String(cell.execucao.nCodOP));
      });

      if (match) {
        cell.produzida = match.qtde;
        cell[2] = match.qtde; // frontend lê cell[2]
        // Se a OP tá concluída e temos quantidade real, atualiza estado
        if (cell.estado === "op_concluida" && cell.planejada > 0 && Math.abs(match.qtde - cell.planejada) > cell.planejada * 0.1) {
          cell.estado = "divergencia_qtde";
        }
      }
    }
  }

  console.log(`✅ OPE/28: ${realizados.length} movimentos cruzados`);
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

  // 1. Plano: CSV da Produção por Lote
  try {
    data.calGrid = await buildCalendarFromCSV(ano, mes);
    const celdas = data.calGrid.weeksData.flat().filter(Boolean).length;
    // Debug: mostra dias 6 e 10
    const wd = data.calGrid.weeksData;
    const dn = data.calGrid.dayNums;
    for (let wi=0; wi<wd.length; wi++) {
      for (let di=0; di<7; di++) {
        const day = dn[wi] && dn[wi][di];
        if (day === '06' || day === '10') {
          const cell = wd[wi] && wd[wi][di];
          console.log(`🔍 Dia ${day}: cell=${JSON.stringify(cell ? cell[0] : null)}`);
        }
      }
    }
    console.log(`✅ Plano CSV: ${celdas} células`);
  } catch (e) {
    console.warn(`⚠️ Plano CSV: ${e.message}`);
    return data;
  }

  // 2. Execução: OPs Omie
  try {
    const cacheProd = await construirCacheProdutos(env);
    const codParaSku = {};
    for (const sku of Object.keys(cacheProd)) {
      const cp = cacheProd[sku];
      if (cp && cp.codigo_produto) codParaSku[String(cp.codigo_produto)] = sku;
    }

    const abertas = await buscarOPs(env, { cConcluida: "N" });
    // Marca explicitamente como concluídas (ListarOrdemProducao pode não retornar outrasInf.dConclusao)
    for (const op of abertas) op._concluida = false;

    const dInicio = `01/${String(mes).padStart(2,"0")}/${ano}`;
    const dFim = `${String(new Date(ano, mes, 0).getDate()).padStart(2,"0")}/${String(mes).padStart(2,"0")}/${ano}`;
    const concluidas = await buscarOPs(env, { dDtConclusaoDe: dInicio, dDtConclusaoAte: dFim, cConcluida: "S" });
    for (const op of concluidas) op._concluida = true;

    const todas = [...abertas, ...concluidas];
    const resultado = casarPlanoComOPs(
      data.calGrid.weeksData, data.calGrid.dayNums,
      todas, codParaSku, ano, mes
    );
    data.calGrid.weeksData = resultado.weeksData;

    // Enriquece com OPE/28 (quantidade real produzida, cruza numPedido com lote)
    await enriquecerComRealizado(data.calGrid.weeksData, data.calGrid.dayNums, env, cacheProd, ano, mes);
    // Recalcula contagem
    const _celdas = data.calGrid.weeksData.flat().filter(Boolean).length;
    console.log(`✅ Plano CSV: ${_celdas} células`);

    console.log(`✅ Execução: ${resultado._lotesComExec} matches, ${resultado._lotesCount} lotes`);
  } catch (e) {
    console.warn(`⚠️ Execução: ${e.message}`);
  }

  return data;
}
