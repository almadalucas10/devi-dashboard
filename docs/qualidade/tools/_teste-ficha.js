// Teste funcional do protótipo ficha-qualidade-com-insumos.html (jsdom)
// Rodar (jsdom instalado em /tmp/qatest):
//   cd /tmp/qatest && npm init -y && npm i jsdom
//   NODE_PATH=/tmp/qatest/node_modules node _teste-ficha.js
// Esperado: 76 passaram, 0 falharam
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/ficha-qualidade-com-insumos.html', 'utf8');
(async () => {


const vc = new VirtualConsole();
const jsErrors = [];
vc.on('jsdomError', e => jsErrors.push(e.message));
vc.on('error', e => jsErrors.push(String(e)));

const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc, url: 'file:///tmp/qatest/' });
const { window } = dom;
const { document } = window;
// jsdom não implementa scrollIntoView — shim de harness (browsers reais têm)
window.HTMLElement.prototype.scrollIntoView = function () {};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' · ' + name); };

// ---- 0. view: lista de OPs abertas ----
ok(jsErrors.length === 0, `sem erros de runtime no parse (${jsErrors.join('; ') || 'nenhum'})`);
ok(document.body.classList.contains('lista'), 'inicia na lista de OPs abertas');
ok($$('#opLista .opc').length === 6, '6 OPs abertas listadas');
ok($$('#opLista .opc')[0].textContent.includes('528') && $$('#opLista .opc')[0].textContent.includes('KPL'), '1º card mostra OP e sigla');
ok($$('#opLista .st.nc').length === 1, 'OP com NC marcada na lista');
window.abrirOp('527');
ok(!document.body.classList.contains('lista'), 'abrir OP → view da ficha');
ok($('#opNum').textContent === '#527', `cabeçalho da ficha: "${$('#opNum').textContent}"`);
ok($('#selSku') === null && $('.demo') === null, 'cabeçalho sem seletor de produto e sem frase de protótipo');
ok($('.prod').textContent === 'KFV · Komb Frutas Vermelhas', 'produto da OP no cabeçalho');

// ---- 0b. siglas corretas (KPL = Pink Lemonade, não Mirtilo) ----
window.abrirOp('528');
ok($('.prod').textContent === 'KPL · Komb Pink Lemonade', `OP 528 KPL → Pink Lemonade (FX007): "${$('.prod').textContent}"`);
ok(!$('#insumos').textContent.includes('Maçã'), 'FX007 (Pink Lemonade) SEM suco de maçã');
ok($('#insumos').textContent.includes('Rótulo Komb Pink Lemonade') && $('#insumos').textContent.includes('Morango'), 'FX007 traz rótulo e morango/framboesa (SAB03)');
ok($$('#insumos .ins').length === 10, 'FX007 tem 10 itens na ficha real');
window.abrirOp('527');

// ---- 1. inicial ----
ok($$('.sec:not([data-consulta])').length === 4, '4 blocos visíveis (kombucha)');
ok($$('#insumos .ins').length === 9, '9 insumos na OP 527 (FX001 — filme/CO2/ribbon fora)');
ok(!$('.sec[data-sec=insumos]').classList.contains('hid'), 'insumos visível no load (não é bloco de família)');
ok($('#insumos').textContent.includes('Rótulo Komb Frutas Vermelhas'), 'FX001 traz o rótulo (RFX001)');
ok(!$('#insumos').textContent.includes('Sorbato'), 'kombucha FX001 não leva sorbato (só refris/chás)');
ok($('#pt').textContent === '0 de 4 blocos preenchidos', `progresso inicial: "${$('#pt').textContent}"`);

// ---- 2. família (agora derivada do SKU; função direta p/ barril) ----
window.aplicarFamilia('barril');
ok($('.sec[data-sec=carbonatacao]').classList.contains('hid'), 'barril esconde Carbonatação');
ok($('.sec[data-sec=recravacao]').classList.contains('hid'), 'barril esconde Recravação');
ok(!$('.sec[data-sec=preenvase]').classList.contains('hid') && !$('.sec[data-sec=estoque]').classList.contains('hid'), 'barril mantém Pré-envase e Estoque');
ok($('#pt').textContent === '0 de 2 blocos preenchidos', `progresso barril: "${$('#pt').textContent}"`);
ok(!$('.sec[data-sec=insumos]').classList.contains('hid'), 'insumos continua visível no barril');

