// ============================================================================
// Painel de Insumos — 38 itens monitorados com consumo via calendário × BOM
// ============================================================================
import { chamarOmie } from "./omie.js";
import { readJson } from "./r2.js";
import { R2_KEYS } from "./constants.js";
import { diasUteisRestantes, corPorDias, pctDoMinimo } from "./ruptura.js";

const LOCAL_ALMOXARIFADO = 3125326654;

// 38 insumos monitorados com SKUs associados
const INSUMOS = [
  { codigo: 'MP018', desc: 'Goma Arábica', un: 'KG', familia: 'Aditivos', skuQtd: {CH001:.002690,CH002:.002690,CH004:.001978,FX001:.005381,FX002:.005381,FX003:.005381,FX006:.005381,FX007:.005381,RF001:.002690,RF002:.002690,RF003:.002690,RF004:.002690,RF005:.002690,RTM001:.002690,RTM002:.002690,RTM003:.002690} },
  { codigo: 'MPR010', desc: 'Conc. Maçã 70 Brix', un: 'KG', familia: 'Concentrados', skuQtd: {CH001:.001865,CH002:.009254,CH003:.005770,CH004:.009254,RF001:.001865,RF002:.009254,RF003:.009254,RF004:.009254,RF005:.009254,RTM001:.001865,RTM002:.009254,RTM003:.009254} },
  { codigo: 'MPR016', desc: 'Estévia', un: 'KG', familia: 'Aditivos', skuQtd: {CH001:.000026,CH002:.000011,CH003:.000016,CH004:.000011,RF001:.000016,RF002:.000011,RF003:.000011,RF004:.000011,RF005:.000011,RTM001:.000016,RTM002:.000011,RTM003:.000011} },
  { codigo: 'MPR021', desc: 'Conc. Limão 45°Bx', un: 'KG', familia: 'Concentrados', skuQtd: {CH001:.002287,CH002:.003093,CH003:.005491,CH004:.003093,RF001:.002287,RF003:.003093,RTM001:.002287} },
  { codigo: 'MP05', desc: 'Chá Verde Orgânico', un: 'KG', familia: 'Base Kombucha', skuQtd: {FX001:.006500,FX002:.006500,FX003:.006500,FX006:.006500,FX007:.006500} },
  { codigo: 'PRD00338', desc: 'Açúcar Cristal Org.', un: 'KG', familia: 'Base Kombucha', skuQtd: {FX001:.040000,FX002:.040000,FX003:.040000,FX006:.040000,FX007:.040000} },
  { codigo: 'MPA001', desc: 'Aroma Limão Siciliano', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {CH004:.000437,FX007:.003905,RF001:.003905,RTM001:.003905} },
  { codigo: 'MPR007', desc: 'Extrato Limão Siciliano', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {CH004:.000568,RF001:.000568,RTM001:.000568} },
  { codigo: 'MPR015', desc: 'Hibisco Desidratado', un: 'KG', familia: 'Hortifruti', skuQtd: {CH001:.000168,CH002:.000887,RF003:.000887} },
  { codigo: 'MPR029', desc: 'Conc. Frutas Vermelhas', un: 'KG', familia: 'Concentrados', skuQtd: {CH002:.009496,RF002:.009496} },
  { codigo: 'MP045', desc: 'Conc. Uva 68°Brix', un: 'KG', familia: 'Concentrados', skuQtd: {RF004:.009496,RTM002:.009496} },
  { codigo: 'MP034', desc: 'Conc. Laranja', un: 'KG', familia: 'Concentrados', skuQtd: {RF005:.009496,RTM003:.009496} },
  { codigo: 'MP04', desc: 'Morango Org. Congelado', un: 'KG', familia: 'Hortifruti', skuQtd: {FX006:.001865,FX007:.001865} },
  { codigo: 'MP036', desc: 'Aroma Natural de Uva', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {RF004:.003905,RTM002:.003905} },
  { codigo: 'MP03', desc: 'Framboesa Org. Congelada', un: 'KG', familia: 'Hortifruti', skuQtd: {FX001:.001865,FX007:.001865} },
  { codigo: 'MP022', desc: 'Aroma Natural de Laranja', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {RF005:.003905,RTM003:.003905} },
  { codigo: 'MP003', desc: 'Amora Org. Congelada', un: 'KG', familia: 'Hortifruti', skuQtd: {FX001:.001865,FX006:.001865} },
  { codigo: 'MPR024', desc: 'Aroma Frutas Vermelhas', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {FX001:.003905,RF002:.003905} },
  { codigo: 'MPR011', desc: 'Extrato de Mirtilo', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {CH002:.000323,FX006:.000323} },
  { codigo: 'MP044', desc: 'Aroma Steviaroom 2000', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {CH001:.000038,RF002:.000038} },
  { codigo: 'MP021', desc: 'Gengibre Orgânico', un: 'KG', familia: 'Hortifruti', skuQtd: {FX002:.000500,FX003:.000500} },
  { codigo: 'MPC002', desc: 'Conc. Maçã e Maracujá', un: 'KG', familia: 'Concentrados', skuQtd: {CH003:.008985} },
  { codigo: 'MP032', desc: 'Conc. Chá-Mate Tosta Alta', un: 'KG', familia: 'Concentrados', skuQtd: {CH004:.010567} },
  { codigo: 'MPC004', desc: 'Conc. Maçã e Pêssego', un: 'KG', familia: 'Concentrados', skuQtd: {CH001:.010567} },
  { codigo: 'MPC005', desc: 'Extrato Camomila', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {CH003:.003093} },
  { codigo: 'MPR006', desc: 'Aroma Natural de Guaraná', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {RF003:.003905} },
  { codigo: 'MP030', desc: 'Conc. Maçã 70º Brix', un: 'KG', familia: 'Concentrados', skuQtd: {FX003:.010567} },
  { codigo: 'MPR018', desc: 'Conc. Maçã e Morango', un: 'KG', familia: 'Concentrados', skuQtd: {CH002:.005649} },
  { codigo: 'MPR002', desc: 'Açaí 12% Xingu Fruit', un: 'KG', familia: 'Hortifruti', skuQtd: {RF003:.005000} },
  { codigo: 'MPC030', desc: 'Extrato de Pêssego', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {CH001:.000750} },
  { codigo: 'MP02', desc: 'Mirtilo Org. Congelado', un: 'KG', familia: 'Hortifruti', skuQtd: {FX006:.001865} },
  { codigo: 'MPC020', desc: 'Extrato Aquoso Chá Verde', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {CH001:.000403} },
  { codigo: 'MPC011', desc: 'Aroma Natural Chá Verde', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {CH001:.000437} },
  { codigo: 'MPR023', desc: 'Extrato de Cranberry', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {RF002:.000323} },
  { codigo: 'MPC006', desc: 'Aroma de Maracujá', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {CH003:.000526} },
  { codigo: 'MPR004', desc: 'Extrato de Guaraná', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {RF003:.000323} },
  { codigo: 'MPR009', desc: 'Aroma de Açaí', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {RF003:.003905} },
  { codigo: 'MP020', desc: 'Extrato de Abacaxi', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {FX002:.000750} },
];

