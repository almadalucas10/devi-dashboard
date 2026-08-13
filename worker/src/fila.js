// ============================================================================
// Fila de Pedidos — port de buscarFilaDePedidos()
// ============================================================================
import { chamarOmie, buscarTodasPaginas } from "./omie.js";
import { hojeBrasilDate } from "./fuso.js";
import { construirCacheProdutos } from "./kpis.js";

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
  const hoje = hojeBrasilDate();
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
    const skus = new Set();
    for (const det of itens) {
      const pr = det.produto || {};
      totalUnidades += pr.quantidade || 0;
      valorTotal += pr.valor_total || 0;
      if (pr.codigo) skus.add(pr.codigo);
    }
    detalhesPorPedido[cod] = {
      codigoCliente: cab.codigo_cliente,
      valorTotal,
      totalUnidades,
      quantidadeSkus: skus.size,
      itens: itens.map(det => ({ codigo: (det.produto || {}).codigo, qtde: (det.produto || {}).quantidade || 0 })).filter(i => i.codigo),
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
      item.quantidadeSkus = detalhe.quantidadeSkus;
      item.itens = detalhe.itens;

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
        const skusFb = new Set();
        for (const det of itens) {
          const pr = det.produto || {};
          totalUnidades += pr.quantidade || 0;
          valorTotal += pr.valor_total || 0;
          if (pr.codigo) skusFb.add(pr.codigo);
        }
        item.valorTotal = valorTotal;
        item.totalUnidades = totalUnidades;
        item.quantidadeSkus = skusFb.size;

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
      quantidadeSkus: item.quantidadeSkus || 0,
      cliente: item.cliente || `Pedido #${item.numero}`,
      dataInclusao: item.dataInclusao,
      itens: item.itens || [],
    });
  }

  return resultado;
}

// ============================================================================
// Remessas — remessas ativas (não faturadas e não canceladas) do OMIE
// ============================================================================

export async function buscarRemessas(env) {
  const remessas = await buscarTodasPaginas(
    env,
    "/produtos/remessa/",
    "ListarRemessas",
    (pagina) => ({ nPagina: pagina }),
    { arrayKey: "remessas", totalPagesKey: "nTotalPaginas", pageDelay: 400 }
  );

  // Só remessas em aberto (aguardando execução/faturamento)
  const ativas = remessas.filter((r) => {
    const cab = r.cabec || {};
    return cab.faturada !== "S" && cab.cCancelado !== "S";
  });
  if (ativas.length === 0) return [];

  // Mapa numérico (nCodProd) → SKU (CH001…)
  const cacheProd = await construirCacheProdutos(env);
  const codParaSku = {};
  for (const sku of Object.keys(cacheProd)) {
    const cp = cacheProd[sku];
    if (cp && cp.codigo_produto) codParaSku[String(cp.codigo_produto)] = sku;
  }

  const nomesCache = await construirCacheClientes(env, 3);

  const resultado = [];
  for (const rem of ativas) {
    const cab = rem.cabec || {};
    const itens = (rem.produtos || [])
      .map((pr) => ({ codigo: codParaSku[String(pr.nCodProd)] || null, qtde: pr.nQtde || 0 }))
      .filter((i) => i.codigo);
    const totalUnidades = itens.reduce((s, i) => s + i.qtde, 0);
    const rec = {
      origem: "remessa",
      numero: cab.cNumeroRemessa,
      etapa: "remessa",
      dataPrevisao: cab.dPrevisao || "",
      valorTotal: cab.nValorTotal || 0,
      totalUnidades,
      quantidadeSkus: itens.length,
      itens,
    };
    if (cab.nCodCli) {
      rec.codigoCliente = cab.nCodCli;
      rec.cliente = nomesCache[cab.nCodCli] || null;
    }
    resultado.push(rec);
  }
  return resultado;
}

// Fila de pedidos + remessas em aberto (a Reposição calcula por cima da fila,
// então as remessas impactam a necessidade automaticamente).
export async function buscarFilaComRemessas(env) {
  const fila = await buscarFilaDePedidos(env);
  try {
    const remessas = await buscarRemessas(env);
    if (remessas.length === 0) return fila;
    console.log(`✅ Remessas ativas: ${remessas.length}`);
    return fila.concat(remessas);
  } catch (e) {
    console.warn(`⚠️ Remessas ignoradas: ${e.message}`);
    return fila; // remessas nunca derrubam a fila
  }
}
