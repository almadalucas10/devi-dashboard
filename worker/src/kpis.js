// ============================================================================
// KPIs Omie + Ranking + Tendência + Realizado OPE/28
// ============================================================================
import { chamarOmie, buscarOPs, buscarTodasPaginas, consultarProduto } from "./omie.js";
import { SKUS_ATIVOS, NOME_CURTO, MESES_ABREV, CODIGO_LOCAL_ESTOQUE_CD_DEVI } from "./constants.js";
import { hojeBrasilDate } from "./fuso.js";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

function abreviarDescricao(sku, desc) {
  if (NOME_CURTO[sku]) return NOME_CURTO[sku];
  if (!desc) return sku;
  return desc.replace(/Refrigerante Natural/i,"Refri").replace(/Kombucha[ -]*/i,"Komb ")
    .replace(/Turma da M[ôo]nica/i,"Mônica").replace(/D[ÊE]VI[ -]*/i,"").replace(/269[ -]*m?[Ll]/i,"").trim() || sku;
}

// ============================================================================
// Cache de produtos
// ============================================================================

export async function construirCacheProdutos(env) {
  const cache = {};
  try {
    const produtos = await buscarTodasPaginas(env, "/geral/produtos/", "ListarProdutos",
      (p) => ({ pagina: p, registros_por_pagina: 100 }),
      { maxPages: 10, pageDelay: 500 });
    for (const p of produtos) {
      if (SKUS_ATIVOS.includes(p.codigo)) {
        cache[p.codigo] = { codigo_produto: p.codigo_produto, descricao: p.descricao || "" };
      }
    }
  } catch (e) { console.warn(`ListarProdutos: ${e.message}`); }

  for (const sku of SKUS_ATIVOS) {
    if (!cache[sku]) {
      try { await sleep(500); const p = await consultarProduto(env, sku);
        if (p && p.codigo_produto) cache[sku] = { codigo_produto: p.codigo_produto, descricao: p.descricao || "" };
      } catch (e) { console.warn(`⚠️ ${sku}: ${e.message}`); }
    }
  }
  console.log(`✅ CacheProd: ${Object.keys(cache).length}/${SKUS_ATIVOS.length}`);
  return cache;
}

// ============================================================================
// Realizado: ListarMovimentoEstoque OPE/entrada/28, janelas bimestrais
// ============================================================================

export async function buscarRealizadoProducao(env, cacheProd) {
  const hoje = hojeBrasilDate();
  const anoAtual = hoje.getFullYear();
  const inicioAno = new Date(anoAtual, 0, 1);

  const janelas = [];
  for (let m = 0; m < 12; m += 2) {
    const iniMes = m; let fimMes = m + 1;
    if (fimMes > 11) fimMes = 11;
    const ini = new Date(anoAtual, iniMes, 1);
    if (ini > hoje) break;
    let fim = new Date(anoAtual, fimMes + 1, 0);
    if (fim > hoje) fim = hoje;
    janelas.push({
      ini: `01/${("0"+(iniMes+1)).slice(-2)}/${anoAtual}`,
      fim: dataParaStr(fim),
    });
  }

  const realizado = [];
  let totalChamadas = 0;

  for (let i = 0; i < SKUS_ATIVOS.length; i++) {
    const sku = SKUS_ATIVOS[i];
    const prod = cacheProd[sku];
    if (!prod || !prod.codigo_produto) continue;
    if (i > 0) await sleep(400);

    for (const janela of janelas) {
      try {
        let pagina = 1, nTotPaginas = 1;
        do {
          const resultado = await chamarOmie(env, "/estoque/consulta/", "ListarMovimentoEstoque", {
            nPagina: pagina, nRegPorPagina: 100, idProd: prod.codigo_produto,
            dDtInicial: janela.ini, dDtFinal: janela.fim,
            codigo_local_estoque: CODIGO_LOCAL_ESTOQUE_CD_DEVI,
          });
          nTotPaginas = resultado.nTotPaginas || 1;
          totalChamadas++;

          (resultado.movProdutoListar || []).forEach(mov => {
            if (mov.codOrigem !== "OPE" || mov.tipo !== "entrada" || mov.operacao !== "28") return;
            const data = parseDataBr(mov.dtMov);
            if (!data || data < inicioAno) return;
            const qtd = mov.qtde || 0;
            if (qtd <= 0) return;
            realizado.push({ codigo: sku, data, entradas: qtd });
          });
          pagina++;
          if (pagina <= nTotPaginas) await sleep(200);
        } while (pagina <= nTotPaginas);
      } catch (e) {
        if (e.message.includes("8020")) await sleep(3000);
        else console.warn(`⚠️ ${sku}/${janela.ini}: ${e.message}`);
      }
    }
  }

  console.log(`✅ Realizado OPE/28: ${realizado.length} movimentos, ${totalChamadas} chamadas`);
  return realizado;
}

