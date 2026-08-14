// ============================================================================
// Rotas de QUALIDADE — fichas do dia e ficha de uma OP (insumos reais + saldo)
// Liga o formulário (ficha-qualidade-com-insumos.html) ao Omie via worker.
//
// Fonte dos insumos: ConsultarOrdemProducao → itensDetalhes (a OP é a fonte
// verdadeira, msg 382). Se a OP não trouxer itens, fallback para a explosão da
// ficha técnica (ESTRUTURAS) × quantidade da OP.
// ============================================================================

import { chamarOmie, buscarOPs, buscarTodasPaginas, consultarProduto } from "./omie.js";
import { construirCacheProdutos } from "./kpis.js";
import { ESTRUTURAS, porUnidadeComEstruturas } from "./estruturas.js";

export const LOCAL_ALMOXARIFADO = 3125326654; // "ALMOXARIFADO" (mesmo de insumos.js)

// Itens sem indicador (decisão do dono 14/08/2026) — não aparecem na ficha nem no card
const EXCLUIR = new Set(['EMB08', 'MP0', 'INS024']);
const excluido = (cod) => EXCLUIR.has(cod);

// Códigos monitorados com saldo no almoxarifado (insumos.js) — só esses buscam
// PosicaoEstoque; os demais ficam com saldo null.
const MONITORADOS = new Set([
  "MP018","MPR010","MPR016","MPR021","MP05","PRD00338","MPA001","MPR007","MPR015",
  "MPR029","MP045","MP034","MP04","MP036","MP03","MP022","MP003","MPR024","MPR011",
  "MP044","MP021","MPC002","MP032","MPC004","MPC005","MPR006","MP030","MPR012",
  "MPR013","MPR022","MPA032","MP09","MP006","MP02","EMB01","EMB02"
]);

const NOMES = {
  // embalagem / produção
  EMB01:"Lata sleek 269 ml", EMB02:"Tampa 202 SOT", EMB04:"Lata (pack água)", EMB08:"Filme",
  MP0:"CO₂", INS024:"Ribbon datador",
  // rótulos (1 por SKU)
  RFX001:"Rótulo Komb Frutas Vermelhas", RFX002:"Rótulo Komb Abacaxi Gengibre",
  RFX003:"Rótulo Komb Maçã Gengibre", RFX006:"Rótulo Komb Mirtilo Morango",
  RFX007:"Rótulo Komb Pink Lemonade", RCH001:"Rótulo Chá Verde Pêssego",
  RCH002:"Rótulo Chá Hibisco Morango", RCH003:"Rótulo Chá Camomila Maracujá",
  RCH004:"Rótulo Chá Mate Limão", RRF001:"Rótulo Refri Limão Siciliano",
  RRF002:"Rótulo Refri Frutas Vermelhas", RRF003:"Rótulo Refri Guaraná Açaí",
  RRF004:"Rótulo Refri Uva", RRF005:"Rótulo Refri Laranja",
  RRTM001:"Rótulo Refri Limão Mônica", RRTM002:"Rótulo Refri Uva Mônica",
  RRTM003:"Rótulo Refri Laranja Mônica",
  // bases / sucos / folhas (nomes do insumos.js)
  FX000:"Base Kombucha", SAB01:"Suco Abacaxi", SAB02:"Suco Limão",
  SAB03:"Suco Frutas Vermelhas (rosa)", SAB04:"Suco Frutas Vermelhas", SAB05:"Suco Mirtilo Morango",
  MP05:"Chá Verde Orgânico", PRD00338:"Açúcar Cristal Org.", MP018:"Goma Arábica",
  MP02:"Mirtilo", MP03:"Framboesa Org. Congelada", MP04:"Morango Org. Congelado",
  MP003:"Amora Org. Congelada", MP09:"Abacaxi (suco)", MP006:"Limão",
  MPR010:"Conc. Maçã 70 Brix", MPR013:"Ácido Cítrico", MPR012:"Sorbato de Potássio",
  MPR021:"Conc. Limão 45°Bx", MPR024:"Aroma Frutas Vermelhas", MPR029:"Conc. Frutas Vermelhas",
  MPR018:"Conc. Maçã e Morango", MPR002:"Açaí", MP030:"Conc. Maçã 70º Brix",
  MP032:"Conc. Chá-Mate Tosta Alta", MP034:"Conc. Laranja", MP045:"Conc. Uva 68°Brix",
  MPR015:"Hibisco Desidratado", MPR016:"Estévia", MPR022:"Conservante",
  MPR011:"Extrato de Mirtilo", MPR007:"Extrato Limão Siciliano", MPR023:"Aroma (023)",
  MPR004:"Aroma (004)", MPR006:"Aroma Natural de Guaraná", MPR009:"Aroma (009)",
  MPC002:"Conc. Maçã e Maracujá", MPC004:"Conc. Maçã e Pêssego", MPC005:"Extrato Camomila",
  MPC006:"Conc. Camomila", MPC011:"Conc. (11)", MPC020:"Conc. (20)", MPC030:"Conc. (30)",
  MP036:"Aroma Natural de Uva", MP022:"Aroma Natural de Laranja", MP020:"Abacaxi (aroma)",
  MP021:"Gengibre Orgânico", MP044:"Aroma Steviaroom 2000", MP051:"Aroma (051)",
  MPA001:"Aroma Limão Siciliano", MPA008:"Aditivo (008)", MPA031:"Aditivo (031)",
  MPA032:"Ácido Ascórbico",
};
const UN = { EMB01:"un", EMB02:"un", EMB04:"un", EMB08:"un", MP0:"kg", INS024:"un",
  MP05:"kg", PRD00338:"kg", MP018:"kg", MP02:"kg", MP03:"kg", MP04:"kg", MP003:"kg",
  MP09:"L", MP006:"L", MPR010:"kg", MPR013:"kg", MPR012:"kg", MPR021:"L", MPR024:"kg",
  MPR029:"kg", MPR018:"kg", MPR002:"kg", MP030:"kg", MP032:"L", MP034:"kg", MP045:"kg",
  MPR022:"kg", MP021:"kg", MP036:"kg", MP022:"kg", MP044:"kg", MPA001:"kg", MPR007:"kg",
  MPR015:"kg", MPR016:"kg", MPR011:"kg", MPR023:"kg", MPR004:"kg", MPR006:"kg",
  MPR009:"kg", MPC002:"kg", MPC004:"kg", MPC005:"kg", MPC006:"kg", MPC011:"kg",
  MPC020:"kg", MPC030:"kg", MP020:"kg", MP051:"kg", MPA008:"kg", MPA031:"kg", MPA032:"kg" };