// Mapa sigla planilha → SKU (para cruzar calendário com BOM)
const SIGLA_PARA_SKU = {
  CVP:'CH001',CHM:'CH002',CCM:'CH003',CML:'CH004',
  KFV:'FX001',KABX:'FX002','KMÇ':'FX003',KMC:'FX003',KMIR:'FX006',KPL:'FX007',
  RLS:'RF001',RFV:'RF002',RGA:'RF003',RUV:'RF004',RLA:'RF005',
  RTMLS:'RTM001',RTMUV:'RTM002',RTMLA:'RTM003',
  CVPSAMS:null,CMLSAMS:null,CHMSAMS:null,RLSSAMS:null,RTMSAMS:null,'RFV/RGASAMS':null,
};

function parseNum(v) {
  if (!v || v.trim() === "") return 0;
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function fmt(n, d=1) { return n.toLocaleString("pt-BR", {maximumFractionDigits: d}); }

// ============================================================================
// Busca estoque + calcula consumo via calendário
// ============================================================================

export async function buscarEstoqueInsumos(env) {
  const hoje = new Date();
  const estoque = [];

  // 1. Lê o calendário do dashboard (já enriquecido com OPs)
  const dashData = await readJson(env, R2_KEYS.dashboard);
  const calGrid = dashData && dashData.calGrid;

  // 2. Calcula planejado por SKU a partir do calendário
  const planejadoPorSKU = {};
  if (calGrid) {
    const wd = calGrid.weeksData;
    for (const row of wd) {
      for (const cell of row) {
        if (!cell) continue;
        const sigla = cell.sigla || cell[0] || "";
        if (/FERIADO|MANUTEN|INVENTÁRIO/i.test(sigla)) continue;
        const planejada = cell.planejada || cell[1] || 0;
        // sigla da planilha → SKU
        let siglaBase = sigla.replace(/2K$/i,"").replace(/\/3$/,"").replace(/SAMS$/i,"");
        const sku = SIGLA_PARA_SKU[sigla] || SIGLA_PARA_SKU[siglaBase];
        if (sku) planejadoPorSKU[sku] = (planejadoPorSKU[sku] || 0) + planejada;
      }
    }
  }

  console.log(`🔍 planejadoPorSKU: ${Object.keys(planejadoPorSKU).length} SKUs, total ${Object.values(planejadoPorSKU).reduce((a,b)=>a+b,0)} un`);
  for (const [k,v] of Object.entries(planejadoPorSKU).slice(0,5)) console.log(`  ${k}: ${v}`);

  // 3. Busca estoque individual + calcula consumo
  for (const ins of INSUMOS) {
    try {
      const p = await chamarOmie(env, "/geral/produtos/", "ConsultarProduto", { codigo: ins.codigo });
      if (!p || !p.codigo_produto) continue;
      await new Promise(r => setTimeout(r, 100));

      const r = await chamarOmie(env, "/estoque/consulta/", "PosicaoEstoque", {
        codigo_local_estoque: LOCAL_ALMOXARIFADO,
        id_prod: p.codigo_produto,
      });

      const saldo = r.saldo || 0;
      const minimo = r.estoque_minimo || 0;

      // Consumo previsto = Σ(planejado × qtd_por_unidade) para cada SKU
      let consumo = 0;
      for (const [sku, qtd] of Object.entries(ins.skuQtd)) {
        const plan = planejadoPorSKU[sku] || 0;
        consumo += plan * qtd;
      }

      const deficit = Math.max(0, consumo - saldo);
      let status = "ok";
      if (saldo <= 0) status = "indisponivel";
      else if (deficit > 0) status = "insuficiente";
      else if (minimo > 0 && saldo < minimo) status = "baixo";

      // Ruptura (A3): dias de cobertura com base nos dias úteis restantes
      const diasUteis = diasUteisRestantes(hoje);
      let dias = null;
      if (consumo > 0) dias = Math.round((saldo / (consumo / diasUteis)) * 10) / 10;
      const pctMinimo = pctDoMinimo(saldo, minimo);
      const cor = corPorDias(dias, minimo > 0 && saldo < minimo);

      estoque.push({
        codigo: ins.codigo,
        descricao: ins.desc,
        saldo,
        minimo,
        consumo: Math.round(consumo * 1000) / 1000,
        deficit: Math.round(deficit * 1000) / 1000,
        unidade: ins.un,
        familia: ins.familia,
        status,
        dias,
        pctMinimo,
        cor,
      });
    } catch (e) {
      estoque.push({
        codigo: ins.codigo, descricao: ins.desc, saldo: null, minimo: 0,
        consumo: 0, deficit: 0, unidade: ins.un, familia: ins.familia, status: "sem_dado",
        dias: null, pctMinimo: 100, cor: "neutro",
      });
    }
  }

  // Ordena por dias de cobertura ascendente; sem consumo (null) no final;
  // sem mínimo definido por último entre os sem consumo
  estoque.sort((a, b) => {
    const da = a.dias === null || a.dias === undefined ? Infinity : a.dias;
    const db = b.dias === null || b.dias === undefined ? Infinity : b.dias;
    if (da !== db) return da - db;
    if (a.dias === null) {
      const am = a.minimo > 0 ? 0 : 1;
      const bm = b.minimo > 0 ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    return 0;
  });

  const criticos = estoque.filter(e => e.status === 'insuficiente' || e.status === 'indisponivel').length;
  console.log(`✅ Insumos: ${estoque.length} itens, ${criticos} críticos`);
  return estoque;
}
