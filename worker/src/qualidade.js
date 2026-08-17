// ============================================================================
// Rotas de QUALIDADE — fichas do dia e ficha de uma OP (insumos reais + saldo)
// Liga o formulário (ficha-qualidade-com-insumos.html) ao Omie via worker.
//
// Fonte dos insumos: ConsultarOrdemProducao → itensDetalhes (a OP é a fonte
// verdadeira, msg 382). Se a OP não trouxer itens, fallback para a explosão da
// ficha técnica (ESTRUTURAS) × quantidade da OP.
// ============================================================================

import { chamarOmie, buscarOPs, buscarTodasPaginas, consultarProduto } from "./omie.js";
import { ESTRUTURAS, porUnidadeComEstruturas } from "./estruturas.js";
import { readJson, writeJson } from "./r2.js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const LOCAL_ALMOXARIFADO = 3125326654; // "ALMOXARIFADO" (mesmo de insumos.js)

// Itens sem indicador (decisão do dono 14/08/2026) — não aparecem na ficha nem no card
const EXCLUIR = new Set(['EMB08', 'MP0', 'INS024']);
const excluido = (cod) => EXCLUIR.has(cod);

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
  // mapaProdutoParaSku usa o arrayKey correto (produto_servico_cadastro) e cobre
  // produtos fora de SKUS_ATIVOS (ex.: FX000 Base Kombucha) — construirCacheProdutos não.
  const [abertas, mapa] = await Promise.all([
    buscarOPs(env, { cConcluida: "N" }),
    mapaProdutoParaSku(env),
  ]);
  const fichas = [];
  for (const op of abertas || []) {
    const ident = op.identificacao || {};
    const inf = op.infAdicionais || {};
    const nCodProduto = get(ident, "nCodProduto");
    const info = mapa.get(String(nCodProduto));
    let sku = info?.sku ?? null;
    let produto = get(ident, "cDescricaoProduto", "cDescricao") ?? (info?.descricao ?? "") ?? "";
    let un = info?.un ?? "";
    if (!sku && nCodProduto) {
      // Último recurso: ConsultarProduto por id (ex.: produto além das páginas do mapa)
      const rp = await resolveProduto(env, nCodProduto);
      sku = rp.codigo || null;
      if (!produto) produto = rp.descricao || "";
      un = rp.un || un;
    }
    fichas.push({
      op: String(get(ident, "cNumOP", "cCodIntOP", "nCodOP") ?? ""),
      nCodOP: get(ident, "nCodOP") ?? null,
      sku,
      // data da OP (mesma prioridade do calendário) — usada como Data de Produção na ficha
      data: get(inf, "dDtInicio", "dDtPrevisao") ?? get(ident, "dDtPrevisao") ?? "",
      produto,
      nCodProduto,
      qtd: get(ident, "nQtde") ?? 0,
      un,
      status: "sem ficha",
    });
  }
  const lista = fichas.filter((f) => f.op || f.nCodOP);
  await anexarEstadoFichas(env, lista);
  return { data: dataIso, fichas: lista };
}

/** Estado salvo das fichas (D1 + R2) — rápido; chamado a cada request p/ rodapés em tempo real */
export async function anexarEstadoFichas(env, lista) {
  // Estado das fichas salvas (D1) — status, NC e blocos preenchidos, p/ o portal
  try {
    const ops = lista.map((f) => f.op).filter(Boolean);
    if (ops.length) {
      const ph = ops.map(() => "?").join(",");
      const r = await env.QUALIDADE_DB.prepare(
        `SELECT op, status, nc_count, blocos_status FROM fichas WHERE op IN (${ph})`
      ).bind(...ops).all();
      const porOp = new Map((r.results || []).map((x) => [x.op, x]));
      for (const f of lista) {
        const s = porOp.get(f.op);
        if (s) {
          f.status = s.status || "parcial";
          f.nc = Number(s.nc_count || 0);
          try { f.blocos_status = s.blocos_status ? JSON.parse(s.blocos_status) : null; }
          catch (e) { f.blocos_status = null; }
        } else {
          // sem ficha salva: o estado fresco manda (não herdar status velho do cache)
          f.status = "sem ficha";
          f.nc = 0;
          f.blocos_status = null;
          f.insumos_conferidos = 0;
          f.insumos_total = 0;
        }
      }
    }
  } catch (e) { console.error(`[qualidade] d1 fichas: ${e.message}`); }
  // Insumos conferidos (do documento R2) — p/ o rodapé do portal
  for (const f of lista) {
    if (!f.status || f.status === 'sem ficha') continue;
    try {
      const doc = await lerFichaSalva(env, f.op);
      const ci = (doc && doc.conferenciaInsumos) || [];
      f.insumos_conferidos = ci.filter((c) => c.conferido).length;
      f.insumos_total = ci.length;
    } catch (e) { /* sem documento ainda */ }
  }
  return lista;
}

