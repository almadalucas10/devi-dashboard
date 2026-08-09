// ============================================================================
// KPIs Omie — 8 indicadores + ranking + tendência
// Port de buscarKPIsOmie(), calcularTendenciaDeMovimentos_(),
// calcularRankingDeMovimentos_(), buscarRealizadoProducao_()
// ============================================================================
import { chamarOmie, buscarOPs, buscarMovimentoEstoque, buscarProdutos, consultarProduto } from "./omie.js";
import { SKUS_ATIVOS, NOME_CURTO, MESES_ABREV } from "./constants.js";

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseDataBr(str) {
  if (!str || typeof str !== "string") return null;
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const y = parseInt(parts[2], 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

function abreviarDescricao(sku, desc) {
  if (NOME_CURTO[sku]) return NOME_CURTO[sku];
  if (!desc) return sku;
  let d = desc
    .replace(/Refrigerante Natural/i, "Refri")
    .replace(/Kombucha[ -]*/i, "Komb ")
    .replace(/Turma da M[ôo]nica/i, "Mônica")
    .replace(/D[ÊE]VI[ -]*/i, "")
    .replace(/269[ -]*m?[Ll]/i, "")
    .trim();
  return d || sku;
}

function dataParaStr(data) {
  const d = ("0" + data.getDate()).slice(-2);
  const m = ("0" + (data.getMonth() + 1)).slice(-2);
  return `${d}/${m}/${data.getFullYear()}`;
}

// ============================================================================
// Cache de produtos (codigo_produto → { codigo_produto, descricao, inativo })
// ============================================================================

export async function construirCacheProdutos(env) {
  const cache = {};

  // ListarProdutos paginado (até 10 pág = 1000 produtos). Plano pago aguenta.
  const { buscarTodasPaginas } = await import("./omie.js");
  let paginas = 0;
  try {
    const produtos = await buscarTodasPaginas(
      env,
      "/geral/produtos/",
      "ListarProdutos",
      (pagina) => ({ pagina, registros_por_pagina: 100 }),
      { maxPages: 10, pageDelay: 500 }
    );
    for (const p of produtos) {
      if (SKUS_ATIVOS.includes(p.codigo)) {
        cache[p.codigo] = {
          codigo_produto: p.codigo_produto,
          descricao: p.descricao || "",
        };
      }
    }
    paginas = Math.ceil(produtos.length / 100);
  } catch (e) {
    console.warn(`ListarProdutos: ${e.message}`);
  }

  // Fallback individual só para SKUs realmente não encontrados
  for (const sku of SKUS_ATIVOS) {
    if (!cache[sku]) {
      try {
        await sleep(500);
        const p = await consultarProduto(env, sku);
        if (p && p.codigo_produto) {
          cache[sku] = {
            codigo_produto: p.codigo_produto,
            descricao: p.descricao || "",
          };
        }
      } catch (e) {
        console.warn(`⚠️ SKU ${sku}: ${e.message}`);
      }
    }
  }

  console.log(`✅ CacheProd: ${Object.keys(cache).length}/${SKUS_ATIVOS.length} SKUs`);
  return cache;
}

// ============================================================================
// Realizado: ListarMovimentoEstoque por SKU, janelas bimestrais, filtro OPE/28.
// ============================================================================

export async function buscarRealizadoProducao(env, cacheProd) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const inicioAno = new Date(anoAtual, 0, 1);

  // Janelas bimestrais (evita truncamento por range grande)
  const janelas = [];
  for (let m = 0; m < 12; m += 2) {
    const iniMes = m;
    let fimMes = m + 1;
    if (fimMes > 11) fimMes = 11;
    const ini = new Date(anoAtual, iniMes, 1);
    if (ini > hoje) break;
    let fim = new Date(anoAtual, fimMes + 1, 0);
    if (fim > hoje) fim = hoje;
    janelas.push({
      ini: `01/${("0" + (iniMes + 1)).slice(-2)}/${anoAtual}`,
      fim: `${("0" + fim.getDate()).slice(-2)}/${("0" + (fim.getMonth() + 1)).slice(-2)}/${anoAtual}`,
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
            nPagina: pagina,
            nRegPorPagina: 100,
            idProd: prod.codigo_produto,
            dDtInicial: janela.ini,
            dDtFinal: janela.fim,
            codigo_local_estoque: 3125334492,
          });
          nTotPaginas = resultado.nTotPaginas || 1;
          totalChamadas++;

          (resultado.movProdutoListar || []).forEach((mov) => {
            if (mov.codOrigem !== "OPE") return;
            if (mov.tipo !== "entrada") return;
            if (mov.operacao !== "28") return;
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
        else console.warn(`⚠️ Realizado ${sku}/${janela.ini}: ${e.message}`);
      }
    }
  }

  console.log(`✅ Realizado OPE/28: ${realizado.length} movimentos, ${totalChamadas} chamadas`);
  return realizado;
}

// ============================================================================
// calcularTendencia / calcularRanking
// ============================================================================

export function calcularTendencia(movimentos) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const meses = [];
  const valores = [];

  // Últimos 8 meses (ou até o mês atual)
  const inicio = new Date(anoAtual, hoje.getMonth() - 7, 1);
  for (let m = inicio.getMonth(), y = inicio.getFullYear(), i = 0; i < 8; i++) {
    meses.push(MESES_ABREV[m]);
    const entradas = movimentos
      .filter((p) => p.data.getMonth() === m && p.data.getFullYear() === y)
      .reduce((sum, p) => sum + p.entradas, 0);
    valores.push(entradas);

    m++;
    if (m > 11) { m = 0; y++; }
    if (y > anoAtual || (y === anoAtual && m > hoje.getMonth())) break;
  }

  return { meses, valores };
}

