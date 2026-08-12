// ============================================================================
// Fuso horário da fábrica — America/Sao_Paulo (UTC-3)
// Sem isso, o Worker usa UTC e há uma janela de 3h na virada do mês em que
// ele já acha que é o mês seguinte enquanto na fábrica ainda é o atual.
// ============================================================================

export function hojeBrasil(quando = new Date()) {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(quando)
    .split("-")
    .map(Number);
  return { ano, mes, dia };
}

/**
 * "Hoje" como uma Date cujos componentes (getDate/getMonth/getFullYear)
 * correspondem ao dia atual no fuso da fábrica. No runtime do Worker o
 * relógio é UTC, então usamos meia-noite UTC do dia brasileiro — só os
 * componentes de data importam nas janelas de consulta.
 */
export function hojeBrasilDate(quando = new Date()) {
  const h = hojeBrasil(quando);
  return new Date(h.ano, h.mes - 1, h.dia);
}