/** Catálogo completo de produtos Omie (ListarProdutos, arrayKey correto) — cache 10 min. */
let _cat = null, _catTs = 0;
async function catalogoProdutos(env) {
  if (_cat && Date.now() - _catTs < 10 * 60 * 1000) return _cat;
  const produtos = await buscarTodasPaginas(env, "/geral/produtos/", "ListarProdutos",
    (p) => ({ pagina: p, registros_por_pagina: 100 }),
    { arrayKey: "produto_servico_cadastro", maxPages: 10 });
  const porId = new Map(), porCod = new Map(), porUn = new Map();
  for (const p of produtos || []) {
    if (p.codigo_produto !== undefined && p.codigo_produto !== null)
      porId.set(String(p.codigo_produto), { codigo: String(p.codigo ?? ""), descricao: p.descricao || "", un: p.unidade || "" });
    if (p.codigo) {
      porCod.set(String(p.codigo), p.descricao || "");
      if (p.unidade) porUn.set(String(p.codigo), p.unidade);
    }
  }
  _cat = { porId, porCod, porUn };
  _catTs = Date.now();
  return _cat;
}

/** Debug — ObterAnexo: link de download do anexo (confere o que o Omie serve) */
export async function obterAnexo(env, nIdAnexo, nId) {
  return chamarOmie(env, "/geral/anexo/", "ObterAnexo", {
    nIdAnexo: Number(nIdAnexo), cTabela: CTABELA_OP, nId: Number(nId),
  });
}

// ============================================================================
// Gravação da ficha — híbrido: documento completo no R2 + índice queryável no D1
// R2:  qualidade/fichas/<ano>/<numero>.json   (fonte da verdade)
// D1:  tabela fichas (metadados) + ncs (não-conformidades)
// ============================================================================
export async function salvarFicha(env, ficha) {
  const op = String(ficha.op || "");
  const num = op.replace(/\D/g, "").slice(-5);
  const ano = op.replace(/\D/g, "").slice(0, 4) || "0000";
  const key = `qualidade/fichas/${ano}/${num || op}.json`;

  // 1) documento completo no R2
  await writeJson(env, key, ficha);

  // 2) índice no D1
  const ncs = ficha.naoConformidades || [];
  const indice = ficha.indiceColeta ? JSON.stringify(ficha.indiceColeta) : null;
  const blocosStatus = ficha.blocos ? JSON.stringify(
    Object.fromEntries(Object.entries(ficha.blocos).map(([b, v]) => {
      if (Array.isArray(v)) {
        // por linha: total de campos vs campos preenchidos
        const total = v.reduce((s, r) => s + (r && typeof r === "object" ? Object.keys(r).length : 1), 0);
        const feitos = v.reduce((s, r) => s + (r && typeof r === "object"
          ? Object.values(r).filter((x) => x !== null && x !== undefined && x !== "").length
          : (r ? 1 : 0)), 0);
        return [b, { f: feitos, t: total }];
      }
      if (v && typeof v === "object") {
        const vals = Object.values(v);
        return [b, { f: vals.filter((x) => x !== null && x !== undefined && x !== "").length, t: vals.length }];
      }
      return [b, { f: String(v ?? "") !== "" ? 1 : 0, t: 1 }];
    }))) : null;
  const agora = new Date().toISOString();
  await env.QUALIDADE_DB.prepare(
    `INSERT INTO fichas (op, n_cod_op, sku, sigla, familia, produto, qtd, un, previsao,
       situacao, tipo_produto, data_producao, status, registrado_em, atualizado_em,
       nc_count, indice, blocos_status)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
     ON CONFLICT(op) DO UPDATE SET
       n_cod_op=?2, sku=?3, sigla=?4, familia=?5, produto=?6, qtd=?7, un=?8,
       previsao=?9, situacao=?10, tipo_produto=?11, data_producao=?12, status=?13,
       registrado_em=?14, atualizado_em=?15, nc_count=?16, indice=?17, blocos_status=?18`
  ).bind(op, ficha.nCodOP ?? null, ficha.sku ?? null, ficha.sigla ?? null,
         ficha.familia ?? null, ficha.produto ?? null, ficha.qtd ?? null, ficha.un ?? null,
         ficha.previsao ?? null, ficha.situacao ?? null, ficha.tipoProduto ?? null,
         ficha.dataProducao ?? null, ficha.status ?? "completa",
         ficha.registradoEm ?? null, agora, ncs.length, indice, blocosStatus).run();

  // 3) não-conformidades (substitui as anteriores da OP)
  await env.QUALIDADE_DB.prepare("DELETE FROM ncs WHERE op = ?1").bind(op).run();
  for (const nc of ncs) {
    await env.QUALIDADE_DB.prepare(
      "INSERT INTO ncs (op, bloco, campo, leitura, valor, min, max) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
    ).bind(op, nc.bloco ?? null, nc.campo ?? null, nc.leitura ?? null,
           nc.valor ?? null, (nc.spec && nc.spec.min) ?? null, (nc.spec && nc.spec.max) ?? null).run();
  }

  return { ok: true, key, d1: "upsert", ncs: ncs.length };
}

