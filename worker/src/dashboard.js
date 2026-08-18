// ============================================================================
// Dashboard Cache — calendário via CSV publicado da "Produção por Lote"
// Sem dependência do Apps Script (_DashboardCache). Sem Sheets API.
// ============================================================================
import { construirCacheProdutos } from "./kpis.js";
import { buscarOPs, chamarOmie } from "./omie.js";
import { hojeBrasil } from "./fuso.js";
import { getAccessToken, getValues } from "./sheets.js";

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
// Calendário direto da aba "Produção por Lote" (Sheets API)
// ============================================================================

async function buildCalendarFromPlanilha(env, ano, mes) {
  const token = await getAccessToken(env);
  const rows = await getValues(env, token, "'Produção por Lote'!A4:H2000");

  // Mapa: chave "YYYY-M-D" → { sigla, planejada, produzida, linha }
  // A leitura começa na linha 4 → rows[0] é o cabeçalho; dados a partir de rows[1]
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0] || !String(row[0]).includes("/")) continue;
    const data = parseDataBr(String(row[0]));
    if (!data) continue;
    const sigla = String(row[1] || "").trim();
    if (!sigla) continue;
    const sufixo = String(row[2] || "").trim();
    const sufixoLimpo = sufixo.toLowerCase().includes("sem") ? "" : sufixo;
    const planejada = parseNum(row[6]) || 0;
    const produzida = parseNum(row[7]) || 0;
    const key = `${data.getFullYear()}-${data.getMonth()+1}-${data.getDate()}`;
    map[key] = { sigla, sufixo: sufixoLimpo, planejada, produzida, linha: 4 + i };
  }

  // Monta grid (5 ou 6 semanas conforme o mês)
  const firstDay = new Date(ano, mes-1, 1);
  const wd = firstDay.getDay() === 0 ? 7 : firstDay.getDay();
  const offset = wd - 1;
  const daysInMonth = new Date(ano, mes, 0).getDate();
  const numWeeks = Math.ceil((offset + daysInMonth) / 7);

  const dayNums = [];
  const weeksData = [];
  const mapLinhas = {};
  let day = 1;

  for (let w = 0; w < numWeeks; w++) {
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
          // produzida NÃO vem da planilha (col H é destino do write-back, não fonte):
          // só do casamento OP/OPE no enriquecimento, evitando feedback loop.
          wdRow.push([siglaCompleta, info.planejada, null]);
          mapLinhas[key] = info.linha;
        } else {
          wdRow.push(null);
        }
        day++;
      }
    }
    dayNums.push(dnRow);
    weeksData.push(wdRow);
  }

  return { dayNums, weeksData, mapLinhas };
}