export function calcularRanking(movimentos, descricoes) {
  const porSku = {};
  for (const m of movimentos) {
    if (!porSku[m.codigo]) porSku[m.codigo] = 0;
    porSku[m.codigo] += m.entradas;
  }

  return Object.entries(porSku)
    .map(([codigo, total]) => ({
      codigo,
      descricao: descricoes[codigo] || abreviarDescricao(codigo),
      total,
    }))
    .sort((a, b) => b.total - a.total);
}

// ============================================================================
// buscarKPIsOmie — os 8 KPIs
// ============================================================================

/**
 * @param {object} env
 * @param {object} cacheProd — mapa SKU → { codigo_produto, descricao }
 * @param {object} [prefetched] — dados já buscados (evita dupla chamada no batch-2)
 * @param {Array} [prefetched.concluidas] — OPs concluídas
 * @param {Array} [prefetched.abertas] — OPs abertas
 * @param {Array} [prefetched.realizadoMov] — movimentos OPE/28 já filtrados
 */
export async function buscarKPIsOmie(env, cacheProd, prefetched = {}) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth();
  const inicioAno = new Date(anoAtual, 0, 1);
  const dDtInicioAno = `01/01/${anoAtual}`;
  const dDtHoje = dataParaStr(hoje);

  // Mapa codigo_produto → SKU (normaliza pra número — Omie às vezes retorna string)
  const codParaSku = {};
  for (const sku of Object.keys(cacheProd)) {
    const cp = cacheProd[sku];
    if (cp && cp.codigo_produto) {
      codParaSku[String(cp.codigo_produto)] = sku;
    }
  }

  // Usa dados pré-buscados ou busca da Omie
  const hasPrefetched = prefetched.concluidas && prefetched.abertas;

  const concluidas = prefetched.concluidas || await buscarOPs(env, {
    dDtConclusaoDe: dDtInicioAno,
    dDtConclusaoAte: dDtHoje,
    cConcluida: "S",
  });

  if (!hasPrefetched) await sleep(3000);

  const abertas = prefetched.abertas || await buscarOPs(env, { cConcluida: "N" });

  // ============ KPIs ANUAIS ============

  // 1. PLANEJADO ANO — nQtde todas OPs (SKUs ativos)
  const todas = [...concluidas, ...abertas];
  let planejadoAno = 0;
  for (const op of todas) {
    const ident = op.identificacao || {};
    if (!codParaSku[String(ident.nCodProduto)]) continue;
    planejadoAno += ident.nQtde || 0;
  }

  // 2. REALIZADO ANO — nQtde das OPs concluídas (fonte de verdade do Omie)
  let realizadoAno = 0;
  for (const op of concluidas) {
    const ident = op.identificacao || {};
    if (!codParaSku[String(ident.nCodProduto)]) continue;
    realizadoAno += ident.nQtde || 0;
  }

  // 3. EFICIÊNCIA ANO — realizado / planejado só das concluídas
  let planejadoConcluidasAno = 0;
  for (const op of concluidas) {
    const ident = op.identificacao || {};
    if (!codParaSku[String(ident.nCodProduto)]) continue;
    planejadoConcluidasAno += ident.nQtde || 0;
  }
  const eficienciaAno = planejadoConcluidasAno > 0 ? realizadoAno / planejadoConcluidasAno : 0;

  // 4. OCUPAÇÃO ANO — dias úteis com ≥ 1 OP ativa
  const diasAtivos = new Set();
  for (const op of todas) {
    const inf = op.infAdicionais || {};
    const outras = op.outrasInf || {};
    const inicio = parseDataBr(inf.dDtInicio);
    if (!inicio || isNaN(inicio.getTime())) continue;
    const fimStr = outras.dConclusao;
    let fim = parseDataBr(fimStr);
    if (!fim || isNaN(fim.getTime())) fim = hoje;

    const cursor = new Date(inicio);
    while (cursor <= fim && cursor <= hoje) {
      if (cursor >= inicioAno) {
        const ds = cursor.getDay();
        if (ds !== 0 && ds !== 6) {
          diasAtivos.add(dataParaStr(cursor));
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  let totalDiasUteis = 0;
  const cursorDU = new Date(inicioAno);
  while (cursorDU <= hoje) {
    const ds = cursorDU.getDay();
    if (ds !== 0 && ds !== 6) totalDiasUteis++;
    cursorDU.setDate(cursorDU.getDate() + 1);
  }
  const ocupacaoAno = totalDiasUteis > 0 ? diasAtivos.size / totalDiasUteis : 0;

  // ============ KPIs MÊS ============

  // 5. PLANEJADO MÊS — abertas (todas) + concluídas no mês
  let planejadoMes = 0;
  for (const op of abertas) {
    const ident = op.identificacao || {};
    if (!codParaSku[String(ident.nCodProduto)]) continue;
    planejadoMes += ident.nQtde || 0;
  }
  for (const op of concluidas) {
    const ident = op.identificacao || {};
    if (!codParaSku[String(ident.nCodProduto)]) continue;
    const conclusao = parseDataBr(
      (op.outrasInf && op.outrasInf.dConclusao) ||
      (op.infAdicionais && op.infAdicionais.dDtConclusao)
    );
    if (conclusao && conclusao.getMonth() === mesAtual && conclusao.getFullYear() === anoAtual) {
      planejadoMes += ident.nQtde || 0;
    }
  }

  // 6. REALIZADO MÊS — nQtde das OPs concluídas no mês
  let realizadoMes = 0;
  for (const op of concluidas) {
    const ident = op.identificacao || {};
    if (!codParaSku[String(ident.nCodProduto)]) continue;
    const conclusao = parseDataBr(
      (op.outrasInf && op.outrasInf.dConclusao) ||
      (op.infAdicionais && op.infAdicionais.dDtConclusao)
    );
    if (conclusao && conclusao.getMonth() === mesAtual && conclusao.getFullYear() === anoAtual) {
      realizadoMes += ident.nQtde || 0;
    }
  }

  // 7. EFICIÊNCIA MÊS
  const eficienciaMes = planejadoMes > 0 ? realizadoMes / planejadoMes : 0;

  // 8. PENDENTES MÊS — número de OPs abertas (SKUs ativos)
  let pendentesMes = 0;
  for (const op of abertas) {
    const ident = op.identificacao || {};
    if (codParaSku[String(ident.nCodProduto)]) pendentesMes++;
  }

  // _opsConcluidas para ranking/tendência (nQtde das OPs concluídas)
  const opsConcluidas = [];
  for (const op of concluidas) {
    const ident = op.identificacao || {};
    if (!codParaSku[String(ident.nCodProduto)]) continue;
    const dataStr = (op.outrasInf && op.outrasInf.dConclusao) ||
                    (op.infAdicionais && op.infAdicionais.dDtConclusao);
    if (!dataStr) continue;
    opsConcluidas.push({
      codigo: codParaSku[String(ident.nCodProduto)],
      nQtde: ident.nQtde || 0,
      dataStr,
    });
  }));

  return {
    planejadoAno,
    realizadoAno,
    eficienciaAno,
    ocupacaoAno,
    planejadoMes,
    realizadoMes,
    eficienciaMes,
    pendentesMes,
    _opsConcluidas: opsConcluidas,
  };
}

// ============================================================================
// Wrapper completo: KPIs + ranking + tendência
// ============================================================================

export async function calcularIndicadoresOmie(env) {
  const cacheProd = await construirCacheProdutos(env);
  const kpisResult = await buscarKPIsOmie(env, cacheProd);

  // Descrições para ranking
  const descricoes = {};
  for (const sku of Object.keys(cacheProd)) {
    descricoes[sku] = abreviarDescricao(sku, cacheProd[sku].descricao);
  }

  // Tendência/Ranking a partir dos dados reais (_opsConcluidas)
  const producao = (kpisResult._opsConcluidas || [])
    .filter((op) => op.codigo)
    .map((op) => ({
      codigo: op.codigo,
      data: parseDataBr(op.dataStr),
      entradas: op.nQtde,
    }))
    .filter((m) => m.data);

  const tendenciaProducao = calcularTendencia(producao);
  const rankingProducao = calcularRanking(producao, descricoes);

  return {
    kpis: {
      planejadoAno: kpisResult.planejadoAno,
      realizadoAno: kpisResult.realizadoAno,
      eficienciaAno: kpisResult.eficienciaAno,
      ocupacaoAno: kpisResult.ocupacaoAno,
      planejadoMes: kpisResult.planejadoMes,
      realizadoMes: kpisResult.realizadoMes,
      eficienciaMes: kpisResult.eficienciaMes,
      pendentesMes: kpisResult.pendentesMes,
    },
    tendenciaProducao,
    rankingProducao,
  };
}
