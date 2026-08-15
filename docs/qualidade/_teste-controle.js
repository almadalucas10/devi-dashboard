// Teste funcional do modal de Planilhas de Controle (PC3) do portal (jsdom)
// Rodar:  cd /tmp/qatest && npm init -y && npm i jsdom
//         NODE_PATH=/tmp/qatest/node_modules node _teste-controle.js
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/ficha-qualidade-com-insumos.html', 'utf8');

const vc = new VirtualConsole();
const jsErrors = [];
vc.on('jsdomError', e => jsErrors.push(e.message));

let postado = null;
let fetchCalls = [];
function mockFetch(url, opts) {
  const u = String(url);
  fetchCalls.push((opts && opts.method) || 'GET');
  if (u.includes('/api/qualidade/controle/pc3') && (!opts || !opts.method || opts.method === 'GET')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ cabecalho: [], registros: [
      { 'Data': '14/08/2026', 'Horário Inicial': '08:00', 'OP': '527', 'Quantidade': '4464', 'Horário Final': '15:30', 'Responsável': 'MB', 'CIP*': '1' },
      { 'Data': '13/08/2026', 'Horário Inicial': '09:00', 'OP': '528', 'Quantidade': '4464', 'Horário Final': '16:00', 'Responsável': 'JF', 'CIP*': '2' },
    ]}) });
  }
  if (u.includes('/api/qualidade/controle/pc3') && opts && opts.method === 'POST') {
    postado = JSON.parse(opts.body);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, linha: 205, registrado: [] }) });
  }
  return Promise.resolve({ ok: false, json: () => Promise.resolve({ erro: 'não mockado ' + u }) });
}

// antes de rodar o script da página
const dom = new JSDOM(html, {
  runScripts: 'dangerously', virtualConsole: vc, url: 'https://x.pages.dev/',
  beforeParse(window) {
    window.fetch = mockFetch;
  },
});
const { window } = dom;
const { document } = window;
window.HTMLElement.prototype.scrollIntoView = function () {};
const $ = s => document.querySelector(s);
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' · ' + n); };

ok(jsErrors.length === 0, `sem erros de runtime no parse (${jsErrors.join('; ') || 'nenhum'})`);

// ---- abrir modal + lista recentes ----
window.abrirControles();
setTimeout(() => {
  ok($('#modalControle').style.display === 'flex', 'modal abre');
  ok($('#ctlRecentes').querySelectorAll('.ctlRec').length === 2, '2 registros recentes renderizados');

  // ---- validação de obrigatórios ----
  window.avisoCtl('');
  window.gerarRegistro();
  ok($('#ctlAviso').style.display === 'block' && $('#ctlAviso').textContent.includes('Data'), 'valida campos obrigatórios');

  // ---- preencher tudo + gerar ----
  $('#pc3Data').value = '2026-08-15';
  $('#pc3Hi').value = '07:30';
  $('#pc3Op').value = '528';
  $('#pc3Qtd').value = '4464';
  $('#pc3Hf').value = '16:10';
  $('#pc3Resp').value = 'MB';
  $('#pc3Cip').value = '1';
  $('#pc3Obs').value = 'troca de lote';
  window.gerarRegistro();
  setTimeout(() => {
    ok(postado && postado.registro.data === '2026-08-15' && postado.registro.cip === '1', 'POST com payload correto: ' + JSON.stringify(postado));
    ok($('#ctlAviso').className.includes('ok') && $('#ctlAviso').textContent.includes('linha 205'), 'aviso de sucesso');
    ok($('#pc3Data').value === '', 'form limpo após gravar');
    ok(fetchCalls.filter(m => m === 'POST').length === 1, 'exatamente 1 POST (calls: ' + fetchCalls.join(',') + ')');
    console.log(`\n${pass} passaram, ${fail} falharam`);
    process.exit(fail ? 1 : 0);
  }, 50);
}, 50);
