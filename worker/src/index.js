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
        const itens = Object.entries(dem).map(([sku, pedido]) => {
          const e = partial.estoque.find(x => x.codigo === sku);
          const saldo = e ? (e.saldo || 0) : 0;
          return { sku, pedido, saldo, deficit: pedido - saldo };
        }).sort((a, b) => b.deficit - a.deficit);
        const total = itens.reduce((s, i) => s + i.pedido, 0);
        partial.demandaFila = { itens, totalUnidades: total, pedidosConsiderados: partial.filaDePedidos.length, naoMapeados, geradoEm: new Date().toISOString() };
        console.log(`[light] ✅ Demanda fila: ${itens.length} SKUs, ${total} un`);
      }
    } catch (e) { console.error(`[light] ⚠️ Demanda fila: ${e.message}`); }

    // Cobertura recalculada com saldo fresco (usa vendas-90d.json em cache)
    if (Array.isArray(partial.estoque)) {
      try {
        partial.cobertura = await recalcularCobertura(env, partial.estoque);
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
        const hoje = new Date();
        const kcal = extrairKPIsDoCalendario(dashData.calGrid, hoje.getFullYear(), hoje.getMonth() + 1);
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
        const hoje = new Date();
        const kcal = extrairKPIsDoCalendario(dashData.calGrid, hoje.getFullYear(), hoje.getMonth() + 1);
        if (data.kpis && !data.kpis.erro) {
          data.kpis.planejadoMes = kcal.planejadoMes;
          data.kpis.realizadoMes = kcal.realizadoMes;
          data.kpis.eficienciaMes = kcal.eficienciaMes;
          data.kpis.pendentesMes = kcal.pendentesMes;
          if (data.tendenciaProducao && data.tendenciaProducao.valores) {
            const mesIdx = new Date().getMonth();
            data.tendenciaProducao.valores[mesIdx] = kcal.realizadoMes;
            data.kpis.realizadoAno = data.tendenciaProducao.valores.reduce((a,v)=>a+v,0);
          }
        }
      }
    } catch (e) { console.error(`[heavy] ⚠️ KPIs calendário: ${e.message}`); }

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