/** Ficha salva (do R2) — para reabrir/editar */
export async function lerFichaSalva(env, op) {
  const num = String(op).replace(/\D/g, "").slice(-5);
  const ano = String(op).replace(/\D/g, "").slice(0, 4) || "0000";
  return readJson(env, `qualidade/fichas/${ano}/${num || op}.json`);
}

/** Acha a OP string pelo nCodOP (D1) e lê a ficha salva — o form usa nCodOP na URL */
export async function lerFichaSalvaPorNcod(env, nCodOP) {
  try {
    const r = await env.QUALIDADE_DB.prepare(
      "SELECT op FROM fichas WHERE n_cod_op = ?1 LIMIT 1"
    ).bind(Number(nCodOP)).first();
    if (r && r.op) return lerFichaSalva(env, r.op);
  } catch (e) { console.error(`[qualidade] lerFichaPorNcod: ${e.message}`); }
  return null;
}

/** Fichas salvas no mês (D1) — alimenta o painel/lista */
export async function fichasDoMes(env, aaaamm) {
  const r = await env.QUALIDADE_DB.prepare(
    "SELECT op, sku, produto, data_producao, status, nc_count, indice, blocos_status, qtd, un, n_cod_op FROM fichas WHERE data_producao LIKE ?1 || '%' ORDER BY op"
  ).bind(aaaamm).all();
  const fichas = (r.results || []).map((f) => ({
    ...f,
    // D1 guarda JSON como texto — devolve parseado (consistente com /api/qualidade/fichas)
    blocos_status: typeof f.blocos_status === 'string' ? (() => { try { return JSON.parse(f.blocos_status); } catch(e) { return null; } })() : f.blocos_status,
    indice: typeof f.indice === 'string' ? (() => { try { return JSON.parse(f.indice); } catch(e) { return null; } })() : f.indice,
  }));
  // NCs detalhadas por OP (tabela ncs) — alimenta as "Ocorrências" do painel
  try {
    const ops = fichas.map((f) => f.op).filter(Boolean);
    if (ops.length) {
      const ph = ops.map(() => "?").join(",");
      const rn = await env.QUALIDADE_DB.prepare(
        `SELECT op, bloco, campo, leitura, valor, min, max FROM ncs WHERE op IN (${ph})`
      ).bind(...ops).all();
      const porOp = new Map();
      for (const nc of rn.results || []) {
        const arr = porOp.get(nc.op) || [];
        arr.push(nc);
        porOp.set(nc.op, arr);
      }
      for (const f of fichas) f.ncs = porOp.get(f.op) || [];
    }
  } catch (e) { console.error(`[qualidade] ncs do mes: ${e.message}`); }
  // Bases (FX000) podem ter qtd/un nulos se gravadas antes de o form enviar esses campos.
  // Backfill via fichaDaOp (cache do worker) para que o KPI "volume de base" no painel funcione.
  try {
    const precisam = fichas.filter(f => f.sku === 'FX000' && (f.qtd == null || f.un == null));
    for (const f of precisam) {
      try {
        const op = f.n_cod_op ?? f.op;
        const dados = await fichaDaOp(env, op, false, false);
        if (dados.qtd != null) f.qtd = dados.qtd;
        if (dados.un != null) f.un = dados.un;
      } catch (e) { /* mantém null */ }
    }
  } catch (e) { console.error(`[qualidade] backfill base: ${e.message}`); }
  return fichas;
}

/** Fichas salvas (arquivo) — todas, mais recentes primeiro */
export async function fichasArquivadas(env, limite = 100) {
  const r = await env.QUALIDADE_DB.prepare(
    "SELECT op, n_cod_op, sku, sigla, produto, data_producao, status, nc_count, registrado_em FROM fichas ORDER BY data_producao DESC, op DESC LIMIT ?1"
  ).bind(limite).all();
  return r.results || [];
}

/** Link de download do PDF anexado na OP (ObterAnexo → cLinkDownload); null se não houver */
export async function linkPdfDaOp(env, nCodOP) {
  const r = await listarAnexos(env, nCodOP, CTABELA_OP);
  const anexos = (r && r.listaAnexos) || [];
  const fichaAnexo = anexos.find((a) => String(a.cNomeArquivo || "").startsWith(PREFIXO_ANEXO));
  if (!fichaAnexo) return null;
  const det = await obterAnexo(env, fichaAnexo.nIdAnexo, nCodOP);
  return (det && det.cLinkDownload) || null;
}

