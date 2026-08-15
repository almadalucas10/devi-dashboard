// ============================================================================
// Planilhas de Controle — registro direto na aba MODELO REGISTRO (PC3 Envase)
// Padrão: a tabela é um template com linhas pré-formatadas (cabeçalho na
// linha 2, registros da linha 3 em diante). Por isso NÃO usamos append:
// procuramos a primeira linha vazia e escrevemos nela — preserva o intervalo
// A3:H usado pelos KPIs (QUERY) e evita pular ~1.000 linhas do template.
// ============================================================================
import { getAccessToken, getValues, setRange } from "./sheets.js";

export const PC3_TAB = "MODELO REGISTRO";
export const PC3_HEADERS = ["Data", "Horário Inicial", "OP", "Quantidade",
  "Horário Final", "Responsável", "CIP*", "Observações"];

function sheetId(env) { return env.CONTROLE_PC3_ID; }

/** Normaliza um registro do form → linha da planilha (8 colunas, na ordem do cabeçalho). */
export function montarLinhaRegistro(r) {
  const s = (v) => (v === null || v === undefined ? "" : String(v).trim());
  // input type=date entrega ISO (YYYY-MM-DD) — a planilha usa dd/mm/aaaa
  let data = s(r.data);
  const mIso = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (mIso) data = `${mIso[3]}/${mIso[2]}/${mIso[1]}`;
  return [
    data,             // Data
    s(r.horarioInicial),  // Horário Inicial
    s(r.op),              // OP
    s(r.quantidade),      // Quantidade
    s(r.horarioFinal),    // Horário Final
    s(r.responsavel),     // Responsável
    s(r.cip),             // CIP*
    s(r.observacoes),     // Observações
  ];
}

/** Primeira linha vazia (índice 1-based) na coluna A a partir da linha 3. */
export async function primeiraLinhaVazia(env, token, spreadsheetId, tab) {
  const colB = await getValues(env, token, `${tab}!B3:B2000`, spreadsheetId);
  for (let i = 0; i < colB.length; i++) {
    if (!String(colB[i] && colB[i][0] || "").trim()) return i + 3;
  }
  return 3 + colB.length;
}

/** Últimos registros (do fim da tabela para cima) + cabeçalho. Opcional: filtra por OP. */
export async function listarRegistros(env, n = 10, opFiltro = null) {
  const id = sheetId(env);
  if (!id) return { erro: "CONTROLE_PC3_ID não configurado" };
  const token = await getAccessToken(env);
  const valores = await getValues(env, token, `${PC3_TAB}!B2:I2000`, id);
  if (!valores.length) return { cabecalho: PC3_HEADERS, registros: [] };
  const cabecalho = valores[0];
  let linhas = valores.slice(1).filter((l) =>
    l.some((c) => String(c).trim() !== "") &&
    !String(l[0] || "").trim().startsWith("*CIP")); // nota de rodapé do template
  if (opFiltro) {
    const alvo = String(opFiltro).replace(/\D/g, "");
    linhas = linhas.filter((l) => String(l[2] || "").replace(/\D/g, "") === alvo); // coluna OP
  }
  const ultimas = linhas.slice(-n).map((l) => {
    const rec = {};
    cabecalho.forEach((h, i) => { rec[h] = l[i] ?? ""; });
    return rec;
  });
  return { cabecalho, registros: ultimas, total: linhas.length };
}

/** Grava um registro na primeira linha vazia do template (não usa append). */
export async function registrarControle(env, rec) {
  const id = sheetId(env);
  if (!id) return { ok: false, erro: "CONTROLE_PC3_ID não configurado" };
  const linha = ["", ...montarLinhaRegistro(rec)]; // A = espaçador; tabela real é B:I
  const token = await getAccessToken(env);
  const row = await primeiraLinhaVazia(env, token, id, PC3_TAB);
  const range = `${PC3_TAB}!A${row}:I${row}`; // A (espaçador) + B:I (dados)
  const r = await setRange(env, token, id, range, linha);
  return { ok: true, linha: row, registrado: linha };
}
