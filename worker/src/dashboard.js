// ============================================================================
// Dashboard Cache — só o calendário (planilha). KPIs vêm do /api/omie.
// ============================================================================
import { getAccessToken, getValues } from "./sheets.js";
import { SHEET_NAMES } from "./constants.js";

function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ============================================================================
// Calendário via planilha "Produção por Lote"
// ============================================================================

async function buildCalendarFromLotes(env, token, ano, mes) {
  const vals = await getValues(env, token, `'${SHEET_NAMES.lote}'!A5:H5000`);
  if (!vals || vals.length === 0) return null;

  const map = {};
  for (const row of vals) {
    const d = row[0];
    if (!d || typeof d !== "string") continue;
    const parts = d.split("/");
    if (parts.length !== 3) continue;
    const key = `${parseInt(parts[2])}-${parseInt(parts[1])}-${parseInt(parts[0])}`;
    const sigla = String(row[1] || "").trim();
    const sufixo = String(row[2] || "").trim();
    if (!sigla) continue;
    map[key] = {
      sigla,
      sufixo: sufixo.toLowerCase().includes("sem") ? "" : sufixo,
      planejada: toNumber(row[6]) || 0,
      produzida: toNumber(row[7]) || 0,
    };
  }

  const firstDay = new Date(ano, mes - 1, 1);
  const wd = firstDay.getDay() === 0 ? 7 : firstDay.getDay();
  const offset = wd - 1;
  const daysInMonth = new Date(ano, mes, 0).getDate();

  const dayNums = [];
  const weeksData = [];
  let day = 1;

  for (let w = 0; w < 5; w++) {
    const dnRow = [];
    const wdRow = [];
    for (let d = 0; d < 7; d++) {
      if ((w === 0 && d < offset) || day > daysInMonth) {
        dnRow.push(null);
        wdRow.push(null);
      } else {
        const ds = String(day).padStart(2, "0");
        dnRow.push(ds);
        const key = `${ano}-${String(mes).padStart(2, "0")}-${ds}`;
        const info = map[key];
        if (info && info.sigla) {
          const siglaCompleta = info.sigla + (info.sufixo || "");
          wdRow.push([siglaCompleta, info.planejada, info.produzida > 0 ? info.produzida : null]);
        } else {
          wdRow.push(null);
        }
        day++;
      }
    }
    dayNums.push(dnRow);
    weeksData.push(wdRow);
  }

  return { dayNums, weeksData };
}

// ============================================================================
// Dashboard Cache — só calendário
// ============================================================================

export async function buildDashboardCache(env) {
  const token = await getAccessToken(env);
  const hoje = new Date();
  const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  const data = {
    mesLabel: nomes[hoje.getMonth()],
    geradoEm: new Date().toISOString(),
    // KPIs vêm do /api/omie — mantidos por compatibilidade
    planejado: null, realizado: null, eficiencia: null,
    extraLabel: null, extraValue: null,
    mes: { planejado: null, realizado: null, eficiencia: null, pendentes: null },
    familias: [], tendencia: null, skuMensal: null,
  };

  try {
    data.calGrid = await buildCalendarFromLotes(env, token, hoje.getFullYear(), hoje.getMonth() + 1);
    const celdas = data.calGrid ? data.calGrid.weeksData.flat().filter(Boolean).length : 0;
    console.log(`✅ Calendário planilha: ${celdas} células`);
  } catch (e) {
    console.warn(`⚠️ Calendário: ${e.message}`);
    data.calGrid = null;
  }

  return data;
}
