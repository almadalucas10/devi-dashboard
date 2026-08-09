// ============================================================================
// Dashboard PCP Worker — Entry Point
// Workers Paid: 1000 subrequests, sync em 2 lotes independentes.
// Endpoints: /api/omie, /api/dashboard, /api/sync, /api/sync/omie
// Cron: minutos 7 e 37 (roda lote 1 → lote 2 em sequência)
// ============================================================================
import { readJson, writeJson, writeSyncMeta } from "./r2.js";
import { getAccessToken, writeToHiddenSheet } from "./sheets.js";
import { construirCacheProdutos, calcularIndicadoresOmie } from "./kpis.js";
import { buscarFilaDePedidos } from "./fila.js";
import { buscarEstoque } from "./estoque.js";
import { fetchDashboardCache } from "./dashboard.js";
import { R2_KEYS, SHEET_NAMES } from "./constants.js";

// ============================================================================
// Lote 1: cacheProd + fila + estoque + OPs (~50 chamadas, ~90s)
// ============================================================================

async function syncLote1(env) {
  const t0 = Date.now();
  console.log("[lote-1] iniciando...");

  const hoje = new Date();
  const d = ("0" + hoje.getDate()).slice(-2);
  const m = ("0" + (hoje.getMonth() + 1)).slice(-2);
  const dDtInicioAno = `01/01/${hoje.getFullYear()}`;
  const dDtHoje = `${d}/${m}/${hoje.getFullYear()}`;

  // Cache de produtos
  const cacheProd = await construirCacheProdutos(env);

  // Fila
  let filaDePedidos;
  try {
    filaDePedidos = await buscarFilaDePedidos(env);
    console.log(`[lote-1] ✅ Fila: ${filaDePedidos.length} pedidos`);
  } catch (e) {
    filaDePedidos = { erro: e.message };
    console.error(`[lote-1] ❌ Fila: ${e.message}`);
  }

  // Estoque
  let estoque;
  try {
    estoque = await buscarEstoque(env, cacheProd);
    console.log(`[lote-1] ✅ Estoque: ${estoque.length} SKUs`);
  } catch (e) {
    estoque = { erro: e.message };
    console.error(`[lote-1] ❌ Estoque: ${e.message}`);
  }

  // OPs concluídas
  const { buscarOPs } = await import("./omie.js");
  const concluidas = await buscarOPs(env, {
    dDtConclusaoDe: dDtInicioAno,
    dDtConclusaoAte: dDtHoje,
    cConcluida: "S",
  });
  console.log(`[lote-1] ✅ OPs concluídas: ${concluidas.length}`);

  // OPs abertas (com intervalo)
  await new Promise(r => setTimeout(r, 5000));
  const abertas = await buscarOPs(env, { cConcluida: "N" });
  console.log(`[lote-1] ✅ OPs abertas: ${abertas.length}`);

  // Salva estado pro lote-2
  await writeJson(env, "batch-state.json", {
    cacheProd,
    concluidas,
    abertas,
    filaDePedidos,
    estoque,
    timestamp: new Date().toISOString(),
  });

  // Salva parcial no R2 (fila + estoque visíveis)
  await writeJson(env, R2_KEYS.omie, {
    geradoEm: new Date().toISOString(),
    filaDePedidos,
    estoque,
    kpis: { status: "aguardando lote 2" },
    tendenciaProducao: { status: "aguardando lote 2" },
    rankingProducao: { status: "aguardando lote 2" },
  });

  console.log(`[lote-1] ✅ concluído em ${Date.now() - t0}ms`);
  return { ok: true, lote: 1, elapsedMs: Date.now() - t0 };
}

// ============================================================================
// Lote 2: realizado OPE/28 + KPIs + ranking + tendência (~120 chamadas, ~2min)
// ============================================================================

