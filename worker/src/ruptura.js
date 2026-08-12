// ============================================================================
// Ruptura — dias de cobertura + cor (lógica compartilhada estoque/insumos)
// Modelo A3: a cor segue os dias, não o mínimo; abaixo do mínimo vira âmbar,
// nunca vermelho (regra de cadastro ≠ urgência).
// ============================================================================

// Dias úteis restantes no mês (nunca zero — evita divisão por zero)
export function diasUteisRestantes(hoje = new Date()) {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  let n = 0;
  for (let d = hoje.getDate(); d <= ultimo; d++) {
    const dow = new Date(ano, mes, d).getDay();
    if (dow >= 1 && dow <= 5) n++;
  }
  return Math.max(1, n);
}

// Cor derivada dos dias de cobertura:
//   null  → neutro (sem consumo/giro — nunca um número grande)
//   < 7   → vermelho (risco real)
//   < 15  → âmbar
//   abaixo do mínimo cadastrado → âmbar (regra de cadastro, não urgência)
//   senão → verde
export function corPorDias(dias, abaixoDoMinimo) {
  if (dias === null || dias === undefined) return "neutro";
  if (dias < 7) return "vermelho";
  if (dias < 15) return "ambar";
  if (abaixoDoMinimo) return "ambar";
  return "verde";
}

// Percentual do mínimo — limitado a 100 para a barra (o rodapé usa o % real)
export function pctDoMinimo(saldo, minimo) {
  if (!minimo || minimo <= 0) return 100;
  return Math.min(100, Math.round((saldo / minimo) * 100));
}

// Cor do insumo: cobre o que falta produzir?
//   restante <= 0  → neutro (sem uso no restante do mês)
//   saldo < restante → vermelho (não cobre a produção restante)
//   saldo < mínimo  → âmbar (cobre, mas abaixo do mínimo cadastrado)
//   senão           → verde
export function corInsumo(saldo, restante, minimo) {
  if (restante === null || restante === undefined || restante <= 0) return "neutro";
  if (saldo < restante) return "vermelho";
  if (minimo > 0 && saldo < minimo) return "ambar";
  return "verde";
}

// Consolida dias/cobertura no payload de estoque acabado (fonte: bloco cobertura)
export function enriquecerEstoqueRuptura(estoque, cobertura) {
  if (!Array.isArray(estoque)) return estoque;
  const porSku = {};
  if (cobertura && Array.isArray(cobertura.todos)) {
    for (const c of cobertura.todos) porSku[c.codigo] = c;
  }
  for (const item of estoque) {
    const c = porSku[item.codigo];
    const dias = c && c.cobertura !== null && c.cobertura !== undefined ? c.cobertura : null;
    const minimo = item.estoqueMinimo || 0;
    item.dias = dias;
    item.pctMinimo = pctDoMinimo(item.saldo, minimo);
    item.cor = corPorDias(dias, item.saldo < minimo);
  }
  return estoque;
}
