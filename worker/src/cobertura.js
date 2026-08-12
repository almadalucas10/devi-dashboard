// ============================================================================
// Cobertura de Estoque em Dias
// Vendas: 1x/dia (ListarPedidos 90d). Cobertura: 30min (saldo fresco).
//
// NÃO chamar atualizarAgregadoVendas() de dentro de fetch().
// Só do scheduled(). 3-4 páginas paginadas na Omie.
// ============================================================================
import { chamarOmie } from "./omie.js";
import { readJson, writeJson } from "./r2.js";
import { SKUS_ATIVOS, NOME_CURTO } from "./constants.js";
import { hojeBrasilDate } from "./fuso.js";

const DIAS_JANELA = 90;
const LIMIAR_GIRO = 5; // un/dia
const VENDAS_R2_KEY = "vendas-90d.json";

// Lead times em dias — só kombucha definido
const LEAD_TIMES = { kombucha: 10, cha: null, refrigerante: null, rtm: null };

function familiaDoSku(sku) {
  if (sku.startsWith("CH")) return "cha";
  if (sku.startsWith("FX")) return "kombucha";
  if (sku.startsWith("RTM")) return "rtm";
  return "refrigerante";
}

function nomeCurtoSku(sku, descricao) {
  if (NOME_CURTO[sku]) return NOME_CURTO[sku];
  if (descricao) {
    const idx = descricao.indexOf(" - ");
    if (idx > 0) return descricao.substring(0, idx).trim();
    return descricao.substring(0, 40).trim();
  }
  return sku;
}

function dataParaStr(dt) {
  return `${("0"+dt.getDate()).slice(-2)}/${("0"+(dt.getMonth()+1)).slice(-2)}/${dt.getFullYear()}`;
}

// ============================================================================
// Agregado de vendas — 1x/dia, só do scheduled()
// ============================================================================

export async function atualizarAgregadoVendas(env) {
  const hoje = hojeBrasilDate();
  const dataInicial = new Date(hoje.getTime() - DIAS_JANELA * 24 * 60 * 60 * 1000);
  const dDtInicial = dataParaStr(dataInicial);
  const dDtFinal = dataParaStr(hoje);

  const saida = {};
  for (const sku of SKUS_ATIVOS) saida[sku] = 0;

  let pagina = 1, totalPaginas = 1;
  do {
    const resultado = await chamarOmie(env, "/produtos/pedido/", "ListarPedidos", {
      pagina, registros_por_pagina: 100,
      filtrar_por_data_de: dDtInicial, filtrar_por_data_ate: dDtFinal,
    });
    totalPaginas = resultado.total_de_paginas || 1;

    const pedidos = resultado.pedido_venda_produto || [];
    for (const pv of pedidos) {
      const cab = pv.cabecalho || {};
      const etapaNum = parseInt(cab.etapa || "0", 10);
      if (etapaNum > 0 && etapaNum < 50) continue;

      const itens = pv.det || [];
      for (const det of itens) {
        const pr = det.produto || {};
        const codigo = pr.codigo;
        if (!codigo || !SKUS_ATIVOS.includes(codigo)) continue;
        saida[codigo] += pr.quantidade || 0;
      }
    }
    pagina++;
    if (pagina <= totalPaginas) await new Promise(r => setTimeout(r, 300));
  } while (pagina <= totalPaginas);

  // Constrói agregado com diária por SKU
  const agregado = { geradoEm: new Date().toISOString(), janelaDias: DIAS_JANELA, skus: {} };
  for (const sku of SKUS_ATIVOS) {
    const total = saida[sku] || 0;
    agregado.skus[sku] = { total, diaria: total / DIAS_JANELA };
  }

  await writeJson(env, VENDAS_R2_KEY, agregado);
  const totalGeral = Object.values(saida).reduce((a,b) => a+b, 0);
  console.log(`✅ Vendas 90d: ${totalGeral.toLocaleString("pt-BR")} un, ${pagina-1} páginas`);
  return agregado;
}

// ============================================================================
// Recalcula cobertura — a cada 30min, usa saldo fresco + vendas em cache
// ============================================================================

export async function recalcularCobertura(env, estoque) {
  const vendas = await readJson(env, VENDAS_R2_KEY);
  const saidaPorSku = vendas ? vendas.skus : null;

  const todos = [];
  const semGiro = [];

  for (const item of estoque) {
    const sku = item.codigo;
    const skuVendas = (saidaPorSku && saidaPorSku[sku]) || { total: 0, diaria: 0 };
    const diaria = skuVendas.diaria || 0;
    const nomeCurto = nomeCurtoSku(sku, item.descricao);
    const familia = familiaDoSku(sku);
    const lead = LEAD_TIMES[familia] || null;

    // Sem agregado de vendas → cobertura null (degradação previsível)
    if (!saidaPorSku) {
      todos.push({
        codigo: sku, nome: item.descricao || sku, nomeCurto, familia,
        saldo: item.saldo, minimo: item.estoqueMinimo || 0,
        diaria: 0, cobertura: null, minimoEmDias: null, lead, status: "sem_dados",
      });
      continue;
    }

    if (skuVendas.total < LIMIAR_GIRO) {
      semGiro.push(sku);
      todos.push({
        codigo: sku, nome: item.descricao || sku, nomeCurto, familia,
        saldo: item.saldo, minimo: item.estoqueMinimo || 0,
        diaria: 0, cobertura: null, minimoEmDias: null, lead, status: "sem_giro",
      });
      continue;
    }

    const cobertura = item.saldo / diaria;
    const minimoEmDias = (item.estoqueMinimo || 0) / diaria;

    let status = "ok";
    if (lead !== null && cobertura < lead) status = "critico";
    else if (lead !== null && cobertura < lead * 1.5) status = "alerta";

    todos.push({
      codigo: sku, nome: item.descricao || sku, nomeCurto, familia,
      saldo: item.saldo, minimo: item.estoqueMinimo || 0,
      diaria: Math.round(diaria * 10) / 10,
      cobertura: Math.round(cobertura * 10) / 10,
      minimoEmDias: Math.round(minimoEmDias * 10) / 10,
      lead, status,
    });
  }

  todos.sort((a, b) => {
    if (a.cobertura === null && b.cobertura === null) return 0;
    if (a.cobertura === null) return 1;
    if (b.cobertura === null) return -1;
    return a.cobertura - b.cobertura;
  });

  const critico = todos.find(s => s.status === "critico")
    || todos.find(s => s.status === "alerta")
    || todos.find(s => s.cobertura !== null);

  return {
    critico: critico || null,
    todos,
    semGiro,
    janelaDias: DIAS_JANELA,
    vendasAtualizadasEm: vendas ? vendas.geradoEm : null,
    geradoEm: new Date().toISOString(),
  };
}
