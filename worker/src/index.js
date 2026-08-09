// ============================================================================
// Dashboard PCP Worker — Entry Point
// Workers Paid: 1000 subrequests, sync único.
// Endpoints: /api/omie, /api/sync, /api/health
// Cron: minutos 7 e 37
// ============================================================================
import { readJson, writeJson, writeSyncMeta } from "./r2.js";
import { getAccessToken, writeToHiddenSheet } from "./sheets.js";
import { construirCacheProdutos, calcularIndicadoresOmie } from "./kpis.js";
import { buscarFilaDePedidos } from "./fila.js";
import { buscarEstoque } from "./estoque.js";
import { fetchDashboardCache } from "./dashboard.js";
import { R2_KEYS, SHEET_NAMES } from "./constants.js";

// ============================================================================
// Sync completo (plano pago — 1000 subrequests, ~200 chamadas Omie)
// ============================================================================

async function runFullSync(env) {
  const t0 = Date.now();
  console.log("[sync] iniciando...");

  // Dashboard cache (planilha → R2, 1 chamada HTTP rápida)
  const meta = (await readJson(env, R2_KEYS.syncMeta)) || { omie: 0, dashboard: 0 };
  const DASHBOARD_INTERVAL = 5 * 60 * 1000; // 5 min
  if (Date.now() - (meta.dashboard || 0) > DASHBOARD_INTERVAL) {
    try {
      const dashData = await fetchDashboardCache();
      await writeJson(env, R2_KEYS.dashboard, dashData);
      await writeSyncMeta(env, { dashboard: Date.now() });
      console.log(`[sync] ✅ Dashboard cache: ${dashData.mesLabel || "?"}`);
    } catch (e) {
      console.error(`[sync] ⚠️ Dashboard: ${e.message}`);
    }
  }
  const OMIE_INTERVAL = 15 * 60 * 1000;

  if (Date.now() - (meta.omie || 0) < OMIE_INTERVAL) {
    console.log(`[sync] throttled (último há ${Math.round((Date.now() - meta.omie) / 60000)}min)`);
    return;
  }

  try {
    const data = { geradoEm: new Date().toISOString() };
    const cacheProd = await construirCacheProdutos(env);

    // Fila
    try {
      data.filaDePedidos = await buscarFilaDePedidos(env);
      console.log(`[sync] ✅ Fila: ${data.filaDePedidos.length} pedidos`);
    } catch (e) {
      data.filaDePedidos = { erro: e.message };
      console.error(`[sync] ❌ Fila: ${e.message}`);
    }

    // Estoque
    try {
      data.estoque = await buscarEstoque(env, cacheProd);
      console.log(`[sync] ✅ Estoque: ${data.estoque.length} SKUs`);
    } catch (e) {
      data.estoque = { erro: e.message };
      console.error(`[sync] ❌ Estoque: ${e.message}`);
    }

    // KPIs + Ranking + Tendência
    try {
      const indicadores = await calcularIndicadoresOmie(env);
      data.kpis = indicadores.kpis;
      data.tendenciaProducao = indicadores.tendenciaProducao;
      data.rankingProducao = indicadores.rankingProducao;
      console.log(`[sync] ✅ KPIs calculados`);
    } catch (e) {
      data.kpis = { erro: e.message };
      data.tendenciaProducao = { erro: e.message };
      data.rankingProducao = { erro: e.message };
      console.error(`[sync] ❌ KPIs: ${e.message}`);
    }

    // Salva no R2
    await writeJson(env, R2_KEYS.omie, data);
    await writeSyncMeta(env, { omie: Date.now() });
    console.log(`[sync] ✅ R2`);

    // Espelha no Google Sheets
    if (env.SKIP_SHEETS_MIRROR !== "true") {
      try {
        const token = await getAccessToken(env);
        await writeToHiddenSheet(env, token, SHEET_NAMES.cacheOmie, data);
        console.log(`[sync] ✅ Sheets`);
      } catch (e) {
        console.error(`[sync] ⚠️ Sheets: ${e.message}`);
      }
    }
  } catch (e) {
    console.error(`[sync] ❌ ${e.message}`);
  }

  console.log(`[sync] concluído em ${Date.now() - t0}ms`);
}

// ============================================================================
// Fetch handler
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

    if (url.pathname === "/api/omie") {
      const data = await readJson(env, R2_KEYS.omie);
      return data ? json(data) : json({ erro: "cache indisponível" }, 503);
    }

    // Sync manual (síncrono — aguarda completar)
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

  // Cron trigger (minutos 7 e 37)
  async scheduled(event, env, ctx) {
    console.log("[cron] sync...");
    try {
      await runFullSync(env);
      console.log("[cron] ✅");
    } catch (e) {
      console.error("[cron] ❌ " + e.message);
    }
  },
};