// volta pra kombucha
window.aplicarFamilia('kombucha');
ok($$('.sec:not([data-consulta]):not(.hid)').length === 4, 'volta a 4 blocos em kombucha');

// ---- 3. spec do SKU (FX001) — valida contra a faixa da planilha ----
ok($('#avisoPre').textContent.includes('Spec do FX001'), 'aviso pré-envase mostra a spec do SKU');
const pH = $('input[data-c="pH"]');
pH.value = '3,28';
pH.dispatchEvent(new window.Event('input'));
ok(pH.classList.contains('ok') && !pH.classList.contains('er'), 'pH 3,28 dentro da faixa FX001 (2,8–3,64) → ok');
pH.value = '4,5';
pH.dispatchEvent(new window.Event('input'));
ok(pH.classList.contains('er'), 'pH 4,5 fora da faixa → er');
const msgpH = pH.parentElement.querySelector('.msg');
ok(msgpH.textContent.includes('fora — 2.80 a 3.64'), `msg do pH: "${msgpH.textContent}"`);

// ---- 3b. trocar de OP troca a spec (SKU vem da OP) ----
window.abrirOp('525'); // CHM2K → CH004
pH.value = '3,9';
pH.dispatchEvent(new window.Event('input'));
ok(pH.classList.contains('er'), 'pH 3,9 fora da faixa do CH004 (3,72–3,83) → er');
ok($$('#insumos .ins').length === 14, 'insumos da OP 525 (CH004) — 14 itens da ficha real');
ok($('#insumos').textContent.includes('Concentrado chá-mate') && $('#insumos').textContent.includes('Sorbato de potássio'), 'CH004 traz chá-mate e sorbato');
ok($('#insChk').textContent === '0 de 14 conferidos', `contador acompanha a lista: "${$('#insChk').textContent}"`);
ok($('#insumosAvi').textContent.includes('#525'), 'aviso de insumos cita a OP aberta');
window.abrirOp('527');
ok($$('#insumos .ins').length === 9, 'volta a 9 insumos na OP 527 (FX001)');
pH.value = '3,28';
pH.dispatchEvent(new window.Event('input'));

// ---- 3c. conferência de insumos ----
ok($('#insChk').textContent === '0 de 9 conferidos', 'contador inicial de insumos');
window.toggleInsumo('MP018');
ok($('#chk_MP018').classList.contains('on'), 'check ligado no item tocado');
ok($('#chk_MP018').parentElement.parentElement.classList.contains('conf'), 'linha do item fica marcada');
ok($('#insChk').textContent === '1 de 9 conferidos', `contador após check: "${$('#insChk').textContent}"`);

// ---- 4. preencher tudo e validar badges ----
const setV = (c, v) => { const e = $(`input[data-c="${c}"], select[data-c="${c}"]`); e.value = v; e.dispatchEvent(new window.Event('input')); };
setV('cb_0_h', '09:30'); setV('cb_0_t', '4,2'); setV('cb_0_pc', '3,5'); setV('cb_0_pt', '2,1');
setV('brix', '4,6'); setV('carb', '1,6'); setV('respPre', 'MB');
setV('rec_altura', '2,58'); setV('rec_espessura', '1,06'); setV('rec_transpasse', '0,78'); // NC!
setV('es_0_h', '17:30'); setV('es_0_q', '4080'); setV('es_0_t', 'Lata'); setV('es_0_r', 'MB');
ok($('input[data-c="es_0_t"]') !== null && document.querySelector('select[data-c="es_0_t"]') === null, 'tipo do envio é campo de texto livre');
ok($('#pt').textContent === '4 de 4 blocos preenchidos', `progresso completo: "${$('#pt').textContent}"`);
const estRec = $('.sec[data-sec=recravacao] [data-est]');
ok(estRec.classList.contains('err') && estRec.textContent === 'fora de spec', `recravação fora de spec: "${estRec.textContent}"`);

