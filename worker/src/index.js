// ============================================================================
// Dashboard PCP Worker
// Sync leve (30min): dashboard + fila + estoque
// Sync pesado (1x/dia 6h BRT): KPIs + ranking + vendas + cobertura
// ============================================================================
import { readJson, writeJson, writeSyncMeta } from "./r2.js";
import { construirCacheProdutos, calcularIndicadoresOmie } from "./kpis.js";
import { buscarFilaDePedidos } from "./fila.js";
import { buscarEstoque } from "./estoque.js";
import { buscarEstoqueInsumos } from "./insumos.js";
import { buildDashboardCache, extrairKPIsDoCalendario } from "./dashboard.js";
import { atualizarAgregadoVendas, recalcularCobertura } from "./cobertura.js";
import { enriquecerEstoqueRuptura } from "./ruptura.js";
import { hojeBrasil } from "./fuso.js";
import { R2_KEYS } from "./constants.js";

// ============================================================================
// Sync leve — a cada 30 min (dashboard + fila + estoque)
// ============================================================================

async function runLightSync(env) {
  const t0 = Date.now();
  console.log("[light] iniciando...");

  // Dashboard (planilha)
  try {
    const dashData = await buildDashboardCache(env);
    await writeJson(env, R2_KEYS.dashboard, dashData);
    console.log(`[light] ✅ Dashboard: ${dashData.mesLabel || "?"} | Planejado: ${dashData.planejado}`);
  } catch (e) {
    console.error(`[light] ⚠️ Dashboard: ${e.message}`);
  }

  // Omie leves (fila + estoque)
  try {
    const partial = (await readJson(env, R2_KEYS.omie)) || { geradoEm: new Date().toISOString() };
    partial.geradoEm = new Date().toISOString();
    const cacheProd = await construirCacheProdutos(env);

    try {
      partial.filaDePedidos = await buscarFilaDePedidos(env);
      console.log(`[light] ✅ Fila: ${partial.filaDePedidos.length} pedidos`);
    } catch (e) {
      partial.filaDePedidos = { erro: e.message };
      console.error(`[light] ❌ Fila: ${e.message}`);
    }

    try {
      partial.estoque = await buscarEstoque(env, cacheProd);
      console.log(`[light] ✅ Estoque: ${partial.estoque.length} SKUs`);
    } catch (e) {
      partial.estoque = { erro: e.message };
      console.error(`[light] ❌ Estoque: ${e.message}`);
    }

    try {
      partial.insumos = await buscarEstoqueInsumos(env);
      console.log(`[light] ✅ Insumos: ${partial.insumos.length} itens`);
    } catch (e) {
      partial.insumos = { erro: e.message };
      console.error(`[light] ❌ Insumos: ${e.message}`);
    }

    // Demanda da fila × estoque
    try {
      if (Array.isArray(partial.filaDePedidos) && Array.isArray(partial.estoque)) {
        const dem = {};
        const naoMapeados = [];
        const skusValidos = new Set(Object.keys(cacheProd));
        console.log(`🔍 cacheProd keys (${skusValidos.size}): ${[...skusValidos].join(', ')}`);
        for (const pedido of partial.filaDePedidos) {
          for (const item of (pedido.itens || [])) {
            const sku = item.codigo;
            if (!sku) continue;
            if (!skusValidos.has(sku)) { naoMapeados.push(sku); continue; }
            dem[sku] = (dem[sku] || 0) + (item.qtde || 0);
          }
        }
        const semMinimo = [];
        // Candidatos: SKUs com demanda na fila + todos do estoque —
        // abaixo do mínimo entra mesmo sem pedido na fila (ex.: CH003)
        const candidatos = new Set(Object.keys(dem));
        for (const e of partial.estoque) {
          if (e && e.codigo) candidatos.add(e.codigo);
        }
        const itens = [...candidatos].map((sku) => {
          const pedido = dem[sku] || 0;
          const e = partial.estoque.find(x => x.codigo === sku);
          const saldo = e ? (e.saldo || 0) : 0;
          const descricao = e ? (e.descricao || sku) : sku;
          const minimo = e ? (e.estoqueMinimo || 0) : 0;
          if (!minimo) semMinimo.push(sku);
          const necessidade = pedido + minimo - saldo;
          return { sku, descricao, pedido, saldo, minimo, necessidade: Math.max(0, necessidade) };
        }).filter(i => i.necessidade > 0)
          .sort((a, b) => b.necessidade - a.necessidade);
        const total = itens.reduce((s, i) => s + i.pedido, 0);
        partial.reposicao = { itens, totalUnidades: total, pedidosConsiderados: partial.filaDePedidos.length, semMinimo, naoMapeados, geradoEm: new Date().toISOString() };
        console.log(`[light] ✅ Reposição: ${itens.length} SKUs, ${total} un`);
      }
    } catch (e) { console.error(`[light] ⚠️ Demanda fila: ${e.message}`); }

    // Cobertura recalculada com saldo fresco (usa vendas-90d.json em cache)
    if (Array.isArray(partial.estoque)) {
      try {
        partial.cobertura = await recalcularCobertura(env, partial.estoque);
        enriquecerEstoqueRuptura(partial.estoque, partial.cobertura);
        await writeSyncMeta(env, { cobertura: Date.now() });
        console.log(`[light] ✅ Cobertura: ${partial.cobertura.critico ? partial.cobertura.critico.cobertura + 'd' : 'ok'}`);
      } catch (e) {
        console.error(`[light] ⚠️ Cobertura: ${e.message}`);
      }
    }

    // KPIs do calendário (fonte única)
    try {
      const dashData = await readJson(env, R2_KEYS.dashboard);
      if (dashData && dashData.calGrid) {
        const h = hojeBrasil();
        const kcal = extrairKPIsDoCalendario(dashData.calGrid, h.ano, h.mes);
        if (!partial.kpis || partial.kpis.erro) partial.kpis = {};
        Object.assign(partial.kpis, {
          planejadoMes: kcal.planejadoMes,
          realizadoMes: kcal.realizadoMes,
          eficienciaMes: kcal.eficienciaMes,
          pendentesMes: kcal.pendentesMes,
        });
      }
    } catch (e) { console.error(`[light] ⚠️ KPIs calendário: ${e.message}`); }

    await writeJson(env, R2_KEYS.omie, partial);
  } catch (e) {
    console.error(`[light] ❌ ${e.message}`);
  }

  console.log(`[light] concluído em ${Date.now() - t0}ms`);
}

