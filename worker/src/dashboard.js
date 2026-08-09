// ============================================================================
// Dashboard Cache — port de doGetInner() + buildCalendarFromLotes()
// Lê direto da planilha Google via Sheets API (Service Account)
// ============================================================================
import { getAccessToken, getValues } from "./sheets.js";
import { SHEET_NAMES, SPREADSHEET_ID, PLANILHA_PARA_SKU } from "./constants.js";

// ============================================================================
// Helpers (port do Apps Script)
// ============================================================================

function findRow(values, needle, fromRow = 0) {
  const low = needle.toLowerCase();
  for (let r = fromRow; r < values.length; r++) {
    const row = values[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (String(row[c] || "").toLowerCase().includes(low)) return r;
    }
  }
  return -1;
}

function findColInRow(row, needle) {
  const low = needle.toLowerCase();
  for (let c = 0; c < row.length; c++) {
    if (String(row[c] || "").toLowerCase().includes(low)) return c;
  }
  return -1;
}

function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ============================================================================
// Calendário (port de buildCalendarFromLotes)
// ============================================================================

async function buildCalendarFromLotes(env, token, ano, mes) {
  // Lê Produção por Lote (A5:H5000)
  const vals = await getValues(env, token, `'${SHEET_NAMES.lote}'!A5:H5000`);
  if (!vals || vals.length === 0) return null;

  // Constrói mapa: data → { sigla, sufixo, planejada, produzida }
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

  // Grid 5 semanas × 7 dias (seg-dom)
  const firstDay = new Date(ano, mes - 1, 1);
  const wd = firstDay.getDay() === 0 ? 7 : firstDay.getDay(); // seg=1..dom=7
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
          wdRow.push([siglaCompleta, info.planejada, info.produzida]);
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
// Dashboard Cache (port de doGetInner)
// ============================================================================

const MONTH_MAP = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

export async function buildDashboardCache(env) {
  const token = await getAccessToken(env);

  // Dashboard sheet (A1:T150)
  const values = await getValues(env, token, `'${SHEET_NAMES.dashboard}'!A1:T150`);
  if (!values || values.length === 0) {
    throw new Error("Dashboard sheet vazia");
  }

  const data = {
    planejado: null, realizado: null, eficiencia: null,
    extraLabel: null, extraValue: null,
    mes: { planejado: null, realizado: null, eficiencia: null, pendentes: null },
    mesLabel: "",
    familias: [],
    tendencia: null,
    calGrid: null,
    geradoEm: new Date().toISOString(),
  };

  // KPIs anuais (1ª ocorrência de "planejado")
  const labelRow = findRow(values, "planejado");
  if (labelRow !== -1) {
    const valueRow = labelRow + 1;
    const colPlan = findColInRow(values[labelRow], "planejado");
    const colReal = findColInRow(values[labelRow], "realizado");
    const colEfic = findColInRow(values[labelRow], "eficiência");
    if (colPlan !== -1) data.planejado = toNumber(values[valueRow][colPlan]);
    if (colReal !== -1) data.realizado = toNumber(values[valueRow][colReal]);
    if (colEfic !== -1) {
      let ef = toNumber(values[valueRow][colEfic]);
      if (ef !== null && ef > 1) ef = ef / 100;
      data.eficiencia = ef;
    }
    // Extra KPI (primeira coluna não-KPI com valor)
    for (let c = 0; c < (values[valueRow] || []).length; c++) {
      if (c === colPlan || c === colReal || c === colEfic) continue;
      const v = toNumber(values[valueRow][c]);
      if (v !== null) {
        data.extraLabel = String(values[labelRow][c] || "").trim();
        data.extraValue = v;
        break;
      }
    }
  }

  // KPIs do mês (2ª ocorrência de "planejado")
  const labelRow2 = labelRow !== -1 ? findRow(values, "planejado", labelRow + 1) : -1;
  if (labelRow2 !== -1) {
    const valueRow2 = labelRow2 + 1;
    const colPlan2 = findColInRow(values[labelRow2], "planejado");
    const colReal2 = findColInRow(values[labelRow2], "realizado");
    const colEfic2 = findColInRow(values[labelRow2], "eficiência");
    const colPend2 = findColInRow(values[labelRow2], "pendentes");
    if (colPlan2 !== -1) data.mes.planejado = toNumber(values[valueRow2][colPlan2]);
    if (colReal2 !== -1) data.mes.realizado = toNumber(values[valueRow2][colReal2]);
    if (colEfic2 !== -1) {
      let ef2 = toNumber(values[valueRow2][colEfic2]);
      if (ef2 !== null && ef2 > 1) ef2 = ef2 / 100;
      data.mes.eficiencia = ef2;
    }
    if (colPend2 !== -1) data.mes.pendentes = toNumber(values[valueRow2][colPend2]);
  }

  // Famílias
  const famRow = findRow(values, "família");
  if (famRow !== -1) {
    for (let r = famRow + 1; r < values.length; r++) {
      const row = values[r] || [];
      if (!row[0] || String(row[0]).toLowerCase().includes("total")) break;
      const nome = String(row[0]).trim();
      const nums = [];
      for (let c = 1; c < row.length && nums.length < 2; c++) {
        const n = toNumber(row[c]);
        if (n !== null) nums.push(n);
      }
      if (nome && nums.length >= 1) {
        data.familias.push({
          nome,
          planejado: nums[0] || 0,
          valor: nums[1] !== undefined ? nums[1] : nums[0],
        });
      }
    }
  }

  // Mês/ano de referência
  for (const row of values) {
    const label = String(row[0] || "").toLowerCase();
    if (label.includes("mês selecionado")) {
      const mesNome = String(row[1] || "").toLowerCase().trim();
      data.mesLabel = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);
    }
    if (label.includes("ano de referência")) {
      // já temos o mesLabel
    }
  }
  if (!data.mesLabel) {
    const hoje = new Date();
    const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    data.mesLabel = nomes[hoje.getMonth()];
  }

  // Tendência + SKU mensal (Realizado Mensal por SKU)
  try {
    const trendVals = await getValues(env, token, `'${SHEET_NAMES.trend}'!A1:Q40`);
    if (trendVals && trendVals.length > 0) {
      const totalRow = findRow(trendVals, "total geral");
      if (totalRow !== -1) {
        const meses = [];
        const valores = [];
        for (let c = 2; c < (trendVals[totalRow] || []).length; c++) {
          const v = toNumber(trendVals[totalRow][c]);
          if (v !== null) {
            valores.push(v);
            if (trendVals[0] && trendVals[0][c]) {
              meses.push(String(trendVals[0][c]).trim());
            }
          }
        }
        if (meses.length > 0) data.tendencia = { meses, valores };

        // SKU mensal
        const skuMensal = [];
        for (let r = 0; r < totalRow; r++) {
          const row = trendVals[r] || [];
          const sigla = String(row[2] || "").trim();
          if (!sigla || sigla.toLowerCase().includes("total")) continue;
          let totalAnual = 0;
          for (let c = 3; c < row.length; c++) {
            const vl = toNumber(row[c]);
            if (vl !== null) {
              totalAnual = vl;
              break;
            }
          }
          skuMensal.push({ sigla, total: totalAnual });
        }
        if (skuMensal.length > 0) data.skuMensal = skuMensal;
      }
    }
  } catch (e) {
    console.warn(`⚠️ Trend sheet: ${e.message}`);
  }

  // Calendário
  try {
    // Determina ano/mês do label
    let mesNum = new Date().getMonth() + 1;
    let anoRef = new Date().getFullYear();
    if (data.mesLabel) {
      const mn = MONTH_MAP[data.mesLabel.toLowerCase()];
      if (mn) mesNum = mn;
    }
    data.calGrid = await buildCalendarFromLotes(env, token, anoRef, mesNum);
  } catch (e) {
    console.warn(`⚠️ Calendário: ${e.message}`);
  }

  return data;
}
