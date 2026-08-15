// Teste funcional do Controle de Envase (PC3) — botão no cabeçalho → modal unificado (jsdom)
// Rodar:  cd /tmp/qatest && npm init -y && npm i jsdom
//         NODE_PATH=/tmp/qatest/node_modules node _teste-controle.js
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/ficha-qualidade-com-insumos.html', 'utf8');

const vc = new VirtualConsole();
const jsErrors = [];
vc.on('jsdomError', e => { if (!/navigation/i.test(e.message)) jsErrors.push(e.message); });

let postado = null;
let gets = [];
function mockFetch(url, opts) {
  const u = String(url), m = (opts && opts.method) || 'GET';
  if (u.includes('/api/qualidade/fichas')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ fichas: [
      { op: '2026/00528', sku: 'CH003', qtd: 4464, nCodOP: 9226377886 },
      { op: '2026/00517', sku: 'RF002', qtd: 7435, nCodOP: 9226163665 },
      { op: '2026/00518', sku: 'FX001', qtd: 4464, nCodOP: 9226000001 },
    ] }) });
  }
  if (u.includes('/api/qualidade/controle/pc3') && m === 'GET') {
    gets.push(u.includes('op=') ? 'GET?op' : 'GET');
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ cabecalho: [], registros: [
      { 'Data': '14/08/2026', 'Horário Inicial': '08:00', 'OP': '517', 'Quantidade': '7200', 'Horário Final': '19:00', 'Responsável': 'Everaldo', 'CIP*': '1' },
      { 'Data': '15/08/2026', 'Horário Inicial': '07:30', 'OP': '528', 'Quantidade': '4464', 'Horário Final': '16:10', 'Responsável': 'MB', 'CIP*': '2' },
    ], total: 2 }) });
  }
  if (u.includes('/api/qualidade/controle/pc3') && m === 'POST') {
    postado = JSON.parse(opts.body).registro;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, linha: 3, registrado: [] }) });
  }
  if (u.includes('/api/qualidade/ficha/')) {
    const ncod = u.split('/ficha/').pop();
    if (ncod === '9226163665') { // OP 517 — resposta atrasada (simula rede lenta)
      return new Promise(res => setTimeout(() => res({ ok: true, json: () => Promise.resolve({
        itens: [], ficha: { op: '2026/00517', blocos: { preEnvase: { pH: 3.55, brix: 4.5, carbonatacao: 1.5 } } } }) }), 80));
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({
      itens: [], ficha: { op: '2026/00528', blocos: { preEnvase: { pH: 3.3, brix: 4.5, carbonatacao: 1.5 } } } }) });
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
const $$ = s => [...document.querySelectorAll(s)];
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' · ' + n); };

ok(jsErrors.length === 0, `sem erros de runtime no parse (${jsErrors.join('; ') || 'nenhum'})`);
ok(!$('.sec[data-sec="controleEnvase"]'), 'card da coluna removido');
ok(typeof window.injetarLinksPOP === 'function', 'função injetarLinksPOP existe');
const btnNav = [...document.querySelectorAll('.nav .btnNav')].find(b => b.textContent.includes('Envase'));
ok(!!btnNav, 'botão 📑 Envase no cabeçalho da ficha');

// CIP com descrição (value continua 1/2 para a planilha)
const cipOpts = [...document.querySelectorAll('#pc3Cip option')].map(o => o.textContent);
ok(cipOpts.includes('1 — água + soda + peracético') && cipOpts.includes('2 — peracético'), 'CIP com descrição: ' + cipOpts.join(' | '));
ok($('select#pc3Cip option[value="1"]') && $('select#pc3Cip option[value="2"]'), 'valores CIP permanecem 1/2');

