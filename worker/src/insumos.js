// ============================================================================
// Estoque de Insumos (matérias-primas) — substitui Ranking
// ============================================================================
import { chamarOmie } from "./omie.js";

// Matérias-primas monitoradas (código Omie → nome)
const INSUMOS = {
  // Aditivos
  MP018: "Goma Arábica", MP025: "Isomalto (IMO)", MP027: "Inulina em Pó",
  MPA032: "Ácido Ascórbico", MPR012: "Sorbato de Potássio", MPR013: "Ácido Cítrico",
  MPR016: "Estévia", MPR022: "Benzoato de Sódio",
  // Aromas e Extratos
  MP020: "Extrato Abacaxi", MP022: "Aroma Laranja", MP036: "Aroma Uva",
  MP043: "Aroma Mouthfeel", MP044: "Aroma Steviaroom", MPA001: "Aroma Limão Siciliano",
  MPA007: "Aroma Refrescância", MPA008: "Aroma Acerola", MPA031: "Extrato Camu-Camu",
  MPC005: "Extrato Camomila", MPC006: "Aroma Maracujá", MPC011: "Aroma Chá Verde",
  MPC020: "Extrato Chá Verde", MPC030: "Extrato Pêssego", MPC032: "Extrato Gengibre",
  MPC043: "Extrato Maracujá", MPR004: "Extrato Guaraná", MPR006: "Aroma Guaraná",
  MPR007: "Extrato Limão", MPR008: "Aroma Limão Taiti", MPR009: "Aroma Açaí",
  MPR011: "Extrato Mirtilo", MPR023: "Extrato Cranberry", MPR024: "Aroma Frutas Vermelhas",
  PRD00789: "Água Destilada",
  // Concentrados
  MP030: "Conc. Maçã 70º", MP032: "Conc. Chá-Mate", MP034: "Conc. Laranja",
  MP035: "Conc. Limão", MP045: "Conc. Uva 68º", MPC002: "Conc. Maçã e Maracujá",
  MPC004: "Conc. Maçã e Pêssego", MPR010: "Conc. Maçã 70", MPR018: "Conc. Maçã e Morango",
  MPR020: "Conc. Maçã e Framboesa", MPR021: "Conc. Limão 45º", MPR029: "Conc. Frutas Vermelhas",
  // Rótulos
  PRD00772: "Rótulo TMN Uva 2026", RAS001: "Rótulo Limão Siciliano", RAS002: "Rótulo Camu Camu",
  RCH001: "Rótulo Chá Verde", RCH002: "Rótulo Hibisco", RCH002M: "Rótulo Hibisco Mana",
  RCH003: "Rótulo Camomila", RCH004: "Rótulo Mate Limão",
  RFX001: "Rótulo Komb Frutas Verm.", RFX002: "Rótulo Komb Abacaxi", RFX003: "Rótulo Komb Maçã",
  RFX006: "Rótulo Komb Mirtilo", RFX007: "Rótulo Komb Pink Lemonade",
  RRF001: "Rótulo Refri Limão", RRF001M: "Rótulo Limão Mana", RRF002: "Rótulo Refri Frutas Verm.",
  RRF003: "Rótulo Refri Guaraná", RRF004: "Rótulo Refri Uva", RRF005: "Rótulo Refri Laranja",
  RRTM001: "Rótulo TMN Limão", RRTM002: "Rótulo TMN Laranja", RRTM003: "Rótulo TMN Uva",
  SAB01: "Suco Org. Abacaxi", SAB02: "Suco Org. Limão", SAB03: "Suco Org. Morango",
  SAB04: "Suco Org. Amora", SAB05: "Suco Org. Amora Mirtilo",
};

const CODIGOS = Object.keys(INSUMOS);
// Local de estoque: 91=INSUMOS (3132022755), 96=ROTULOS (3132020859)
// INSUMOS (3132022755) para matérias-primas
const LOCAL_ESTOQUE_INSUMOS = 3132022755;

export async function buscarEstoqueInsumos(env) {
  const hoje = new Date();
  const dataStr = `${("0"+hoje.getDate()).slice(-2)}/${("0"+(hoje.getMonth()+1)).slice(-2)}/${hoje.getFullYear()}`;
  const estoque = [];

  // ConsultarProduto individual → id_prod → PosicaoEstoque
  for (const cod of CODIGOS) {
    try {
      const p = await chamarOmie(env, "/geral/produtos/", "ConsultarProduto", { codigo: cod });
      if (!p || !p.codigo_produto) continue;
      await new Promise(r => setTimeout(r, 150)); // respiro

      const r = await chamarOmie(env, "/estoque/consulta/", "PosicaoEstoque", {
        codigo_local_estoque: LOCAL_ESTOQUE_INSUMOS,
        id_prod: p.codigo_produto,
        data: dataStr,
      });
      const nome = INSUMOS[cod] || cod;
      const saldo = r.saldo || 0;
      const minimo = r.estoque_minimo || 0;
      let status = "ok";
      if (saldo <= 0) status = "indisponivel";
      else if (minimo > 0 && saldo < minimo) status = "baixo";
      else if (minimo > 0 && saldo < minimo * 1.1) status = "alerta";
      estoque.push({ codigo: cod, descricao: nome, saldo, estoqueMinimo: minimo, status });
    } catch (e) {
      if (estoque.length === 0) console.warn(`⚠️ ${cod}: ${e.message}`);
    }
  }

  const ordem = { indisponivel: 0, baixo: 1, alerta: 2, ok: 3 };
  estoque.sort((a, b) => (ordem[a.status] || 4) - (ordem[b.status] || 4));

  console.log(`✅ Insumos: ${estoque.length} itens (${Object.keys(idPorCodigo).length} códigos mapeados), ${estoque.filter(e=>e.status!=='ok').length} com alerta`);
  return estoque;
}