// ---- 5. salvar() → resumo + payload ----
window.salvar();
ok($('#resumo').style.display === 'block', 'resumo visível após salvar');
ok($('#resumo').textContent.includes('não-conformidade'), 'resumo cita não-conformidade');
const payload = JSON.parse($('#saida').textContent.replace(/^\/\/[^\n]*\n/gm, '').trim());
ok(payload.sku === 'FX001' && payload.sigla === 'KFV', 'payload com SKU e sigla do produto selecionado');
ok(!('formulacao' in payload.blocos), 'payload sem bloco de formulação');
ok(payload.blocos.recravacao.altura === 2.58 && payload.blocos.recravacao.espessura === 1.06 && payload.blocos.recravacao.transpasse === 0.78, 'recravação como objeto único (1 medição por lote)');
ok(payload.naoConformidades.length === 1 && payload.naoConformidades[0].campo === 'transpasse' && !('posicao' in payload.naoConformidades[0]), `payload NC: ${JSON.stringify(payload.naoConformidades)}`);
ok(payload.indiceColeta.recravacao === true && payload.indiceColeta.pH === true, 'índice de coleta preenchido');
ok(window.statusFicha('527') && window.statusFicha('527').nc === true && window.statusFicha('527').completa === true, 'salvar completa com NC registra status na OP');
ok(payload.blocos.carbonatacao.length === 1 && payload.blocos.carbonatacao[0].temperatura === 4.2, 'carbonatação no payload');
ok(Array.isArray(payload.blocos.estoque) && payload.blocos.estoque.length === 1
  && payload.blocos.estoque[0].quantidade === 4080 && payload.blocos.estoque[0].tipo === 'Lata'
  && payload.blocos.estoque[0].hora === '17:30', 'estoque como array de envios');
const mp018 = payload.conferenciaInsumos.find(x => x.codigo === 'MP018');
ok(mp018 && mp018.conferido === true, 'payload registra MP018 como conferido');
ok(payload.conferenciaInsumos.filter(x => x.conferido).length === 1, 'payload registra só 1 insumo conferido');

// ---- 5b. pH fora da spec → NC de pré-envase ----
pH.value = '4,5';
pH.dispatchEvent(new window.Event('input'));
window.salvar();
const payloadNC = JSON.parse($('#saida').textContent.replace(/^\/\/[^\n]*\n/gm, '').trim());
ok(payloadNC.naoConformidades.some(nc => nc.bloco === 'preEnvase' && nc.campo === 'pH' && nc.valor === 4.5),
  `pH fora da spec vira NC de pré-envase: ${JSON.stringify(payloadNC.naoConformidades)}`);
pH.value = '3,28';
pH.dispatchEvent(new window.Event('input'));

// ---- 6. família derivada do SKU no payload ----
ok((JSON.parse($('#saida').textContent.replace(/^\/\/[^\n]*\n/gm, '').trim()).familia) === 'kombucha', 'payload FX001 → família kombucha');
window.abrirOp('525'); // CHM2K → CH004
window.salvar();
const payloadF = JSON.parse($('#saida').textContent.replace(/^\/\/[^\n]*\n/gm, '').trim());
ok(payloadF.sku === 'CH004' && payloadF.familia === 'cha', 'payload CH004 → família chá (derivada do SKU)');
ok(payloadF.conferenciaInsumos.length === 14, 'payload de insumos acompanha a OP (14 itens do chá)');
window.abrirOp('527');

// ---- 7. marcar/desmarcar insumo ----
window.toggleInsumo('MP018');
ok($('#insChk').textContent === '1 de 9 conferidos', 'marcar insumo na ficha');
window.toggleInsumo('MP018');
ok($('#insChk').textContent === '0 de 9 conferidos', 'desmarcar volta o contador a 0');

// ---- 8. múltiplos envios de estoque (padrão carbonatação) ----
window.addEstoque();
setV('es_0_h', '17:30'); setV('es_0_q', '4080'); setV('es_0_t', 'Lata'); setV('es_0_r', 'MB');
setV('es_1_h', '18:10'); setV('es_1_q', '320'); setV('es_1_t', 'Barril'); setV('es_1_r', 'MB');
const estBadge = $('.sec[data-sec=estoque] [data-est]');
ok(estBadge.textContent === 'completo' && estBadge.classList.contains('done'), `badge estoque com 2 envios completos: "${estBadge.textContent}"`);
window.salvar();
const payload2 = JSON.parse($('#saida').textContent.replace(/^\/\/[^\n]*\n/gm, '').trim());
ok(payload2.blocos.estoque.length === 2 && payload2.blocos.estoque[1].quantidade === 320 && payload2.blocos.estoque[1].tipo === 'Barril', 'payload com 2 envios');
// remover a 2ª linha (mesmo efeito do botão ×)
$$('.es')[1].remove();
window.atualizar();
ok($('.sec[data-sec=estoque] [data-est]').textContent === 'completo', 'remover linha mantém o bloco completo (1 envio preenchido)');

