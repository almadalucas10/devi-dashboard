// Gera RECEITAS (insumos por SKU) explodindo a ficha técnica REAL
// (worker/src/estruturas.js do repo) até as folhas — mesma lógica do worker.
import { ESTRUTURAS, explodir } from '/tmp/qatest/estruturas.mjs';
import fs from 'fs';

// Itens sem indicador (decisão do dono 14/08/2026) — fora do card e da ficha
const EXCLUIR = new Set(['EMB08', 'MP0', 'INS024']);
const excluido = cod => EXCLUIR.has(cod);

const SKUS = ['CH001','CH002','CH003','CH004','FX001','FX002','FX003','FX006','FX007',
              'RF001','RF002','RF003','RF004','RF005','RTM001','RTM002','RTM003'];

const NOMES = {
  EMB01:'Lata sleek 269 ml', EMB02:'Tampa 202 SOT', EMB04:'Lata (pack água)', EMB08:'Filme',
  MP0:'CO₂', INS024:'Ribbon datador',
  RFX001:'Rótulo Komb Frutas Vermelhas', RFX002:'Rótulo Komb Abacaxi Gengibre',
  RFX003:'Rótulo Komb Maçã Gengibre', RFX004:'Rótulo Komb (4)', RFX005:'Rótulo Komb (5)',
  RFX006:'Rótulo Komb Mirtilo Morango', RFX007:'Rótulo Komb Pink Lemonade', RFX008:'Rótulo Komb (8)',
  RCH001:'Rótulo Chá Verde Pêssego', RCH002:'Rótulo Chá Hibisco Morango',
  RCH003:'Rótulo Chá Camomila Maracujá', RCH004:'Rótulo Chá Mate Limão',
  RRF001:'Rótulo Refri Limão Siciliano', RRF002:'Rótulo Refri Frutas Vermelhas',
  RRF003:'Rótulo Refri Guaraná Açaí', RRF004:'Rótulo Refri Uva', RRF005:'Rótulo Refri Laranja',
  RRTM001:'Rótulo Refri Limão Mônica', RRTM002:'Rótulo Refri Uva Mônica', RRTM003:'Rótulo Refri Laranja Mônica',
  RAS001:'Rótulo Água Saborizada (1)', RAS002:'Rótulo Água Saborizada (2)',
  FX000:'Base Kombucha', SAB01:'Suco Abacaxi', SAB02:'Suco Limão', SAB03:'Suco Frutas Vermelhas (rosa)',
  SAB04:'Suco Frutas Vermelhas', SAB05:'Suco Mirtilo Morango',
  MP05:'Chá verde', PRD00338:'Açúcar orgânico', MP018:'Goma arábica',
  MP02:'Mirtilo', MP03:'Framboesa', MP04:'Morango', MP003:'Amora', MP09:'Abacaxi (suco)', MP006:'Limão',
  MPR010:'Suco conc. maçã 70º Brix', MPR013:'Ácido cítrico', MPR012:'Sorbato de potássio',
  MPR021:'Suco limão conc. clarificado', MPR024:'Suco conc. frutas vermelhas', MPR029:'Suco conc. frutas vermelhas',
  MPR018:'Suco conc. maçã e morango', MPR002:'Açaí', MP030:'Suco org. conc. maçã 70º',
  MP032:'Concentrado chá-mate', MP034:'Suco conc. laranja', MP045:'Suco conc. uva clarificado',
  MPC002:'Conc. maçã e maracujá', MPC004:'Conc. maçã e pêssego', MPC005:'Conc. maracujá',
  MPC006:'Conc. camomila', MPC011:'Conc. (11)', MPC020:'Conc. (20)', MPC030:'Conc. (30)',
  MPR015:'Aroma (015)', MPR016:'Aroma (016)', MPR022:'Conservante', MPR011:'Aroma (011)',
  MPR007:'Aroma (007)', MPR023:'Aroma (023)', MPR004:'Aroma (004)', MPR006:'Aroma (006)', MPR009:'Aroma (009)',
  MP036:'Uva (aroma)', MP022:'Laranja (aroma)', MP020:'Abacaxi (aroma)', MP021:'Gengibre',
  MP044:'Aroma (044)', MP051:'Aroma (051)', MP12:'Aroma (12)', MP13:'Aroma (13)', MP14:'Aroma (14)', MP033:'Aroma (033)',
  MPA001:'Limão (aroma)', MPA008:'Aditivo (008)', MPA031:'Aditivo (031)', MPA032:'Ácido ascórbico',
};
const UN = { EMB01:'un', EMB02:'un', EMB04:'un', EMB08:'un', MP0:'kg', INS024:'un',
  MP05:'kg', PRD00338:'kg', MP018:'kg', MP02:'kg', MP03:'kg', MP04:'kg', MP003:'kg', MP09:'L', MP006:'L',
  MPR010:'kg', MPR013:'kg', MPR012:'kg', MPR021:'L', MPR024:'kg', MPR029:'kg', MPR018:'kg',
  MPR002:'kg', MP030:'kg', MP032:'L', MP034:'kg', MP045:'kg', MPR022:'kg', MP021:'kg' };
for (const k of Object.keys(ESTRUTURAS)) {
  if (/^R/.test(k)) { NOMES[k] = NOMES[k] || 'Rótulo'; UN[k] = 'un'; }
}

const hash = s => [...s].reduce((a, c) => a + c.charCodeAt(0), 0);
const r3 = x => Math.round(x * 1000) / 1000;

const out = {};
for (const sku of SKUS) {
  const folhas = Object.fromEntries(Object.entries(explodir(sku, 1, ESTRUTURAS)).filter(([c]) => !excluido(c)));
  const itens = Object.entries(folhas)
    .sort((a, b) => b[1] - a[1])
    .map(([cod, q]) => ({
      cod, nome: NOMES[cod] || cod, un: UN[cod] || '',
      porUnidade: Number(q.toPrecision(6)), saldo: Math.max(2, Math.round(q * 4464 * (2 + (hash(cod) % 8))))
    }));
  out[sku] = itens;
}

let js = 'const RECEITAS = {\n';
for (const sku of SKUS) {
  js += `  ${sku}: [\n`;
  for (const i of out[sku]) {
    js += `    { cod:'${i.cod}', nome:'${i.nome}', un:'${i.un}', porUnidade:${i.porUnidade}, saldo:${i.saldo} },\n`;
  }
  js += '  ],\n';
}
js += '  default: [\n    { cod:\'BASE\', nome:\'Base do produto\', un:\'L\', porUnidade:1, saldo:1200 },\n    { cod:\'EMB01\', nome:\'Lata sleek 269 ml\', un:\'un\', porUnidade:1, saldo:88000 },\n    { cod:\'EMB02\', nome:\'Tampa 202 SOT\', un:\'un\', porUnidade:1, saldo:92000 }\n  ]\n};';

fs.writeFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/_receitas_geradas.txt', js);
console.log('SKUs gerados:', SKUS.length);
for (const sku of ['FX001','FX007','CH004','RF001']) {
  console.log(`\n${sku} (${out[sku].length} itens):`);
  for (const i of out[sku]) console.log('  ', i.cod, i.nome, i.un, i.porUnidade);
}
