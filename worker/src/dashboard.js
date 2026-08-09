// ============================================================================
// Dashboard Cache — lê CSV publicado do Sheets e guarda no R2
// Equivalente a atualizarCacheAutomatico() do Apps Script
// ============================================================================

const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0CiPxDF_WzXooUU_b7MgoyjvnIDp3kZ3KKMeEVVXEuE2ZIl5iYIoi1EjxuEIQMQ/pub?gid=1158403049&single=true&output=csv";

/**
 * Busca o CSV publicado do _DashboardCache, faz parse do JSON embrulhado
 * em CSV (célula A1), e retorna o objeto parseado.
 * Igual ao loadFromCsv do frontend.
 */
export async function fetchDashboardCache() {
  const res = await fetch(SHEETS_CSV_URL, { cf: { cacheTtl: 0 } });
  if (!res.ok) throw new Error(`Dashboard CSV: HTTP ${res.status}`);
  const text = await res.text();
  if (!text || !text.trim()) throw new Error("Dashboard CSV veio vazio");

  let raw = text.trim();
  // Sheets publica célula A1 entre aspas, com aspas internas duplicadas (padrão CSV)
  if (raw.startsWith('"') && raw.endsWith('"')) {
    raw = raw.slice(1, -1).replace(/""/g, '"');
  }
  return JSON.parse(raw);
}