// ---- abrir a OP e depois o modal ----
window.preencherOPS([
  { op: '2026/00528', sku: 'CH003', qtd: 4464, nCodOP: 9226377886 },
  { op: '2026/00517', sku: 'RF002', qtd: 7435, nCodOP: 9226163665 },
]);
window.abrirOp('2026/00528');
setTimeout(() => {
  window.abrirControles();
  setTimeout(() => {
    ok($('#modalControle').style.display === 'flex', 'modal abre pelo cabeçalho');
    ok($('#pc3Op').value === '528', 'OP pré-preenchida: ' + $('#pc3Op').value);
    ok($('#pc3Qtd').value === '4464', 'quantidade pré-preenchida: ' + $('#pc3Qtd').value);
    const hoje = new Date();
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;
    ok($('#pc3Data').value === iso, 'data = hoje');
    ok($('#pc3Ctx').textContent.includes('#528') && $('#pc3Ctx').textContent.includes('CH003'), 'contexto OP+SKU: ' + $('#pc3Ctx').textContent);

    // ---- links "ver POP" nos blocos visíveis da ficha (blocoFicha) ----
    const linkPOPs = $$('.linkPOP').map(a => a.textContent.trim());
    ok(linkPOPs.some(t => t.includes('POP 10')), 'bloco Carbonatação com ver POP 10 (' + linkPOPs.join(', ') + ')');
    ok(linkPOPs.some(t => t.includes('POP 13')), 'bloco Recravação com ver POP 13');
    ok(linkPOPs.some(t => t.includes('POP 15')), 'bloco Estoque com ver POP 15');
    // OP 528 = CH003 (família cha): pré-envase mostra só POP 12 — POP 11 (saborização) é kombucha
    ok(linkPOPs.some(t => t.includes('POP 12')), 'bloco Pré-envase com ver POP 12 (cha): ' + linkPOPs.join(', '));
    ok(!linkPOPs.some(t => t.includes('POP 11')), 'POP 11 NÃO aparece em OP de chá (só kombucha)');
    ok($('#ctlRecentes').querySelectorAll('.ctlRec').length === 2, 'lista unificada (2 registros, todas as OPs)');
    ok(!gets.includes('GET?op'), 'carregamento unificado, sem filtro por OP');

    // ---- validação ----
    window.avisoCtl('');
    window.gerarRegistro();
    ok($('#ctlAviso').textContent.includes('Horário Inicial'), 'valida obrigatórios');

    // ---- preencher (draft) e fechar sem salvar ----
    $('#pc3Hi').value = '07:30';
    $('#pc3Qtd').value = '4464';
    $('#pc3Hf').value = '16:10';
    $('#pc3Resp').value = 'MB';
    $('#pc3Cip').value = '1';
    $('#pc3Obs').value = 'turno da manhã';
    $('#pc3Hi').dispatchEvent(new window.Event('input')); // dispara auto-salvar do draft
    window.fecharControles();
    ok($('#modalControle').style.display === 'none', 'modal fechado sem salvar');
    ok(!!window.localStorage.getItem('pc3Draft-528'), 'draft salvo por OP (pc3Draft-528)');

    // ---- trocar para OUTRA OP sem draft: deve abrir EM BRANCO (bug reportado) ----
    window.abrirOp('2026/00517');
    window.abrirControles();
    ok($('#pc3Resp').value === '' && $('#pc3Hi').value === '' && $('#pc3Obs').value === '', 'OP 517 abre em branco (sem herdar dados da 528)');
    ok($('#pc3Op').value === '517', 'OP 517 preenchida no campo');
    window.fecharControles();

    // ---- voltar p/ 528: rascunho restaurado ----
    window.abrirOp('2026/00528');
    window.abrirControles();
    setTimeout(() => {
      ok($('#pc3Hi').value === '07:30' && $('#pc3Resp').value === 'MB' && $('#pc3Obs').value === 'turno da manhã', 'draft restaurado ao reabrir');
      ok($('#pc3Data').value !== '', 'data mantida do draft');
      window.gerarRegistro();
      setTimeout(() => {
        ok(postado && postado.op === '528' && postado.sku === 'CH003' && postado.cip === '1' && postado.observacoes === 'turno da manhã', 'POST com dados do draft: ' + JSON.stringify(postado));
        ok($('#ctlAviso').className.includes('ok'), 'aviso de sucesso');
        ok($('#pc3Op').value === '528', 'OP permanece após gravar');
        ok(!window.localStorage.getItem('pc3Draft-528'), 'draft limpo após gravar');
        ok($('#pc3Hi').value === '' && $('#pc3Resp').value === '', 'form limpo após gravar');

        // ---- RACE: resposta atrasada da OP 517 NÃO pode vazar para a 528 ----
        window.abrirOp('2026/00517'); // dispara fetch lento (80ms) da 517
        window.abrirOp('2026/00528'); // troca rápido; fetch da 528 aplica pH 3.3
        const pH = $('input[data-c="pH"]');
        setTimeout(() => {
          ok(pH.value === '3.3', 'pH da 528 mantido após resposta atrasada da 517 chegar (era ' + pH.value + ')');

          // ---- viewer de POPs em janela pop (iframe sobre o portal) ----
          window.abrirPOPsViewer();
          const fr = $('#popFrame');
          ok($('#modalPOPViewer').style.display === 'flex', 'modal do viewer abre (portal ao fundo)');
          ok((fr.src || '').includes('/docs/qualidade/pops/?') && (fr.src || '').includes('op='), 'iframe com contexto da OP: ' + fr.src);
          window.fecharPOPViewer();
          ok($('#modalPOPViewer').style.display === 'none' && fr.src === 'about:blank', 'modal fecha e iframe limpo');
          const btn10 = $$('.linkPOP').find(b => b.textContent.includes('POP 10'));
          if (btn10) btn10.click();
          ok($('#modalPOPViewer').style.display === 'flex' && (fr.src || '').includes('pop=POP10'), 'link ver POP 10 abre no modal: ' + fr.src);
          window.fecharPOPViewer();

          // ---- kombucha: pré-envase volta a mostrar POP 11/12 ----
          window.abrirOp('2026/00518'); // FX001
          const linkK = $$('.linkPOP').map(a => a.textContent.trim());
          ok(linkK.some(t => t.includes('POP 11')) && !linkK.some(t => t.includes('POP 12')), 'kombucha: pré-envase com POP 11 apenas (' + linkK.join(', ') + ')');
          console.log(`\n${pass} passaram, ${fail} falharam`);
          process.exit(fail ? 1 : 0);
        }, 160);
      }, 60);
    }, 60);
  }, 60);
}, 60);
