// Gera os PDFs dos POPs 09–17 a partir de pops.json (pdf-lib)
// 01–08 (rotinas) já são PDFs exportados do Drive — copiados pelo script de build.
// Uso: NODE_PATH=worker/node_modules node tools/_gera_pops_pdf.mjs
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const POPS = JSON.parse(fs.readFileSync('docs/qualidade/pops/pops.json', 'utf8')).pops;
const OUT = 'docs/qualidade/pops/pdfs';
fs.mkdirSync(OUT, { recursive: true });

const PRETO = rgb(0.12, 0.12, 0.12);
const CINZA = rgb(0.45, 0.45, 0.45);
const AZUL = rgb(0.16, 0.25, 0.36);
const AZULC = rgb(0.23, 0.33, 0.47);
const VERMELHO = rgb(0.78, 0.12, 0.12);
const FUNDO = rgb(0.95, 0.96, 0.98);
const BORDA = rgb(0.8, 0.82, 0.86);

const SAN = { '⚠':'AVISO: ', '🌡':'', '⏱':'', '🎯':'', '🎚':'', '🧪':'', '📏':'', '💧':'', '🧫':'', '💨':'', '🔬':'', '⚙':'', '📦':'', '📐':'', '🔥':'', '🎞':'', '×':'x', '²':'^2', '℃':'C', '–':'-', '—':'-' };
const limpar = (t) => String(t ?? '').split('').map(c => SAN[c] !== undefined ? SAN[c] : (c.charCodeAt(0) > 255 ? '' : c)).join('');