/** Debug — ListarAnexo: descobre o cTabela da OP (anexar arquivo pela interface, ler aqui) */
export async function listarAnexos(env, nId, cTabela = "") {
  return chamarOmie(env, "/geral/anexo/", "ListarAnexo", {
    nPagina: 1, nRegPorPagina: 50, nId: Number(nId),
    ...(cTabela ? { cTabela } : {}),
  });
}

// Logo (versão preta) servido pelo Pages — cache em memória; sem rede, segue sem logo
let _logoPng = null;
async function carregarLogo() {
  if (_logoPng !== null) return _logoPng;
  try {
    const r = await fetch("https://cobertura-completa.dashboard-3gm.pages.dev/docs/qualidade/logo-devi-preta.png");
    _logoPng = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch (e) { _logoPng = null; }
  return _logoPng;
}

// ============================================================================
// Anexo automático da ficha na OP — cTabela descoberto em 14/08/2026:
// anexar um arquivo pela interface do Omie e ler com ListarAnexo retorna
// cTabela = "ordem-producao" e nId = nCodOP da OP.
// ============================================================================
const CTABELA_OP = "ordem-producao";
const PREFIXO_ANEXO = "ficha-qualidade-";

// CRC32 (ZIP exige) — tabela padrão
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** MD5 (Rivest) — exigido pelo IncluirAnexo (cMd5 do conteúdo compactado) */
function md5hex(u8) {
  const K = [0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391];
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const len = u8.length;
  const bitLen = len * 8;
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6);
  padded.set(u8);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bitLen >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000), true);
  let A0 = 1732584193 >>> 0, B0 = 4023233417 >>> 0, C0 = 2562383102 >>> 0, D0 = 271733878 >>> 0;
  const M = new Uint32Array(16);
  const rotl = (x, n) => (x << n) | (x >>> (32 - n));
  for (let i = 0; i < padded.length; i += 64) {
    for (let j = 0; j < 16; j++) M[j] = dv.getUint32(i + j * 4, true);
    let A = A0, B = B0, C = C0, D = D0;
    for (let j = 0; j < 64; j++) {
      let Fn, g;
      if (j < 16) { Fn = (B & C) | (~B & D); g = j; }
      else if (j < 32) { Fn = (D & B) | (~D & C); g = (5 * j + 1) % 16; }
      else if (j < 48) { Fn = B ^ C ^ D; g = (3 * j + 5) % 16; }
      else { Fn = C ^ (B | ~D); g = (7 * j) % 16; }
      const tmp = D; D = C; C = B;
      B = (B + rotl((A + Fn + K[j] + M[g]) >>> 0, S[j])) >>> 0;
      A = tmp;
    }
    A0 = (A0 + A) >>> 0; B0 = (B0 + B) >>> 0; C0 = (C0 + C) >>> 0; D0 = (D0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const od = new DataView(out.buffer);
  od.setUint32(0, A0, true); od.setUint32(4, B0, true); od.setUint32(8, C0, true); od.setUint32(12, D0, true);
  return [...out].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** ZIP sem compressão (método store) — o Omie exige o arquivo compactado em ZIP */
function zipStore(arquivos) {
  const chunks = []; let offset = 0;
  const central = [];
  for (const { nome, dados } of arquivos) {
    const data = Buffer.isBuffer(dados) ? dados : Buffer.from(dados, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);            // assinatura
    local.writeUInt16LE(20, 4);                    // versão
    local.writeUInt16LE(0x0800, 6);                // flags UTF-8
    local.writeUInt16LE(0, 8);                     // método store
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nome.length, 26);
    const nameBuf = Buffer.from(nome, "utf8");
    chunks.push(local, nameBuf, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);               // assinatura central
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(0x0800, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nome.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBuf]));
    offset += 30 + nome.length + data.length;
  }
  const cdStart = offset;
  const cdData = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(cdData.length, 12);
  eocd.writeUInt32LE(cdStart, 16);
  return Buffer.concat([...chunks, cdData, eocd]);
}

