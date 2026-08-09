// ============================================================================
// Fila de Pedidos — port de buscarFilaDePedidos()
// ============================================================================
import { chamarOmie, buscarTodasPaginas } from "./omie.js";
import { ETAPA_LABELS } from "./constants.js";

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
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

function dataParaStr(data) {
  const d = ("0" + data.getDate()).slice(-2);
  const m = ("0" + (data.getMonth() + 1)).slice(-2);
  return `${d}/${m}/${data.getFullYear()}`;
}

export async function buscarFilaDePedidos(env) {
  const REGISTROS_POR_PAGINA = 100;
  const DIAS_PARA_TRAS = 90;

  const hoje = new Date();
  const dataInicial = new Date(hoje.getTime() - DIAS_PARA_TRAS * 24 * 60 * 60 * 1000);
  const dDtInicial = dataParaStr(dataInicial);
  const dDtFinal = dataParaStr(hoje);

  // 1º passo: ListarEtapasPedido (transições dos últimos 90 dias)
  const etapasResult = await buscarTodasPaginas(
    env,
    "/produtos/pedidoetapas/",
    "ListarEtapasPedido",
    (pagina) => ({
      nPagina: pagina,
      nRegPorPagina: REGISTROS_POR_PAGINA,
      dDtInicial,
      dDtFinal,
      cOrdenarPor: "DATAHORA",
      cOrdemDecrescente: "S",
    }),
    { arrayKey: "etapasPedido", totalPagesKey: "nTotPaginas" }
  );

  // Dedup por pedido (mantém etapa mais alta)
  const porPedido = {};
  for (const r of etapasResult) {
    const cod = r.nCodPed;
    const etapaNum = parseInt(r.cEtapa, 10) || 0;
    if (!porPedido[cod] || etapaNum > parseInt(porPedido[cod].cEtapa, 10)) {
      porPedido[cod] = r;
    }
  }
  const unicos = Object.values(porPedido);

  // Filtra: não faturado e não cancelado
  const filaBasica = unicos
    .filter((r) => {
      const faturado = r.faturamento && r.faturamento.cFaturado === "S";
      const cancelado = r.cancelamento && r.cancelamento.cCancelado === "S";
      return !faturado && !cancelado;
    })
    .map((r) => ({
      codigoPedido: r.nCodPed,
      numero: r.cNumero,
      etapa: r.cEtapa,
      dataInclusao: r.info && r.info.dInc,
    }));

  if (filaBasica.length === 0) return [];

  // 2º passo: ListarPedidos (detalhes em batch)
  await sleep(2000);
  const detalhesPorPedido = {};
  const pedidosResult = await buscarTodasPaginas(
    env,
    "/produtos/pedido/",
    "ListarPedidos",
    (pagina) => ({
      pagina,
      registros_por_pagina: REGISTROS_POR_PAGINA,
      filtrar_por_data_de: dDtInicial,
      filtrar_por_data_ate: dDtFinal,
    }),
    { arrayKey: "pedido_venda_produto", pageDelay: 300 }
  );

  for (const pv of pedidosResult) {
    const cab = pv.cabecalho || {};
    const cod = cab.codigo_pedido;
    if (!cod) continue;
    const itens = pv.det || [];
    let totalUnidades = 0;
    let valorTotal = 0;
    for (const item of itens) {
      totalUnidades += item.quantidade || 0;
      valorTotal += item.valor_total || 0;
    }
    detalhesPorPedido[cod] = {
      cliente: cab.nome_cliente || "",
      valorTotal,
      totalUnidades,
    };
  }

  // 3º: Monta resultado final
  const resultado = [];
  for (const item of filaBasica) {
    const detalhes = detalhesPorPedido[item.codigoPedido] || {};
    resultado.push({
      codigoPedido: item.codigoPedido,
      numero: item.numero,
      etapa: item.etapa,
      valorTotal: detalhes.valorTotal || 0,
      totalUnidades: detalhes.totalUnidades || 0,
      cliente: detalhes.cliente || `Pedido #${item.numero}`,
      dataInclusao: item.dataInclusao,
    });
  }

  return resultado;
}