// ---- 9. voltar à lista reflete o status salvo ----
window.voltarLista();
ok(document.body.classList.contains('lista'), 'voltar → lista de OPs');
const card527 = $$('#opLista .opc').find(c => c.textContent.includes('#527'));
ok(card527 && card527.querySelector('.st').classList.contains('parcial'), 'OP 527 mostra parcial na lista (ficha reiniciada, só estoque salvo)');
ok(window.statusFicha('527') && window.statusFicha('527').completa === false && window.statusFicha('527').nc === false, 'status salvo condiz com o que foi preenchido');

// ---- 10. ?op= abre direto a ficha da OP ----
const vc2 = new VirtualConsole();
const dom2 = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc2, url: 'file:///tmp/qatest/ficha.html?op=524' });
const w2 = dom2.window;
ok(!w2.document.body.classList.contains('lista'), '?op=524 abre direto a ficha');
ok(w2.document.getElementById('opNum').textContent === '#524', 'ficha da OP 524');
ok(w2.document.querySelector('.prod').textContent.includes('Abacaxi'), 'produto da OP 524 = FX002 (Abacaxi)');
ok(w2.document.getElementById('insumos').textContent.includes('Abacaxi') && w2.document.getElementById('insumos').textContent.includes('Gengibre'), 'insumos da OP 524 trazem a receita do abacaxi (MP09/MP020 + gengibre)');
const vc3 = new VirtualConsole();
const dom3 = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc3, url: 'file:///tmp/qatest/ficha.html?op=999' });
ok(dom3.window.document.body.classList.contains('lista'), '?op=999 (inexistente) → cai na lista');

// ---- 12. integração com o endpoint do worker (fetch stubado) ----
const fichasApi = { fichas: [{ op: '9999', sku: 'FX001', qtd: 4464, produto: 'Komb Frutas Vermelhas' }] };
const fichaApi = { op: '9999', sku: 'FX001', qtd: 4464, origem: 'op_itens', itens: [
  { codigo: 'EMB01', nome: 'Lata sleek 269 ml', un: 'un', quantidade: 4464, saldo: 88000 },
  { codigo: 'RFX001', nome: 'Rótulo Komb Frutas Vermelhas', un: 'un', quantidade: 4464, saldo: null },
  { codigo: 'MPR012', nome: 'Sorbato de Potássio', un: 'kg', quantidade: 0.67, saldo: 6 }
] };
const vc4 = new VirtualConsole();
const dom4 = new JSDOM(html, {
  runScripts: 'dangerously', virtualConsole: vc4,
  url: 'http://localhost/ficha.html',
  beforeParse(w) { w.fetch = async (u) => ({ ok: true, json: async () => String(u).includes('/fichas') ? fichasApi : fichaApi }); }
});
const w4 = dom4.window, d4 = w4.document;
const $4 = s => d4.querySelector(s), $$4 = s => [...d4.querySelectorAll(s)];
const flush = () => new Promise(r => setTimeout(r, 20));
await flush();
ok($$4('#opLista .opc').length === 1 && $$4('#opLista .opc')[0].textContent.includes('9999'), 'lista de OPs vinda do endpoint');
w4.abrirOp('9999');
await flush();
ok($4('#opNum').textContent === '#9999', 'abre a OP do endpoint');
ok($4('#insumos').textContent.includes('Rótulo Komb Frutas Vermelhas') && $4('#insumos').textContent.includes('Sorbato de Potássio'), 'insumos reais do endpoint (rótulo + sorbato)');
ok($4('#insumos').textContent.includes('saldo —'), 'saldo null do endpoint vira "saldo —"');
ok($4('#insChk').textContent === '0 de 3 conferidos', 'contador usa a lista real do endpoint');

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
})();
