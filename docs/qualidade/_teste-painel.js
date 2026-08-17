// Teste funcional do painel de qualidade (dados reais do worker) — jsdom
// Rodar:  cd /tmp/qatest && npm init -y && npm i jsdom
//         NODE_PATH=/tmp/qatest/node_modules node _teste-painel.js
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/painel-qualidade.html', 'utf8');

const FICHAS = [
  { op: '2026/00517', sku: 'RF002', produto: 'Refri Frutas Vermelhas', data_producao: '2026-08-13', status: 'parcial', nc_count: 0, indice: JSON.stringify({ pH: true, brix: true, carbonatacao: true, recravacao: true, abv: false }), ncs: [],
    blocos_status: JSON.stringify({ preenvase: { f: 3, t: 4 }, carbonatacao: { f: 2, t: 3 }, recravacao: { f: 1, t: 3 }, estoque: { f: 0, t: 3 } }) },
  { op: '2026/00519', sku: 'RF001', produto: 'Refri Limão Siciliano', data_producao: '2026-08-17', status: 'parcial', nc_count: 0, indice: JSON.stringify({ pH: false, brix: false, carbonatacao: false, recravacao: false, abv: false }), ncs: [],
    blocos_status: JSON.stringify({ preenvase: { f: 0, t: 4 }, carbonatacao: { f: 0, t: 3 }, recravacao: { f: 0, t: 3 }, estoque: { f: 0, t: 3 } }) },
  { op: '2026/00520', sku: 'FX000', produto: 'Base Kombucha', data_producao: '2026-08-10', status: 'parcial', nc_count: 0, indice: JSON.stringify({ pH: true, brix: true, temperatura: true, abv: true, carbonatacao: false, recravacao: false }), ncs: [],
    blocos_status: JSON.stringify({ starter: { f: 1, t: 5 }, fermentacao: { f: 4, t: 5 }, filtracao: { f: 0, t: 2 }, produtoAcabado: { f: 0, t: 5 } }) },
  { op: '2026/00528', sku: 'CH003', produto: 'Chá Camomila Maracujá', data_producao: '2026-08-14', status: 'completa', nc_count: 1, indice: JSON.stringify({ pH: true, brix: true, carbonatacao: true, recravacao: true, abv: false }), ncs: [{ bloco: 'recravacao', campo: 'transpasse', valor: 0.78, min: 0.8, max: 0.9 }],
    blocos_status: JSON.stringify({ preenvase: { f: 4, t: 4 }, carbonatacao: { f: 3, t: 3 }, recravacao: { f: 3, t: 3 }, estoque: { f: 3, t: 3 } }) },
];

function mockFetch(url, opts) {
  const u = String(url);
  if (u.includes('/api/qualidade/mes/2026-08')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ fichas: FICHAS }) });
  }
  if (/mes\/\d{4}-\d{2}/.test(u)) { // meses passados — vazios
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ fichas: [] }) });
  }
  if (u.includes('/api/qualidade/fichas')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ fichas: [
      { op: '2026/00520', sku: 'FX000', produto: 'Base Kombucha', data: '10/08/2026' },
    ] }) });
  }
  if (u.includes('/api/qualidade/ficha/2026%2F00528')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ficha: { op: '2026/00528', blocos: { recravacao: [{ altura: 2.58, espessura: 1.08, transpasse: 0.78 }] } } }) });
  }
  if (u.includes('/api/qualidade/ficha/')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ficha: { op: 'x', blocos: {} } }) });
  }
  return Promise.resolve({ ok: false, json: () => Promise.resolve({ erro: 'não mockado ' + u }) });
}

const vc = new VirtualConsole();
const jsErrors = [];
vc.on('jsdomError', e => jsErrors.push(e.message));
const dom = new JSDOM(html, {
  runScripts: 'dangerously', virtualConsole: vc, url: 'https://x.pages.dev/',
  beforeParse(w) { w.fetch = mockFetch; },
});
const { window } = dom, { document } = window;
window.HTMLElement.prototype.scrollIntoView = function () {};
const $ = s => document.querySelector(s);
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' · ' + n); };

setTimeout(() => {
  ok(jsErrors.length === 0, `sem erros de runtime (${jsErrors.join('; ') || 'nenhum'})`);
  const kpis = $('#kpis').textContent;
  // coleta: agora 6 indicadores (inclui estoque) + exclusão de FX000 nas contagens de lote.
  // Valores reais com o mock: pH 54%, Brix 54%, ABV 80%, Carb 56%, Rec 44%, Est 33% → média 54%
  ok(kpis.includes('54%'), 'KPI Coleta do Mês = 54% (era: ' + $('#kpis').textContent.slice(0, 60) + ')');
  ok(kpis.includes('0/3'), 'KPI Lotes Conformes = 0/3 (FX000 excluído; única completa tem NC)');
  ok(/NÃO-CONFORMIDADES[\s\S]*?\b1\b/.test(kpis), 'KPI Não-Conformidades = 1');

  const col = $('#coleta').textContent;
  ok(col.includes('pH') && col.includes('54%'), 'Coleta por indicador: pH 54% (preenchimento pré-envase)');
  ok(col.includes('Recravação') && col.includes('44%'), 'Coleta por indicador: Recravação 44%');

  const lotes = $('#lotes').textContent;
  ok(lotes.includes('#528') && lotes.includes('Chá Camomila'), 'Lista de lotes com OP 528');
  ok(lotes.includes('transpasse 0.78'), 'Lote NC mostra a ocorrência');

  const occ = $('#ocorrencias').textContent;
  ok(occ.includes('transpasse 0.78 fora de spec (0.8–0.9)'), 'Ocorrência detalhada');
  ok($('#occSub').textContent.includes('1'), 'Ocorrências: 1 no mês');

  const vida = $('#vida').textContent;
  ok(vida.includes('vencida') || vida.includes('vence em'), 'Análises vencidas calculadas (validade = fab + 8m)');

  const ferm = $('#fermentacao').textContent;
  ok(ferm.includes('Base Kombucha'), 'Fermentação: base FX000 listada');

  const rec = $('#recrava').textContent;
  ok(rec.includes('Altura') && rec.includes('2,58'), 'Recravação da última ficha renderizada');
  ok(rec.includes('0,78'), 'Recravação com transpasse 0,78 (fora de spec)');

  console.log(`\n${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
}, 400);
