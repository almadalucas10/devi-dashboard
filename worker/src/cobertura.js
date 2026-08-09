// ============================================================================
// Cobertura de Estoque em Dias — substitui Ocupação (Ano)
// ============================================================================
import { chamarOmie } from "./omie.js";
import { SKUS_ATIVOS, NOME_CURTO } from "./constants.js";

const DIAS_JANELA = 90;
const LIMIAR_GIRO = 5; // un/dia — abaixo disso, SKU é "sem giro"

// Lead times em dias — só kombucha definido, resto pendente com PCP
const LEAD_TIMES = { kombucha: 10, cha: null, refrigerante: null, rtm: null };

function familiaDoSku(sku) {
  if (sku.startsWith("CH")) return "cha";
  if (sku.startsWith("FX")) return "kombucha";
  if (sku.startsWith("RTM")) return "rtm";
  return "refrigerante";
}

// Nome curto: até o primeiro hífen, ou apelido do NOME_CURTO
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
// Busca vendas (saídas) dos últimos 90 dias via ListarPedidos
// ============================================================================

export async function buscarVendasPorSku(env) {
  const hoje = new Date();
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

  const total = Object.values(saida).reduce((a,b) => a+b, 0);
  console.log(`✅ Vendas: ${total.toLocaleString("pt-BR")} un em ${DIAS_JANELA}d`);
  return saida;
}

// ============================================================================
// Calcula cobertura em dias para cada SKU
// ============================================================================

export function calcularCobertura(estoque, saidaPorSku) {
  const todos = [];
  const semGiro = [];

  for (const item of estoque) {
    const sku = item.codigo;
    const saidaTotal = (saidaPorSku && saidaPorSku[sku]) || 0;
    const diaria = saidaTotal / DIAS_JANELA;

    const nomeCurto = nomeCurtoSku(sku, item.descricao);
    const familia = familiaDoSku(sku);
    const lead = LEAD_TIMES[familia] || null;

    if (diaria * DIAS_JANELA < LIMIAR_GIRO || saidaTotal === 0) {
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

  // Ordena por cobertura ascendente, semGiro no final
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
    geradoEm: new Date().toISOString(),
  };
}
