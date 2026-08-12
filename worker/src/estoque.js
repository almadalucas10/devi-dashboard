// ============================================================================
// Estoque — port de buscarEstoque()
// ============================================================================
import { chamarOmie } from "./omie.js";
import { SKUS_ATIVOS, CODIGO_LOCAL_ESTOQUE_CD_DEVI } from "./constants.js";
import { hojeBrasilDate } from "./fuso.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dataParaStr(data) {
  const d = ("0" + data.getDate()).slice(-2);
  const m = ("0" + (data.getMonth() + 1)).slice(-2);
  return `${d}/${m}/${data.getFullYear()}`;
}

export async function buscarEstoque(env, cacheProd) {
  const hoje = dataParaStr(hojeBrasilDate());

  // ListarPosEstoque em batch para todos os SKUs
  const resultado = await chamarOmie(env, "/estoque/consulta/", "ListarPosEstoque", {
    nPagina: 1,
    nRegPorPagina: 100,
    dDataPosicao: hoje,
    codigo_local_estoque: CODIGO_LOCAL_ESTOQUE_CD_DEVI,
    lista_produtos: SKUS_ATIVOS.map((sku) => ({ cCodigo: sku })),
  });

  const registros = resultado.produtos || [];

  const estoque = [];
  for (const sku of SKUS_ATIVOS) {
    const reg = registros.find((r) => r.codigo === sku);
    const prod = cacheProd[sku];

    if (reg) {
      const saldo = reg.saldo || 0;
      const minimo = reg.estoque_minimo || 0;
      let status = "ok";
      if (saldo <= 0) status = "indisponivel";
      else if (saldo < minimo) status = "baixo";
      else if (saldo < minimo * 1.1) status = "alerta";

      estoque.push({
        codigo: sku,
        descricao: (prod && prod.descricao) || sku,
        saldo,
        estoqueMinimo: minimo,
        status,
      });
    } else {
      // Fallback: PosicaoEstoque individual
      try {
        const prodId = prod ? prod.codigo_produto : null;
        if (!prodId) {
          estoque.push({
            codigo: sku,
            descricao: (prod && prod.descricao) || sku,
            saldo: 0,
            estoqueMinimo: 0,
            status: "indisponivel",
          });
          continue;
        }

        const individual = await chamarOmie(env, "/estoque/consulta/", "PosicaoEstoque", {
          codigo_local_estoque: CODIGO_LOCAL_ESTOQUE_CD_DEVI,
          id_prod: prodId,
          cod_int: "",
          data: hoje,
        });

        const saldo = individual.saldo || 0;
        const minimo = individual.estoque_minimo || 0;
        let status = "ok";
        if (saldo <= 0) status = "indisponivel";
        else if (saldo < minimo) status = "baixo";
        else if (saldo < minimo * 1.1) status = "alerta";

        estoque.push({
          codigo: sku,
          descricao: (prod && prod.descricao) || sku,
          saldo,
          estoqueMinimo: minimo,
          status,
        });
      } catch (e) {
        estoque.push({
          codigo: sku,
          descricao: (prod && prod.descricao) || sku,
          saldo: 0,
          estoqueMinimo: 0,
          status: "indisponivel",
        });
      }
    }
  }

  return estoque;
}
