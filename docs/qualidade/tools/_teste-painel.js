// Teste funcional do protótipo painel-qualidade.html (jsdom)
// Rodar (jsdom instalado em /tmp/qatest):
//   NODE_PATH=/tmp/qatest/node_modules node _teste-painel.js
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/painel-qualidade.html', 'utf8');
const vc = new VirtualConsole();
const jsErrors = [];
vc.on('jsdomError', e => jsErrors.push(e.message));

const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc, url: 'file:///tmp/qatest/' });
const { document } = dom.window;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' · ' + name); };

// ---- cabeçalho ----
ok(jsErrors.length === 0, `sem erros de runtime (${jsErrors.join('; ') || 'nenhum'})`);
ok($('#sub').textContent === 'Agosto de 2026 · 12 lotes produzidos', `sub: "${$('#sub').textContent}"`);
ok($('#rel').textContent === '08:14', 'relógio do payload');

// ---- KPIs ----
const kpis = $$('#kpis .kpi');
ok(kpis.length === 4, '4 KPIs');
ok(kpis[0].querySelector('.v').textContent === '72%', `coleta média: "${kpis[0].querySelector('.v').textContent}"`);
ok(kpis[0].querySelector('.v').style.color === 'rgb(248, 113, 113)', 'coleta 72% → vermelho (limiar <90%)');
ok(kpis[1].querySelector('.v').textContent === '10/12', 'lotes conformes');
ok(kpis[2].querySelector('.v').textContent === '3', 'não-conformidades');
ok(kpis[3].querySelector('.v').textContent === '4', 'análises vencidas');

// ---- índice de coleta (limiar por indicador) ----
const cols = $$('#coleta .col-lin');
ok(cols.length === 5, '5 indicadores de coleta');
ok(cols[0].querySelector('b').textContent === '100%' && cols[0].querySelector('b').style.color === 'rgb(207, 224, 238)', 'pH 100% → neutro');
ok(cols[2].querySelector('b').textContent === '92%' && cols[2].querySelector('b').style.color === 'rgb(251, 191, 36)', 'carbonatação 92% → âmbar');
ok(cols[3].querySelector('b').textContent === '25%' && cols[3].querySelector('b').style.color === 'rgb(248, 113, 113)', 'recravação 25% → vermelho');
ok(cols[4].querySelector('b').textContent === '42%', 'ABV 42% (último indicador)');

// ---- evolução mensal da coleta (série real) ----
ok($$('#evol > div > div').length === 19, '19 meses na evolução (Jan/25–Jul/26)');
ok($('#evol').textContent.includes('Dez/25') && $('#evol').textContent.includes('Jul/26'), 'evolução cobre 2025–2026');

// ---- recravação (1 medição por lote) ----
ok($('#recTitulo').textContent.includes('OP #527'), 'título recravação com OP');
ok($('#recSub').textContent === '1 lata · 12/08', `sub recravação: "${$('#recSub').textContent}"`);
ok($$('#recrava .rec').length === 3, '3 dimensões');
ok($$('#recrava .faixa').every(f => f.querySelectorAll('.pt').length === 1), '1 ponto por dimensão (1 medição por lote)');
const transp = $$('#recrava .rec')[2];
ok(transp.querySelector('.pt').style.background === 'var(--er2)', 'transpasse 0,78 fora → ponto vermelho');
ok($('#recrava').parentElement.querySelector('.leg').textContent.includes('1 medição por lote'), 'legenda de 1 medição por lote');

// ---- listas ----
ok($$('#lotes .it').length === 5, '5 lotes listados');
ok($$('#lotes .it')[0].textContent.includes('não conforme'), 'primeiro lote não conforme');
ok($$('#lotes .it a').length === 5 && $$('#lotes .it a')[0].getAttribute('href') === 'ficha-qualidade-com-insumos.html?op=527', 'lotes com drill-down para a ficha da OP');
ok($('#lotes').parentElement.querySelector('.leg').textContent.includes('toque no lote'), 'legenda de drill-down');
ok($$('#ocorrencias .it').length === 3, '3 ocorrências');
ok($$('#vida .it').length === 4, '4 análises de vida de prateleira');
ok($$('#fermentacao .it').length === 3, '3 tanques em fermentação');

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