/** PDF da ficha — seções separadas com barra de título, logo à esquerda em cima (estilo Qualidade V2 / OP Omie) */
export async function pdfDaFicha(ficha) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const F1 = await doc.embedFont(StandardFonts.Helvetica);
  const F2 = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await carregarLogo();
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null;
  const AZUL = rgb(0.16, 0.25, 0.36);
  const AZULC = rgb(0.23, 0.33, 0.47);
  const VERMELHO = rgb(0.78, 0.12, 0.12);
  const PRETO = rgb(0.12, 0.12, 0.12);
  const CINZA = rgb(0.5, 0.5, 0.5);
  const FUNDOL = rgb(0.96, 0.97, 0.98);
  const BORDA = rgb(0.78, 0.8, 0.84);
  let y = 810;
  const FAM = { kombucha: "Kombuchas", refri: "Refrigerantes", cha: "Chás", barril: "Barril" };
  const LAB = {
    starter: "Starter da Fermentação", fermentacao: "Fermentação", filtracao: "Filtração",
    produtoAcabado: "Produto Acabado", observacoes: "Observações do Processo",
    preenvase: "Pré-envase", recravacao: "Recravação", carbonatacao: "Carbonatação",
    estoque: "Envio para Estoque", formulacao: "Formulação",
  };
  const fmtN = v => (v === null || v === undefined || isNaN(v)) ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  const pesoLiquido = () => ficha.un === 'L' ? ficha.qtd : Math.round((ficha.qtd || 0) * 0.269 * 1000) / 1000;

  const t = (s, o = {}) => {
    if (y < 40) return;
    const size = o.size || 10, font = o.bold ? F2 : F1;
    page.drawText(s, { x: o.x ?? 50, y, size, font, color: o.color || PRETO });
    y -= size * 1.5;
  };
  const secao = (titulo, cor = AZUL) => {
    y -= 10;
    page.drawRectangle({ x: 50, y: y - 17, width: 495, height: 17, color: cor });
    page.drawText(titulo.toUpperCase(), { x: 58, y: y - 12, size: 9.5, font: F2, color: rgb(1, 1, 1) });
    y -= 17; y -= 6;
  };
  const tabela = (colunas, largs, linhas, opt = {}) => {
    const rh = opt.rh || 14, fs = opt.fs || 9;
    const xs = []; let acc = 50;
    for (let i = 0; i < colunas.length; i++) { xs.push(acc); acc += largs[i]; }
    const right = acc, yTop = y;
    if (y - rh * (1 + linhas.length) < 40) return;
    page.drawRectangle({ x: 50, y: y - rh, width: right - 50, height: rh, color: AZULC });
    colunas.forEach((c, i) => page.drawText(c, { x: xs[i] + 4, y: y - 9, size: fs, font: F2, color: rgb(1, 1, 1) }));
    y -= rh;
    linhas.forEach((linha, li) => {
      if (y - rh < 40) { y = 30; return; }
      if (li % 2 === 0) page.drawRectangle({ x: 50, y: y - rh, width: right - 50, height: rh, color: FUNDOL });
      linha.forEach((c, i) => {
        let s = String(c ?? "");
        const max = largs[i] - 7;
        while (F1.widthOfTextAtSize(s, fs) > max && s.length > 1) s = s.slice(0, -1);
        page.drawText(s, { x: xs[i] + 4, y: y - 9, size: fs, font: F1, color: PRETO });
      });
      y -= rh;
      page.drawLine({ start: { x: 50, y }, end: { x: right, y }, thickness: 0.3, color: BORDA });
    });
    for (let i = 1; i < colunas.length; i++)
      page.drawLine({ start: { x: xs[i], y }, end: { x: xs[i], y: yTop }, thickness: 0.3, color: BORDA });
    y -= 8;
  };
  const pares = (paresArr, cols = 2) => {
    const linhas = [];
    for (let i = 0; i < paresArr.length; i += cols) {
      const row = [];
      for (let j = 0; j < cols; j++) {
        const p = paresArr[i + j];
        row.push(p ? p[0] : "", p ? String(p[1]) : "");
      }
      linhas.push(row);
    }
    const largs = [];
    for (let j = 0; j < cols; j++) largs.push(70, (495 - cols * 70) / cols);
    tabela(["Campo", "Valor", "Campo", "Valor"].slice(0, cols * 2), largs, linhas, { rh: 14 });
  };

  // ============ cabeçalho: logo à ESQUERDA em cima (como a OP do Omie) ============
  if (logo) {
    const lh = 48, lw = 48 * (1010 / 650);
    page.drawImage(logo, { x: 50, y: 842 - 14 - lh, width: lw, height: lh });
  }
  t("DEVI PRODUCAO DE BEBIDAS LTDA", { bold: true, size: 15, x: 142 });
  t("FICHA DE QUALIDADE", { size: 10.5, x: 142 });
  y -= 8;
  t(`Ordem de Produção Nº ${ficha.op || "—"}`, { bold: true, size: 13 });
  t(`${ficha.sku || ""} - ${ficha.produto || ficha.sigla || ""}`, { size: 11 });
  t(`Previsão de Conclusão: ${ficha.previsao || "—"}     Situação: ${ficha.situacao || "Em andamento"}`, { size: 9.5 });
  t(`Tipo de Produto: ${ficha.tipoProduto || "04 - Produto Acabado"}     Quantidade: ${fmtN(ficha.qtd)} ${ficha.un || ""}     Peso Líquido: ${fmtN(pesoLiquido())} Kg`, { size: 9.5 });
  y -= 4;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1.2, color: AZUL });
  y -= 8;

  // ============ seções (uma por bloco, barra de título própria) ============
  for (const [bloco, dados] of Object.entries(ficha.blocos || {})) {
    if (y < 120) break;
    secao(LAB[bloco] || bloco);
    if (bloco === "recravacao") {
      const linhas = (Array.isArray(dados) ? dados : []).map((r, i) => [`#${i + 1}`, fmtN(r.altura), fmtN(r.espessura), fmtN(r.transpasse)]);
      tabela(["Leitura", "Altura (mm)", "Espessura (mm)", "Transpasse (mm)"], [80, 130, 140, 145], linhas);
    } else if (bloco === "carbonatacao") {
      const linhas = (Array.isArray(dados) ? dados : []).map(r => [r.hora || "—", fmtN(r.temperatura), fmtN(r.pressaoCilindro), fmtN(r.pressaoTanque)]);
      tabela(["Horário", "Temp (°C)", "P. cilindro", "P. tanque"], [90, 130, 135, 140], linhas);
    } else if (bloco === "fermentacao") {
      const linhas = (Array.isArray(dados) ? dados : []).map(r => [r.data || "—", fmtN(r.pH), fmtN(r.brix), fmtN(r.temperatura), fmtN(r.abv)]);
      tabela(["Data", "pH", "°Brix", "Temp (°C)", "ABV (%)"], [110, 90, 95, 95, 105], linhas);
    } else if (bloco === "estoque") {
      const linhas = (Array.isArray(dados) ? dados : []).map(r => [r.hora || "—", fmtN(r.quantidade), r.tipo || "—", r.responsavel || "—"]);
      tabela(["Horário", "Quantidade", "Tipo", "Responsável"], [90, 140, 125, 140], linhas);
    } else if (bloco === "preenvase") {
      pares([["pH", fmtN(dados.pH)], ["°Brix", fmtN(dados.brix)], ["Carbonatação", fmtN(dados.carbonatacao)], ["Responsável", dados.responsavel || "—"]]);
    } else if (bloco === "starter") {
      pares([["Tanque", dados.tanque || "—"], ["Fonte", dados.fonte || "—"], ["pH", fmtN(dados.pH)], ["°Brix", fmtN(dados.brix)], ["Volume (L)", fmtN(dados.volume)]]);
    } else if (bloco === "filtracao") {
      pares([["Volume (L)", fmtN(dados.volume)], ["Tempo (min)", fmtN(dados.tempo)]]);
    } else if (bloco === "produtoAcabado") {
      pares([["Produto", dados.produto || "—"], ["°Brix", fmtN(dados.brix)], ["pH", fmtN(dados.pH)], ["ABV (%)", fmtN(dados.abv)], ["Brix Suco", fmtN(dados.brixSuco)]]);
    } else if (bloco === "observacoes") {
      t(String(dados || "") || "—", { size: 9.5 });
    } else {
      pares(Object.entries(dados || {}).map(([k, v]) => [k, typeof v === "string" ? v : fmtN(v)]));
    }
    y -= 4;
  }

  // ============ não-conformidades (barra vermelha) ============
  const ncs = ficha.naoConformidades || [];
  if (ncs.length) {
    secao(`Não Conformidades (${ncs.length})`, VERMELHO);
    ncs.forEach(nc => {
      t(`• ${LAB[nc.bloco] || nc.bloco}${nc.leitura ? " · leitura " + nc.leitura : ""} — ${nc.campo}: ${fmtN(nc.valor)} (faixa ${fmtN(nc.spec && nc.spec.min)} a ${fmtN(nc.spec && nc.spec.max)})`,
        { size: 9.5, color: VERMELHO });
    });
    y -= 4;
  }

  // ============ outras informações ============
  secao("Outras Informações", AZULC);
  pares([["Registrado em", ficha.registradoEm || "—"], ["Status da ficha", ficha.status || "completa"]]);

  // ============ rodapé ============
  y -= 6;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.8, color: AZUL });
  y -= 8;
  page.drawText("Documento gerado automaticamente pelo sistema de qualidade - Dêvi", { x: 50, y: y - 4, size: 8, font: F1, color: CINZA });
  page.drawText("Página 1 de 1", { x: 480, y: y - 4, size: 8, font: F1, color: CINZA });

  return Buffer.from(await doc.save());
}

