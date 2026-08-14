// Valida que o PRODUTOS embutido no HTML bate com spec/produtos.json
const fs = require('fs');
const html = fs.readFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/ficha-qualidade-com-insumos.html', 'utf8');
const json = JSON.parse(fs.readFileSync('/home/almadalucas/.reasonix/global-workspace/devi-dashboard/docs/qualidade/spec/produtos.json', 'utf8'));

const m = html.match(/const PRODUTOS = \{([\s\S]*?)\n\};/);
if (!m) { console.error('PRODUTOS block not found'); process.exit(1); }
const PRODUTOS = eval('({' + m[1] + '})');

const jk = Object.keys(json).sort(), pk = Object.keys(PRODUTOS).sort();
let fail = 0;
const ok = (c, n) => { if (!c) { fail++; console.log('FAIL · ' + n); } };
ok(JSON.stringify(jk) === JSON.stringify(pk), `mesmos SKUs (${jk.length})`);
for (const sku of jk) {
  const a = json[sku], b = PRODUTOS[sku];
  ok(a.nome === b.nome, sku + ' nome');
  ok(a.familia === b.familia, sku + ' familia');
  for (const ind of ['pH', 'brix', 'carbonatacao', 'abv']) {
    const sa = a[ind], sb = b[ind];
    if (sa.min === null) { ok(sb === null, sku + '.' + ind + ' null'); continue; }
    ok(sb && sb.min === sa.min && sb.alvo === sa.alvo && sb.max === sa.max,
      `${sku}.${ind} ${JSON.stringify(sb)} === ${JSON.stringify(sa)}`);
  }
}
console.log(fail ? `${fail} divergências` : `PRODUTOS do HTML idêntico a produtos.json (${jk.length} SKUs)`);
process.exit(fail ? 1 : 0);
