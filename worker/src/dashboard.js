// ============================================================================
// Dashboard Cache — calendário via CSV publicado (sem Sheets API)
// ============================================================================

const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0CiPxDF_WzXooUU_b7MgoyjvnIDp3kZ3KKMeEVVXEuE2ZIl5iYIoi1EjxuEIQMQ/pub?gid=1158403049&single=true&output=csv";

// ============================================================================
// Lê o CSV publicado do _DashboardCache e extrai o calGrid + mesLabel
// ============================================================================

export async function buildDashboardCache(env) {
  const hoje = new Date();
  const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  const data = {
    mesLabel: nomes[hoje.getMonth()],
    geradoEm: new Date().toISOString(),
    planejado: null, realizado: null, eficiencia: null,
    extraLabel: null, extraValue: null,
    mes: { planejado: null, realizado: null, eficiencia: null, pendentes: null },
    familias: [], tendencia: null, skuMensal: null,
    calGrid: null,
  };

  try {
    const res = await fetch(SHEETS_CSV_URL, { cf: { cacheTtl: 0 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let raw = (await res.text()).trim();
    if (raw.startsWith('"') && raw.endsWith('"')) {
      raw = raw.slice(1, -1).replace(/""/g, '"');
    }
    const dashData = JSON.parse(raw);

    if (dashData.calGrid) {
      data.calGrid = dashData.calGrid;
      const celdas = data.calGrid.weeksData.flat().filter(Boolean).length;
      console.log(`✅ Calendário CSV: ${celdas} células, ${dashData.mesLabel || "?"}`);
    }
  } catch (e) {
    console.warn(`⚠️ Calendário CSV: ${e.message}`);
  }

  return data;
}