const get = (obj, ...keys) => { for (const k of keys) { if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k]; } return null; };
const r3 = x => Math.round(x * 1000) / 1000;

/** Lista as OPs abertas (fichas do dia) — ListarOrdemProducao, cConcluida=N */
export async function listarFichasDoDia(env, dataIso) {
  const [abertas, cacheProd] = await Promise.all([
    buscarOPs(env, { cConcluida: "N" }),
    construirCacheProdutos(env),
  ]);
  const idParaSku = {};
  for (const [s, info] of Object.entries(cacheProd)) idParaSku[String(info.codigo_produto)] = s;
  const fichas = (abertas || []).map((op) => {
    const ident = op.identificacao || {};
    const nCodProduto = get(ident, "nCodProduto");
    const sku = idParaSku[String(nCodProduto)] ?? null;
    return {
      op: String(get(ident, "cNumOP", "cCodIntOP", "nCodOP") ?? ""),
      nCodOP: get(ident, "nCodOP") ?? null,
      sku,
      produto: get(ident, "cDescricaoProduto", "cDescricao") ?? (sku ? cacheProd[sku].descricao : "") ?? "",
      nCodProduto,
      qtd: get(ident, "nQtde") ?? 0,
      status: "sem ficha",
    };
  }).filter((f) => f.op || f.nCodOP);
  return { data: dataIso, fichas };
}

/** Mapa codigo_produto → { sku, descricao } via ListarProdutos (chave real: produto_servico_cadastro). */
async function mapaProdutoParaSku(env) {
  const produtos = await buscarTodasPaginas(env, "/geral/produtos/", "ListarProdutos",
    (p) => ({ pagina: p, registros_por_pagina: 100 }),
    { arrayKey: "produto_servico_cadastro", maxPages: 10 });
  const mapa = new Map();
  for (const p of produtos || []) {
    const id = p.codigo_produto;
    if (id !== undefined && p.codigo) mapa.set(String(id), { sku: String(p.codigo), descricao: p.descricao || "" });
  }
  return mapa;
}


/** Resolve produto (codigo/descricao) por id numérico — ConsultarProduto por codigo ou nCodProduto. */
const cacheProdutosResolvidos = new Map();
async function resolveProduto(env, id) {
  if (id === null || id === undefined) return { codigo: "", descricao: "" };
  const chave = String(id);
  if (cacheProdutosResolvidos.has(chave)) return cacheProdutosResolvidos.get(chave);
  let r = null;
  try { r = await consultarProduto(env, chave); } catch (e) { /* tenta nCodProduto */ }
  if (!r || !r.codigo_produto) {
    try { r = await chamarOmie(env, "/geral/produtos/", "ConsultarProduto", { nCodProduto: id }); } catch (e) {}
  }
  const out = r && r.codigo_produto
    ? { codigo: r.codigo || "", descricao: r.descricao || r.cDescricao || "" }
    : { codigo: "", descricao: "" };
  cacheProdutosResolvidos.set(chave, out);
  return out;
}

