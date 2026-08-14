// Levantamento p/ melhorias: coleta mensal real (abas Estatísticas) + percentis P5/P95 por SKU
const XLSX = require('xlsx');
const fs = require('fs');

const FILE = '/home/almadalucas/Downloads/Copy of Indicadores Qualidade.xlsx';
const wb = XLSX.readFile(FILE);

// ---------- 1) séries mensais de coleta ----------
function monthly(sheetName, cols) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const out = [];
  let header = null;
  for (const r of rows) {
    if (!r[0]) continue;
    if (/^Mês$/i.test(String(r[0]).trim())) { header = r; continue; }
    if (!header) continue;
    const m = String(r[0]).trim();
    if (!/^[A-Za-zç]+$/.test(m)) continue;
    const o = { mes: m };
    cols.forEach(([idx, key]) => {
      const v = r[idx];
      const s = String(v === null || v === undefined ? '' : v).trim();
      if (/^Estragado|^[A-Za-z]/.test(s) || s === '') o[key] = null;
      else { const x = parseFloat(s.replace(',', '.')); o[key] = isNaN(x) ? null : x; }
    });
    out.push(o);
  }
  return out;
}

// Kombucha: 1=padronização, 2=pH, 3=Brix, 4=ABV
const komb = monthly('Estatísticas Indicadores Kombuc', [[1, 'pad'], [2, 'pH'], [3, 'brix'], [4, 'abv']]);
// Refri/Chá: 1=padronização, 2=pH, 3=Brix
const refri = monthly('Estatística Indicadores Refri e', [[1, 'pad'], [2, 'pH'], [3, 'brix']]);

console.log('== Coleta mensal — Kombucha (2025) ==');
for (const o of komb) console.log(o.mes, o.pad, o.pH, o.brix, o.abv);
console.log('\n== Coleta mensal — Refri/Chá (2025) ==');
for (const o of refri) console.log(o.mes, o.pad, o.pH, o.brix);

// ---------- 2) percentis P5/P95 por SKU/indicador ----------
const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
function matchSku(sheetName, prod, sabor) {
  const p = norm(prod), sa = norm(sabor);
  if (sheetName === 'Indicadores Kombucha') {
    if (/^abacaxi/.test(p)) return 'FX002';
    if (/^maçã|^maca/.test(p)) return 'FX003';
    if (/frutas vermelhas/.test(p)) return 'FX001';
    if (/^mirtilo/.test(p)) return 'FX006';
    if (/pink/.test(p)) return 'FX007';
    return null;
  }
  if (p.startsWith('chá') || p.startsWith('cha')) {
    if (/hibisc/.test(sa)) return 'CH002';
    if (/camomila/.test(sa)) return 'CH003';
    if (/^mate/.test(sa)) return 'CH004';
    if (/pêssego|pessego|verde/.test(sa)) return 'CH001';
    return null;
  }
  if (p.startsWith('refri')) {
    const monica = /tm |turma|mônica|monica/.test(sa);
    if (monica) {
      if (/limão|limao/.test(sa)) return 'RTM001';
      if (/uva/.test(sa)) return 'RTM002';
      if (/laranja/.test(sa)) return 'RTM003';
    }
    if (/limão|limao/.test(sa)) return 'RF001';
    if (/frutas vermelhas/.test(sa)) return 'RF002';
    if (/guaraná|guarana|açaí|acai/.test(sa)) return 'RF003';
    if (/^uva/.test(sa)) return 'RF004';
    if (/laranja/.test(sa)) return 'RF005';
    return null;
  }
  return null;
}
const CONFIG = {
  'Indicadores Kombucha':    { produto: 3, sabor: -1, pH: 5, brix: 6, carb: 7, abv: 9 },
  'Indicadores Refri e Chá': { produto: 3, sabor: 4,  pH: 6, brix: 7, carb: 8, abv: -1 },
};
const num = v => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (!s || /^[*–—\-]+$/.test(s) || /Barril/i.test(s)) return null;
  const x = parseFloat(s);
  return isNaN(x) ? null : x;
};
const stats = {};
const semMapa = new Set();
for (const [sn, cfg] of Object.entries(CONFIG)) {
  const ws = wb.Sheets[sn];
  if (!ws) continue;
  for (const r of XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })) {
    const prod = r[cfg.produto];
    if (!prod || typeof prod !== 'string') continue;
    const sabor = cfg.sabor >= 0 ? (r[cfg.sabor] || '') : '';
    const pn = norm(prod);
    if (/^(produto|sabor|data|indicadores|mês|mes|ano)$/.test(pn)) continue;
    const sku = matchSku(sn, prod, sabor);
    if (!sku) { semMapa.add(`${sn} :: ${prod}${sabor ? ' / ' + sabor : ''}`); continue; }
    (stats[sku] = stats[sku] || {});
    const push = (ind, col) => { const v = col >= 0 ? num(r[col]) : null; if (v !== null) (stats[sku][ind] = stats[sku][ind] || []).push(v); };
    push('pH', cfg.pH); push('brix', cfg.brix); push('carbonatacao', cfg.carb); push('abv', cfg.abv);
  }
}
const pct = (arr, q) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const r2 = x => Math.round(x * 100) / 100;
console.log('\n== Percentis P5/P95 por SKU (para a planilha de validação) ==');
for (const sku of Object.keys(stats).sort()) {
  for (const ind of ['pH', 'brix', 'carbonatacao', 'abv']) {
    const v = stats[sku][ind] || [];
    if (!v.length) continue;
    console.log(`${sku} ${ind}: n=${v.length} P5=${r2(pct(v, .05))} P95=${r2(pct(v, .95))}`);
  }
}

fs.writeFileSync('/tmp/mensal.json', JSON.stringify({ komb, refri }, null, 1));
console.log('\nsem mapa:', [...semMapa].sort());
