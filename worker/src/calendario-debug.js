// Diagnóstico: por que o calendário da planilha está quase vazio?
import { getAccessToken, getValues } from "./sheets.js";
import { SHEET_NAMES } from "./constants.js";

export async function debugCalendario(env) {
  const token = await getAccessToken(env);
  const hoje = new Date();
  const mes = hoje.getMonth() + 1;
  const ano = hoje.getFullYear();

  // Lê a planilha "Produção por Lote"
  const vals = await getValues(env, token, `'${SHEET_NAMES.lote}'!A5:H5000`);
  console.log(`=== Produção por Lote: ${vals.length} linhas ===`);

  // Mostra primeiras 10 linhas
  for (let i = 0; i < Math.min(10, vals.length); i++) {
    console.log(`  [${i}]: ${JSON.stringify(vals[i])}`);
  }

  // Conta linhas no mês atual
  let noMes = 0;
  for (const row of vals) {
    const d = row[0];
    if (!d || typeof d !== "string") continue;
    const parts = d.split("/");
    if (parts.length !== 3) continue;
    const dia = parseInt(parts[0]), mesRow = parseInt(parts[1]), anoRow = parseInt(parts[2]);
    if (mesRow === mes && anoRow === ano) {
      noMes++;
      if (noMes <= 3) console.log(`  Mês atual: ${d} | sigla=${row[1]} | planejada=${row[6]} | produzida=${row[7]}`);
    }
  }
  console.log(`Total no mês ${mes}/${ano}: ${noMes} linhas`);

  // Verifica o formato dos dados
  if (vals.length > 0) {
    console.log(`Tipos: col0=${typeof vals[0][0]} col1=${typeof vals[0][1]} col6=${typeof vals[0][6]} col7=${typeof vals[0][7]}`);
  }
}
