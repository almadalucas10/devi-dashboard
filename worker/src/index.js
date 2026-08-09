// ============================================================================
// Dashboard PCP Worker
// Sync leve (30min): dashboard + fila + estoque
// Sync pesado (1x/dia 6h BRT): KPIs + ranking + vendas + cobertura
// ============================================================================
import { readJson, writeJson, writeSyncMeta } from "./r2.js";
import { construirCacheProdutos, calcularIndicadoresOmie } from "./kpis.js";
import { buscarFilaDePedidos } from "./fila.js";
import { buscarEstoque } from "./estoque.js";
import { buildDashboardCache } from "./dashboard.js";
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
      const t0 = Date.now();
      try {
        await runHeavySync(env);
        return json({ ok: true, elapsedMs: Date.now() - t0 });
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
      const horaUTC = new Date().getUTCHours();
      if (horaUTC === 9) {
        console.log("[cron] 6h BRT — executando sync pesado...");
        await runHeavySync(env);
      }
      console.log("[cron] ✅");
    } catch (e) {
      console.error("[cron] ❌ " + e.message);
    }
  },
};
