// ============================================================================
// Fila de Pedidos — port de buscarFilaDePedidos()
// ============================================================================
import { chamarOmie, buscarTodasPaginas } from "./omie.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dataParaStr(data) {
  const d = ("0" + data.getDate()).slice(-2);
  const m = ("0" + (data.getMonth() + 1)).slice(-2);
  return `${d}/${m}/${data.getFullYear()}`;
}

const REGISTROS_POR_PAGINA = 100;
const DIAS_PARA_TRAS = 90;

// Cache de clientes: codigo_cliente → nome (nome_fantasia || razao_social)
async function construirCacheClientes(env, maxPaginas = 10) {
  const cache = {};
  try {
    const clientes = await buscarTodasPaginas(
      env,
      "/geral/clientes/",
      "ListarClientesResumido",
      (pagina) => ({ pagina, registros_por_pagina: 100 }),
      { arrayKey: "clientes_cadastro_resumido", maxPages: maxPaginas, pageDelay: 200 }
    );
    for (const c of clientes) {
      cache[c.codigo_cliente] = c.nome_fantasia || c.razao_social || null;
    }
    console.log(`✅ Cache clientes: ${Object.keys(cache).length}`);
  } catch (e) {
    console.warn(`⚠️ Cache clientes: ${e.message}`);
  }
  return cache;
}

export async function buscarFilaDePedidos(env) {
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

    // Omie: itens[i].produto.quantidade, itens[i].produto.valor_total
    const itens = pv.det || [];
    let totalUnidades = 0, valorTotal = 0;
    for (const det of itens) {
      const pr = det.produto || {};
      totalUnidades += pr.quantidade || 0;
      valorTotal += pr.valor_total || 0;
    }
    detalhesPorPedido[cod] = {
      codigoCliente: cab.codigo_cliente,
      valorTotal,
      totalUnidades,
    };
  }

  // 3º passo: Cache de nomes de clientes (nome_fantasia || razao_social)
  const nomesClientesCache = await construirCacheClientes(env);

  // 4º passo: Montar resultado final
  const resultado = [];
  for (const item of filaBasica) {
    const detalhe = detalhesPorPedido[item.codigoPedido];

    if (detalhe) {
      item.valorTotal = detalhe.valorTotal;
      item.totalUnidades = detalhe.totalUnidades;

      if (detalhe.codigoCliente) {
        let nome = nomesClientesCache[detalhe.codigoCliente];
        if (!nome) {
          try {
            const cinfo = await chamarOmie(env, "/geral/clientes/", "ConsultarCliente", {
              codigo_cliente_omie: detalhe.codigoCliente,
            });
            nome = cinfo.nome_fantasia || cinfo.razao_social || null;
            nomesClientesCache[detalhe.codigoCliente] = nome;
          } catch (e) { nome = null; }
        }
        item.cliente = nome;
      }
    } else {
      // Fallback: ConsultarPedido individual
      try {
        const detalheFb = await chamarOmie(env, "/produtos/pedido/", "ConsultarPedido", {
          codigo_pedido: item.codigoPedido,
        });
        const pedido = detalheFb.pedido_venda_produto || {};
        const itens = pedido.det || [];
        let totalUnidades = 0, valorTotal = 0;
        for (const det of itens) {
          const pr = det.produto || {};
          totalUnidades += pr.quantidade || 0;
          valorTotal += pr.valor_total || 0;
        }
        item.valorTotal = valorTotal;
        item.totalUnidades = totalUnidades;

        const codigoCliente = pedido.cabecalho && pedido.cabecalho.codigo_cliente;
        if (codigoCliente) {
          let nomeFb = nomesClientesCache[codigoCliente];
          if (!nomeFb) {
            try {
              const cinfoFb = await chamarOmie(env, "/geral/clientes/", "ConsultarCliente", {
                codigo_cliente_omie: codigoCliente,
              });
              nomeFb = cinfoFb.nome_fantasia || cinfoFb.razao_social || null;
              nomesClientesCache[codigoCliente] = nomeFb;
            } catch (e) { nomeFb = null; }
          }
          item.cliente = nomeFb;
        }
      } catch (e) {
        item.valorTotal = 0;
        item.totalUnidades = 0;
      }
    }

    resultado.push({
      codigoPedido: item.codigoPedido,
      numero: item.numero,
      etapa: item.etapa,
      valorTotal: item.valorTotal || 0,
      totalUnidades: item.totalUnidades || 0,
      cliente: item.cliente || `Pedido #${item.numero}`,
      dataInclusao: item.dataInclusao,
    });
  }

  return resultado;
}