/** Anexa (ou substitui) o PDF da ficha na OP — zip + base64 conforme o Omie exige */
export async function anexarFichaNaOp(env, nCodOP, ficha, debug = false) {
  const nomePdf = `${PREFIXO_ANEXO}${String(ficha.op || nCodOP).replace(/\D/g, "")}.pdf`;
  const pdf = await pdfDaFicha(ficha);
  const zip = zipStore([{ nome: nomePdf, dados: pdf }]);
  const cArquivo = zip.toString("base64");
  // cMd5 = MD5 da string base64 (verificado com o Omie em 14/08/2026 — não dos bytes)
  const cMd5 = md5hex(new TextEncoder().encode(cArquivo));

  // debug: quais interpretações de MD5 o Omie espera?
  if (debug) {
    const cand = {
      md5Zip: md5hex(zip),
      md5B64: md5hex(new TextEncoder().encode(cArquivo)),
      md5Pdf: md5hex(pdf),
      lenZip: zip.length, lenB64: cArquivo.length, lenPdf: pdf.length,
    };
    try {
      const r = await chamarOmie(env, "/geral/anexo/", "IncluirAnexo", {
        cCodIntAnexo: "", cTabela: CTABELA_OP, nId: Number(nCodOP),
        cNomeArquivo: nomePdf, cTipoArquivo: "pdf", cArquivo, cMd5: cand.md5B64,
      });
      return { ok: true, ...(r || {}), candidatos: cand };
    } catch (e) { return { erro: String(e.message), candidatos: cand }; }
  }

  // substitui apenas anexos da própria ficha (nunca apaga arquivos anexados à mão)
  try {
    const existentes = await listarAnexos(env, nCodOP, CTABELA_OP);
    for (const an of existentes.listaAnexos || []) {
      if (String(an.cNomeArquivo || "").startsWith(PREFIXO_ANEXO)) {
        try {
          await chamarOmie(env, "/geral/anexo/", "ExcluirAnexo", {
            nIdAnexo: an.nIdAnexo, nId: Number(nCodOP), cTabela: CTABELA_OP,
          });
        } catch (e) { console.error(`[qualidade] excluir anexo antigo: ${e.message}`); }
      }
    }
  } catch (e) { /* sem anexos ainda */ }

  const r = await chamarOmie(env, "/geral/anexo/", "IncluirAnexo", {
    cCodIntAnexo: "",
    cTabela: CTABELA_OP,
    nId: Number(nCodOP),
    cNomeArquivo: nomePdf,
    cTipoArquivo: "pdf",
    cArquivo,
    cMd5,
  });
  return { ok: true, nomeArquivo: nomePdf, ...(r || {}) };
}

