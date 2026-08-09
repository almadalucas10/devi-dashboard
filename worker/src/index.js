// ============================================================================
// Dashboard PCP Worker
// Sync único via cron (15 min limite, 1000 subrequests). Simples e direto.
// ============================================================================
import { readJson, writeJson, writeSyncMeta } from "./r2.js";
import { construirCacheProdutos, calcularIndicadoresOmie } from "./kpis.js";
import { buscarFilaDePedidos } from "./fila.js";
import { buscarEstoque } from "./estoque.js";
import { buildDashboardCache } from "./dashboard.js";
import { R2_KEYS } from "./constants.js";

// ============================================================================
// Sync completo
// ============================================================================

async function runFullSync(env) {
  const t0 = Date.now();
  console.log("[sync] iniciando...");

  // Dashboard cache (lê planilha via Sheets API)
  try {
    const dashData = await buildDashboardCache(env);
    await writeJson(env, R2_KEYS.dashboard, dashData);
    console.log(`[sync] ✅ Dashboard: ${dashData.mesLabel || "?"} | Planejado: ${dashData.planejado}`);
  } catch (e) {
    console.error(`[sync] ⚠️ Dashboard: ${e.message}`);
  }

  // Omie completo
  try {
    const data = { geradoEm: new Date().toISOString() };
    console.log("[sync] CacheProd...");
    const cacheProd = await construirCacheProdutos(env);
    console.log(`[sync] ✅ CacheProd: ${Object.keys(cacheProd).length} SKUs`);

    console.log("[sync] Fila...");
    try {
      data.filaDePedidos = await buscarFilaDePedidos(env);
      console.log(`[sync] ✅ Fila: ${data.filaDePedidos.length} pedidos`);
    } catch (e) {
      data.filaDePedidos = { erro: e.message };
      console.error(`[sync] ❌ Fila: ${e.message}`);
    }

    console.log("[sync] Estoque...");
    try {
      data.estoque = await buscarEstoque(env, cacheProd);
      console.log(`[sync] ✅ Estoque: ${data.estoque.length} SKUs`);
    } catch (e) {
      data.estoque = { erro: e.message };
      console.error(`[sync] ❌ Estoque: ${e.message}`);
    }

    console.log("[sync] KPIs + Ranking...");
    try {
      const indicadores = await calcularIndicadoresOmie(env);
      data.kpis = indicadores.kpis;
      data.tendenciaProducao = indicadores.tendenciaProducao;
      data.rankingProducao = indicadores.rankingProducao;
      console.log(`[sync] ✅ KPIs: pendentes=${data.kpis.pendentesMes}`);
    } catch (e) {
      data.kpis = { erro: e.message };
      data.tendenciaProducao = { erro: e.message };
      data.rankingProducao = { erro: e.message };
      console.error(`[sync] ❌ KPIs: ${e.message}`);
    }

    await writeJson(env, R2_KEYS.omie, data);
    await writeSyncMeta(env, { omie: Date.now() });
    console.log(`[sync] ✅ R2 salvo`);
  } catch (e) {
    console.error(`[sync] ❌ ${e.message}`);
  }

  console.log(`[sync] concluído em ${Date.now() - t0}ms`);
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
        await runFullSync(env);
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
      await runFullSync(env);
      console.log("[cron] ✅");
    } catch (e) {
      console.error("[cron] ❌ " + e.message);
    }
  },
};