// ============================================================================
// Tendência e Ranking
// ============================================================================

export function calcularTendencia(movimentos) {
  const hoje = hojeBrasilDate();
  const anoAtual = hoje.getFullYear();
  const meses = [], valores = [];
  const inicio = new Date(anoAtual, hoje.getMonth() - 7, 1);
  for (let m = inicio.getMonth(), y = inicio.getFullYear(), i = 0; i < 8; i++) {
    meses.push(MESES_ABREV[m]);
    valores.push(movimentos.filter(p => p.data.getMonth() === m && p.data.getFullYear() === y).reduce((s, p) => s + p.entradas, 0));
    m++; if (m > 11) { m = 0; y++; }
    if (y > anoAtual || (y === anoAtual && m > hoje.getMonth())) break;
  }
  return { meses, valores };
}

export function calcularRanking(movimentos, descricoes) {
  const porSku = {};
  for (const m of movimentos) { porSku[m.codigo] = (porSku[m.codigo] || 0) + m.entradas; }
  return Object.entries(porSku)
    .map(([codigo, total]) => ({ codigo, descricao: descricoes[codigo] || abreviarDescricao(codigo), total }))
    .sort((a, b) => b.total - a.total);
}

// ============================================================================
// buscarKPIsOmie — 8 KPIs
// ============================================================================

