// Teste funcional do Controle de Envase (PC3) dentro da ficha (jsdom)
// Rodar:  cd /tmp/qatest && npm init -y && npm i jsdom
//         NODE_PATH=/tmp/qatest/node_modules node _teste-controle.js
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/ficha-qualidade-com-insumos.html', 'utf8');

const vc = new VirtualConsole();
const jsErrors = [];
vc.on('jsdomError', e => jsErrors.push(e.message));

let postado = null;
let gets = [];
function mockFetch(url, opts) {
  const u = String(url), m = (opts && opts.method) || 'GET';
  if (u.includes('/api/qualidade/fichas')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ fichas: [{ op: '2026/00528', sku: 'CH003', qtd: 4464, nCodOP: 9226377886 }] }) });
  }
  if (u.includes('/api/qualidade/controle/pc3') && m === 'GET') {
    const hasOp = u.includes('op=');
    gets.push(hasOp ? 'GET?op' : 'GET');
    const regs = hasOp
      ? [{ 'Data': '14/08/2026', 'Horário Inicial': '08:00', 'OP': '528', 'Quantidade': '4464', 'Horário Final': '15:30', 'Responsável': 'MB', 'CIP*': '1' }]
      : [];
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ cabecalho: [], registros: regs, total: regs.length }) });
  }
  if (u.includes('/api/qualidade/controle/pc3') && m === 'POST') {
    postado = JSON.parse(opts.body).registro;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, linha: 3, registrado: [] }) });
  }
  if (u.includes('/api/qualidade/ficha/')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ itens: [] }) });
  }
  return Promise.resolve({ ok: false, json: () => Promise.resolve({ erro: 'não mockado ' + u }) });
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously', virtualConsole: vc, url: 'https://x.pages.dev/',
  beforeParse(window) { window.fetch = mockFetch; },
});
const { window } = dom;
const { document } = window;
window.HTMLElement.prototype.scrollIntoView = function () {};
const $ = s => document.querySelector(s);
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' · ' + n); };

ok(jsErrors.length === 0, `sem erros de runtime no parse (${jsErrors.join('; ') || 'nenhum'})`);
ok(!$('#modalControle'), 'modal removido da página');

// ---- abrir a OP (fluxo real: preencherOPS → abrirOp) ----
window.preencherOPS([{ op: '2026/00528', sku: 'CH003', qtd: 4464, nCodOP: 9226377886 }]);
window.abrirOp('2026/00528');
setTimeout(() => {
  const sec = $('.sec[data-sec="controleEnvase"]');
  ok(sec && !sec.classList.contains('hid'), 'seção Controle de Envase visível na ficha');
  ok($('#pc3Ctx').textContent.includes('#528') && $('#pc3Ctx').textContent.includes('CH003'), 'contexto OP+SKU: ' + $('#pc3Ctx').textContent);
  ok($('#pc3Op').value === '528', 'OP pré-preenchida: ' + $('#pc3Op').value);
  ok($('#pc3Qtd').value === '4464', 'quantidade pré-preenchida: ' + $('#pc3Qtd').value);
  const hoje = new Date();
  const iso = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;
  ok($('#pc3Data').value === iso, 'data = hoje');
  ok(gets.includes('GET?op'), 'registros carregados filtrados pela OP');
  ok($('#ctlRecentes').querySelectorAll('.ctlRec').length === 1, 'registro desta OP renderizado');

  // ---- validação de obrigatórios ----
  window.avisoCtl('');
  window.gerarRegistro();
  ok($('#ctlAviso').textContent.includes('Horário Inicial'), 'valida obrigatórios (faltam horários/responsável)');

  // ---- preencher e gerar ----
  $('#pc3Hi').value = '07:30';
  $('#pc3Qtd').value = '4464';
  $('#pc3Hf').value = '16:10';
  $('#pc3Resp').value = 'MB';
  $('#pc3Cip').value = '1';
  window.gerarRegistro();
  setTimeout(() => {
    ok(postado && postado.op === '528' && postado.sku === 'CH003' && postado.data === iso, 'POST com OP/SKU/data: ' + JSON.stringify(postado));
    ok($('#ctlAviso').className.includes('ok') && $('#ctlAviso').textContent.includes('linha 3'), 'aviso de sucesso');
    ok($('#pc3Hi').value === '', 'form limpo após gravar (horários/responsável)');
    ok($('#pc3Op').value === '528', 'OP permanece após gravar');
    console.log(`\n${pass} passaram, ${fail} falharam`);
    process.exit(fail ? 1 : 0);
  }, 60);
}, 60);
