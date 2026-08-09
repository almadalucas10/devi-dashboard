// ============================================================================
// Dashboard PCP Worker — Entry Point
// Endpoints de dados + sync via cron e /sync manual
// ============================================================================
import { readJson, writeJson, writeSyncMeta } from "./r2.js";
import { getAccessToken, writeToHiddenSheet } from "./sheets.js";
import { construirCacheProdutos, calcularIndicadoresOmie } from "./kpis.js";
import { buscarFilaDePedidos } from "./fila.js";
import { buscarEstoque } from "./estoque.js";
import { R2_KEYS, SHEET_NAMES } from "./constants.js";

// ============================================================================
// Sync principal
// ============================================================================

async function runFullSync(env) {
  const t0 = Date.now();
  console.log("[sync] iniciando...");

  // --- Indicadores Omie (com throttle de 15 min) ---
  const meta = (await readJson(env, R2_KEYS.syncMeta)) || { omie: 0 };
  const OMIE_INTERVAL = 15 * 60 * 1000; // 15 min

  if (Date.now() - (meta.omie || 0) > OMIE_INTERVAL) {
    try {
      console.log("[sync] Omie: iniciando...");
      const data = { geradoEm: new Date().toISOString() };
      const cacheProd = await construirCacheProdutos(env);

      // Cada indicador é independente — erro em um não derruba os outros
      try {
        data.filaDePedidos = await buscarFilaDePedidos(env);
        console.log(`[sync] ✅ Fila: ${data.filaDePedidos.length} pedidos`);
      } catch (e) {
        data.filaDePedidos = { erro: e.message };
        console.error(`[sync] ❌ Fila: ${e.message}`);
      }

      try {
        data.estoque = await buscarEstoque(env, cacheProd);
        console.log(`[sync] ✅ Estoque: ${data.estoque.length} SKUs`);
      } catch (e) {
        data.estoque = { erro: e.message };
        console.error(`[sync] ❌ Estoque: ${e.message}`);
      }

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

      // Escreve no R2
      await writeJson(env, R2_KEYS.omie, data);
      await writeSyncMeta(env, { omie: Date.now() });
      console.log(`[sync] ✅ Omie salvo no R2`);

      // Espelha no Google Sheets (não bloqueia se falhar)
      if (env.SKIP_SHEETS_MIRROR !== "true") {
        try {
          const token = await getAccessToken(env);
          await writeToHiddenSheet(env, token, SHEET_NAMES.cacheOmie, data);
          console.log(`[sync] ✅ Sheets mirror Omie`);
        } catch (e) {
          console.error(`[sync] ⚠️ Sheets mirror Omie falhou: ${e.message}`);
        }
      }
    } catch (e) {
      console.error(`[sync] ❌ Omie geral: ${e.message}`);
    }
  } else {
    console.log(`[sync] Omie: throttled (último há ${Math.round((Date.now() - meta.omie) / 60000)}min)`);
  }

  console.log(`[sync] concluído em ${Date.now() - t0}ms`);
}

// ============================================================================
// Fetch handler — serve dados do R2
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

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST",
          "Access-Control-Allow-Headers": "x-sync-secret",
        },
      });
    }

    // Health check
    if (url.pathname === "/api/health") {
      const dash = await readJson(env, R2_KEYS.dashboard);
      const omie = await readJson(env, R2_KEYS.omie);
      return json({ ok: true, dashboard: !!dash, omie: !!omie });
    }

    // Dados: dashboard (produção + calendário)
    if (url.pathname === "/api/dashboard") {
      const data = await readJson(env, R2_KEYS.dashboard);
      return data ? json(data) : json({ erro: "cache indisponível" }, 503);
    }

    // Dados: Omie (KPIs + ranking + tendência + fila + estoque)
    if (url.pathname === "/api/omie") {
      const data = await readJson(env, R2_KEYS.omie);
      return data ? json(data) : json({ erro: "cache indisponível" }, 503);
    }

    // Force sync (protegido por header)
    if (url.pathname === "/api/sync" && request.method === "POST") {
      const secret = request.headers.get("x-sync-secret");
      if (env.SYNC_SECRET && secret !== env.SYNC_SECRET) {
        return json({ erro: "não autorizado" }, 401);
      }
      ctx.waitUntil(runFullSync(env));
      return json({ ok: true, message: "sync disparado" });
    }

    // 404
    return new Response("Not found", { status: 404 });
  },

  // Cron trigger: roda a cada 5 min (minutos 7 e 37)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runFullSync(env));
  },
};
