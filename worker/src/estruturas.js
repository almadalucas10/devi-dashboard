// ============================================================================
// Estruturas (ficha técnica) — explosão multinível de componentes
//
// Fonte: ficha técnica (CSV/planilha do PCP). O OMIE não expõe estruturas
// (endpoints /produtos/estrutura/ retornam 404 nesta conta) e a planilha é um
// arquivo Office (a API Google Sheets não a lê — só o CSV publicado).
//
// ESTRUTURAS deve ser preenchido no formato:
//   {
//     "FX001": [ { codigo: "FX000", qtdePorUnidade: 0.250740 }, ... ],  // SKU
//     "FX000": [ { codigo: "MP05",  qtdePorUnidade: 0.006 }, ... ],     // intermediário
//   }
// Enquanto estiver vazio, o insumos.js usa o mapa plano skuQtd (fallback).
// ============================================================================

export const ESTRUTURAS = {};

// Explode a estrutura de um produto até as folhas (insumos).
// Ao descer um nível, a quantidade do componente é MULTIPLICADA pela
// quantidade acumulada do pai (não somada nem substituída).
export function explodir(sku, qtde, estruturas = ESTRUTURAS, acc = {}, prof = 0) {
  if (prof > 6) return acc; // guarda contra ciclo
  for (const comp of estruturas[sku] || []) {
    const q = qtde * comp.qtdePorUnidade;
    if (estruturas[comp.codigo]) {
      explodir(comp.codigo, q, estruturas, acc, prof + 1);
    } else {
      acc[comp.codigo] = (acc[comp.codigo] || 0) + q; // folha
    }
  }
  return acc;
}

// Se houver estruturas preenchidas, retorna por-unidade de cada insumo para
// um SKU; senão retorna null (chamador usa o fallback skuQtd).
export function porUnidadeComEstruturas(sku, estruturas = ESTRUTURAS) {
  if (!estruturas || Object.keys(estruturas).length === 0) return null;
  return explodir(sku, 1, estruturas);
}