// ============================================================================
// Sincroniza a "Produção por Lote" com a aba mensal do calendário — ADITIVA.
// Lê os lotes programados na aba mensal (ex.: "Agosto"), separa sigla+sufixo,
// e ANEXA na "Produção por Lote" apenas as linhas que ainda não existem
// (casamento por Data + Sigla). Preserva as linhas existentes — e portanto o
// Nº do Lote (col F) e Qtd. Produzida (col H), que vêm do Omie, ficam intactos.
// Retorna o mapa { "YYYY-M-D": linhaReal } para o preencherLotesRealizado usar.
// ============================================================================
export async function sincronizarProducaoPorLote(env, ano, mes) {
  const token = await getAccessToken(env);
  const tabNomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const tab = tabNomes[mes - 1];

  // 1. Quantidade por sufixo (Legenda de Sufixos)
  const qtdPorSufixo = { "(sem sufixo)": 0 };
  const sufixos = [];
  try {
    const legRows = await getValues(env, token, "'Legenda de Sufixos'!A3:C20");
    for (let i = 1; i < legRows.length; i++) {
      const r = legRows[i];
      const s = String(r[0] || "").trim();
      const q = parseNum(r[2]);
      if (!s || q === null) continue;
      qtdPorSufixo[s] = q;
      if (s !== "(sem sufixo)") sufixos.push(s);
    }
  } catch (e) { console.warn(`⚠️ SincProd legenda: ${e.message}`); }
  sufixos.sort((a, b) => b.length - a.length);

  // 2. Cadastro de SKUs → produto/família
  const skus = {};
  try {
    const skuRows = await getValues(env, token, "'Cadastro de SKUs'!A4:D200");
    for (const r of skuRows) {
      const sig = String(r[2] || "").trim();
      if (sig) skus[sig] = { produto: String(r[1] || "").trim(), familia: String(r[0] || "").trim() };
    }
  } catch (e) { console.warn(`⚠️ SincProd skus: ${e.message}`); }

  // 3. Lê a aba mensal: linhas 5..11 = Seg..Dom; Semana 1 começa na col D (rel. B=0: D=2, sigla=3)
  const rows = await getValues(env, token, `'${tab}'!B5:M11`);

  // 4. Monta os lotes programados (key = "DD/MM/AAAA|siglaCompleta")
  const programados = {};
  for (let d = 0; d < 7; d++) {
    const row = rows[d] || [];
    for (let w = 0; w < 6; w++) {
      const colData = 2 + 2 * w;   // D, F, H, J, L
      const colSigla = 3 + 2 * w;  // E, G, I, K, M
      const dataStr = row[colData];
      const siglaRaw = row[colSigla];
      if (!dataStr || !String(dataStr).includes("/")) continue;
      const data = parseDataBr(String(dataStr));
      if (!data) continue;
      if (siglaRaw === undefined || siglaRaw === null || String(siglaRaw).trim() === "") continue;
      const sc = String(siglaRaw).trim();
      if (/MANUTEN|FERIADO|INVENTÁRIO/i.test(sc)) continue;
      let siglaBase = sc, sufixo = "(sem sufixo)";
      for (const s of sufixos) {
        if (sc.length > s.length && sc.endsWith(s)) { siglaBase = sc.slice(0, -s.length); sufixo = s; break; }
      }
      const qtd = (qtdPorSufixo[sufixo] ?? qtdPorSufixo["(sem sufixo)"] ?? 0);
      const ds = `${String(data.getDate()).padStart(2,"0")}/${String(data.getMonth()+1).padStart(2,"0")}/${data.getFullYear()}`;
      const sku = skus[siglaBase] || {};
      programados[`${ds}|${sc}`] = [ds, siglaBase, sufixo, sku.produto || "", sku.familia || "", "", qtd];
    }
  }
  const chaves = Object.keys(programados);
  if (chaves.length === 0) return { mapa: {} };

  // 5. Lê as linhas já existentes (a partir da linha 5) — para casar por Data+Sigla
  const existentes = new Map(); // key → linha
  const loteRows = await getValues(env, token, "'Produção por Lote'!A5:H2000");
  loteRows.forEach((r, i) => {
    const ds = String(r[0] || "").trim();
    const sig = String(r[1] || "").trim();
    if (ds && sig) existentes.set(`${ds}|${sig}`, 5 + i);
  });

  // 6. Apenas as que faltam
  const novaLinhas = [];
  chaves.forEach(k => { if (!existentes.has(k)) novaLinhas.push(programados[k]); });
  let primeiraNova = 0;
  if (novaLinhas.length > 0) {
    await appendValues(env, token, env.SPREADSHEET_ID, "Produção por Lote", novaLinhas);
    // Re-lê para saber a linha de cada nova (append no fim)
    const atual = await getValues(env, token, "'Produção por Lote'!A5:H2000");
    for (let i = 0; i < atual.length; i++) {
      const r = atual[i];
      const ds = String(r[0] || "").trim();
      const sig = String(r[1] || "").trim();
      if (ds && sig) existentes.set(`${ds}|${sig}`, 5 + i);
    }
    primeiraNova = 5 + loteRows.length;
    console.log(`✅ SincProd: +${novaLinhas.length} lotes na Produção por Lote (${tab})`);
  } else {
    console.log(`✅ SincProd: já sincronizado (${tab})`);
  }

  // 7. Mapa "YYYY-M-D" → linha (para o preencherLotesRealizado)
  const mapa = {};
  for (const [k, linha] of existentes) {
    const [ds] = k.split("|");
    const p = ds.split("/");
    if (p.length === 3) {
      const chaveM = `${p[2]}-${parseInt(p[1],10)}-${parseInt(p[0],10)}`;
      mapa[chaveM] = linha;
    }
  }
  return { mapa };
}

// ============================================================================
// Preenche Nº do Lote (col F) e Qtd. Produzida (col H) na aba
// "Produção por Lote", a partir da execução já calculada no calendário.
// Chama 1x por sync (leve/pesado) — valores idempotentes.
// ============================================================================

export async function preencherLotesRealizado(env, calGrid, ano, mes) {
  try {
    const token = await getAccessToken(env);
    const wd = calGrid.weeksData, dn = calGrid.dayNums;
    const mapLinhas = calGrid.mapLinhas || {};
    const dados = []; // { range, values } para batchUpdate

    for (let wi = 0; wi < wd.length; wi++) {
      for (let di = 0; di < 7; di++) {
        const cell = wd[wi] && wd[wi][di];
        const day = dn[wi] && dn[wi][di];
        if (!cell || !day) continue;
        const key = `${ano}-${mes}-${parseInt(day, 10)}`;
        const linha = mapLinhas[key];
        if (!linha) continue;

        // Só escreve quando há valor real — nunca apaga o que já está na planilha
        const lote = cell.execucao ? (cell.execucao.cNumero || "") : "";
        const qtd = (cell.produzida || cell[2] || null);
        if (!lote && qtd === null) continue;
        if (lote) dados.push({ range: `'Produção por Lote'!F${linha}`, values: [[lote]] });
        if (qtd !== null && qtd !== "") dados.push({ range: `'Produção por Lote'!H${linha}`, values: [[qtd]] });
      }
    }

    if (dados.length === 0) return { atualizados: 0 };

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ valueInputOption: "RAW", data: dados }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error(`⚠️ Preenche Lote: ${res.status} ${err.slice(0, 150)}`);
      return { erro: err.slice(0, 150) };
    }
    const r = await res.json();
    console.log(`✅ Preenche Lote: ${r.totalUpdatedCells || 0} células (${dados.length / 2} lotes)`);
    return { atualizados: r.totalUpdatedCells || 0 };
  } catch (e) {
    console.error(`⚠️ Preenche Lote: ${e.message}`);
    return { erro: e.message };
  }
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
        // Divergência: OP qtde ≠ plano (20%+). Quebra normal de 5-15% não gera alerta.
        if (lote.planejada > 0 && Math.abs(lote.execucao.qtde - lote.planejada) > lote.planejada * 0.2) {
          novoCell.estado = "divergencia_qtde";
        }
      } else if (lote.execucao.status === "andamento") {
        novoCell.estado = "op_andamento";
        if (lote.planejada > 0 && Math.abs(lote.execucao.qtde - lote.planejada) > lote.planejada * 0.2) {
          novoCell.estado = "divergencia_qtde";
        }
      } else {
        novoCell.estado = "op_aberta";
      }
      if (lote.execucao.confianca !== "exata") novoCell.confianca = lote.execucao.confianca;
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
        cell[2] = match.qtde;
        // OPE/28 nunca gera divergência — quebra de 5-15% é normal no processo
      }
    }
  }

  console.log(`✅ OPE/28: ${realizados.length} movimentos cruzados`);
}