/** Mapa codigo_produto → { sku, descricao, un } via ListarProdutos (chave real: produto_servico_cadastro). */
async function mapaProdutoParaSku(env) {
  const cat = await catalogoProdutos(env);
  const mapa = new Map();
  for (const [id, p] of cat.porId) mapa.set(id, { sku: p.codigo, descricao: p.descricao, un: p.un });
  return mapa;
}


/** Resolve produto (codigo/descricao) — por codigo_produto (id numérico) ou codigo. */
const cacheProdutosResolvidos = new Map();
async function resolveProduto(env, id) {
  if (id === null || id === undefined) return { codigo: "", descricao: "" };
  const chave = String(id);
  if (cacheProdutosResolvidos.has(chave)) return cacheProdutosResolvidos.get(chave);
  let r = null;
  try {
    r = /^\d+$/.test(chave)
      ? await chamarOmie(env, "/geral/produtos/", "ConsultarProduto", { codigo_produto: Number(chave) })
      : await consultarProduto(env, chave);
  } catch (e) { /* não encontrado */ }
  const out = r && r.codigo_produto
    ? { codigo: r.codigo || "", descricao: r.descricao || r.cDescricao || "", un: r.unidade || r.un || "" }
    : { codigo: "", descricao: "", un: "" };
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
export async function fichaDaOp(env, op, comSaldo = true, raw = false) {
  const n = parseInt(op, 10);
  let consulta;
  if (/^\d{4}\/\d+$/.test(String(op))) {
    // formato <ano>/<numero> (ex.: 2026/00520) → previsão/comando da Ordre de Produção
    consulta = { cNumOP: op };
  } else if (Number.isInteger(n) && String(n) === String(op)) {
    consulta = { nCodOP: n };
  } else {
    consulta = { cCodIntOP: op };
  }

  const r = await chamarOmie(env, "/produtos/op/", "ConsultarOrdemProducao", consulta);
  if (raw) return { op, nCodOP: n, raw: r };
  const ident = r.identificacao || {};
  const inf = r.infAdicionais || {};
  const nCodProduto = get(ident, "nCodProduto");
  const qtdOP = get(ident, "nQtde") ?? 0;
  let sku = null, produtoDesc = "", un = "";
  if (nCodProduto) {
    // mapaProdutoParaSku (arrayKey correto) cobre produtos fora de SKUS_ATIVOS,
    // ex.: FX000 Base Kombucha — construirCacheProdutos não resolve esses.
    const mapa = await mapaProdutoParaSku(env);
    const info = mapa.get(String(nCodProduto));
    if (info) { sku = info.sku || null; produtoDesc = info.descricao || ""; un = info.un || ""; }
  }
  if (!sku && nCodProduto) {
    // Último recurso: ConsultarProduto por id (ex.: produto além das páginas do mapa)
    const rp = await resolveProduto(env, nCodProduto);
    sku = rp.codigo || null;
    if (!produtoDesc) produtoDesc = rp.descricao || "";
    un = rp.un || un;
  }

  // 1) Fonte verdadeira: itensDetalhes da OP (msg 382)
  let itens = (Array.isArray(r.itensDetalhes) ? r.itensDetalhes : []).map((d) => ({
    codigo: String(get(d, "cCodIntItem", "cCodProduto", "nIdProdutoMalha") ?? ""),
    nome: get(d, "cDescricao", "cNomeProduto", "cDescricaoItem") ?? "",
    un: get(d, "cUnidade", "nUnidade") ?? "",
    quantidade: get(d, "nQtde") ?? null,
    reservado: get(d, "cReservado") ?? "",
    _id: get(d, "nIdProdutoMalha", "nCodProduto"),
  })).filter((i) => i.codigo || i.nome);

  // Código + nome reais via ConsultarProduto pelo id numérico (itensDetalhes só traz
  // nIdProdutoMalha). O casamento por quantidade é só último recurso — itens 1:1
  // (lata/rótulo/tampa) e quantidades idênticas colidem e produziam duplicados.
  const porUn = sku ? porUnidadeComEstruturas(sku, ESTRUTURAS) : null;
  const qtdUsadas = new Set();
  for (const item of itens) {
    // 1) cadastro Omie: codigo_produto → codigo + descricao reais (como no PDF da OP)
    if (!item.nome && item._id != null) {
      const rp = await resolveProduto(env, item._id);
      if (rp.codigo || rp.descricao) {
        item.codigo = rp.codigo || item.codigo;
        item.nome = rp.descricao || item.nome;
        item.un = rp.un || UN[item.codigo] || item.un;
      }
    }
    // 2) último recurso: casamento por quantidade — só sem código e sem repetir código
    if (!item.nome && porUn && qtdOP > 0 && item.quantidade != null) {
      const alvo = item.quantidade / qtdOP;
      const casal = Object.entries(porUn).find(([cod, q]) =>
        !qtdUsadas.has(cod) && Math.abs(q - alvo) < Math.max(alvo, 1e-6) * 0.02);
      if (casal) {
        if (!item.codigo) item.codigo = casal[0];
        item.nome = NOMES[casal[0]] || casal[0];
        item.un = UN[item.codigo] || item.un;
        qtdUsadas.add(casal[0]);
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

  // 3) Saldo do almoxarifado — TODOS os itens da OP (rótulo, tampa, aroma, concentrado…),
  //    lotes de 4 com pausa. Itens sem produto/sem posição no local ficam com saldo null.
  //    Critério diferente do painel de insumos (insumos.js: subconjunto curado com
  //    indicador de cobertura) — aqui o operador precisa do saldo de tudo. Intencional.
  if (comSaldo && itens.length) {
    const cache = new Map();
    for (let i = 0; i < itens.length; i += 4) {
      const lote = itens.slice(i, i + 4);
      await Promise.all(lote.map(async (item) => {
        item.saldo = await saldoDo(env, item.codigo, cache);
      }));
      if (i + 4 < itens.length) await new Promise((res) => setTimeout(res, 250));
    }
  } else {
    itens.forEach((i) => { i.saldo = null; });
  }

  return {
    op, nCodOP: get(ident, "nCodOP") ?? null, sku,
    produto: get(ident, "cDescricaoProduto", "cDescricao") ?? produtoDesc,
    nCodProduto, qtd: qtdOP, un, origem, itens,
    // campos da folha (clone do modelo impresso pelo Omie)
    // data = data corrente da OP (mesma prioridade do calendário); previsao = dDtPrevisao
    data: get(inf, "dDtInicio", "dDtPrevisao") ?? get(ident, "dDtPrevisao") ?? "",
    previsao: get(ident, "dDtPrevisao") ?? "",
    situacao: "Em andamento",            // lista só traz OPs abertas
    tipoProduto: "04 - Produto Acabado",
  };
}
