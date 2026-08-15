// Gera os insumos FALTANTES do card do dashboard (worker/src/insumos.js) a partir
// da ficha técnica real (estruturas.js) — união das folhas dos 17 SKUs.
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
  RFX003:'Rótulo Komb Maçã Gengibre', RFX006:'Rótulo Komb Mirtilo Morango',
  RFX007:'Rótulo Komb Pink Lemonade', RCH001:'Rótulo Chá Verde Pêssego',
  RCH002:'Rótulo Chá Hibisco Morango', RCH003:'Rótulo Chá Camomila Maracujá',
  RCH004:'Rótulo Chá Mate Limão', RRF001:'Rótulo Refri Limão Siciliano',
  RRF002:'Rótulo Refri Frutas Vermelhas', RRF003:'Rótulo Refri Guaraná Açaí',
  RRF004:'Rótulo Refri Uva', RRF005:'Rótulo Refri Laranja',
  RRTM001:'Rótulo Refri Limão Mônica', RRTM002:'Rótulo Refri Uva Mônica',
  RRTM003:'Rótulo Refri Laranja Mônica', RAS001:'Rótulo Água Saborizada (1)',
  RAS002:'Rótulo Água Saborizada (2)', FX000:'Base Kombucha', SAB01:'Suco Abacaxi',
  SAB02:'Suco Limão', SAB03:'Suco Frutas Vermelhas (rosa)', SAB04:'Suco Frutas Vermelhas',
  SAB05:'Suco Mirtilo Morango', MP05:'Chá Verde Orgânico', PRD00338:'Açúcar Cristal Org.',
  MP018:'Goma Arábica', MP02:'Mirtilo', MP03:'Framboesa Org. Congelada',
  MP04:'Morango Org. Congelado', MP003:'Amora Org. Congelada', MP09:'Abacaxi (suco)',
  MP006:'Limão', MPR010:'Conc. Maçã 70 Brix', MPR013:'Ácido Cítrico',
  MPR012:'Sorbato de Potássio', MPR021:'Conc. Limão 45°Bx', MPR024:'Aroma Frutas Vermelhas',
  MPR029:'Conc. Frutas Vermelhas', MPR018:'Conc. Maçã e Morango', MPR002:'Açaí',
  MP030:'Conc. Maçã 70º Brix', MP032:'Conc. Chá-Mate Tosta Alta', MP034:'Conc. Laranja',
  MP045:'Conc. Uva 68°Brix', MPR015:'Hibisco Desidratado', MPR016:'Estévia',
  MPR022:'Conservante', MPR011:'Extrato de Mirtilo', MPR007:'Extrato Limão Siciliano',
  MPR023:'Aroma (023)', MPR004:'Aroma (004)', MPR006:'Aroma Natural de Guaraná',
  MPR009:'Aroma (009)', MPC002:'Conc. Maçã e Maracujá', MPC004:'Conc. Maçã e Pêssego',
  MPC005:'Extrato Camomila', MPC006:'Conc. Camomila', MPC011:'Conc. (11)',
  MPC020:'Conc. (20)', MPC030:'Conc. (30)', MP036:'Aroma Natural de Uva',
  MP022:'Aroma Natural de Laranja', MP020:'Abacaxi (aroma)', MP021:'Gengibre Orgânico',
  MP044:'Aroma Steviaroom 2000', MP051:'Aroma (051)', MPA001:'Aroma Limão Siciliano',
  MPA008:'Aditivo (008)', MPA031:'Aditivo (031)', MPA032:'Ácido Ascórbico',
};
const UN = { EMB01:'un', EMB02:'un', EMB04:'un', EMB08:'un', MP0:'kg', INS024:'un',
  MP05:'kg', PRD00338:'kg', MP018:'kg', MP02:'kg', MP03:'kg', MP04:'kg', MP003:'kg',
  MP09:'L', MP006:'L', MPR010:'kg', MPR013:'kg', MPR012:'kg', MPR021:'L', MPR024:'kg',
  MPR029:'kg', MPR018:'kg', MPR002:'kg', MP030:'kg', MP032:'L', MP034:'kg', MP045:'kg',
  MPR022:'kg', MP021:'kg', MP036:'kg', MP022:'kg', MP044:'kg', MPA001:'kg', MPR007:'kg',
  MPR015:'kg', MPR016:'kg', MPR011:'kg', MPR023:'kg', MPR004:'kg', MPR006:'kg',
  MPR009:'kg', MPC002:'kg', MPC004:'kg', MPC005:'kg', MPC006:'kg', MPC011:'kg',
  MPC020:'kg', MPC030:'kg', MP020:'kg', MP051:'kg', MPA008:'kg', MPA031:'kg',
  MPA032:'kg', MP030:'kg' };
function familia(cod){
  if (/^R[A-Z]{2,3}[0-9]{3}$/.test(cod)) return 'Rótulos';
  if (/^EMB/.test(cod)) return 'Embalagens';
  if (cod === 'MP0' || cod === 'INS024') return 'Produção';
  if (/^MPC|^MP[0-9]{2}$/.test(cod)) return 'Concentrados';
  if (['MP05','PRD00338','FX000'].includes(cod)) return 'Base Kombucha';
  if (['MP02','MP03','MP04','MP003','MP09','MP006','MP021','MPR015','MPR002'].includes(cod)) return 'Hortifruti';
  if (['MPR013','MPR012','MPR016','MPR022','MPA032'].includes(cod)) return 'Aditivos';
  return 'Aromas e Extratos';
}

// união das folhas (com skuQtd por SKU)
const union = {};
for (const sku of SKUS) {
  for (const [cod, q] of Object.entries(explodir(sku, 1, ESTRUTURAS))) {
    if (excluido(cod)) continue;
    (union[cod] = union[cod] || { skuQtd: {} }).skuQtd[sku] = Math.round(q * 1e6) / 1e6;
  }
}
const r3 = x => Math.round(x * 1000) / 1000;

// códigos já monitorados
const src = fs.readFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/worker/src/insumos.js', 'utf8');
const exist = new Set([...src.matchAll(/codigo:\s*'([^']+)'/g)].map(m => m[1]));
const missing = Object.keys(union).filter(c => !exist.has(c)).sort();

const frag = missing.map(cod => {
  const skuQtd = union[cod].skuQtd;
  const q = Object.values(skuQtd)[0];
  return `  { codigo: '${cod}', desc: '${NOMES[cod] || cod}', un: '${UN[cod] || ''}', familia: '${familia(cod)}', skuQtd: ${JSON.stringify(skuQtd)} },`;
}).join('\n');

console.log('Faltantes (a adicionar):', missing.length);
console.log(frag);
fs.writeFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/_insumos_faltantes.txt', frag);
console.log('\nTotal INSUMOS após adição:', exist.size + missing.length);