// ============================================================================
// KPIs extraídos do calendário enriquecido (fonte única)
// ============================================================================

export function extrairKPIsDoCalendario(calGrid, ano, mes) {
  let planejadoMes = 0, planejadoConcluidasMes = 0, realizadoMes = 0, pendentesMes = 0;
  const produzidoPorSku = {};
  const wd = calGrid.weeksData;

  for (const row of wd) {
    for (const cell of row) {
      if (!cell) continue;
      const sigla = cell.sigla || cell[0] || "";
      const planejada = cell.planejada || cell[1] || 0;
      if (/FERIADO|MANUTEN|INVENTÁRIO/i.test(sigla)) continue;

      planejadoMes += planejada;

      const ex = cell.execucao;
      const estado = cell.estado;
      const produzida = cell.produzida || cell[2];

      if (estado === 'op_concluida' || estado === 'divergencia_qtde') {
        const opMes = ex && ex.dataStr ? parseInt(ex.dataStr.split("/")[1], 10) : mes;
        const opAno = ex && ex.dataStr ? parseInt(ex.dataStr.split("/")[2], 10) : ano;
        if (opMes === mes && opAno === ano) {
          planejadoConcluidasMes += planejada;
          realizadoMes += produzida || ex.qtde || 0;
        }
      }
      if (estado === 'planejado_sem_op') pendentesMes++;

      if (produzida && (estado === 'op_concluida' || estado === 'divergencia_qtde')) {
        const sku = SIGLA_PARA_SKU[sigla] || SIGLA_PARA_SKU[sigla.replace(/2K$/i,"").replace(/\/3$/,"").replace(/SAMS$/i,"")];
        if (sku) produzidoPorSku[sku] = (produzidoPorSku[sku] || 0) + produzida;
      }
    }
  }
  const eficienciaMes = planejadoConcluidasMes > 0 ? realizadoMes / planejadoConcluidasMes : 0;
  return { planejadoMes, realizadoMes, eficienciaMes, pendentesMes, produzidoPorSku };
}

// ============================================================================
// Dashboard Cache
// ============================================================================

export async function buildDashboardCache(env) {
  const { ano, mes } = hojeBrasil();
  const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  const data = {
    mesLabel: nomes[mes - 1],
    geradoEm: new Date().toISOString(),
    planejado: null, realizado: null, eficiencia: null,
    extraLabel: null, extraValue: null,
    mes: { planejado: null, realizado: null, eficiencia: null, pendentes: null },
    familias: [], tendencia: null, skuMensal: null,
    calGrid: null,
  };

  // 0. Sincroniza a "Produção por Lote" com a aba mensal (aditiva, preserva F/H).
  //    Guarda o mapa dia→linha para o preenchimento do realizado (Omie) abaixo.
  let mapaLinhasLote = {};
  try {
    const sinc = await sincronizarProducaoPorLote(env, ano, mes);
    if (sinc && sinc.mapa) mapaLinhasLote = sinc.mapa;
  } catch (e) {
    console.warn(`⚠️ Sinc Produção por Lote: ${e.message}`);
  }

  // 1. Plano: aba "Produção por Lote" via Sheets API
  try {
    data.calGrid = await buildCalendarFromPlanilha(env, ano, mes);
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
    console.log(`✅ Plano: ${_celdas} células`);

    console.log(`✅ Execução: ${resultado._lotesComExec} matches, ${resultado._lotesCount} lotes`);

    // Garante o mapa dia→linha (das linhas sincronizadas no passo 0) para gravar F/H
    data.calGrid.mapLinhas = { ...(data.calGrid.mapLinhas || {}), ...mapaLinhasLote };

    // Preenche Nº do Lote + Qtd. Produzida na aba "Produção por Lote"
    await preencherLotesRealizado(env, data.calGrid, ano, mes);
  } catch (e) {
    console.warn(`⚠️ Execução: ${e.message}`);
  }

  return data;
}