export async function buscarKPIsOmie(env, cacheProd, prefetched = {}) {
  const hoje = hojeBrasilDate();
  const anoAtual = hoje.getFullYear(), mesAtual = hoje.getMonth();
  const inicioAno = new Date(anoAtual, 0, 1);
  const dDtInicioAno = `01/01/${anoAtual}`;
  const dDtHoje = dataParaStr(hoje);

  const codParaSku = {};
  for (const sku of Object.keys(cacheProd)) {
    const cp = cacheProd[sku];
    if (cp && cp.codigo_produto) codParaSku[String(cp.codigo_produto)] = sku;
  }

  const hasPrefetched = prefetched.concluidas && prefetched.abertas;

  const concluidas = prefetched.concluidas || await buscarOPs(env, { dDtConclusaoDe: dDtInicioAno, dDtConclusaoAte: dDtHoje, cConcluida: "S" });
  if (!hasPrefetched) await sleep(3000);
  const abertas = prefetched.abertas || await buscarOPs(env, { cConcluida: "N" });

  const realizadoMov = prefetched.realizadoMov || await buscarRealizadoProducao(env, cacheProd);

  // ============ KPIs ANUAIS ============

  const todas = [...concluidas, ...abertas];
  let planejadoAno = 0;
  for (const op of todas) { const ident = op.identificacao || {}; if (codParaSku[String(ident.nCodProduto)]) planejadoAno += ident.nQtde || 0; }

  let realizadoAno = 0;
  for (const m of realizadoMov) realizadoAno += m.entradas;

  let planejadoConcluidasAno = 0;
  for (const op of concluidas) { const ident = op.identificacao || {}; if (codParaSku[String(ident.nCodProduto)]) planejadoConcluidasAno += ident.nQtde || 0; }
  const eficienciaAno = planejadoConcluidasAno > 0 ? realizadoAno / planejadoConcluidasAno : 0;

  // Ocupação
  const diasAtivos = new Set();
  for (const op of todas) {
    const inf = op.infAdicionais || {}, outras = op.outrasInf || {};
    const inicio = parseDataBr(inf.dDtInicio);
    if (!inicio || isNaN(inicio.getTime())) continue;
    let fim = parseDataBr(outras.dConclusao);
    if (!fim || isNaN(fim.getTime())) fim = hoje;
    const cursor = new Date(inicio);
    while (cursor <= fim && cursor <= hoje) {
      if (cursor >= inicioAno && cursor.getDay() !== 0 && cursor.getDay() !== 6) diasAtivos.add(dataParaStr(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  let totalDiasUteis = 0;
  const cursorDU = new Date(inicioAno);
  while (cursorDU <= hoje) { if (cursorDU.getDay() !== 0 && cursorDU.getDay() !== 6) totalDiasUteis++; cursorDU.setDate(cursorDU.getDate() + 1); }
  const ocupacaoAno = totalDiasUteis > 0 ? diasAtivos.size / totalDiasUteis : 0;

  // ============ KPIs MÊS ============

  let planejadoMes = 0;
  for (const op of abertas) { const ident = op.identificacao || {}; if (codParaSku[String(ident.nCodProduto)]) planejadoMes += ident.nQtde || 0; }
  for (const op of concluidas) {
    const ident = op.identificacao || {};
    if (!codParaSku[String(ident.nCodProduto)]) continue;
    const c = parseDataBr((op.outrasInf && op.outrasInf.dConclusao) || (op.infAdicionais && op.infAdicionais.dDtConclusao));
    if (c && c.getMonth() === mesAtual && c.getFullYear() === anoAtual) planejadoMes += ident.nQtde || 0;
  }

  let realizadoMes = 0;
  for (const m of realizadoMov) { if (m.data.getMonth() === mesAtual && m.data.getFullYear() === anoAtual) realizadoMes += m.entradas; }
  // Fallback: se OPE/28 vazio no mês, usa nQtde das OPs concluídas
  // (considera tanto as com data de conclusão no mês quanto as sem data)
  if (realizadoMes === 0) {
    for (const op of concluidas) {
      const ident = op.identificacao || {};
      if (!codParaSku[String(ident.nCodProduto)]) continue;
      const c = parseDataBr((op.outrasInf && op.outrasInf.dConclusao) || (op.infAdicionais && op.infAdicionais.dDtConclusao));
      if (c && c.getMonth() === mesAtual && c.getFullYear() === anoAtual) {
        realizadoMes += ident.nQtde || 0;
      }
    }
    // Se ainda zero, soma TODAS as concluídas (sem filtro de data)
    if (realizadoMes === 0) {
      for (const op of concluidas) {
        const ident = op.identificacao || {};
        if (codParaSku[String(ident.nCodProduto)]) realizadoMes += ident.nQtde || 0;
      }
    }
  }
  const eficienciaMes = planejadoMes > 0 ? realizadoMes / planejadoMes : 0;

  let pendentesMes = 0;
  for (const op of abertas) { if (codParaSku[String((op.identificacao||{}).nCodProduto)]) pendentesMes++; }

  // _opsConcluidas para ranking/tendência via OPE/28
  const opsConcluidas = realizadoMov.map(m => ({ codigo: m.codigo, nQtde: m.entradas, dataStr: dataParaStr(m.data) }));

  return { planejadoAno, realizadoAno, eficienciaAno, ocupacaoAno, planejadoMes, realizadoMes, eficienciaMes, pendentesMes, _opsConcluidas: opsConcluidas };
}

// ============================================================================
// Wrapper: KPIs + ranking + tendência
// ============================================================================

export async function calcularIndicadoresOmie(env) {
  const cacheProd = await construirCacheProdutos(env);
  const kpisResult = await buscarKPIsOmie(env, cacheProd);

  const descricoes = {};
  for (const sku of Object.keys(cacheProd)) descricoes[sku] = abreviarDescricao(sku, cacheProd[sku].descricao);

  const producao = (kpisResult._opsConcluidas || []).filter(op => op.codigo)
    .map(op => ({ codigo: op.codigo, data: parseDataBr(op.dataStr), entradas: op.nQtde })).filter(m => m.data);

  return { kpis: { ...kpisResult, _opsConcluidas: undefined }, tendenciaProducao: calcularTendencia(producao), rankingProducao: calcularRanking(producao, descricoes) };
}