function wrap(text, font, size, maxW) {
  text = limpar(text);
  const palavras = String(text ?? '').split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const t = atual ? atual + ' ' + p : p;
    if (font.widthOfTextAtSize(t, size) <= maxW) atual = t;
    else { if (atual) linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [''];
}

async function gerar(pop) {
  const doc = await PDFDocument.create();
  const F1 = await doc.embedFont(StandardFonts.Helvetica);
  const F2 = await doc.embedFont(StandardFonts.HelveticaBold);
  const MARGEM = 50, W = 595 - 2 * MARGEM;
  let page = doc.addPage([595, 842]);
  let y = 800;

  const novaPagina = () => { page = doc.addPage([595, 842]); y = 800; };
  const texto = (t, { size = 10, font = F1, color = PRETO, x = MARGEM, bold = false } = {}) => {
    const f = bold ? F2 : font;
    for (const linha of wrap(t, f, size, W)) {
      if (y < 40) novaPagina();
      page.drawText(linha, { x, y, size, font: f, color });
      y -= size + 3;
    }
  };
  const textoQuebrado = (t, size, font, color, maxW = W) => {
    for (const linha of wrap(t, font, size, maxW)) {
      if (y < 40) novaPagina();
      page.drawText(linha, { x: MARGEM, y, size, font, color });
      y -= size + 2.5;
    }
  };

  // cabeçalho
  page.drawRectangle({ x: 0, y: 810, width: 595, height: 32, color: AZUL });
  page.drawText(`POP ${pop.numero}`, { x: MARGEM, y: 822, size: 12, font: F2, color: rgb(1, 1, 1) });
  page.drawText(limpar(pop.titulo).toUpperCase(), { x: MARGEM + 60, y: 822, size: 12, font: F2, color: rgb(1, 1, 1) });
  const revTxt = `Revisão ${pop.revisao || '—'}${pop.data ? ' · ' + pop.data : ''}`;
  const revW = F1.widthOfTextAtSize(revTxt, 9);
  page.drawText(revTxt, { x: 595 - MARGEM - revW, y: 822, size: 9, font: F1, color: rgb(1, 1, 1) });
  y = 792;

  // parâmetros
  if (pop.parametros && pop.parametros.length) {
    texto('PARÂMETROS DO PROCESSO', { size: 10, font: F2, color: AZULC, bold: true });
    y -= 3;
    for (const p of pop.parametros) {
      texto(`${p.nome}: ${p.valor}${p.un ? ' ' + p.un : ''}`, { size: 9.5 });
    }
    y -= 6;
  }

  // fases / passos (sequencial, ciclo, up)
  const passosDe = (fase) => fase.passos || [];
  const fases = (pop.tipo === 'decisao')
    ? [{ nome: 'DESCONGELAMENTO (antes)', cor: 'azul', passos: pop.fasesComuns?.antes?.passos || [] },
       ...(pop.decisao?.opcoes || []).map(o => ({ nome: o.titulo, cor: o.cor || 'cinza', passos: o.passos || [] })),
       { nome: 'FILTRAGEM', cor: 'roxo', passos: pop.fasesComuns?.filtragem?.passos || [] },
       { nome: 'ARMAZENAMENTO (depois)', cor: 'verde', passos: pop.fasesComuns?.depois?.passos || [] }]
    : (pop.fases || []);

  for (const fase of fases) {
    if (!fase.nome) continue;
    if (y < 90) novaPagina();
    page.drawRectangle({ x: MARGEM - 8, y: y - 13, width: W + 16, height: 18, color: FUNDO });
    texto(fase.nome, { size: 10.5, font: F2, color: AZULC, bold: true });
    y -= 4;
    for (const s of passosDe(fase)) {
      texto(`${s.n} · ${s.txt}`, { size: 9.5 });
      if (s.params && s.params.length)
        texto(`   ${s.params.map(p => `${p.valor}`).join('  |  ')}`, { size: 8.5, color: CINZA });
      if (s.epi && s.epi.length)
        texto(`   EPI: ${s.epi.join(' e ')}`, { size: 8.5, color: VERMELHO });
      if (s.aviso)
        texto(`   ⚠ ${s.aviso}`, { size: 8.5, color: CINZA });
      if (s.tabela && s.tabela.cab) {
        const largs = s.tabela.cab.map(() => W / s.tabela.cab.length);
        const cell = (txt, i, font, color, size) => {
          const maxW = largs[i] - 6;
          let t = limpar(txt);
          while (font.widthOfTextAtSize(t, size) > maxW && t.length > 1) t = t.slice(0, -1);
          if (String(txt ?? '') !== t) t = t.slice(0, -1) + '…';
          page.drawText(t, { x: MARGEM + i * largs[i] + 4, y: y - 9, size, font, color });
        };
        if (y < 80) novaPagina();
        page.drawRectangle({ x: MARGEM, y: y - 14, width: W, height: 16, color: AZULC });
        s.tabela.cab.forEach((c, i) => cell(c, i, F2, rgb(1, 1, 1), 8));
        y -= 18;
        for (const linha of s.tabela.linhas || []) {
          if (y < 30) novaPagina();
          page.drawLine({ start: { x: MARGEM, y }, end: { x: MARGEM + W, y }, thickness: 0.4, color: BORDA });
          linha.forEach((c, i) => cell(c, i, F1, PRETO, 8));
          y -= 14;
        }
        y -= 6;
      }
      y -= 2;
    }
    y -= 4;
  }

  if (pop.tipo === 'ciclo' && pop.ciclo)
    texto(`Ciclo: leituras a cada ${pop.ciclo.intervaloMin} min até ${pop.ciclo.alvo} ${pop.ciclo.unidade}. Campos: ${(pop.ciclo.campos || []).join(', ')}.`, { size: 8.5, color: CINZA });
  if (pop.tipo === 'up' && pop.up)
    texto(`Cálculo de UP: ${pop.up.formula}${pop.up.alvo ? ' · alvo ' + pop.up.alvo : ' · alvo a definir pela Qualidade'}.`, { size: 8.5, color: CINZA });

  if (pop.encadeamento) {
    const enc = [];
    if (pop.encadeamento.antes?.length) enc.push(`Antes: ${pop.encadeamento.antes.join(', ')}`);
    if (pop.encadeamento.depois?.length) enc.push(`Depois: ${pop.encadeamento.depois.join(', ')}`);
    if (enc.length) texto(enc.join('  ·  '), { size: 8.5, color: CINZA });
  }
  if (pop.pendencia)
    texto(`Pendência: ${pop.pendencia}`, { size: 8.5, color: VERMELHO });

  texto('', { size: 8 });
  texto('Documento gerado automaticamente a partir do pops.json — consulte o arquivo original para detalhes com imagens.', { size: 7.5, color: CINZA });

  const bytes = await doc.save();
  const nome = path.join(OUT, `${pop.codigo}.pdf`);
  fs.writeFileSync(nome, bytes);
  console.log(nome, bytes.length, 'bytes');
}

for (const pop of POPS) {
  if (pop.tipo === 'rotina') continue; // 01–08: PDFs exportados do Drive (cópia feita pelo build)
  await gerar(pop);
}
console.log('pronto');
