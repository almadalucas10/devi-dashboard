// ============================================================================
// Fichas de qualidade → planilha "Indicadores Qualidade" (Google Sheets)
// Roteamento por família (alinhado ao BLOCO_FAMILIA do formulário):
//   base (FX000 / PC04 Qualidade Kombucha V2) → aba "Indicadores fermentação"
//   kombucha / refri / cha / barril            → aba "Indicadores Refi e Chá"
// Escrita acontece no fechamento da ficha (após o anexo na OP do Omie).
// Mapeamento verificado contra os cabeçalhos reais das abas (15/08/2026):
//   fermentação = 19 colunas (cabeçalho linha 5, dados linha 6)
//   refri e chá = 14 colunas (cabeçalho linha 2, dados linha 3)
// ============================================================================
import { getAccessToken, appendValues } from "./sheets.js";

export const TAB_FERMENTACAO = "Indicadores fermentação";
export const TAB_REFRI_CHA = "Indicadores Refri e Chá";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const num = (v) => (v === null || v === undefined || v === "") ? "" : v;
const primeiro = (a) => (Array.isArray(a) && a.length) ? a[0] : null;
const ultimo = (a) => (Array.isArray(a) && a.length) ? a[a.length - 1] : null;

// Aceita ISO (YYYY-MM-DD) ou BR (DD/MM/AAAA) → sempre ISO. Usado no override da
// data autoritativa (o Omie devolve DD/MM/AAAA) e no payload do formulário (ISO).
function normISO(v) {
  if (!v) return "";
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : s;
}

// data ISO ou BR → "M/D/YYYY" (formato histórico das células da planilha)
function dataUS(v) {
  const iso = normISO(v);
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return String(v);
  return `${m}/${d}/${y}`;
}
function mesNome(v) {
  const m = Number(normISO(v).split("-")[1]);
  return MESES[m - 1] || "";
}
function ano2(v) {
  const y = Number(normISO(v).split("-")[0]);
  return y ? String(y % 100) : "";
}
function diasEntre(a, b) {
  if (!a || !b) return "";
  const A = new Date(normISO(a) + "T12:00:00Z");
  const B = new Date(normISO(b) + "T12:00:00Z");
  if (isNaN(A) || isNaN(B)) return "";
  return Math.round((B - A) / 864e5);
}

/** Linha da aba "Indicadores fermentação" (família base). 19 colunas. */
export function montarLinhaFermentacao(f) {
  const b = f.blocos || {};
  const fer = b.fermentacao || [];
  const ini = primeiro(fer), fim = ultimo(fer);
  const dIni = (ini && ini.data) || f.dataProducao;
  const dFim = (fim && fim.data) || dIni;
  const st = b.starter || {};
  const pa = b.produtoAcabado || {};
  const fil = b.filtracao || {};
  const volTanque = st.volumeTanque == null || st.volumeTanque === "" ? null : Number(st.volumeTanque);
  const volStarter = st.volume == null || st.volume === "" ? null : Number(st.volume);
  const volTotal = volTanque != null && volStarter != null ? volTanque + volStarter : "";
  return [
    dataUS(dIni),                         // 1  Data de Início
    dataUS(dFim),                         // 2  Data Final
    diasEntre(dIni, dFim),                // 3  Tempo de Fermentação
    mesNome(dIni),                        // 4  Mês
    num(st.tanque),                       // 5  Tanque
    num(volTanque),                       // 6  Volume (tanque)
    num(st.pH),                           // 7  pH Starter
    num(st.brix),                         // 8  Brix Starter
    num(volStarter),                      // 9  Volume Starter
    num(volTotal),                        // 10 Volume Total (tanque + starter)
    num(ini && ini.pH),                   // 11 pH Inicial Kombucha
    num(ini && ini.brix),                 // 12 Brix Inicial Kombucha
    num(ini && ini.temperatura),          // 13 Temperatura Inicial
    num(fim && fim.pH),                   // 14 pH Final
    num(fim && fim.brix),                 // 15 Brix Final
    num(fim && fim.temperatura),          // 16 Temperatura Final
    num(fil.tempo),                       // 17 Tempo de Filtração
    num(pa.produto || f.produto || f.sigla || f.sku), // 18 Produto
    num(pa.abv ?? (fim && fim.abv) ?? ""),// 19 ABV
  ];
}

/** Linha da aba "Indicadores Refi e Chá" (kombucha/refri/cha/barril). 14 colunas. */
export function montarLinhaRefriCha(f) {
  const b = f.blocos || {};
  const pre = b.preEnvase || {};
  const rec = primeiro(b.recravacao) || {};
  const es = b.estoque || [];
  // entregas de estoque SOMADAS → um único número na planilha (Volume Produto)
  const totalEstoque = es.length
    ? es.reduce((soma, e) => soma + (Number(e && e.quantidade) || 0), 0)
    : null;
  const fam = String(f.familia || "").toLowerCase();
  const tipo = f.tipoProduto || (fam === "cha" ? "Chá" : fam === "kombucha" ? "Kombucha" : "Refri");
  return [
    dataUS(f.dataProducao),                     // 1  Data de Produção
    mesNome(f.dataProducao),                    // 2  Mês
    ano2(f.dataProducao),                       // 3  Ano
    tipo,                                       // 4  Produto (Chá/Refri/Kombucha)
    num(f.produto || f.sigla || f.sku),      // 5  Sabor (nome curto do produto)
    String(parseInt(String(f.op || "").split("/").pop().replace(/\D/g, ""), 10) || ""), // 6 Lote (número da OP)
    num(pre.pH),                                // 7  pH Produto
    num(pre.brix),                              // 8  Brix Produto
    num(pre.carbonatacao),                      // 9  Carbonatação Produto
    num(rec.altura),                            // 10 Largura ← altura física (planilha inverte nomenclatura)
    num(rec.espessura),                         // 11 Altura ← espessura física
    num(rec.transpasse),                        // 12 Transpasse
    num(totalEstoque),                          // 13 Volume Produto (soma das entregas de estoque)
    num(b.observacoes ?? ""),                   // 14 Observação
  ];
}

export function montarLinhaIndicadores(f) {
  const fam = String(f.familia || "").toLowerCase();
  if (fam === "base") return { tab: TAB_FERMENTACAO, linha: montarLinhaFermentacao(f) };
  return { tab: TAB_REFRI_CHA, linha: montarLinhaRefriCha(f) };
}

/** Escreve a ficha na planilha de indicadores (no fechamento). Não-fatal no fluxo. */
export async function registrarFichaNosIndicadores(env, f) {
  const id = env.INDICADORES_SPREADSHEET_ID;
  if (!id) return { ok: false, erro: "INDICADORES_SPREADSHEET_ID não configurado" };
  const { tab, linha } = montarLinhaIndicadores(f);
  const token = await getAccessToken(env);
  const r = await appendValues(env, token, id, tab, [linha]);
  const ups = r && r.updates;
  return { ok: true, tab, linha, atualizadas: ups ? ups.updatedRows : null };
}