async function syncLote2(env) {
  const t0 = Date.now();
  console.log("[lote-2] iniciando...");

  const state = await readJson(env, "batch-state.json");
  if (!state || !state.cacheProd) {
    throw new Error("Lote 1 ainda não rodou. Execute /api/sync/lote-1 primeiro.");
  }
  const { cacheProd, concluidas, abertas, filaDePedidos, estoque } = state;

  // Realizado OPE/28
  const { buscarRealizadoProducao, buscarKPIsOmie, calcularTendencia, calcularRanking } = await import("./kpis.js");
  const realizadoMov = await buscarRealizadoProducao(env, cacheProd);
  console.log(`[lote-2] ✅ Realizado: ${realizadoMov.length} movimentos`);

  // KPIs
  const kpis = await buscarKPIsOmie(env, cacheProd, { concluidas, abertas, realizadoMov });
  console.log(`[lote-2] ✅ KPIs: pendentes=${kpis.pendentesMes}`);

  // Ranking/Tendência
  const descricoes = {};
  for (const sku of Object.keys(cacheProd)) {
    descricoes[sku] = cacheProd[sku].descricao || sku;
  }
  const producao = (kpis._opsConcluidas || [])
    .filter(op => op.codigo)
    .map(op => ({
      codigo: op.codigo,
      data: new Date(op.dataStr.split("/").reverse().join("-")),
      entradas: op.nQtde,
    }))
    .filter(m => m.data && !isNaN(m.data));
  const tendenciaProducao = calcularTendencia(producao);
  const rankingProducao = calcularRanking(producao, descricoes);

  // Monta resultado final
  const data = {
    geradoEm: new Date().toISOString(),
    filaDePedidos: filaDePedidos || [],
    estoque: estoque || [],
    kpis: {
      planejadoAno: kpis.planejadoAno,
      realizadoAno: kpis.realizadoAno,
      eficienciaAno: kpis.eficienciaAno,
      ocupacaoAno: kpis.ocupacaoAno,
      planejadoMes: kpis.planejadoMes,
      realizadoMes: kpis.realizadoMes,
      eficienciaMes: kpis.eficienciaMes,
      pendentesMes: kpis.pendentesMes,
    },
    tendenciaProducao,
    rankingProducao,
  };

  await writeJson(env, R2_KEYS.omie, data);
  await writeSyncMeta(env, { omie: Date.now() });
  await writeJson(env, "batch-state.json", null);

  // Sheets mirror
  if (env.SKIP_SHEETS_MIRROR !== "true") {
    try {
      const token = await getAccessToken(env);
      await writeToHiddenSheet(env, token, SHEET_NAMES.cacheOmie, data);
      console.log(`[lote-2] ✅ Sheets`);
    } catch (e) {
      console.error(`[lote-2] ⚠️ Sheets: ${e.message}`);
    }
  }

  console.log(`[lote-2] ✅ concluído em ${Date.now() - t0}ms`);
  return { ok: true, lote: 2, elapsedMs: Date.now() - t0 };
}

// ============================================================================
// Dashboard cache (rápido, 1 chamada HTTP)
// ============================================================================

async function syncDashboard(env) {
  const meta = (await readJson(env, R2_KEYS.syncMeta)) || {};
  const INTERVAL = 5 * 60 * 1000;
  if (Date.now() - (meta.dashboard || 0) < INTERVAL) return;
  try {
    const dashData = await fetchDashboardCache();
    await writeJson(env, R2_KEYS.dashboard, dashData);
    await writeSyncMeta(env, { dashboard: Date.now() });
    console.log(`[dash] ✅ ${dashData.mesLabel || "?"}`);
  } catch (e) {
    console.error(`[dash] ⚠️ ${e.message}`);
  }
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

    // Health
    if (url.pathname === "/api/health") {
      const dash = await readJson(env, R2_KEYS.dashboard);
      const omie = await readJson(env, R2_KEYS.omie);
      return json({ ok: true, dashboard: !!dash, omie: !!omie });
    }

    // Dados
    if (url.pathname === "/api/dashboard") {
      const data = await readJson(env, R2_KEYS.dashboard);
      return data ? json(data) : json({ erro: "cache indisponível" }, 503);
    }

    if (url.pathname === "/api/omie") {
      const data = await readJson(env, R2_KEYS.omie);
      return data ? json(data) : json({ erro: "cache indisponível" }, 503);
    }

    // Dashboard cache (rápido, sempre disponível)
    if (url.pathname === "/api/sync/dashboard" && request.method === "POST") {
      try { await syncDashboard(env); return json({ ok: true }); }
      catch (e) { return json({ erro: e.message }, 500); }
    }

    // Lote 1 — leve (~50 chamadas, ~90s)
    if (url.pathname === "/api/sync/lote-1" && request.method === "POST") {
      const t0 = Date.now();
      try {
        await syncDashboard(env);
        const r = await syncLote1(env);
        return json({ ...r, elapsedMs: Date.now() - t0 });
      } catch (e) {
        return json({ erro: e.message, elapsedMs: Date.now() - t0 }, 500);
      }
    }

    // Lote 2 — pesado (~120 chamadas, ~2min)
    if (url.pathname === "/api/sync/lote-2" && request.method === "POST") {
      const t0 = Date.now();
      try {
        const r = await syncLote2(env);
        return json({ ...r, elapsedMs: Date.now() - t0 });
      } catch (e) {
        return json({ erro: e.message, elapsedMs: Date.now() - t0 }, 500);
      }
    }

    // Sync completo (lote 1 + lote 2 em sequência)
    if (url.pathname === "/api/sync" && request.method === "POST") {
      const t0 = Date.now();
      try {
        await syncDashboard(env);
        await syncLote1(env);
        await syncLote2(env);
        return json({ ok: true, elapsedMs: Date.now() - t0 });
      } catch (e) {
        return json({ erro: e.message, elapsedMs: Date.now() - t0 }, 500);
      }
    }

    return new Response("Not found", { status: 404 });
  },

  // Cron: dashboard + lote 1 a cada 5 min, lote 2 a cada 30 min
  async scheduled(event, env, ctx) {
    console.log("[cron] iniciando...");
    try {
      await syncDashboard(env);
      await syncLote1(env);
      await syncLote2(env);
      console.log("[cron] ✅");
    } catch (e) {
      console.error("[cron] ❌ " + e.message);
    }
  },
};
