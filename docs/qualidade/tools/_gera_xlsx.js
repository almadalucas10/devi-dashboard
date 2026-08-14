// Gera spec/Especificacoes_Qualidade_para_validar.xlsx a partir de produtos.json
// + estatísticas reais (n, σ, P5/P95) para a Qualidade decidir as faixas finais.
const XLSX = require('xlsx');
const fs = require('fs');

const FILE = '/home/almadalucas/Downloads/Copy of Indicadores Qualidade.xlsx';
const wb = XLSX.readFile(FILE);
const produtos = JSON.parse(fs.readFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/spec/produtos.json', 'utf8'));

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
    if (!sku) continue;
    (stats[sku] = stats[sku] || {});
    const push = (ind, col) => { const v = col >= 0 ? num(r[col]) : null; if (v !== null) (stats[sku][ind] = stats[sku][ind] || []).push(v); };
    push('pH', cfg.pH); push('brix', cfg.brix); push('carbonatacao', cfg.carb); push('abv', cfg.abv);
  }
}
const pct = (arr, q) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const r2 = x => Math.round(x * 100) / 100;

const IND = { pH: 'pH', brix: 'Brix', carbonatacao: 'Carbonatação', abv: 'ABV' };
const rows = [];
for (const sku of Object.keys(stats).sort()) {
  for (const ind of Object.keys(IND)) {
    const v = stats[sku][ind] || [];
    if (!v.length) continue;
    const n = v.length;
    const med = r2(v.reduce((a, b) => a + b, 0) / n);
    const sd = n > 1 ? r2(Math.sqrt(v.reduce((a, b) => a + (b - med) ** 2, 0) / (n - 1))) : 0;
    rows.push({
      SKU: sku, Produto: produtos[sku].nome, Família: produtos[sku].familia,
      Indicador: IND[ind], Alvo_média: med, Mín_observado: r2(Math.min(...v)), Máx_observado: r2(Math.max(...v)),
      P5: r2(pct(v, .05)), P95: r2(pct(v, .95)), n: n, σ: sd,
      Aviso: sd === 0 ? 'σ=0 — valor parece copiado (conferir se é medido)' : (n < 10 ? 'poucos registros (n<10)' : '')
    });
  }
}
const aoa = [
  ['SKU', 'Produto', 'Família', 'Indicador', 'Alvo (média)', 'Mín observado', 'Máx observado', 'P5', 'P95', 'n', 'σ', 'Aviso'],
  ...rows.map(r => [r.SKU, r.Produto, r.Família, r.Indicador, r.Alvo_média, r.Mín_observado, r.Máx_observado, r.P5, r.P95, r.n, r.σ, r.Aviso])
];
const ws1 = XLSX.utils.aoa_to_sheet(aoa);
ws1['!cols'] = [{wch:7},{wch:24},{wch:9},{wch:14},{wch:12},{wch:13},{wch:13},{wch:6},{wch:6},{wch:4},{wch:5},{wch:44}];

const semDado = Object.keys(produtos).filter(sku => !stats[sku] || !Object.keys(stats[sku]).length);
const avisos = rows.filter(r => r.Aviso);
const resumo = [
  ['Especificações de Qualidade — para validar com a Qualidade', ''],
  ['Gerado em 14/08/2026 a partir de Copy of Indicadores Qualidade.xlsx', ''],
  ['', ''],
  ['Decisão pendente:', 'alvo = média (já aplicado em produtos.json); min/max = faixa observada OU P5–P95'],
  ['', ''],
  ['SKUs com dados', rows.length ? [...new Set(rows.map(r => r.SKU))].length : 0],
  ['Linhas (SKU × indicador)', rows.length],
  ['Avisos (σ=0 ou n<10)', avisos.length],
  ['SKUs sem nenhum dado na planilha', semDado.join(', ') || '(nenhum)'],
  ['', ''],
  ['SKU', 'Indicador', 'Aviso'],
  ...avisos.map(a => [a.SKU, a.Indicador, a.Aviso])
];
const ws2 = XLSX.utils.aoa_to_sheet(resumo);
ws2['!cols'] = [{wch:30},{wch:16},{wch:60}];

const out = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(out, ws1, 'Specs');
XLSX.utils.book_append_sheet(out, ws2, 'Resumo');
const PATH = '/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/spec/Especificacoes_Qualidade_para_validar.xlsx';
XLSX.writeFile(out, PATH);
console.log('gravado:', PATH, '| linhas Specs:', rows.length);

// série mensal de coleta (kombucha: média de pH/Brix/ABV por mês) p/ o painel
function monthly(sheetName, cols) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const out = [];
  let header = null;
  for (const r of XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })) {
    if (!r[0]) continue;
    if (/^Mês$/i.test(String(r[0]).trim())) { header = r; continue; }
    if (!header) continue;
    const m = String(r[0]).trim();
    if (!/^[A-Za-zç]+$/.test(m)) continue;
    const o = { mes: m };
    cols.forEach(([idx, key]) => {
      const s = String(r[idx] === null || r[idx] === undefined ? '' : r[idx]).trim();
      if (/^Estragado|^[A-Za-z]/.test(s) || s === '') o[key] = null;
      else { const x = parseFloat(s.replace(',', '.')); o[key] = isNaN(x) ? null : x; }
    });
    out.push(o);
  }
  return out;
}
const komb = monthly('Estatísticas Indicadores Kombuc', [[1, 'pad'], [2, 'pH'], [3, 'brix'], [4, 'abv']]);
const serie = komb
  .filter(o => o.pH !== null || o.brix !== null || o.abv !== null)
  .map(o => {
    const vals = [o.pH, o.brix, o.abv].filter(x => x !== null);
    return { mes: o.mes, coleta: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) };
  });
console.log('SÉRIE_PAINEL=' + JSON.stringify(serie));