// ============================================================================
// Sync pesado — 1x/dia (KPIs + ranking + vendas + cobertura)
// ============================================================================

async function runHeavySync(env) {
  const t0 = Date.now();
  console.log("[heavy] iniciando...");

  try {
    const data = (await readJson(env, R2_KEYS.omie)) || { geradoEm: new Date().toISOString() };
    data.geradoEm = new Date().toISOString();

    const cacheProd = await construirCacheProdutos(env);

    // Atualiza fila + estoque também (dados frescos)
    try {
      data.filaDePedidos = await buscarFilaDePedidos(env);
      console.log(`[heavy] ✅ Fila: ${data.filaDePedidos.length} pedidos`);
    } catch (e) {
      data.filaDePedidos = { erro: e.message };
    }

    try {
      data.estoque = await buscarEstoque(env, cacheProd);
      console.log(`[heavy] ✅ Estoque: ${data.estoque.length} SKUs`);
    } catch (e) {
      data.estoque = { erro: e.message };
    }

    // KPIs + Ranking + Tendência (usa OPE/28, pesado)
    try {
      const indicadores = await calcularIndicadoresOmie(env);
      data.kpis = indicadores.kpis;
      data.tendenciaProducao = indicadores.tendenciaProducao;
      data.rankingProducao = indicadores.rankingProducao;
      console.log(`[heavy] ✅ KPIs: pendentes=${data.kpis.pendentesMes}`);
    } catch (e) {
      data.kpis = { erro: e.message };
      data.tendenciaProducao = { erro: e.message };
      data.rankingProducao = { erro: e.message };
      console.error(`[heavy] ❌ KPIs: ${e.message}`);
    }

    // Atualiza agregado de vendas (ListarPedidos 90d, 1x/dia)
    try {
      await atualizarAgregadoVendas(env);
      await writeSyncMeta(env, { vendas: Date.now() });
      console.log(`[heavy] ✅ Vendas 90d atualizadas`);
    } catch (e) {
      console.error(`[heavy] ⚠️ Vendas: ${e.message}`);
    }

    // Cobertura com vendas frescas + saldo fresco
    if (Array.isArray(data.estoque)) {
      try {
        data.cobertura = await recalcularCobertura(env, data.estoque);
        enriquecerEstoqueRuptura(data.estoque, data.cobertura);
        await writeSyncMeta(env, { cobertura: Date.now() });
        console.log(`[heavy] ✅ Cobertura: ${data.cobertura.critico ? data.cobertura.critico.cobertura + 'd' : 'ok'}`);
      } catch (e) {
        data.cobertura = { erro: e.message };
        console.error(`[heavy] ⚠️ Cobertura: ${e.message}`);
      }
    }

    // KPIs do calendário (fonte única: plano + executado)
    try {
      const dashData = await readJson(env, R2_KEYS.dashboard);
      if (dashData && dashData.calGrid) {
        const h = hojeBrasil();
        const kcal = extrairKPIsDoCalendario(dashData.calGrid, h.ano, h.mes);
        if (data.kpis && !data.kpis.erro) {
          data.kpis.planejadoMes = kcal.planejadoMes;
          data.kpis.realizadoMes = kcal.realizadoMes;
          data.kpis.eficienciaMes = kcal.eficienciaMes;
          data.kpis.pendentesMes = kcal.pendentesMes;
          if (data.tendenciaProducao && data.tendenciaProducao.valores) {
            const mesIdx = h.mes - 1;
            data.tendenciaProducao.valores[mesIdx] = kcal.realizadoMes;
            data.kpis.realizadoAno = data.tendenciaProducao.valores.reduce((a,v)=>a+v,0);
          }
        }
      }
    } catch (e) { console.error(`[heavy] ⚠️ KPIs calendário: ${e.message}`); }

    // Qualidade — pré-aquece a lista de OPs abertas (cache do formulário do tablet)
    try {
      const { listarFichasDoDia } = await import("./qualidade.js");
      const dados = await listarFichasDoDia(env, new Date().toISOString().slice(0, 10));
      await writeJson(env, R2_KEYS.qualidadeFichas, { _ts: Date.now(), dados });
      console.log(`[heavy] ✅ Qualidade fichas: ${dados.fichas.length} OPs`);
    } catch (e) { console.error(`[heavy] ⚠️ Qualidade fichas: ${e.message}`); }

    await writeJson(env, R2_KEYS.omie, data);
    await writeSyncMeta(env, { omie: Date.now() });
    console.log(`[heavy] ✅ R2 salvo`);
  } catch (e) {
    console.error(`[heavy] ❌ ${e.message}`);
  }

  console.log(`[heavy] concluído em ${Date.now() - t0}ms`);
}