/** PosicaoEstoque individual — saldo do almoxarifado. null se falhar. */
async function saldoDo(env, codigo, cacheProduto) {
  try {
    let id = cacheProduto.get(codigo);
    if (id === undefined) {
      const p = await consultarProduto(env, codigo);
      id = p && p.codigo_produto;
      cacheProduto.set(codigo, id ?? null);
    }
    if (id === null || id === undefined) return null;
    const r = await chamarOmie(env, "/estoque/consulta/", "PosicaoEstoque", {
      codigo_local_estoque: LOCAL_ALMOXARIFADO,
      id_prod: id,
    });
    return r.saldo ?? r.nSaldo ?? null;
  } catch (e) {
    return null;
  }
}

/** Ficha de uma OP — itens reais (itensDetalhes) + saldo (opcional). */
export async function fichaDaOp(env, op, comSaldo = true) {
  const n = parseInt(op, 10);
  const consulta = Number.isInteger(n) && String(n) === String(op)
    ? { nCodOP: n } : { cCodIntOP: op };

  const r = await chamarOmie(env, "/produtos/op/", "ConsultarOrdemProducao", consulta);
  const ident = r.identificacao || {};
  const nCodProduto = get(ident, "nCodProduto");
  const qtdOP = get(ident, "nQtde") ?? 0;
  let sku = null, produtoDesc = "";
  if (nCodProduto) {
    const cacheProd = await construirCacheProdutos(env); // { SKU: { codigo_produto, descricao } }
    for (const [s, info] of Object.entries(cacheProd)) {
      if (String(info.codigo_produto) === String(nCodProduto)) { sku = s; produtoDesc = info.descricao || ""; break; }
    }
  }

  // 1) Fonte verdadeira: itensDetalhes da OP (msg 382)
  let itens = (Array.isArray(r.itensDetalhes) ? r.itensDetalhes : []).map((d) => ({
    codigo: String(get(d, "cCodIntItem", "cCodProduto", "nIdProdutoMalha") ?? ""),
    nome: get(d, "cDescricao", "cNomeProduto", "cDescricaoItem") ?? "",
    un: get(d, "cUnidade", "nUnidade") ?? "",
    quantidade: get(d, "nQtde") ?? null,
    _id: get(d, "nIdProdutoMalha", "nCodProduto"),
  })).filter((i) => i.codigo || i.nome);

  // nomes reais: itens vêm com id numérico → casa a quantidade por unidade
  // com a folha da estrutura (ex.: 2,7/450 = 0,006 = MP0 CO₂)
  const porUn = sku ? porUnidadeComEstruturas(sku, ESTRUTURAS) : null;
  for (const item of itens) {
    if (!item.nome && porUn && qtdOP > 0 && item.quantidade != null) {
      const alvo = item.quantidade / qtdOP;
      const casal = Object.entries(porUn).find(([, q]) => Math.abs(q - alvo) < Math.max(alvo, 1e-6) * 0.02);
      if (casal) {
        item.codigo = casal[0];
        item.nome = NOMES[casal[0]] || casal[0];
        item.un = UN[casal[0]] || item.un;
      }
    }
    delete item._id;
  }

  // remove itens sem indicador (EMB08 filme, MP0 CO2, INS024 ribbon)
  itens = itens.filter((i) => !excluido(i.codigo));

  let origem = itens.length ? "op_itens" : null;

  // 2) Fallback: explosão da ficha técnica × quantidade da OP
  if (!itens.length && sku) {
    const porUn = porUnidadeComEstruturas(sku, ESTRUTURAS);
    if (porUn) {
      itens = Object.entries(porUn)
        .filter(([cod]) => !excluido(cod))
        .map(([cod, q]) => ({
          codigo: cod,
          nome: NOMES[cod] || cod,
          un: UN[cod] || "",
          quantidade: r3(q * qtdOP),
        })).sort((a, b) => b.quantidade - a.quantidade);
      origem = "estrutura";
    }
  }

  // 3) Saldo do almoxarifado — só monitorados, lotes de 4 com pausa
  if (comSaldo && itens.length) {
    const cache = new Map();
    for (let i = 0; i < itens.length; i += 4) {
      const lote = itens.slice(i, i + 4);
      await Promise.all(lote.map(async (item) => {
        item.saldo = MONITORADOS.has(item.codigo) ? await saldoDo(env, item.codigo, cache) : null;
      }));
      if (i + 4 < itens.length) await new Promise((res) => setTimeout(res, 250));
    }
  } else {
    itens.forEach((i) => { i.saldo = null; });
  }

  return {
    op, nCodOP: get(ident, "nCodOP") ?? null, sku,
    produto: get(ident, "cDescricaoProduto", "cDescricao") ?? produtoDesc,
    nCodProduto, qtd: qtdOP, origem, itens,
  };
}
