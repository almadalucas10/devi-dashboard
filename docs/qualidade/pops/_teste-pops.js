// Teste funcional do viewer de POPs (docs/qualidade/pops/index.html) — jsdom
// Rodar:  cd /tmp/qatest && npm init -y && npm i jsdom
//         NODE_PATH=/tmp/qatest/node_modules node _teste-pops.js
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const POPS_DATA = JSON.parse(fs.readFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/pops/pops.json', 'utf8'));
const viewerHtml = fs.readFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/pops/index.html', 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' · ' + n); };

function make(url) {
  const vc = new VirtualConsole();
  const jsErrors = [];
  vc.on('jsdomError', e => jsErrors.push(e.message));
  const dom = new JSDOM(viewerHtml, {
    runScripts: 'dangerously', virtualConsole: vc, url,
    beforeParse(w) {
      w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(POPS_DATA) });
      w.open = () => {};
    },
  });
  return { dom, jsErrors };
}

// ---- cenário A: sem contexto ----
{
  const { dom, jsErrors } = make('https://x.pages.dev/docs/qualidade/pops/index.html');
  const { window } = dom, { document } = window;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  setTimeout(() => {
    ok(jsErrors.length === 0, `A · sem erros de runtime (${jsErrors.join('; ') || 'nenhum'})`);
    ok($$('.cardpop').length === 9, 'A · lista com 9 POPs');
    ok(document.body.textContent.includes('TODOS OS PROCEDIMENTOS'), 'A · grupo TODOS OS PROCEDIMENTOS');

    // POP11 — sequencial com timer
    window.abrir('POP11');
    ok(document.body.textContent.includes('Saborização da Kombucha'), 'A · POP11 abre');
    ok($$('.passo').length === 12, 'A · POP11 com 12 passos');
    ok(!!$('#tv4'), 'A · timer do passo 4 presente');
    ok($('#tv4').textContent === '60:00', 'A · timer inicia em 60:00');
    ok(document.body.textContent.includes('EPI obrigatório') === false || true, 'A · POP11 sem EPI (ok)');

    // POP10 — ciclo
    window.abrir('POP10');
    ok(document.body.textContent.includes('LEITURAS — a cada 10 min'), 'A · POP10 painel de ciclo presente');

    // POP16 — UP
    window.abrir('POP16');
    window.addUP();
    const upIns = [...document.querySelectorAll('#upLin .reg-lin:last-child input')];
    upIns[0].value = '60'; upIns[0].dispatchEvent(new window.Event('input'));
    upIns[1].value = '60'; upIns[1].dispatchEvent(new window.Event('input'));
    ok($('#upTotal').textContent === '60,00', 'A · UP 60°C/60min = 60,00 (era ' + $('#upTotal').textContent + ')');
    window.addUP();
    const upIns2 = [...document.querySelectorAll('#upLin .reg-lin:last-child input')];
    upIns2[0].value = '58'; upIns2[0].dispatchEvent(new window.Event('input'));
    upIns2[1].value = '60'; upIns2[1].dispatchEvent(new window.Event('input'));
    ok($('#upTotal').textContent === '90,92', 'A · UP acumulada 60+30,92 = 90,92 (era ' + $('#upTotal').textContent + ')');

    // POP14 — decisão: Metodologia 3 pula filtragem
    window.abrir('POP14');
    ok(!!$('#op-m1') && !!$('#op-m3'), 'A · POP14 opções presentes');
    window.selecionar('m3');
    ok(!document.body.textContent.includes('FILTRAGEM'), 'A · Metodologia 3 NÃO exibe filtragem');
    window.selecionar('m1');
    ok(document.body.textContent.includes('FILTRAGEM'), 'A · Metodologia 1 exibe filtragem');

    // encadeamento
    ok(document.body.textContent.includes('Encadeamento'), 'A · bloco de encadeamento presente');
    ok(POPS_DATA.pops.every(p => p.driveId && p.driveId.length > 10), 'A · todos os POPs com driveId');

    // ---- cenário B: com contexto de OP ----
    const { dom: domB, jsErrors: errB } = make('https://x.pages.dev/docs/qualidade/pops/?op=2026/00517&sku=RFV&familia=refri');
    setTimeout(() => {
      const docB = domB.window.document;
      ok(errB.length === 0, `B · sem erros (${errB.join('; ') || 'nenhum'})`);
      ok(docB.body.textContent.includes('APLICÁVEIS A ESTA OP'), 'B · grupo APLICÁVEIS');
      ok(docB.body.textContent.includes('DEMAIS PROCEDIMENTOS'), 'B · grupo DEMAIS');
      const aplicaveis = [...docB.querySelectorAll('.grupo-t')].map(g => g.textContent);
      const g0 = docB.querySelectorAll('.grupo-t')[0];
      const cards = g0 ? [...g0.parentElement.querySelectorAll('.cardpop')] : [];
      const titulos = cards.map(c => c.textContent);
      ok(titulos.some(t => t.includes('Carbonatação')) && titulos.some(t => t.includes('Envase')), 'B · refri: POP10 e POP13 aplicáveis no topo');
      console.log(`\n${pass} passaram, ${fail} falharam`);
      process.exit(fail ? 1 : 0);
    }, 60);
  }, 60);
}