// ============================================================================
// Helpers
// ============================================================================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ============================================================================
// Entry point
// ============================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    if (url.pathname === "/api/debug/estruturas") {
      try {
        const { buscarTodasPaginas } = await import("./omie.js");
        // Tenta vários endpoints de estrutura
        const endpoints = [
          "/produtos/estrutura/", "/geral/produtos/", "/produtos/consultaestrutura/",
          "/geral/estrutura/", "/produtos/receita/", "/produtos/composicao/",
        ];
        const metodos = ["ListarEstruturas", "ConsultarEstrutura", "ListarComposicao", "PesquisarEstrutura"];
        const results = {};
        for (const ep of endpoints) {
          for (const mt of metodos) {
            try {
              const r = await (await import("./omie.js")).chamarOmie(env, ep, mt, { nPagina: 1, nRegPorPagina: 3 });
              results[`${ep} ${mt}`] = { keys: Object.keys(r).slice(0,10), total: r.nTotRegistros || r.total_de_registros || 0 };
            } catch(e) { results[`${ep} ${mt}`] = { erro: e.message.slice(0,80) }; }
          }
        }
        return json(results);
      } catch(e) { return json({ erro: e.message }, 500); }
    }

    if (url.pathname === "/api/debug/almox") {
      try {
        const { chamarOmie } = await import("./omie.js");
        // Busca o codigo_produto numerico do MP018
        const p = await chamarOmie(env, "/geral/produtos/", "ConsultarProduto", { codigo: "MP018" });
        if (!p || !p.codigo_produto) return json({ erro: "MP018 nao encontrado" });
        // PosicaoEstoque com id_prod numerico
        const r = await chamarOmie(env, "/estoque/consulta/", "PosicaoEstoque", {
          codigo_local_estoque: 3125326654,
          id_prod: p.codigo_produto,
        });
        return json({ produto: p.codigo_produto, descricao: p.descricao, estoque: r });
      } catch(e) { return json({ erro: e.message }, 500); }
    }

    if (url.pathname === "/api/debug/almox-old") {
      try {
        const { chamarOmie } = await import("./omie.js");
        // ListarPosEstoque SEM filtro — todos os produtos no almoxarifado
        const r = await chamarOmie(env, "/estoque/consulta/", "ListarPosEstoque", {
          nPagina: 1, nRegPorPagina: 10,
          codigo_local_estoque: 3125326654,
        });
        const prods = (r.produtos || []).slice(0, 10);
        return json({ total: r.nTotRegistros || 0, paginas: r.nTotPaginas || 1, amostra: prods });
      } catch(e) { return json({ erro: e.message }, 500); }
    }

    if (url.pathname === "/api/debug/insumo-teste") {
      try {
        const { chamarOmie } = await import("./omie.js");
        const r = await chamarOmie(env, "/estoque/consulta/", "PosicaoEstoque", {
          codigo_local_estoque: 3132022755,
          id_prod: "MP018",
          data: "10/08/2026",
        });
        return json(r);
      } catch(e) { return json({ erro: e.message }, 500); }
    }

    if (url.pathname === "/api/debug/locais") {
      try {
        const { chamarOmie } = await import("./omie.js");
        const r = await chamarOmie(env, "/estoque/local/", "ListarLocaisEstoque", { nPagina: 1, nRegPorPagina: 50 });
        return json(r.cadastros || r);
      } catch(e) { return json({ erro: e.message }, 500); }
    }

    if (url.pathname === "/api/debug/produtos") {
      try {
        const { chamarOmie } = await import("./omie.js");
        const r = await chamarOmie(env, "/geral/produtos/", "ListarProdutos", { pagina: 1, registros_por_pagina: 3 });
        return json({ keys: Object.keys(r), total_paginas: r.total_de_paginas, total_registros: r.total_de_registros, amostra: (r.cadastros||r.produto_servico_cadastro||[]).slice(0,3) });
      } catch(e) { return json({ erro: e.message }, 500); }
    }

    if (url.pathname === "/api/debug/sa-email") {
      // E-mail do service account (para compartilhar a planilha com ele)
      try {
        const saJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
        const sa = saJson ? JSON.parse(saJson) : null;
        return json({ client_email: sa ? sa.client_email : null, temCredencial: !!saJson });
      } catch(e) { return json({ erro: e.message }, 500); }
    }

    if (url.pathname === "/api/debug/sheets-tabs") {
      // Lista as abas da planilha (procurar ficha técnica / estruturas)
      try {
        const { getAccessToken } = await import("./sheets.js");
        const token = await getAccessToken(env);
        const res = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}?fields=sheets.properties.title`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        const tabs = ((data.sheets || []).map(s => s.properties.title)).filter(Boolean);
        return json({ tabs, total: tabs.length, rawError: data.error || null, spreadId: env.SPREADSHEET_ID });
      } catch(e) { return json({ erro: e.message }, 500); }
    }

    if (url.pathname === "/api/debug/movimentos-saida") {
      // Levantamento: identifica a operação de SAÍDA de insumo do almoxarifado
      // (ListarMovimentoEstoque, 90 dias) — para validar consumo real × ficha
      try {
        const { chamarOmie } = await import("./omie.js");
        const fim = new Date();
        const ini = new Date(Date.now() - 90 * 24 * 3600 * 1000);
        const d = (x) => `${("0"+x.getDate()).slice(-2)}/${("0"+(x.getMonth()+1)).slice(-2)}/${x.getFullYear()}`;
        const raw = await chamarOmie(env, "/estoque/consulta/", "ListarMovimentoEstoque", {
          nPagina: 1,
          nRegPorPagina: 100,
          codigo_local_estoque: 3125326654,
          dDtInicial: d(ini),
          dDtFinal: d(fim),
        });
        const movs = raw.movProdutoListar || [];
        const combos = {};
        const saidas = { total: 0, qtde: 0 };
        for (const m of movs) {
          const tipo = m.tipo || "?";
          const key = `${tipo}|${m.codOrigem || "?"}|${m.operacao || "?"}|${m.desOrigem || ""}`;
          combos[key] = (combos[key] || 0) + 1;
          if (tipo === "saida" || m.qtde < 0) { saidas.total++; saidas.qtde += Math.abs(m.qtde || 0); }
        }
        const amostra = movs.slice(0, 3);
        return json({
          periodo: `${d(ini)} a ${d(fim)}`,
          totalMovimentos: movs.length,
          nTotPaginas: raw.nTotPaginas || 1,
          combos,
          saidas,
          amostra: amostra.map(m => ({ tipo: m.tipo, operacao: m.operacao, codOrigem: m.codOrigem, desOrigem: m.desOrigem, qtde: m.qtde, dtMov: m.dtMov, idProd: m.idProd || m.codigoProduto, numPedido: m.numPedido })),
        });
      } catch(e) { return json({ erro: e.message }, 500); }
    }

    
    if (url.pathname === "/api/debug/remessas") {
      // Sonda a API de Remessas do OMIE (vendas/remessa) — pra exibir na Fila e impactar Reposição
      try {
        const { chamarOmie } = await import("./omie.js");
        const tenta = async (ep, mt) => {
          try {
            const r = await chamarOmie(env, ep, mt, { pagina: 1, registros_por_pagina: 50, apenas_importado_api: "N" });
            const lista = Array.isArray(r) ? r : (r.remessas || r.listaRemessas || r.cadastros || r.lista || []);
            return { ok: true, chaves: Object.keys(r).slice(0, 20), total: r.nTotRegistros || r.total_de_registros || r.total || lista.length, n: lista.length, amostra: lista[0] || null };
          } catch(e) { return { ok: false, erro: e.message.slice(0, 120) }; }
        };
        const r1 = await tenta("/vendas/remessa/", "ListarRemessas");
        const r2 = await tenta("/vendas/remessa/", "PesquisarRemessas");
        return json({ ListarRemessas: r1, PesquisarRemessas: r2 });
      } catch(e) { return json({ erro: e.message.slice(0, 150) }, 500); }
    }

    // ================= QUALIDADE — fichas do dia e ficha de uma OP =================
    // Cache R2 com TTL + stale-while-revalidate: o Omie ao vivo leva 10-40s e pende;
    // o cache garante resposta rápida e estável. O sync (cron 30min) aquece a lista.
    if (url.pathname === "/api/qualidade/debug/anexo") {
      try {
        const { obterAnexo } = await import("./qualidade.js");
        const nIdAnexo = url.searchParams.get("nIdAnexo");
        const nId = url.searchParams.get("nId");
        if (!nIdAnexo || !nId) return json({ erro: "passe ?nIdAnexo= e ?nId=" }, 400);
        return json(await obterAnexo(env, nIdAnexo, nId));
      } catch(e) { return json({ erro: e.message.slice(0, 2000) }, 500); }
    }
    if (url.pathname === "/api/qualidade/debug/anexos") {
      try {
        const { listarAnexos } = await import("./qualidade.js");
        const nId = url.searchParams.get("nId");
        const cTabela = url.searchParams.get("cTabela") || "";
        if (!nId) return json({ erro: "passe ?nId=NCODOP da OP" }, 400);
        return json(await listarAnexos(env, nId, cTabela));
      } catch(e) { return json({ erro: e.message.slice(0, 2000) }, 500); }
    }
    if (url.pathname.startsWith("/api/qualidade/ficha/") && request.method === "POST") {
      try {
        const { anexarFichaNaOp } = await import("./qualidade.js");
        const op = decodeURIComponent(url.pathname.split("/").pop());
        const body = await request.json();
        const nCodOP = Number(body.nCodOP || op);
        const ficha = body.ficha || {};
        const debug = url.searchParams.get("debug") === "1";
        if (!nCodOP || !Object.keys(ficha.blocos || {}).length) {
          return json({ erro: "envie { nCodOP, ficha } com blocos preenchidos" }, 400);
        }
        return json(await anexarFichaNaOp(env, nCodOP, { ...ficha, op: ficha.op || op }, debug));
      } catch(e) { return json({ erro: e.message.slice(0, 2000) }, 500); }
    }
    // Gravação da ficha (R2 + D1)
    if (url.pathname.startsWith("/api/qualidade/ficha/") && request.method === "PUT") {
      try {
        const { salvarFicha } = await import("./qualidade.js");
        const op = decodeURIComponent(url.pathname.split("/").pop());
        const body = await request.json();
        const ficha = { ...(body.ficha || {}), op: (body.ficha && body.ficha.op) || op };
        if (!ficha.op || !Object.keys(ficha.blocos || {}).length) {
          return json({ erro: "envie { ficha } com op e blocos preenchidos" }, 400);
        }
        return json(await salvarFicha(env, ficha));
      } catch(e) { return json({ erro: e.message.slice(0, 2000) }, 500); }
    }
    // Ficha salva (R2) + fichas do mês (D1)
    if (url.pathname.startsWith("/api/qualidade/ficha/") && request.method === "GET") {
      try {
        const { lerFichaSalva } = await import("./qualidade.js");
        const op = decodeURIComponent(url.pathname.split("/").pop());
        const saved = await lerFichaSalva(env, op);
        return json({ op, salva: !!saved, ficha: saved || null });
      } catch(e) { return json({ erro: e.message.slice(0, 2000) }, 500); }
    }
    if (url.pathname.startsWith("/api/qualidade/mes/")) {
      try {
        const { fichasDoMes } = await import("./qualidade.js");
        const aaaamm = decodeURIComponent(url.pathname.split("/").pop());
        return json({ mes: aaaamm, fichas: await fichasDoMes(env, aaaamm) });
      } catch(e) { return json({ erro: e.message.slice(0, 2000) }, 500); }
    }
    if (url.pathname === "/api/qualidade/fichas") {
      try {
        const { listarFichasDoDia } = await import("./qualidade.js");
        const data = url.searchParams.get("data") || new Date().toISOString().slice(0, 10);
        const KEY = R2_KEYS.qualidadeFichas;
        const FRESCO_MS = 15 * 60 * 1000;
        const cached = await readJson(env, KEY);
        if (cached && cached._ts && Date.now() - cached._ts < FRESCO_MS) {
          return json(cached.dados);
        }
        if (cached && cached._ts) {
          // stale: responde com o cache e refresca em background (usuário nunca espera o Omie)
          ctx.waitUntil((async () => {
            try {
              const dados = await listarFichasDoDia(env, data);
              await writeJson(env, KEY, { _ts: Date.now(), dados });
              console.log(`[qualidade] refresh fichas: ${dados.fichas.length} OPs`);
            } catch (e) { console.error(`[qualidade] refresh fichas: ${e.message}`); }
          })());
          return json(cached.dados);
        }
        // sem cache (primeira vez) — calcula ao vivo e guarda
        const dados = await listarFichasDoDia(env, data);
        await writeJson(env, KEY, { _ts: Date.now(), dados });
        return json(dados);
      } catch(e) { return json({ erro: e.message.slice(0, 200) }, 500); }
    }
    if (url.pathname.startsWith("/api/qualidade/ficha/")) {
      try {
        const { fichaDaOp } = await import("./qualidade.js");
        const op = decodeURIComponent(url.pathname.split("/").pop());
        const comSaldo = url.searchParams.get("saldo") !== "0";
        const raw = url.searchParams.get("raw") === "1";
        if (raw) return json(await fichaDaOp(env, op, false, true));
        const KEY = "qualidade-ficha-" + String(op).replace(/[^A-Za-z0-9_-]/g, "_") + ".json";
        const FRESCO_MS = 20 * 60 * 1000;
        const cached = await readJson(env, KEY);
        if (cached && cached._ts && Date.now() - cached._ts < FRESCO_MS) {
          return json(cached.dados);
        }
        if (cached && cached._ts) {
          ctx.waitUntil((async () => {
            try {
              const dados = await fichaDaOp(env, op, comSaldo);
              await writeJson(env, KEY, { _ts: Date.now(), dados });
            } catch (e) { console.error(`[qualidade] refresh ficha ${op}: ${e.message}`); }
          })());
          return json(cached.dados);
        }
        const dados = await fichaDaOp(env, op, comSaldo);
        await writeJson(env, KEY, { _ts: Date.now(), dados });
        return json(dados);
      } catch(e) { return json({ erro: e.message.slice(0, 200) }, 500); }
    }
if (url.pathname === "/api/health") {
      const dash = await readJson(env, R2_KEYS.dashboard);
      const omie = await readJson(env, R2_KEYS.omie);
      return json({ ok: true, dashboard: !!dash, omie: !!omie });
    }

    if (url.pathname === "/api/dashboard") {
      const data = await readJson(env, R2_KEYS.dashboard);
      return data ? json(data) : json({ erro: "cache indisponível" }, 503);
    }

    if (url.pathname === "/api/omie") {
      const data = await readJson(env, R2_KEYS.omie);
      return data ? json(data) : json({ erro: "cache indisponível" }, 503);
    }

    if (url.pathname === "/api/sync" && request.method === "POST") {
      ctx.waitUntil(runHeavySync(env));
      return json({ ok: true, message: "sync pesado disparado em background" });
    }

    if (url.pathname === "/api/sync/vendas" && request.method === "POST") {
      const t0 = Date.now();
      try {
        const agregado = await atualizarAgregadoVendas(env);
        await writeSyncMeta(env, { vendas: Date.now() });
        return json({ ok: true, janelaDias: agregado.janelaDias, skus: Object.keys(agregado.skus || {}).length, elapsedMs: Date.now() - t0 });
      } catch (e) {
        return json({ erro: e.message, elapsedMs: Date.now() - t0 }, 500);
      }
    }

    if (url.pathname === "/api/sync/light" && request.method === "POST") {
      const t0 = Date.now();
      try {
        await runLightSync(env);
        return json({ ok: true, elapsedMs: Date.now() - t0 });
      } catch (e) {
        return json({ erro: e.message, elapsedMs: Date.now() - t0 }, 500);
      }
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    console.log("[cron] iniciando...");
    try {
      await runLightSync(env);
      // Heavy sync: 6h BRT ou a cada 2h (0,2,4,6,8,10,12,14,16,18,20,22 UTC)
      const horaUTC = new Date().getUTCHours();
      if (horaUTC === 9 || horaUTC % 2 === 0) {
        console.log("[cron] executando sync pesado...");
        await runHeavySync(env);
      }
      console.log("[cron] ✅");
    } catch (e) {
      console.error("[cron] ❌ " + e.message);
    }
  },
};
