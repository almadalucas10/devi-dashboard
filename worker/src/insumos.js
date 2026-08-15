// ============================================================================
// Painel de Insumos — lista CURADA de itens monitorados com indicador de
// cobertura/consumo no dashboard. Critério DIFERENTE da ficha de qualidade:
// a ficha mostra TODOS os itens da OP (o operador pesa/conferência cada um),
// sem filtro por esta lista. A diferença é intencional.
// ============================================================================
import { chamarOmie } from "./omie.js";
import { readJson } from "./r2.js";
import { R2_KEYS } from "./constants.js";
import { corInsumo } from "./ruptura.js";
import { ESTRUTURAS, porUnidadeComEstruturas } from "./estruturas.js";

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
  { codigo: 'MP020', desc: 'Extrato de Abacaxi', un: 'KG', familia: 'Aromas e Extratos', skuQtd: {FX002:.000750} },
  // + 29 itens novos (14/08/2026) — gerados da ficha técnica real (estruturas.js):
  // embalagem (lata, tampa) e os 20 rótulos R* (filme/CO2/ribbon removidos por decisão 14/08).
  { codigo: 'EMB01', desc: 'Lata sleek 269 ml', un: 'un', familia: 'Embalagens', skuQtd: {"CH001":1,"CH002":1,"CH003":1,"CH004":1,"FX001":1,"FX002":1,"FX003":1,"FX006":1,"FX007":1,"RF001":1,"RF002":1,"RF003":1,"RF004":1,"RF005":1,"RTM001":1,"RTM002":1,"RTM003":1} },
  { codigo: 'EMB02', desc: 'Tampa 202 SOT', un: 'un', familia: 'Embalagens', skuQtd: {"CH001":1,"CH002":1,"CH003":1,"CH004":1,"FX001":1,"FX002":1,"FX003":1,"FX006":1,"FX007":1,"RF001":1,"RF002":1,"RF003":1,"RF004":1,"RF005":1,"RTM001":1,"RTM002":1,"RTM003":1} },
  { codigo: 'MP006', desc: 'Limão', un: 'L', familia: 'Hortifruti', skuQtd: {"FX007":0.013847} },
  { codigo: 'MP09', desc: 'Abacaxi (suco)', un: 'L', familia: 'Concentrados', skuQtd: {"FX002":0.019848} },
  { codigo: 'MPA032', desc: 'Ácido Ascórbico', un: 'kg', familia: 'Aditivos', skuQtd: {"CH004":0.000269,"RF001":0.000054,"RF002":0.000135,"RF004":0.000215,"RF005":0.000135,"RTM001":0.000054,"RTM002":0.000215,"RTM003":0.000135} },
  { codigo: 'MPR009', desc: 'Aroma (009)', un: 'kg', familia: 'Aromas e Extratos', skuQtd: {"RF003":0.000027} },
  { codigo: 'MPR012', desc: 'Sorbato de Potássio', un: 'kg', familia: 'Aditivos', skuQtd: {"CH001":0.00015,"CH002":0.000108,"CH003":0.000134,"CH004":0.00015,"RF001":0.000108,"RF002":0.000108,"RF003":0.000135,"RF004":0.00014,"RF005":0.000108,"RTM001":0.000108,"RTM002":0.00014,"RTM003":0.000108} },
  { codigo: 'MPR013', desc: 'Ácido Cítrico', un: 'kg', familia: 'Aditivos', skuQtd: {"CH001":0.000323,"CH002":0.000269,"CH003":0.000027,"CH004":0.000323,"RF001":0.000269,"RF002":0.000538,"RF003":0.000161,"RF004":0.000387,"RF005":0.000229,"RTM001":0.000269,"RTM002":0.00043,"RTM003":0.000229} },
  { codigo: 'MPR022', desc: 'Conservante', un: 'kg', familia: 'Aditivos', skuQtd: {"CH001":0.000108,"CH002":0.000108,"CH003":0.000134,"CH004":0.000108,"RF001":0.000054,"RF002":0.000108,"RF003":0.000135,"RF004":0.000108,"RF005":0.000054,"RTM001":0.000054,"RTM002":0.000054,"RTM003":0.000054} },
  { codigo: 'RCH001', desc: 'Rótulo Chá Verde Pêssego', un: 'un', familia: 'Rótulos', skuQtd: {"CH001":1} },
  { codigo: 'RCH002', desc: 'Rótulo Chá Hibisco Morango', un: 'un', familia: 'Rótulos', skuQtd: {"CH002":1} },
  { codigo: 'RCH003', desc: 'Rótulo Chá Camomila Maracujá', un: 'un', familia: 'Rótulos', skuQtd: {"CH003":1} },
  { codigo: 'RCH004', desc: 'Rótulo Chá Mate Limão', un: 'un', familia: 'Rótulos', skuQtd: {"CH004":1} },
  { codigo: 'RFX001', desc: 'Rótulo Komb Frutas Vermelhas', un: 'un', familia: 'Rótulos', skuQtd: {"FX001":1} },
  { codigo: 'RFX002', desc: 'Rótulo Komb Abacaxi Gengibre', un: 'un', familia: 'Rótulos', skuQtd: {"FX002":1} },
  { codigo: 'RFX003', desc: 'Rótulo Komb Maçã Gengibre', un: 'un', familia: 'Rótulos', skuQtd: {"FX003":1} },
  { codigo: 'RFX006', desc: 'Rótulo Komb Mirtilo Morango', un: 'un', familia: 'Rótulos', skuQtd: {"FX006":1} },
  { codigo: 'RFX007', desc: 'Rótulo Komb Pink Lemonade', un: 'un', familia: 'Rótulos', skuQtd: {"FX007":1} },
  { codigo: 'RRF001', desc: 'Rótulo Refri Limão Siciliano', un: 'un', familia: 'Rótulos', skuQtd: {"RF001":1} },
  { codigo: 'RRF002', desc: 'Rótulo Refri Frutas Vermelhas', un: 'un', familia: 'Rótulos', skuQtd: {"RF002":1} },
  { codigo: 'RRF003', desc: 'Rótulo Refri Guaraná Açaí', un: 'un', familia: 'Rótulos', skuQtd: {"RF003":1} },
  { codigo: 'RRF004', desc: 'Rótulo Refri Uva', un: 'un', familia: 'Rótulos', skuQtd: {"RF004":1} },
  { codigo: 'RRF005', desc: 'Rótulo Refri Laranja', un: 'un', familia: 'Rótulos', skuQtd: {"RF005":1} },
  { codigo: 'RRTM001', desc: 'Rótulo Refri Limão Mônica', un: 'un', familia: 'Rótulos', skuQtd: {"RTM001":1} },
  { codigo: 'RRTM002', desc: 'Rótulo Refri Uva Mônica', un: 'un', familia: 'Rótulos', skuQtd: {"RTM003":1} },
  { codigo: 'RRTM003', desc: 'Rótulo Refri Laranja Mônica', un: 'un', familia: 'Rótulos', skuQtd: {"RTM002":1} },
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

  // 2. Calcula planejado por SKU a partir do calendário.
  //    planejadoPorSKU = mês inteiro (contexto); restantePorSKU = só lotes
  //    ainda não concluídos (é o que vai consumir insumo de agora em diante)
  const planejadoPorSKU = {};
  const restantePorSKU = {};
  if (calGrid) {
    const wd = calGrid.weeksData;
    for (const row of wd) {
      for (const cell of row) {
        if (!cell) continue;
        const sigla = cell.sigla || cell[0] || "";
        if (/FERIADO|MANUTEN|INVENTÁRIO/i.test(sigla)) continue;
        const planejada = cell.planejada || cell[1] || 0;
        if (!planejada) continue;
        const concluido = cell.estado === "op_concluida";
        // sigla da planilha → SKU
        let siglaBase = sigla.replace(/2K$/i,"").replace(/\/3$/,"").replace(/SAMS$/i,"");
        const sku = SIGLA_PARA_SKU[sigla] || SIGLA_PARA_SKU[siglaBase];
        if (!sku) continue;
        planejadoPorSKU[sku] = (planejadoPorSKU[sku] || 0) + planejada;
        if (!concluido) restantePorSKU[sku] = (restantePorSKU[sku] || 0) + planejada;
      }
    }
  }

  console.log(`🔍 planejadoPorSKU: ${Object.keys(planejadoPorSKU).length} SKUs, total ${Object.values(planejadoPorSKU).reduce((a,b)=>a+b,0)} un | restante (não concluído): ${Object.values(restantePorSKU).reduce((a,b)=>a+b,0)} un`);

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

      // Consumo previsto = Σ(planejado × qtd_por_unidade) para cada SKU.
      // Usa explosão multinível (ESTRUTURAS) quando preenchida; senão o mapa plano.
      const usarEstruturas = Object.keys(ESTRUTURAS).length > 0;
      const skus = usarEstruturas
        ? new Set([...Object.keys(planejadoPorSKU), ...Object.keys(restantePorSKU)])
        : Object.keys(ins.skuQtd);
      let consumo = 0;   // mês inteiro (contexto)
      let restante = 0;  // só o que falta produzir
      for (const sku of skus) {
        let qtd;
        if (usarEstruturas) {
          const porUn = porUnidadeComEstruturas(sku, ESTRUTURAS) || {};
          qtd = porUn[ins.codigo] || 0;
        } else {
          qtd = ins.skuQtd[sku] || 0;
        }
        if (!qtd) continue;
        consumo += (planejadoPorSKU[sku] || 0) * qtd;
        restante += (restantePorSKU[sku] || 0) * qtd;
      }

      const deficit = Math.max(0, consumo - saldo);
      const falta = Math.max(0, restante - saldo);
      let status = "ok";
      if (saldo <= 0) status = "indisponivel";
      else if (deficit > 0) status = "insuficiente";
      else if (minimo > 0 && saldo < minimo) status = "baixo";

      // Cobertura do insumo: cobre o que falta produzir? (em vez de "dias")
      const pctRestante = restante > 0 ? Math.min(100, Math.round(saldo / restante * 100)) : 0;
      const cor = corInsumo(saldo, restante, minimo);

      estoque.push({
        codigo: ins.codigo,
        descricao: ins.desc,
        saldo,
        minimo,
        consumo: Math.round(consumo * 1000) / 1000,
        restante: Math.round(restante * 1000) / 1000,
        falta: Math.round(falta * 1000) / 1000,
        deficit: Math.round(deficit * 1000) / 1000,
        unidade: ins.un,
        familia: ins.familia,
        status,
        dias: null,
        pctRestante,
        pctMinimo: minimo > 0 ? Math.min(100, Math.round(saldo / minimo * 100)) : 100,
        cor,
        valor: parseFloat(r.cmc) || 0,
      });
    } catch (e) {
      estoque.push({
        codigo: ins.codigo, descricao: ins.desc, saldo: null, minimo: 0,
        consumo: 0, restante: 0, falta: 0, deficit: 0, unidade: ins.un, familia: ins.familia, status: "sem_dado",
        dias: null, pctRestante: 0, pctMinimo: 100, cor: "neutro", valor: 0,
      });
    }
  }

  // Ordena: vermelho → âmbar → verde (pelo maior déficit), neutro (sem uso
  // no restante do mês) no final
  const pesoCor = { vermelho: 0, ambar: 1, verde: 2, neutro: 3 };
  estoque.sort((a, b) => {
    const pa = pesoCor[a.cor] !== undefined ? pesoCor[a.cor] : 3;
    const pb = pesoCor[b.cor] !== undefined ? pesoCor[b.cor] : 3;
    if (pa !== pb) return pa - pb;
    return (b.falta || 0) - (a.falta || 0);
  });

  const criticos = estoque.filter(e => e.status === 'insuficiente' || e.status === 'indisponivel').length;
  console.log(`✅ Insumos: ${estoque.length} itens, ${criticos} críticos`);
  return estoque;
}
