// Calcula estatísticas por produto a partir das planilhas de indicadores
// e gera qualidade/spec/produtos.json (alvo = média, limites = min/máx observados)
const XLSX = require('xlsx');
const fs = require('fs');

const FILE = '/home/almadalucas/Downloads/Copy of Indicadores Qualidade.xlsx';
const wb = XLSX.readFile(FILE);

// De-para nome (planilha) -> SKU (dashboard), derivado de NOME_CURTO + PLANILHA_PARA_SKU
// Kombucha: Produto = nome direto. Refri/Chá: Produto = família, Sabor = sabor.
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
  // Refri e Chá
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

// colunas por planilha: [colProduto, colSabor, colPH, colBrix, colCarb, colAbv]
const CONFIG = {
  'Indicadores Kombucha':     { produto: 3, sabor: -1, pH: 5, brix: 6, carb: 7, abv: 9 },
  'Indicadores Refri e Chá':  { produto: 3, sabor: 4,  pH: 6, brix: 7, carb: 8, abv: -1 },
};

const num = v => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (!s || /^[*–—\-]+$/.test(s)) return null;      // "*", "-" etc
  if (/Barril/i.test(s)) return null;               // não carbonatado
  const x = parseFloat(s);
  return isNaN(x) ? null : x;
};

const stats = {}; // sku -> { indicador: [valores] }
const semMapa = new Set();

for (const [sheetName, cfg] of Object.entries(CONFIG)) {
  const ws = wb.Sheets[sheetName];
  if (!ws) { console.log('!! planilha ausente:', sheetName); continue; }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  for (const r of rows) {
    const prod = r[cfg.produto];
    if (!prod || typeof prod !== 'string') continue;
    const sabor = cfg.sabor >= 0 ? (r[cfg.sabor] || '') : '';
    const pn = norm(prod);
    if (/^(produto|sabor|data|indicadores|mês|mes|ano)$/.test(pn)) continue;
    const sku = matchSku(sheetName, prod, sabor);
    if (!sku) { semMapa.add(`${sheetName} :: ${prod}${sabor ? ' / ' + sabor : ''}`); continue; }
    if (!stats[sku]) stats[sku] = {};
    const push = (ind, col) => {
      const v = col >= 0 ? num(r[col]) : null;
      if (v !== null) (stats[sku][ind] = stats[sku][ind] || []).push(v);
    };
    push('pH', cfg.pH); push('brix', cfg.brix); push('carbonatacao', cfg.carb); push('abv', cfg.abv);
  }
}

const NOME = {
  FX001: 'Komb Frutas Vermelhas', FX002: 'Komb Abacaxi Gengibre', FX003: 'Komb Maçã Gengibre',
  FX006: 'Komb Mirtilo Morango', FX007: 'Komb Pink Lemonade',
  CH001: 'Chá Verde Pêssego', CH002: 'Chá Hibisco Morango', CH003: 'Chá Camomila Maracujá', CH004: 'Chá Mate Limão',
  RF001: 'Refri Limão Siciliano', RF002: 'Refri Frutas Vermelhas', RF003: 'Refri Guaraná Açaí',
  RF004: 'Refri Uva', RF005: 'Refri Laranja',
  RTM001: 'Refri Limão Mônica', RTM002: 'Refri Uva Mônica', RTM003: 'Refri Laranja Mônica',
};
const FAMILIA = sku => sku.startsWith('FX') ? 'kombucha' : sku.startsWith('CH') ? 'cha' : 'refri';

const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

const spec = {};
const table = [];
for (const sku of Object.keys(stats).sort()) {
  const s = stats[sku];
  const entry = { nome: NOME[sku] || sku, familia: FAMILIA(sku) };
  table.push(`| ${sku} | ${entry.nome} |`);
  for (const ind of ['pH', 'brix', 'carbonatacao', 'abv']) {
    const v = s[ind] || [];
    if (!v.length) { entry[ind] = { min: null, alvo: null, max: null }; continue; }
    const med = round(v.reduce((a, b) => a + b, 0) / v.length);
    const mn = round(Math.min(...v)), mx = round(Math.max(...v));
    const sd = v.length > 1 ? round(Math.sqrt(v.reduce((a, b) => a + (b - med) ** 2, 0) / (v.length - 1))) : 0;
    entry[ind] = { min: mn, alvo: med, max: mx };
    table[table.length - 1] += ` ${ind}: n=${v.length} med=${med} (${mn}–${mx}) σ=${sd}${sd === 0 ? ' ⚠σ=0' : ''}`;
  }
  spec[sku] = entry;
}

fs.mkdirSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/spec', { recursive: true });
fs.writeFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/spec/produtos.json',
  JSON.stringify(spec, null, 2) + '\n');

// Doc de auditoria — de onde vieram os números
const linhas = [
  '# Especificações por SKU — origem dos parâmetros',
  '',
  'Gerado em **14/08/2026** a partir de `Copy of Indicadores Qualidade.xlsx`',
  '(abas `Indicadores Kombucha` e `Indicadores Refri e Chá`).',
  '',
  '- **alvo = média** dos registros históricos do produto (decisão do dono)',
  '- **min/max = faixa observada** no histórico (mínimo e máximo registrados)',
  '- `produtos.json` guarda só `{min, alvo, max}`; esta tabela é a auditoria (n e σ)',
  '- Produtos sem registro na planilha ficam com `null` → o formulário registra sem validar',
  '',
  '| SKU | Produto | Indicador: n · média (min–max) · σ |',
  '|---|---|---|',
  ...table.map(t => `| ${t.replace(/^\| /, '').replace(/ \|$/, '')} |`),
  '',
  '## ⚠ Avisos',
  '',
  '- **Carbonatação com σ=0** (sempre 1,50 nos registros): CH004, RF004, RF005, RTM001, RTM002, RTM003.',
  '  Parece meta copiada, não medida — validar com a Qualidade antes de confiar na faixa.',
  '- **ABV** só existe para kombuchas (FX*) e com preenchimento parcial; refri/chá ficam `null`.',
  '- **Faixas observadas** podem conter outliers (ex.: Brix até 7 em FX007). A Qualidade pode',
  '  estreitar à vontade — é só editar `produtos.json`.',
];
fs.writeFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/spec/produtos-estatisticas.md',
  linhas.join('\n') + '\n');

console.log('== SKUs com dados (n produtos com valores):');
for (const s of Object.keys(stats).sort()) console.log(' ', s, Object.keys(stats[s]));
console.log('\n== Produtos SEM mapeamento para SKU:');
for (const s of [...semMapa].sort()) console.log('  -', s);
console.log('\n== tabela (escrita no doc de auditoria):');
for (const t of table) console.log(t);
