/**
 * ============================================================================
 * API do Dashboard PCP — dashboard completo servido direto pelo Apps Script
 * ============================================================================
 * CAMINHO A — pelo menu da planilha (se você achar "Extensões"):
 * 1. Abra a sua planilha do Google Sheets (o Planejador de PCP).
 * 2. Menu Extensões > Apps Script.
 * 3. Apague o conteúdo padrão e cole TODO este arquivo.
 * 4. Pule direto pro passo 4 do CAMINHO B abaixo (implantar).
 *
 * CAMINHO B — direto, sem precisar do menu "Extensões" (funciona sempre):
 * 1. Acesse https://script.google.com em outra aba.
 * 2. Clique em "Novo projeto".
 * 3. Apague o conteúdo padrão e cole TODO este arquivo.
 * 4. Clique em "Implantar" (Deploy) > "Nova implantação" (New deployment).
 * 5. No ícone de engrenagem, escolha o tipo "App da Web" (Web app).
 * 6. Configure:
 *      - "Executar como": Eu (seu e-mail)
 *      - "Quem pode acessar": Qualquer pessoa (Anyone)
 * 7. Clique em Implantar. Autorize as permissões pedidas (é sua própria planilha).
 * 8. Abra a "URL do app da Web" gerada — é ela que mostra o dashboard completo,
 *    e é ela que você vai apontar na TV.
 *
 * IMPORTANTE: se editar este código depois, use "Gerenciar implantações" >
 * editar (lápis) > Versão: "Nova versão" > Implantar — assim a URL não muda.
 * ============================================================================
 */

const SHEET_NAME = "Dashboard";
const LOTE_SHEET_NAME = "Produção por Lote";
const TREND_SHEET_NAME = "Realizado Mensal por SKU";

// ID da planilha — usado apenas se este script NÃO estiver vinculado a ela.
const SPREADSHEET_ID = "1dVTXuNhf9QWrz0kyh7i9S0SNJ43O5GZD";

const MONTH_MAP = {
  "janeiro":1,"fevereiro":2,"março":3,"marco":3,"abril":4,"maio":5,"junho":6,
  "julho":7,"agosto":8,"setembro":9,"outubro":10,"novembro":11,"dezembro":12
};

function getSpreadsheet() {
  try {
    const bound = SpreadsheetApp.getActiveSpreadsheet();
    if (bound) return bound;
  } catch (e) { /* não vinculado — segue pro fallback abaixo */ }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// ============================================================================
// ENTRY POINT DA WEB APP
// ============================================================================
// Aceita ?run=nomeDaFuncao para executar diagnósticos diretamente pela URL,
// sem precisar abrir o editor do Apps Script.
//
// Exemplos:
//   .../exec?run=diagnosticarMaio
//   .../exec?run=testarOPsConcluidas
//   .../exec?run=testarFilaDePedidos
//   .../exec                         → dashboard normal
// ============================================================================

// Lista de funções que podem ser chamadas via ?run= (whitelist de segurança)
var DIAG_FUNCTIONS = {
  diagnosticarMaio: diagnosticarMaio,
  testarOPsConcluidas: testarOPsConcluidas,
  testarFilaDePedidos: testarFilaDePedidos,
  testarEstoque: testarEstoque,
  testarRankingProducaoPorSku: testarRankingProducaoPorSku,
  testarTendenciaMensalProducao: testarTendenciaMensalProducao,
  atualizarRankingAutomatico: atualizarRankingAutomatico,
  atualizarFilaAutomatico: atualizarFilaAutomatico,
  atualizarEstoqueAutomatico: atualizarEstoqueAutomatico,
  atualizarCacheOmieAutomatico: atualizarCacheOmieAutomatico,
  testarDatasOPs: testarDatasOPs,
  testarPlanejadoPorSku: testarPlanejadoPorSku,
  testarCodigosNaoMapeados: testarCodigosNaoMapeados,
  testarPlanejadoPlanilha: testarPlanejadoPlanilha,
  testarMovimentosKeys: testarMovimentosKeys,
  testarMovimentoEstoqueRealizadoRaw: testarMovimentoEstoqueRealizadoRaw,
  testarSemIdProd: testarSemIdProd
};

function doGet(e) {
  e = e || {};
  var runParam = (e.parameter && e.parameter.run) || "";

  if (runParam && DIAG_FUNCTIONS[runParam]) {
    // Modo diagnóstico: executa a função e retorna o resultado como JSON
    var result;
    try {
      result = DIAG_FUNCTIONS[runParam]();
    } catch (err) {
      result = { erro: err.message, stack: err.stack };
    }
    return ContentService.createTextOutput(JSON.stringify(result, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Modo normal: dashboard
  return jsonOutput(doGetInner(e));
}

function doGetInner(e) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    return { error: "Aba '" + SHEET_NAME + "' não encontrada." };
  }

  const maxRows = Math.min(150, sheet.getMaxRows());
  const maxCols = Math.min(20, sheet.getMaxColumns());
  const values = sheet.getRange(1, 1, maxRows, maxCols).getValues();

  const data = {
    planejado: null, realizado: null, eficiencia: null,
    extraLabel: null, extraValue: null,
    mes: { planejado: null, realizado: null, eficiencia: null, pendentes: null },
    mesLabel: "",
    familias: [],
    tendencia: null,
    calGrid: null,
    geradoEm: new Date().toISOString()
  };

  // ---- KPIs anuais (1ª ocorrência de "planejado" na planilha) ----
  const labelRow = findRow(values, "planejado");
  if (labelRow !== -1) {
    const valueRow = labelRow + 1;
    const colPlan = findColInRow(values[labelRow], "planejado");
    const colReal = findColInRow(values[labelRow], "realizado");
    const colEfic = findColInRow(values[labelRow], "eficiência");
    if (colPlan !== -1) data.planejado = toNumber(values[valueRow][colPlan]);
    if (colReal !== -1) data.realizado = toNumber(values[valueRow][colReal]);
    if (colEfic !== -1) {
      let ef = toNumber(values[valueRow][colEfic]);
      if (ef !== null && ef > 1) ef = ef / 100;
      data.eficiencia = ef;
    }
    for (let c = 0; c < values[labelRow].length; c++) {
      if (c === colPlan || c === colReal || c === colEfic) continue;
      const txt = String(values[labelRow][c] || "").trim();
      if (txt) { data.extraLabel = txt; data.extraValue = values[valueRow][c]; break; }
    }
  }

  // ---- KPIs do mês selecionado (2ª ocorrência de "planejado") ----
  const labelRow2 = labelRow !== -1 ? findRow(values, "planejado", labelRow + 1) : -1;
  if (labelRow2 !== -1) {
    const valueRow2 = labelRow2 + 1;
    const colPlan2 = findColInRow(values[labelRow2], "planejado");
    const colReal2 = findColInRow(values[labelRow2], "realizado");
    const colEfic2 = findColInRow(values[labelRow2], "eficiência");
    const colPend2 = findColInRow(values[labelRow2], "pendentes");
    if (colPlan2 !== -1) data.mes.planejado = toNumber(values[valueRow2][colPlan2]);
    if (colReal2 !== -1) data.mes.realizado = toNumber(values[valueRow2][colReal2]);
    if (colEfic2 !== -1) {
      let ef2 = toNumber(values[valueRow2][colEfic2]);
      if (ef2 !== null && ef2 > 1) ef2 = ef2 / 100;
      data.mes.eficiencia = ef2;
    }
    if (colPend2 !== -1) data.mes.pendentes = toNumber(values[valueRow2][colPend2]);
  }

  // ---- Totais por família (Planejado e Realizado) ----
  const famRow = findRow(values, "família", labelRow + 1);
  if (famRow !== -1) {
    const colFam = findColInRow(values[famRow], "família");
    for (let r = famRow + 1; r < values.length; r++) {
      const nome = String(values[r][colFam] || "").trim();
      if (!nome || nome.toLowerCase().includes("total")) break;
      const nums = [];
      for (let c = colFam + 1; c < values[r].length && nums.length < 2; c++) {
        const n = toNumber(values[r][c]);
        if (n !== null) nums.push(n);
      }
      if (nums.length) {
        data.familias.push({ nome: nome, planejado: nums[0] || 0, valor: nums[1] !== undefined ? nums[1] : nums[0] });
      }
    }
  }

  // ---- Tendência mensal (total geral) + detalhe por SKU (pro gráfico de Top 5) ----
  data.skuMensal = [];
  try {
    const trendSheet = ss.getSheetByName(TREND_SHEET_NAME);
    if (trendSheet) {
      const tv = trendSheet.getRange(1, 1, Math.min(40, trendSheet.getMaxRows()), 17).getValues();
      const headerRow = findRow(tv, "família");
      const totalRow = findRow(tv, "total geral");
      if (headerRow !== -1 && totalRow !== -1) {
        const meses = [], valoresTotal = [];
        for (let c = 3; c < tv[headerRow].length && c < 15; c++) {
          const label = String(tv[headerRow][c] || "").trim();
          if (!label) continue;
          meses.push(label);
          valoresTotal.push(toNumber(tv[totalRow][c]) || 0);
        }
        if (meses.length) data.tendencia = { meses: meses, valores: valoresTotal };

        for (let r = headerRow + 1; r < totalRow; r++) {
          const sigla = String(tv[r][2] || "").trim(); // coluna C = Sigla
          if (!sigla) continue;
          const total = toNumber(tv[r][3 + meses.length]); // coluna "Total Anual"
          data.skuMensal.push({ sigla: sigla, total: total !== null ? total : 0 });
        }
      }
    }
  } catch (e) { /* aba de tendência ausente — segue sem quebrar */ }

  // ---- Mês/Ano de referência (pra saber qual mês desenhar no calendário) ----
  const ano = toNumber(findLabelValue(values, "ano de referência")) || (new Date()).getFullYear();
  const mesNome = findLabelValue(values, "mês selecionado");
  const monthNum = mesNome ? MONTH_MAP[String(mesNome).trim().toLowerCase()] : null;
  data.mesLabel = mesNome ? String(mesNome).trim() : "";

  // ---- Calendário: montado direto da Produção por Lote (dá pra calcular eficiência por dia) ----
  if (monthNum) {
    data.calGrid = buildCalendarFromLotes(ss, ano, monthNum);
  }

  return data;
}

// Constrói a grade do calendário (5 semanas x 7 dias) cruzando com a Produção por Lote,
// pra ter Planejado e Produzido separados (e assim calcular a eficiência de cada dia).
function buildCalendarFromLotes(ss, ano, monthNum) {
  const dayNums = [], weeksData = [];
  const loteSheet = ss.getSheetByName(LOTE_SHEET_NAME);
  const map = {};

  if (loteSheet) {
    const lastRow = loteSheet.getLastRow();
    if (lastRow >= 5) {
      const vals = loteSheet.getRange(5, 1, lastRow - 4, 8).getValues(); // A:H
      vals.forEach(function (row) {
        const d = row[0];
        if (Object.prototype.toString.call(d) === "[object Date]" && !isNaN(d)) {
          const key = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
          map[key] = { sigla: row[1], sufixo: row[2], planejada: toNumber(row[6]), produzida: toNumber(row[7]) };
        }
      });
    }
  }

  const day1 = new Date(ano, monthNum - 1, 1);
  const wdRaw = day1.getDay(); // 0=domingo...6=sábado
  const wd = wdRaw === 0 ? 7 : wdRaw; // 1=segunda...7=domingo
  const monday1 = new Date(ano, monthNum - 1, 1 - (wd - 1));

  // Número de semanas do mês (5 ou 6) — cobre o dia 29/30/31 em meses longos
  // (ex.: agosto/2026 e novembro/2026 precisam de 6 semanas)
  const offset = (wdRaw + 6) % 7; // dias antes do dia 1 (segunda = 0)
  const semanas = Math.ceil((new Date(ano, monthNum, 0).getDate() + offset) / 7);

  for (let w = 0; w < semanas; w++) {
    const dayRow = [], weekRow = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(monday1.getFullYear(), monday1.getMonth(), monday1.getDate() + d + 7 * w);
      if (dt.getMonth() !== monthNum - 1) {
        dayRow.push(null); weekRow.push(null);
        continue;
      }
      dayRow.push(("0" + dt.getDate()).slice(-2));
      const key = dt.getFullYear() + "-" + (dt.getMonth() + 1) + "-" + dt.getDate();
      const info = map[key];
      if (info && info.sigla) {
        const sufixoRaw = String(info.sufixo || "").trim();
        // "sem" é o texto usado na planilha pra indicar "sem sufixo" — nesse caso,
        // ou quando a célula está mesmo vazia, mostra só a sigla, sem nada colado.
        // Pega qualquer variação tipo "sem", "SEM", "(sem sufixo)", "Sem Sufixo" etc. —
        // qualquer texto que contenha "sem" é tratado como "sem sufixo nenhum".
        const sufixoLimpo = sufixoRaw.toLowerCase().includes("sem") ? "" : sufixoRaw;
        const siglaCompleta = String(info.sigla || "") + sufixoLimpo;
        weekRow.push([siglaCompleta, info.planejada, info.produzida]);
      } else {
        weekRow.push(null);
      }
    }
    dayNums.push(dayRow);
    weeksData.push(weekRow);
  }
  return { dayNums: dayNums, weeksData: weeksData };
}

function findRow(values, needle, fromRow) {
  fromRow = fromRow || 0;
  const low = needle.toLowerCase();
  for (let r = fromRow; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      if (String(values[r][c] || "").toLowerCase().includes(low)) return r;
    }
  }
  return -1;
}

function findColInRow(row, needle) {
  const low = needle.toLowerCase();
  for (let c = 0; c < row.length; c++) {
    if (String(row[c] || "").toLowerCase().includes(low)) return c;
  }
  return -1;
}

// Acha o valor associado a um rótulo: mesma linha, primeira célula não-vazia após o rótulo.
function findLabelValue(values, labelNeedle) {
  const r = findRow(values, labelNeedle);
  if (r === -1) return null;
  const c = findColInRow(values[r], labelNeedle);
  for (let cc = c + 1; cc < values[r].length; cc++) {
    const v = values[r][cc];
    if (v !== "" && v !== null && v !== undefined) return v;
  }
  return null;
}

function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  if (Object.prototype.toString.call(v) === "[object Date]") return null;
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return isNaN(n) ? null : n;
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================================
// GRAVADOR AUTOMÁTICO EM SEGUNDO PLANO (NOVA ABORDAGEM)
// ============================================================================
// Em vez da TV visitar a URL do Apps Script diretamente (o que esbarra na
// instabilidade de autorização OAuth do Google que vínhamos enfrentando), este
// script roda SOZINHO, num horário, sem ninguém visitando URL nenhuma. Ele
// calcula os dados do dashboard e escreve numa aba oculta da própria planilha,
// como um texto JSON puro numa única célula. Essa aba é publicada como CSV
// (link público, sem OAuth, sem redirecionamento) — e é esse CSV que a TV vai
// ler diretamente, num arquivo HTML separado e totalmente estático.
//
// COMO CONFIGURAR (uma vez só):
//
// 1. Cole este arquivo inteiro no lugar do código atual em script.google.com
//    (Gerenciar implantações > lápis > Nova versão > Implantar — mantém a
//    mesma URL de antes, embora ela não seja mais usada pela TV).
//
// 2. No editor do Apps Script, clique no ícone de relógio ⏰ na lateral
//    esquerda ("Acionadores" / "Triggers").
//
// 3. Clique em "+ Adicionar acionador" (canto inferior direito):
//      - Função a executar: atualizarCacheAutomatico
//      - Origem do evento: Baseado em tempo
//      - Tipo: Temporizador por minutos
//      - Intervalo: A cada 5 minutos (alinhado com a leitura da TV, menos carga no Google)
//    Salve. Vai pedir autorização UMA VEZ — aceite (é a única vez que isso
//    deve aparecer, já que gatilhos automáticos rodam com a autorização do
//    dono da planilha, sem depender de sessão de navegador).
//
// 4. Na planilha, confirme que surgiu uma aba nova chamada "_DashboardCache"
//    (criada automaticamente na primeira execução do gatilho).
//
// 5. Arquivo > Compartilhar > Publicar na Web > escolha a aba
//    "_DashboardCache" > formato CSV > Publicar > copie o link gerado.
//
// 6. Cole esse link no arquivo tv_dashboard_static.html, na constante
//    CSV_URL (no topo do arquivo).
// ============================================================================

const CACHE_SHEET_NAME = "_DashboardCache";

function atualizarCacheAutomatico() {
  const ss = getSpreadsheet();
  let cacheSheet = ss.getSheetByName(CACHE_SHEET_NAME);
  if (!cacheSheet) {
    cacheSheet = ss.insertSheet(CACHE_SHEET_NAME);
    cacheSheet.hideSheet();
  }

  let data;
  try {
    data = doGetInner(null);
  } catch (err) {
    data = { error: "Erro ao calcular dados: " + err.message };
  }
  data.geradoEm = new Date().toISOString();

  cacheSheet.getRange("A1").setValue(JSON.stringify(data));
}


/**
 * ============================================================================
 * Integração Omie — armazenamento seguro das chaves + funções de consulta
 * ============================================================================
 * COMO USAR (uma vez só):
 *
 * 1. Cole este arquivo inteiro num Apps Script (pode ser um projeto novo, ou
 *    dentro do mesmo projeto que já grava o cache do dashboard — sua escolha).
 *
 * 2. Ache a função "configurarChavesOmie" logo abaixo, preencha SUA_APP_KEY e
 *    SEU_APP_SECRET com os valores reais que você pegou no Omie.
 *
 * 3. Selecione "configurarChavesOmie" no menu de funções (topo do editor) e
 *    clique em Executar (▶). Isso salva as chaves de forma segura e
 *    criptografada, separadas do código-fonte.
 *
 * 4. IMPORTANTE: depois de rodar uma vez, APAGUE os valores reais das linhas
 *    SUA_APP_KEY/SEU_APP_SECRET (deixe os placeholders de volta) antes de
 *    salvar ou compartilhar esse arquivo — as chaves já estão guardadas em
 *    outro lugar seguro, não precisam mais estar escritas no código.
 *
 * 5. Rode "testarConexaoOmie" (▶) pra confirmar que as chaves funcionam —
 *    ela só busca 1 cliente, pra testar sem gastar muitas requisições.
 * ============================================================================
 */

function configurarChavesOmie() {
  // Preencha aqui, rode uma vez, depois apague e volte aos placeholders:
  const SUA_APP_KEY = "COLE_SUA_APP_KEY_AQUI";
  const SEU_APP_SECRET = "COLE_SEU_APP_SECRET_AQUI";

  if (SUA_APP_KEY === "COLE_SUA_APP_KEY_AQUI" || SEU_APP_SECRET === "COLE_SEU_APP_SECRET_AQUI") {
    throw new Error("Preencha SUA_APP_KEY e SEU_APP_SECRET com os valores reais antes de rodar essa função.");
  }

  PropertiesService.getScriptProperties().setProperty('OMIE_APP_KEY', SUA_APP_KEY);
  PropertiesService.getScriptProperties().setProperty('OMIE_APP_SECRET', SEU_APP_SECRET);

  Logger.log("Chaves salvas com sucesso. Pode apagar os valores reais dessa função agora.");
}

function getOmieKeys_() {
  const key = PropertiesService.getScriptProperties().getProperty('OMIE_APP_KEY');
  const secret = PropertiesService.getScriptProperties().getProperty('OMIE_APP_SECRET');
  if (!key || !secret) {
    throw new Error("Chaves do Omie não configuradas. Rode 'configurarChavesOmie' primeiro.");
  }
  return { key, secret };
}

// Função genérica pra chamar qualquer endpoint da API do Omie
function chamarOmie_(caminhoRelativo, metodo, parametros) {
  const { key, secret } = getOmieKeys_();
  const payload = {
    app_key: key,
    app_secret: secret,
    call: metodo,
    param: [parametros || {}]
  };

  const MAX_TENTATIVAS = 8;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const response = UrlFetchApp.fetch("https://app.omie.com.br/api/v1" + caminhoRelativo, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const status = response.getResponseCode();
    const texto = response.getContentText();

    // 429 = "muitas requisições" — estratégia em duas fases:
    // FASE 1 (primeiro 429): cooldown de 65s pra garantir que a janela de
    //   rate limit da Omie (provavelmente 1 minuto) resete por completo.
    //   Resolve o caso de múltiplas chamadas consecutivas que exaurem a cota.
    // FASE 2 (429s seguintes): backoff exponencial com jitter, respeitando
    //   o header Retry-After se o Omie informar quanto tempo esperar.
    if (status === 429) {
      if (tentativa === MAX_TENTATIVAS) {
        throw new Error("Omie continuou limitando (429) mesmo após " + MAX_TENTATIVAS + " tentativas.");
      }
      var headers = response.getHeaders();
      var retryAfter = parseInt(String(headers['Retry-After'] || headers['retry-after'] || "0"), 10);
      if (retryAfter > 0) {
        Logger.log("⏳ Omie pediu " + retryAfter + "s (Retry-After). Aguardando...");
        Utilities.sleep(retryAfter * 1000);
      } else if (tentativa === 1) {
        // Primeiro 429: cooldown longo pra resetar a janela de rate limit
        Logger.log("⏳ Rate limit Omie (429) — cooldown de 65s para resetar janela...");
        Utilities.sleep(65000);
      } else {
        // Backoff exponencial a partir do 2º 429: 8s → 16s → 32s → 64s...
        var base = Math.pow(2, tentativa + 1) * 1000;
        var jitter = Math.random() * 3000;
        Logger.log("⏳ Rate limit Omie (429) #" + tentativa + " — backoff " + Math.round((base + jitter)/1000) + "s...");
        Utilities.sleep(base + jitter);
      }
      continue;
    }

    if (status !== 200) {
      throw new Error("Omie retornou status " + status + ": " + texto);
    }

    const resultado = JSON.parse(texto);
    if (resultado.faultstring) {
      throw new Error("Erro da API Omie: " + resultado.faultstring);
    }
    return resultado;
  }
}

/**
 * Teste simples: busca só 1 cliente, pra confirmar que as chaves funcionam
 * sem gastar muitas requisições. Roda essa função e olha o "Log de execução"
 * (Exibir > Registros, ou Ctrl+Enter) pra ver o resultado.
 */
// Monta um cache de codigo_cliente → nome, paginando no máximo
// maxPaginas páginas (cada página = 100 clientes, default 10 = 1000 clientes).
// Evita N chamadas individuais a ConsultarCliente dentro da busca da fila de
// pedidos. Clientes que não couberem nas primeiras páginas são buscados sob
// demanda (fallback individual) em buscarFilaDePedidos.
// Retorna um objeto { [codigo_cliente]: "Nome do Cliente" }.
//
// Usa ListarClientesResumido (payload ~90% menor que ListarClientes): retorna
// apenas codigo_cliente, razao_social, nome_fantasia e cnpj_cpf — exatamente
// o que precisamos pro cache de nomes, sem arrastar endereço, contatos, tags
// e dados bancários de cada cliente.
function construirCacheClientes_(maxPaginas) {
  maxPaginas = maxPaginas || 10;
  var cache = {};
  var pagina = 1;
  var totalPaginas = 1;

  do {
    var resultado = chamarOmie_("/geral/clientes/", "ListarClientesResumido", {
      pagina: pagina,
      registros_por_pagina: 100
    });
    totalPaginas = resultado.total_de_paginas || 1;
    var clientes = resultado.clientes_cadastro_resumido || [];
    for (var i = 0; i < clientes.length; i++) {
      var c = clientes[i];
      cache[c.codigo_cliente] = c.razao_social || c.nome_fantasia || null;
    }
    pagina++;
  } while (pagina <= totalPaginas && pagina <= maxPaginas);

  return cache;
}

// Versão batch da chamada Omie: envia várias requisições em paralelo.
// Cada item: { caminho, metodo, parametros }. Retorna array de resultados parseados.
// Reduz drasticamente o tempo quando há muitas chamadas independentes.
function chamarOmieBatch_(calls) {
  if (calls.length === 0) return [];
  var keys = getOmieKeys_();
  var envelope = JSON.stringify({
    app_key: keys.key,
    app_secret: keys.secret
  });

  var requests = calls.map(function(c) {
    var payload = JSON.parse(envelope);
    payload.call = c.metodo;
    payload.param = [c.parametros || {}];
    return {
      url: "https://app.omie.com.br/api/v1" + c.caminho,
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
  });

  var responses = UrlFetchApp.fetchAll(requests);
  return responses.map(function(r, i) {
    try {
      var code = r.getResponseCode();
      if (code !== 200) return { erro: "Status " + code };
      var data = JSON.parse(r.getContentText());
      if (data.faultstring) return { erro: data.faultstring };
      if (code === 429) return { erro: "Rate limit" };
      return data;
    } catch (e) {
      return { erro: e.message };
    }
  });
}

function testarConexaoOmie() {
  const resultado = chamarOmie_("/geral/clientes/", "ListarClientes", {
    pagina: 1,
    registros_por_pagina: 1,
    apenas_importado_api: "N"
  });
  Logger.log("✅ Conexão funcionou! Resposta:");
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

// ============================================================================
// FUNÇÕES DE INDICADORES — cada uma busca e organiza um indicador específico
// ============================================================================

function buscarContasAReceber() {
  const resultado = chamarOmie_("/financas/contareceber/", "ListarContasReceber", {
    pagina: 1,
    registros_por_pagina: 500,
    apenas_importado_api: "N"
  });

  const contas = resultado.conta_receber_cadastro || [];
  const hoje = new Date();

  let totalAberto = 0, totalVencido = 0;
  contas.forEach(function (c) {
    if (c.status_titulo === "RECEBIDO") return; // já recebido, não conta como "em aberto"
    const valor = c.valor_documento || 0;
    totalAberto += valor;
    // data_vencimento vem como "dd/mm/aaaa"
    const partes = (c.data_vencimento || "").split("/");
    if (partes.length === 3) {
      const vencimento = new Date(partes[2], partes[1] - 1, partes[0]);
      if (vencimento < hoje) totalVencido += valor;
    }
  });

  return { totalAberto: totalAberto, totalVencido: totalVencido, quantidade: contas.length };
}

function buscarEtapasPedido() {
  const resultado = chamarOmie_("/produtos/pedidoetapas/", "ListarEtapasPedido", {
    nPagina: 1,
    nRegPorPagina: 20
  });
  return resultado;
}

function testarEtapasPedido() {
  const resultado = buscarEtapasPedido();
  Logger.log(JSON.stringify(resultado, null, 2));
}

function testarContasAReceber() {
  const resultado = buscarContasAReceber();
  Logger.log(JSON.stringify(resultado, null, 2));
}

function testarFilaDePedidos() {
  const resultado = buscarFilaDePedidos();
  Logger.log(JSON.stringify(resultado, null, 2));
}

function testarConsultarPedidoBruto() {
  // Usa o código de um dos pedidos que já sabemos que está ativo (do teste anterior)
  const resultado = chamarOmie_("/produtos/pedido/", "ConsultarPedido", {
    codigo_pedido: 9225151434
  });
  Logger.log(JSON.stringify(resultado, null, 2));
}

function buscarFilaDePedidos() {
  const REGISTROS_POR_PAGINA = 100;
  const DIAS_PARA_TRAS = 90; // cobre pedidos parados há até 3 meses

  // Monta as datas no formato dd/mm/aaaa que a API espera
  var hoje = new Date();
  var dataInicial = new Date(hoje.getTime() - DIAS_PARA_TRAS * 24 * 60 * 60 * 1000);
  var dDtInicial = ("0" + dataInicial.getDate()).slice(-2) + "/" +
                   ("0" + (dataInicial.getMonth() + 1)).slice(-2) + "/" +
                   dataInicial.getFullYear();
  var dDtFinal = ("0" + hoje.getDate()).slice(-2) + "/" +
                 ("0" + (hoje.getMonth() + 1)).slice(-2) + "/" +
                 hoje.getFullYear();

  // 1º passo: busca transições dos últimos 90 dias, ordenadas por data/hora
  // decrescente. Com o filtro de data, o volume cai drasticamente — em vez de
  // todas as transições da história, vêm só as do período recente. A ordenação
  // por DATAHORA garante que as primeiras páginas têm o que interessa.
  var primeira = chamarOmie_("/produtos/pedidoetapas/", "ListarEtapasPedido", {
    nPagina: 1,
    nRegPorPagina: REGISTROS_POR_PAGINA,
    dDtInicial: dDtInicial,
    dDtFinal: dDtFinal,
    cOrdenarPor: "DATAHORA",
    cOrdemDecrescente: "S"
  });

  var totalPaginas = primeira.nTotPaginas || 1;

  var registros = [];
  for (var p = 1; p <= totalPaginas; p++) {
    var resultado = (p === 1)
      ? primeira
      : chamarOmie_("/produtos/pedidoetapas/", "ListarEtapasPedido", {
          nPagina: p,
          nRegPorPagina: REGISTROS_POR_PAGINA,
          dDtInicial: dDtInicial,
          dDtFinal: dDtFinal,
          cOrdenarPor: "DATAHORA",
          cOrdemDecrescente: "S"
        });
    registros = registros.concat(resultado.etapasPedido || []);
  }

  // Esse endpoint registra o HISTÓRICO de mudanças de etapa — o mesmo pedido
  // pode aparecer várias vezes (uma por transição). Junta tudo num só
  // registro por pedido, mantendo a etapa mais alta (mais avançada) de cada um.
  var porPedido = {};
  registros.forEach(function (r) {
    var cod = r.nCodPed;
    var etapaNum = parseInt(r.cEtapa, 10) || 0;
    if (!porPedido[cod] || etapaNum > parseInt(porPedido[cod].cEtapa, 10)) {
      porPedido[cod] = r;
    }
  });
  var registrosUnicos = Object.keys(porPedido).map(function (cod) { return porPedido[cod]; });

  // Um pedido está "fora da fila" (já concluído) se foi faturado OU cancelado.
  // Esses campos vêm prontos da própria Omie — não precisa adivinhar código de etapa.
  var filaBasica = registrosUnicos
    .filter(function (r) {
      var faturado = r.faturamento && r.faturamento.cFaturado === "S";
      var cancelado = r.cancelamento && r.cancelamento.cCancelado === "S";
      return !faturado && !cancelado;
    })
    .map(function (r) {
      return {
        codigoPedido: r.nCodPed,
        numero: r.cNumero,
        etapa: r.cEtapa,
        dataInclusao: r.info && r.info.dInc
      };
    });

  if (filaBasica.length === 0) return [];

  // Respiro entre fases da fila: ListarEtapasPedido → ListarPedidos
  Logger.log("⏸️  Etapas processadas. Aguardando 2s antes dos detalhes...");
  Utilities.sleep(2000);

  // 2º passo: em vez de N chamadas individuais a ConsultarPedido (que disparam
  // o 429), busca os detalhes de TODOS os pedidos de uma vez via ListarPedidos
  // com filtro de data. Uma ou duas páginas substituem dezenas de chamadas.
  var detalhesPorPedido = {};
  var pPed = 1, totPagPed = 1;
  do {
    var listaPed = chamarOmie_("/produtos/pedido/", "ListarPedidos", {
      pagina: pPed,
      registros_por_pagina: REGISTROS_POR_PAGINA,
      filtrar_por_data_de: dDtInicial,
      filtrar_por_data_ate: dDtFinal
    });
    totPagPed = listaPed.total_de_paginas || 1;
    // ListarPedidos retorna o array na chave "pedido_venda_produto"
    var pedidosNaPagina = listaPed.pedido_venda_produto || [];
    for (var i = 0; i < pedidosNaPagina.length; i++) {
      var pv = pedidosNaPagina[i];
      var cab = pv.cabecalho || {};
      var cod = cab.codigo_pedido;
      if (cod) {
        var itens = pv.det || [];
        var totalUnidades = 0, valorTotal = 0;
        itens.forEach(function (det) {
          var pr = det.produto || {};
          totalUnidades += pr.quantidade || 0;
          valorTotal += pr.valor_total || 0;
        });
        detalhesPorPedido[cod] = {
          codigoCliente: cab.codigo_cliente,
          valorTotal: valorTotal,
          totalUnidades: totalUnidades
        };
      }
    }
    pPed++;
    if (pPed <= totPagPed) Utilities.sleep(300); // respiro entre páginas
  } while (pPed <= totPagPed);

  // 3º passo: cache de nomes de clientes (ListarClientesResumido, payload leve)
  var nomesClientesCache = construirCacheClientes_(10);

  // 4º passo: montar resultado final cruzando etapas + detalhes do ListarPedidos.
  // Pedidos que por acaso não vieram no ListarPedidos têm fallback individual
  // (raro, mas seguro).
  var fila = [];
  for (var i = 0; i < filaBasica.length; i++) {
    var item = filaBasica[i];
    var detalhe = detalhesPorPedido[item.codigoPedido];

    if (detalhe) {
      // Caminho feliz: os detalhes já vieram do ListarPedidos (batch)
      item.valorTotal = detalhe.valorTotal;
      item.totalUnidades = detalhe.totalUnidades;

      if (detalhe.codigoCliente) {
        var nome = nomesClientesCache[detalhe.codigoCliente];
        if (!nome) {
          try {
            var cinfo = chamarOmie_("/geral/clientes/", "ConsultarCliente", { codigo_cliente_omie: detalhe.codigoCliente });
            nome = cinfo.razao_social || cinfo.nome_fantasia || null;
            nomesClientesCache[detalhe.codigoCliente] = nome;
          } catch (errCli) { nome = null; }
        }
        item.cliente = nome;
      }
    } else {
      // Fallback raro: pedido não veio no ListarPedidos → ConsultarPedido individual
      try {
        var detalheFb = chamarOmie_("/produtos/pedido/", "ConsultarPedido", {
          codigo_pedido: item.codigoPedido
        });
        var pedido = detalheFb.pedido_venda_produto || {};
        var itens = pedido.det || [];
        var totalUnidades = 0, valorTotal = 0;
        itens.forEach(function (det) {
          var p = det.produto || {};
          totalUnidades += p.quantidade || 0;
          valorTotal += p.valor_total || 0;
        });
        item.valorTotal = valorTotal;
        item.totalUnidades = totalUnidades;

        var codigoCliente = pedido.cabecalho && pedido.cabecalho.codigo_cliente;
        if (codigoCliente) {
          var nomeFb = nomesClientesCache[codigoCliente];
          if (!nomeFb) {
            try {
              var cinfoFb = chamarOmie_("/geral/clientes/", "ConsultarCliente", { codigo_cliente_omie: codigoCliente });
              nomeFb = cinfoFb.razao_social || cinfoFb.nome_fantasia || null;
              nomesClientesCache[codigoCliente] = nomeFb;
            } catch (errCli) { nomeFb = null; }
          }
          item.cliente = nomeFb;
        }
      } catch (err) {
        item.valorTotal = null; item.totalUnidades = null; item.erroDetalhe = err.message;
      }
    }
    fila.push(item);
  }
  return fila;
}

// Endpoint e call confirmados: /estoque/consulta/ + "PosicaoEstoque"
// Lista os produtos cadastrados, pra pegar o ID de cada um (necessário pra
// consultar o estoque, já que PosicaoEstoque exige um produto específico).
// Lista os Locais de Estoque cadastrados — precisamos disso pra achar o
// código específico do "CD-DEVI", já que sempre devemos consultar esse local.
function buscarLocaisEstoque() {
  const resultado = chamarOmie_("/estoque/local/", "ListarLocaisEstoque", {
    nPagina: 1,
    nRegPorPagina: 50
  });
  return resultado;
}

function testarLocaisEstoque() {
  const resultado = buscarLocaisEstoque();
  Logger.log(JSON.stringify(resultado, null, 2));
}

function buscarProdutosOmie() {
  const resultado = chamarOmie_("/geral/produtos/", "ListarProdutos", {
    pagina: 1,
    registros_por_pagina: 100
    // removido "apenas_importado_api" — esse filtro pode estar excluindo
    // produtos válidos sem querer (ele filtra pela origem do cadastro, não
    // pelo status ativo/inativo).
  });
  return resultado;
}

function testarProdutosOmieResumo() {
  const resultado = buscarProdutosOmie();
  const produtos = resultado.produto_servico_cadastro || [];
  const resumo = produtos.map(function (p) {
    return {
      codigo: p.codigo,
      codigo_produto: p.codigo_produto,
      descricao: p.descricao,
      inativo: p.inativo
    };
  });
  Logger.log("Total de produtos retornados: " + produtos.length);
  Logger.log(JSON.stringify(resumo, null, 2));
}

function testarProdutosOmie() {
  const resultado = buscarProdutosOmie();
  Logger.log(JSON.stringify(resultado, null, 2));
}

// Busca um produto específico pelo código (SKU) — usado pra confirmar se um
// SKU que não apareceu na listagem geral existe no Omie sob outro filtro.
function testarBuscarSkuEspecifico() {
  const CODIGO_SKU = "FX001"; // troca pelo SKU que quer investigar

  const resultado = chamarOmie_("/geral/produtos/", "ConsultarProduto", {
    codigo: CODIGO_SKU
  });
  Logger.log(JSON.stringify(resultado, null, 2));
}

// Endpoint e call confirmados: /estoque/consulta/ + "PosicaoEstoque" — mas
// exige um produto específico (id_prod ou cod_int), não retorna todos de vez.
const CODIGO_LOCAL_ESTOQUE_CD_DEVI = 3125334492; // "CD DÊVI - PRODUTO ACABADO"

function consultarEstoqueDeUmProduto_(idProd) {
  const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT-3", "dd/MM/yyyy");
  return chamarOmie_("/estoque/consulta/", "PosicaoEstoque", {
    codigo_local_estoque: CODIGO_LOCAL_ESTOQUE_CD_DEVI,
    id_prod: idProd,
    cod_int: "",
    data: hoje
  });
}

// Teste com o produto CH001 (Chá Verde com Pêssego), que já sabemos que
// existe de verdade (veio no testarProdutosOmie).
function testarEstoqueDeUmProduto() {
  const ID_DE_TESTE = 8962006988; // CH001, já confirmado que existe
  const resultado = consultarEstoqueDeUmProduto_(ID_DE_TESTE);
  Logger.log(JSON.stringify(resultado, null, 2));
}

// Lista oficial dos 23 SKUs ativos (confirmada por você) — usamos essa lista
// fixa em vez do "ListarProdutos", porque esse método está aplicando algum
// filtro escondido que exclui vários produtos (confirmado: FX001 existe e é
// ativo no Omie, mas não aparecia no ListarProdutos).
const SKUS_ATIVOS = [
  "CH001", "CH002", "CH003", "CH004",
  "FX001", "FX002", "FX003", "FX006", "FX007",
  "RF001", "RF002", "RF003", "RF004", "RF005",
  "RTM001", "RTM002", "RTM003"
];

function buscarEstoque(cacheExterno) {
  // Se recebeu cache externo (de atualizarCacheOmieAutomatico), reusa.
  // Senão, constrói o cache aqui (usado nos testes isolados).
  var cacheProdutos = cacheExterno || construirCacheProdutos_();

  var hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT-3", "dd/MM/yyyy");

  // Em vez de 17 chamadas individuais a PosicaoEstoque (uma por SKU), usa
  // ListarPosEstoque com lista_produtos — UMA chamada paginada que consulta
  // todos os SKUs de uma vez. Reduz 17 requisições para 1-2 páginas.
  var todosResultados = {};
  var pagina = 1, totalPaginas = 1;
  do {
    var resultado = chamarOmie_("/estoque/consulta/", "ListarPosEstoque", {
      nPagina: pagina,
      nRegPorPagina: 100,
      dDataPosicao: hoje,
      codigo_local_estoque: CODIGO_LOCAL_ESTOQUE_CD_DEVI,
      lista_produtos: SKUS_ATIVOS.map(function (sku) { return { cCodigo: sku }; })
    });
    totalPaginas = resultado.nTotPaginas || 1;
    var produtos = resultado.produtos || [];
    for (var i = 0; i < produtos.length; i++) {
      var p = produtos[i];
      todosResultados[p.cCodigo] = p;
    }
    pagina++;
  } while (pagina <= totalPaginas);

  // Monta resultado final cruzando o cache de descrições com a posição de cada SKU
  return SKUS_ATIVOS.map(function (sku) {
    var item = { codigo: sku, descricao: null, saldo: null, estoqueMinimo: null, status: "indisponivel" };
    try {
      // Descrição vem do cache de produtos (fallback: ConsultarProduto)
      var produto = cacheProdutos[sku];
      if (!produto || !produto.descricao) {
        try {
          var c = chamarOmie_("/geral/produtos/", "ConsultarProduto", { codigo: sku });
          produto = { codigo_produto: c.codigo_produto, descricao: c.descricao };
          cacheProdutos[sku] = produto;
        } catch (err2) {
          item.erro = "SKU nao encontrado: " + err2.message;
          return item;
        }
      }
      item.descricao = abreviarDescricao_(sku, produto.descricao);

      // Posição de estoque veio do ListarPosEstoque (batch).
      // Campos: nSaldo (saldo), estoque_minimo.
      var posicao = todosResultados[sku];
      if (!posicao) {
        // Fallback: se o SKU não veio na listagem, tenta individual
        posicao = consultarEstoqueDeUmProduto_(produto.codigo_produto);
        item.saldo = posicao.saldo;
        item.estoqueMinimo = posicao.estoque_minimo;
      } else {
        item.saldo = posicao.nSaldo;
        item.estoqueMinimo = posicao.estoque_minimo;
      }

      if (item.estoqueMinimo > 0) {
        if (item.saldo < item.estoqueMinimo) item.status = "baixo";
        else if (item.saldo < item.estoqueMinimo * 1.1) item.status = "alerta";
        else item.status = "ok";
      } else {
        item.status = "ok";
      }
    } catch (err) { item.erro = err.message; }
    return item;
  });
}

function testarEstoque() {
  const resultado = buscarEstoque();
  Logger.log(JSON.stringify(resultado, null, 2));
}

// Endpoint e call confirmados: /estoque/movestoque/ + "ListarMovimentos"
function testarMovimentosEstoqueBruto() {
  const resultado = chamarOmie_("/estoque/movestoque/", "ListarMovimentos", {
    pagina: 1,
    registros_por_pagina: 20,
    codigo_local_estoque: CODIGO_LOCAL_ESTOQUE_CD_DEVI
  });
  Logger.log(JSON.stringify(resultado, null, 2));
}

function parseDataBr_(str) {
  const partes = String(str || "").split("/");
  if (partes.length !== 3) return null;
  return new Date(partes[2], partes[1] - 1, partes[0]);
}

// Abrevia descrições longas mantendo identificação do produto.
// Usa mapeamento direto SKU → nome limpo (muito mais legível na TV que regex).
var NOME_CURTO = {
  "CH001": "Chá Verde Pêssego",
  "CH002": "Chá Hibisco Morango",
  "CH003": "Chá Camomila Maracujá",
  "CH004": "Chá Mate Limão",
  "FX001": "Komb Frutas Vermelhas",
  "FX002": "Komb Abacaxi Gengibre",
  "FX003": "Komb Maçã Gengibre",
  "FX006": "Komb Mirtilo Morango",
  "FX007": "Komb Pink Lemonade",
  "RF001": "Refri Limão Siciliano",
  "RF002": "Refri Frutas Vermelhas",
  "RF003": "Refri Guaraná Açaí",
  "RF004": "Refri Uva",
  "RF005": "Refri Laranja",
  "RTM001": "Refri Limão Mônica",
  "RTM002": "Refri Uva Mônica",
  "RTM003": "Refri Laranja Mônica"
};

function abreviarDescricao_(sku, desc) {
  // Se temos nome curto mapeado pro SKU, usa direto
  if (sku && NOME_CURTO[sku]) return NOME_CURTO[sku];
  // Fallback: limpeza básica da descrição original
  if (!desc) return sku || desc;
  return String(desc)
    .replace(/Refrigerante Natural/gi, "Refri")
    .replace(/Kombucha/gi, "Komb")
    .replace(/Turma da Mônica/gi, "Mônica")
    .replace(/DÊVI\s*/gi, "")
    .replace(/269\s*mL/gi, "")
    .replace(/  +/g, " ")
    .trim();
}

// Mapeamento sigla da planilha PCP → código SKU do Omie
const PLANILHA_PARA_SKU = {
  "CVP": "CH001", "CML": "CH002", "CCM": "CH003", "CHM": "CH004",
  "KFV": "FX001", "KABX": "FX002", "KMIR": "FX003", "KPL": "FX006", "KMC": "FX007",
  "RLS": "RF001", "RFV": "RF002", "RGA": "RF003", "RLA": "RF004", "RUV": "RF005",
  "RTMLA": "RTM001", "RTMLS": "RTM002", "RTMUV": "RTM003"
};

const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// Soma as "entradas" de estoque (= produção concluída entrando no CD) por mês,
// olhando só os SKUs ativos, nos últimos 8 meses. Usa ListarMovimentos com
// filtro de data no servidor (data_inicial / data_final), ordenado por data
// decrescente — resolve o problema anterior onde paginava o histórico inteiro.
// Retorna [{ codigo, data, entradas }] compatível com calcularTendencia e calcularRanking.
function buscarMovimentosEstoqueSKUsAtivos_() {
  const hoje = new Date();
  const dataLimite = new Date(hoje.getFullYear(), hoje.getMonth() - 7, 1);

  const MAX_PAGINAS = 20;
  const REGISTROS_POR_PAGINA = 100;
  var pagina = 1, totalPaginas = 1;
  var movimentos = [];
  var encontrados = {};
  var faltando = SKUS_ATIVOS.length;

  do {
    var resultado = chamarOmie_("/estoque/movestoque/", "ListarMovimentos", {
      pagina: pagina,
      registros_por_pagina: REGISTROS_POR_PAGINA,
      codigo_local_estoque: CODIGO_LOCAL_ESTOQUE_CD_DEVI
    });
    totalPaginas = resultado.total_de_paginas || 1;

    var cadastros = resultado.cadastros || [];
    for (var i = 0; i < cadastros.length; i++) {
      var produto = cadastros[i];
      if (SKUS_ATIVOS.indexOf(produto.cCodigo) === -1) continue;

      if (!encontrados[produto.cCodigo]) {
        encontrados[produto.cCodigo] = true;
        faltando--;
      }

      (produto.movimentos || []).forEach(function (mov) {
        var data = parseDataBr_(mov.dDataMovimento);
        if (!data || data < dataLimite) return;
        var entradas = mov.nQtdeEntradas || 0;
        if (entradas <= 0) return;

        movimentos.push({
          codigo: produto.cCodigo,
          data: data,
          entradas: entradas
        });
      });
    }
    pagina++;
  } while (pagina <= totalPaginas && pagina <= MAX_PAGINAS && faltando > 0);

  return movimentos;
}

// Lê a aba "Produção por Lote" e retorna [{ codigo, data, entradas }] no mesmo
// formato das funções de Omie, pra alimentar tendência e ranking com dados reais.
// Inclui todas as linhas (todos os sufixos/kits), mapeando sigla → SKU Omie.
// Lê a aba "Produção por Lote" e retorna [{ codigo, data, entradas }].
// colIdx: 6 = planejada (coluna G), 7 = produzida (coluna H, default).
function buscarProducaoDaPlanilha_(colIdx) {
  var ss = getSpreadsheet();
  var loteSheet = ss.getSheetByName(LOTE_SHEET_NAME);
  if (!loteSheet) return [];

  colIdx = (colIdx === 6) ? 6 : 7; // default: produzida

  var lastRow = loteSheet.getLastRow();
  var vals = loteSheet.getRange(5, 1, lastRow - 4, 8).getValues();
  var producao = [];

  vals.forEach(function(row) {
    var d = row[0];
    if (Object.prototype.toString.call(d) !== "[object Date]" || isNaN(d)) return;
    var sigla = String(row[1] || "").trim();
    var sku = PLANILHA_PARA_SKU[sigla];
    if (!sku) return;
    var qtd = toNumber(row[colIdx]) || 0;
    if (qtd <= 0) return;

    producao.push({
      codigo: sku,
      data: d,
      entradas: qtd
    });
  });

  return producao;
}

function calcularTendenciaDeMovimentos_(movimentos) {
  const hoje = new Date();
  const totaisPorMes = {}; // chave "AAAA-MM" -> soma de entradas

  const chaves = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const chave = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    chaves.push(chave);
    totaisPorMes[chave] = 0;
  }

  movimentos.forEach(function (m) {
    const chave = m.data.getFullYear() + "-" + String(m.data.getMonth() + 1).padStart(2, "0");
    if (totaisPorMes[chave] === undefined) return;
    totaisPorMes[chave] += m.entradas;
  });

  const meses = chaves.map(function (chave) {
    const mesNum = parseInt(chave.split("-")[1], 10);
    return MESES_ABREV[mesNum - 1];
  });
  const valores = chaves.map(function (chave) { return totaisPorMes[chave]; });

  return { meses: meses, valores: valores };
}

// Monta um cache de código → {codigo_produto, descricao} paginando o ListarProdutos.
// SKUs que não aparecerem na listagem (ex: kombuchas FX00x) têm fallback ConsultarProduto.
// Usado tanto pelo ranking quanto pelo estoque pra evitar chamadas repetidas.
function construirCacheProdutos_() {
  var cache = {};
  var pagina = 1, totalPaginas = 1, encontrados = 0;
  do {
    var listagem = chamarOmie_("/geral/produtos/", "ListarProdutos", {
      pagina: pagina,
      registros_por_pagina: 100
    });
    totalPaginas = listagem.total_de_paginas || 1;
    var produtos = listagem.produto_servico_cadastro || [];
    for (var i = 0; i < produtos.length; i++) {
      var p = produtos[i];
      if (SKUS_ATIVOS.indexOf(p.codigo) !== -1) {
        cache[p.codigo] = { codigo_produto: p.codigo_produto, descricao: p.descricao };
        encontrados++;
        if (encontrados >= SKUS_ATIVOS.length) break;
      }
    }
    pagina++;
    if (pagina <= totalPaginas && encontrados < SKUS_ATIVOS.length) Utilities.sleep(300);
  } while (pagina <= totalPaginas && encontrados < SKUS_ATIVOS.length);

  // Fallback: SKUs que não apareceram no ListarProdutos (ex: kombuchas FX00x)
  SKUS_ATIVOS.forEach(function(sku, idx) {
    if (!cache[sku]) {
      if (idx > 0) Utilities.sleep(400); // respiro entre chamadas individuais
      try {
        var consulta = chamarOmie_("/geral/produtos/", "ConsultarProduto", { codigo: sku });
        cache[sku] = { codigo_produto: consulta.codigo_produto, descricao: consulta.descricao };
      } catch (e) {
        cache[sku] = { codigo_produto: null, descricao: sku };
      }
    }
  });

  return cache;
}

function calcularRankingDeMovimentos_(movimentos, descricoes) {
  const totaisPorSku = {};
  SKUS_ATIVOS.forEach(function (sku) { totaisPorSku[sku] = 0; });

  movimentos.forEach(function (m) {
    totaisPorSku[m.codigo] = (totaisPorSku[m.codigo] || 0) + m.entradas;
  });

  return Object.keys(totaisPorSku)
    .map(function (sku) {
      return {
        codigo: sku,
        descricao: (descricoes && descricoes[sku]) || sku,
        total: totaisPorSku[sku]
      };
    })
    .sort(function (a, b) { return b.total - a.total; });
}

// Mantidas por compatibilidade (ex.: pros testes isolados), mas fazem sua
// própria busca — pra evitar buscar 2x, use buscarMovimentosEstoqueSKUsAtivos_()
// uma vez e passe o resultado pras funções "calcular..." acima.
function buscarTendenciaMensalProducao() {
  return calcularTendenciaDeMovimentos_(buscarMovimentosEstoqueSKUsAtivos_());
}

function buscarRankingProducaoPorSku() {
  var cacheProd = construirCacheProdutos_();
  var descricoes = {};
  Object.keys(cacheProd).forEach(function(k) { descricoes[k] = abreviarDescricao_(k, cacheProd[k].descricao); });
  return calcularRankingDeMovimentos_(buscarMovimentosEstoqueSKUsAtivos_(), descricoes);
}

function testarTendenciaMensalProducao() {
  const resultado = buscarTendenciaMensalProducao();
  Logger.log(JSON.stringify(resultado, null, 2));
}

function testarRankingProducaoPorSku() {
  const resultado = buscarRankingProducaoPorSku();
  Logger.log(JSON.stringify(resultado, null, 2));
}

// FONTE DO REALIZADO: ListarMovimentoEstoque por SKU com janelas de 2 meses.
// Com idProd + data no servidor, cada SKU tem ~2 páginas por janela.
// 17 SKUs × 4 janelas × ~2 páginas ≈ 136 chamadas, ~2-3 minutos.
// Filtro OPE/entrada/operacao=28 para quantidade REAL produzida.
function buscarRealizadoProducao_(cacheProd) {
  var hoje = new Date();
  var anoAtual = hoje.getFullYear();
  var inicioAno = new Date(anoAtual, 0, 1);

  // Janelas bimestrais
  var janelas = [];
  for (var m = 0; m < 12; m += 2) {
    var iniMes = m, fimMes = m + 1;
    if (fimMes > 11) fimMes = 11;
    var ini = new Date(anoAtual, iniMes, 1);
    if (ini > hoje) break;
    var fim = new Date(anoAtual, fimMes + 1, 0);
    if (fim > hoje) fim = hoje;
    janelas.push({
      ini: "01/" + ("0" + (iniMes + 1)).slice(-2) + "/" + anoAtual,
      fim: ("0" + fim.getDate()).slice(-2) + "/" +
           ("0" + (fim.getMonth() + 1)).slice(-2) + "/" + anoAtual,
      dataFim: fim
    });
  }

  var realizado = [];
  var totalChamadas = 0;

  SKUS_ATIVOS.forEach(function(sku, idx) {
    var prod = cacheProd[sku];
    if (!prod || !prod.codigo_produto) return;
    if (idx > 0) Utilities.sleep(300); // respiro entre SKUs

    try {
      janelas.forEach(function(janela) {
        var pagina = 1, totalPaginas = 1;
        do {
          var resultado = chamarOmie_("/estoque/consulta/", "ListarMovimentoEstoque", {
            nPagina: pagina,
            nRegPorPagina: 100,
            idProd: prod.codigo_produto,
            dDtInicial: janela.ini,
            dDtFinal: janela.fim,
            codigo_local_estoque: CODIGO_LOCAL_ESTOQUE_CD_DEVI
          });
          totalPaginas = resultado.nTotPaginas || 1;
          totalChamadas++;

          (resultado.movProdutoListar || []).forEach(function(mov) {
            if (mov.codOrigem !== "OPE") return;
            if (mov.tipo !== "entrada") return;
            if (mov.operacao !== "28") return;
            var data = parseDataBr_(mov.dtMov);
            if (!data || data < inicioAno || data > janela.dataFim) return;
            var qtd = mov.qtde || 0;
            if (qtd <= 0) return;
            realizado.push({ codigo: sku, data: data, entradas: qtd });
          });
          pagina++;
          if (pagina <= totalPaginas) Utilities.sleep(200);
        } while (pagina <= totalPaginas);
      });
    } catch (err) {
      var msg = String(err.message);
      if (msg.indexOf("8020") > -1) { Utilities.sleep(3000); }
      else { Logger.log("⚠️ Realizado " + sku + ": " + msg); }
    }
  });

  Logger.log("✅ Realizado (OPE/28): " + realizado.length + " movimentos, " +
             totalChamadas + " chamadas, " + SKUS_ATIVOS.length + " SKUs, " + janelas.length + " janelas");
  return realizado;
}

// ⚠️ DEPRECATED: substituída por buscarRealizadoProducao_() que é muito mais
// eficiente (sem idProd = todos SKUs de uma vez, com filtro de data no servidor).
// Mantida apenas para referência e testes isolados.
function buscarMovimentoEstoqueRealizado_(cacheProd) {
  var hoje = new Date();
  var dataLimite = new Date(hoje.getFullYear(), hoje.getMonth() - 7, 1);
  var realizado = [];

  SKUS_ATIVOS.forEach(function(sku, idx) {
    var prod = cacheProd[sku];
    if (!prod || !prod.codigo_produto) return;
    if (idx > 0) Utilities.sleep(500);
    try {
      var pagina = 1, totalPaginas = 1;
      do {
        var resultado = chamarOmie_("/estoque/consulta/", "ListarMovimentoEstoque", {
          nPagina: pagina,
          nRegPorPagina: 100,
          idProd: prod.codigo_produto,
          codigo_local_estoque: CODIGO_LOCAL_ESTOQUE_CD_DEVI
        });
        totalPaginas = resultado.nTotPaginas || 1;

        (resultado.movProdutoListar || []).forEach(function(mov) {
          if (mov.codOrigem !== "OPE") return;
          if (mov.tipo !== "entrada") return;
          if (mov.operacao !== "28") return;
          var data = parseDataBr_(mov.dtMov);
          if (!data || data < dataLimite) return;
          var qtd = mov.qtde || 0;
          if (qtd <= 0) return;
          realizado.push({ codigo: sku, data: data, entradas: qtd });
        });
        pagina++;
      } while (pagina <= totalPaginas);
    } catch (err) {
      var msg = String(err.message);
      if (msg.indexOf("8020") > -1) { Utilities.sleep(3000); }
      else { Logger.log("Erro SKU " + sku + ": " + msg); }
    }
  });

  return realizado;
}

// NOVA FONTE DA VERDADE para tendência e ranking: ListarOrdemProducao com
// filtro cConcluida="S". As OPs concluídas são a fonte canônica do realizado
// no Omie — cada OP tem identificacao.nQtde (quantidade da OP) e
// outrasInf.dConclusao (data em que foi concluída).
//
// Vantagens sobre a abordagem anterior (ListarMovimentoEstoque com filtro OPE):
// - Não depende de vínculo textual frágil entre movimento e OP
// - Uma única paginação cobre todos os SKUs (em vez de 17 × N páginas)
// - Bate com os relatórios do Omie (que também usam OP como fonte)
//
// Retorna [{ codigo, data, entradas }] — mesmo formato esperado por
// calcularTendenciaDeMovimentos_ e calcularRankingDeMovimentos_.
function buscarOPsConcluidas_(cacheProd) {
  var hoje = new Date();
  var dataLimite = new Date(hoje.getFullYear(), hoje.getMonth() - 7, 1);
  var dDtDe = ("0" + dataLimite.getDate()).slice(-2) + "/" +
             ("0" + (dataLimite.getMonth() + 1)).slice(-2) + "/" +
             dataLimite.getFullYear();
  var dDtAte = ("0" + hoje.getDate()).slice(-2) + "/" +
               ("0" + (hoje.getMonth() + 1)).slice(-2) + "/" +
               hoje.getFullYear();

  // Mapa reverso: codigo_produto → sku (pra traduzir o nCodProduto da OP)
  var produtoParaSku = {};
  Object.keys(cacheProd).forEach(function (sku) {
    var cp = cacheProd[sku];
    if (cp && cp.codigo_produto) produtoParaSku[cp.codigo_produto] = sku;
  });

  var producao = [];
  var pagina = 1, totalPaginas = 1;
  do {
    var resultado = chamarOmie_("/produtos/op/", "ListarOrdemProducao", {
      pagina: pagina,
      registros_por_pagina: 100,
      dDtConclusaoDe: dDtDe,
      dDtConclusaoAte: dDtAte,
      cConcluida: "S"
    });
    totalPaginas = resultado.total_de_paginas || 1;

    var cadastros = resultado.cadastros || [];
    for (var i = 0; i < cadastros.length; i++) {
      var op = cadastros[i];
      var ident = op.identificacao || {};
      var nCodProduto = ident.nCodProduto;
      var nQtde = ident.nQtde || 0;
      if (nQtde <= 0) continue;

      var sku = produtoParaSku[nCodProduto];
      if (!sku) continue; // SKU fora da lista de ativos

      // Data de conclusão: tenta outrasInf.dConclusao primeiro, fallback infAdicionais
      var dataStr = (op.outrasInf && op.outrasInf.dConclusao) ||
                    (op.infAdicionais && op.infAdicionais.dDtConclusao);
      if (!dataStr) continue;

      var data = parseDataBr_(dataStr);
      if (!data || data < dataLimite) continue;

      producao.push({ codigo: sku, data: data, entradas: nQtde });
    }
    pagina++;
    if (pagina <= totalPaginas) Utilities.sleep(300);
  } while (pagina <= totalPaginas);

  return producao;
}

function testarOPsConcluidas() {
  var cacheProd = construirCacheProdutos_();
  var producao = buscarOPsConcluidas_(cacheProd);
  Logger.log("Total de OPs concluidas (8 meses): " + producao.length);
  Logger.log("Amostra: " + JSON.stringify(producao.slice(0, 5), null, 2));
  var totais = {};
  producao.forEach(function (m) {
    totais[m.codigo] = (totais[m.codigo] || 0) + m.entradas;
  });
  Logger.log("Totais por SKU: " + JSON.stringify(totais, null, 2));
  var tendencia = calcularTendenciaDeMovimentos_(producao);
  Logger.log("Tendência: " + JSON.stringify(tendencia, null, 2));
}

// Diagnóstico detalhado de um mês específico: SKU por SKU, OP por OP.
// Chame pela URL: .../exec?run=diagnosticarMaio
// ou mude o mês/ano aqui pra investigar outro período.
function diagnosticarMaio() {
  var cacheProd = construirCacheProdutos_();
  var producao = buscarOPsConcluidas_(cacheProd);

  var mes = 4; // 0=Jan, 1=Fev, ..., 4=Maio
  var ano = 2026;

  var filtrado = producao.filter(function (p) {
    return p.data.getMonth() === mes && p.data.getFullYear() === ano;
  });

  // Por SKU
  var porSku = {};
  filtrado.forEach(function (p) {
    if (!porSku[p.codigo]) porSku[p.codigo] = { latas: 0, ops: [] };
    porSku[p.codigo].latas += p.entradas;
    porSku[p.codigo].ops.push({ data: p.data.toISOString().slice(0, 10), entradas: p.entradas });
  });

  var ordenado = Object.keys(porSku)
    .map(function (sku) {
      return { sku: sku, latas: porSku[sku].latas, ops: porSku[sku].ops };
    })
    .sort(function (a, b) { return b.latas - a.latas; });

  var total = 0;
  ordenado.forEach(function (item) { total += item.latas; });

  return {
    mes: mes + 1,
    ano: ano,
    totalOps: filtrado.length,
    totalLatas: total,
    porSku: ordenado,
    ops: filtrado
      .sort(function (a, b) { return a.data - b.data; })
      .map(function (op) {
        return { data: op.data.toISOString().slice(0, 10), sku: op.codigo, latas: op.entradas };
      })
  };
}

// ============================================================================
// KPIs OMIE — 8 indicadores (substituem os KPIs da planilha)
// ============================================================================
// 1. PLANEJADO ANO: soma nQtde de todas as OPs (abertas + concluídas)
// 2. REALIZADO ANO: soma qtde REAL dos movimentos de estoque (OPE/entrada/28)
// 3. EFICIÊNCIA ANO: realizado / planejado
// 4. OCUPAÇÃO ANO: dias úteis com ≥1 OP ativa ÷ total dias úteis até hoje
// 5. PLANEJADO MÊS: nQtde de todas as OPs abertas + concluídas no mês
// 6. REALIZADO MÊS: soma qtde REAL dos movimentos OPE/28 no mês
// 7. EFICIÊNCIA MÊS: realizado mês / planejado mês
// 8. PENDENTES MÊS: número de OPs abertas dos SKUs ativos
//
// OP ativa = entre infAdicionais.dDtInicio e outrasInf.dConclusao (ou hoje se aberta)
// Dias úteis = seg a sex (sem feriados — simplificado)
// ============================================================================
function buscarKPIsOmie(cacheProdExterno) {
  var hoje = new Date();
  var inicioAno = new Date(hoje.getFullYear(), 0, 1);
  var dDtInicioAno = "01/01/" + hoje.getFullYear();
  var dDtHoje = ("0" + hoje.getDate()).slice(-2) + "/" +
                ("0" + (hoje.getMonth() + 1)).slice(-2) + "/" +
                hoje.getFullYear();

  // --- OPs concluídas este ano ---
  var concluidas = [];
  var p1 = 1, tp1 = 1;
  do {
    var r1 = chamarOmie_("/produtos/op/", "ListarOrdemProducao", {
      pagina: p1, registros_por_pagina: 100,
      dDtConclusaoDe: dDtInicioAno,
      dDtConclusaoAte: dDtHoje,
      cConcluida: "S"
    });
    tp1 = r1.total_de_paginas || 1;
    concluidas = concluidas.concat(r1.cadastros || []);
    p1++;
    if (p1 <= tp1) Utilities.sleep(500);
  } while (p1 <= tp1);

  // Respiro entre fases: deixa o rate limit da Omie respirar
  Logger.log("⏸️  OPs concluídas: " + concluidas.length + ". Aguardando 3s antes das abertas...");
  Utilities.sleep(3000);

  // --- OPs em aberto ---
  var abertas = [];
  var p2 = 1, tp2 = 1;
  do {
    var r2 = chamarOmie_("/produtos/op/", "ListarOrdemProducao", {
      pagina: p2, registros_por_pagina: 100,
      cConcluida: "N"
    });
    tp2 = r2.total_de_paginas || 1;
    abertas = abertas.concat(r2.cadastros || []);
    p2++;
    if (p2 <= tp2) Utilities.sleep(500);
  } while (p2 <= tp2);

  // Respiro entre fases: deixa o rate limit da Omie respirar
  Logger.log("⏸️  OPs abertas: " + abertas.length + ". Aguardando 5s antes do realizado...");
  Utilities.sleep(5000);

  // ============ KPIs ANUAIS ============

  // Cache de produtos (mapeia SKU ↔ codigo_produto) e movimentos reais de produção.
  // Aceita cache externo pra evitar dupla chamada ao ListarProdutos.
  var cacheProd = cacheProdExterno || construirCacheProdutos_();
  var realizadoMov = buscarRealizadoProducao_(cacheProd);

  // Mapa codigo_produto → SKU para filtrar só os 17 SKUs ativos
  var codParaSku = {};
  Object.keys(cacheProd).forEach(function(sku) {
    var cp = cacheProd[sku];
    if (cp && cp.codigo_produto) codParaSku[cp.codigo_produto] = sku;
  });

  // 1. PLANEJADO ANO = todas as OPs do ano (concluídas + abertas) dos SKUs ativos
  var todas = concluidas.concat(abertas);
  var planejadoAno = 0;
  todas.forEach(function (op) {
    var ident = op.identificacao || {};
    if (!codParaSku[ident.nCodProduto]) return; // exclui FX000, SABs, etc.
    planejadoAno += (ident.nQtde || 0);
  });

  // 2. REALIZADO ANO — quantidades REAIS dos movimentos de estoque (OPE/entrada/28)
  var realizadoAno = 0;
  realizadoMov.forEach(function (m) {
    realizadoAno += m.entradas;
  });

  // 3. EFICIÊNCIA ANO = realizado / planejado só das OPs concluídas.
  // OPs abertas ainda não têm resultado final — não entram no denominador.
  var planejadoConcluidasAno = 0;
  concluidas.forEach(function (op) {
    var ident = op.identificacao || {};
    if (!codParaSku[ident.nCodProduto]) return;
    planejadoConcluidasAno += (ident.nQtde || 0);
  });
  var eficienciaAno = planejadoConcluidasAno > 0 ? realizadoAno / planejadoConcluidasAno : 0;

  // 4. OCUPAÇÃO ANO — dias úteis com ≥1 OP ativa
  var diasAtivos = {};
  todas.forEach(function (op) {
    var inf = op.infAdicionais || {};
    var outras = op.outrasInf || {};
    var inicio = parseDataBr_(inf.dDtInicio);
    if (!inicio || isNaN(inicio.getTime())) return;
    var fimStr = outras.dConclusao;
    var fim = parseDataBr_(fimStr);
    if (!fim || isNaN(fim.getTime())) fim = hoje; // aberta = ativa até hoje

    var cursor = new Date(inicio);
    while (cursor <= fim && cursor <= hoje) {
      if (cursor >= inicioAno) {
        var diaSemana = cursor.getDay();
        if (diaSemana !== 0 && diaSemana !== 6) { // seg a sex
          var chave = ("0" + cursor.getDate()).slice(-2) + "/" +
                      ("0" + (cursor.getMonth() + 1)).slice(-2) + "/" +
                      cursor.getFullYear();
          diasAtivos[chave] = true;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  var totalDiasUteis = 0;
  var cursorDU = new Date(inicioAno);
  while (cursorDU <= hoje) {
    var ds = cursorDU.getDay();
    if (ds !== 0 && ds !== 6) totalDiasUteis++;
    cursorDU.setDate(cursorDU.getDate() + 1);
  }
  var ocupacaoAno = totalDiasUteis > 0 ? Object.keys(diasAtivos).length / totalDiasUteis : 0;

  // ============ KPIs MÊS ============
  var mesAtual = hoje.getMonth();
  var anoAtual = hoje.getFullYear();

  // 5. PLANEJADO MÊS = OPs abertas (SKUs ativos) + concluídas no mês
  var planejadoMes = 0;
  abertas.forEach(function (op) {
    var ident = op.identificacao || {};
    if (!codParaSku[ident.nCodProduto]) return;
    planejadoMes += (ident.nQtde || 0);
  });
  concluidas.forEach(function (op) {
    var ident = op.identificacao || {};
    if (!codParaSku[ident.nCodProduto]) return;
    var conclusao = parseDataBr_((op.outrasInf && op.outrasInf.dConclusao) ||
                                 (op.infAdicionais && op.infAdicionais.dDtConclusao));
    if (conclusao && conclusao.getMonth() === mesAtual && conclusao.getFullYear() === anoAtual) {
      planejadoMes += (ident.nQtde || 0);
    }
  });

  // 6. REALIZADO MÊS — quantidades REAIS dos movimentos de estoque (OPE/entrada/28)
  var realizadoMes = 0;
  realizadoMov.forEach(function (m) {
    if (m.data.getMonth() === mesAtual && m.data.getFullYear() === anoAtual) {
      realizadoMes += m.entradas;
    }
  });

  // 7. EFICIÊNCIA MÊS
  var eficienciaMes = planejadoMes > 0 ? realizadoMes / planejadoMes : 0;

  // 8. PENDENTES MÊS = número de OPs abertas dos SKUs ativos
  var pendentesMes = 0;
  abertas.forEach(function (op) {
    var ident = op.identificacao || {};
    if (codParaSku[ident.nCodProduto]) pendentesMes++;
  });

  // Converte movimentos reais de produção pro formato que o caller (atualizarCacheOmieAutomatico)
  // espera para alimentar calcularTendencia e calcularRanking.
  // Agora usa dados REAIS de estoque (OPE/entrada/28) em vez de nQtde prevista da OP.
  var producaoParaRanking = [];
  realizadoMov.forEach(function (m) {
    producaoParaRanking.push({
      codigo: m.codigo,
      nQtde: m.entradas,
      dataStr: ("0" + m.data.getDate()).slice(-2) + "/" +
               ("0" + (m.data.getMonth() + 1)).slice(-2) + "/" +
               m.data.getFullYear()
    });
  });

  return {
    planejadoAno: planejadoAno,
    realizadoAno: realizadoAno,
    eficienciaAno: eficienciaAno,
    ocupacaoAno: ocupacaoAno,
    planejadoMes: planejadoMes,
    realizadoMes: realizadoMes,
    eficienciaMes: eficienciaMes,
    pendentesMes: pendentesMes,
    _opsConcluidas: producaoParaRanking
  };
}

function investigarMarco() {
  var cacheProd = construirCacheProdutos_();
  var prod = cacheProd["RF001"];
  Logger.log("=== RF001: codigo_produto=" + prod.codigo_produto);

  // 1) ListarOrdemProducao: tem OP de RF001 depois de fevereiro?
  Logger.log("--- OPs concluidas (RF001, mar-ago) ---");
  var ops = [];
  var p = 1, tp = 1;
  do {
    var r = chamarOmie_("/produtos/op/", "ListarOrdemProducao", {
      pagina: p, registros_por_pagina: 100,
      dDtConclusaoDe: "01/03/2026", dDtConclusaoAte: "07/08/2026",
      cConcluida: "S"
    });
    tp = r.total_de_paginas || 1;
    (r.cadastros || []).forEach(function(op) {
      var ident = op.identificacao || {};
      if (ident.nCodProduto !== prod.codigo_produto) return;
      ops.push({ op: ident.cNumOP, dt: op.outrasInf.dConclusao, planejado: ident.nQtde, nCodOP: ident.nCodOP });
    });
    p++;
  } while (p <= Math.min(tp, 3));
  Logger.log(ops.length + " OPs encontradas: " + JSON.stringify(ops.slice(0, 10)));

  // 2) ListarMovimentoEstoque SEM filtro de origem: quantas paginas? datas min/max?
  Logger.log("--- MovimentoEstoque (RF001, SEM filtro codOrigem, jan-ago) ---");
  var todas = 0;
  var dtMin = "99", dtMax = "00";
  p = 1; tp = 1;
  do {
    var mr = chamarOmie_("/estoque/consulta/", "ListarMovimentoEstoque", {
      nPagina: p, nRegPorPagina: 100,
      idProd: prod.codigo_produto,
      dDtInicial: "01/01/2026", dDtFinal: "07/08/2026",
      codigo_local_estoque: CODIGO_LOCAL_ESTOQUE_CD_DEVI
    });
    tp = mr.nTotPaginas || 1;
    var arr = mr.movProdutoListar || [];
    todas += arr.length;
    if (arr.length > 0) {
      var d0 = arr[0].dtMov, dN = arr[arr.length-1].dtMov;
      if (d0 < dtMin) dtMin = d0;
      if (dN > dtMax) dtMax = dN;
    }
    p++;
  } while (p <= tp);
  Logger.log("Total paginas=" + tp + " registros=" + todas + " dtMin=" + dtMin + " dtMax=" + dtMax);

  // 3) Se OPs existem mas movimentos nao, consultar UMA OP especifica
  if (ops.length > 0) {
    var opTeste = ops[0];
    Logger.log("--- Consultar OP " + opTeste.op + " ---");
    var cop = chamarOmie_("/produtos/op/", "ConsultarOrdemProducao", { nCodOP: opTeste.nCodOP });
    var ident = cop.identificacao;
    Logger.log("ident.nQtde=" + ident.nQtde);
    Logger.log("ident.codigo_local_estoque=" + ident.codigo_local_estoque + " (CD-DEVI=" + CODIGO_LOCAL_ESTOQUE_CD_DEVI + ")");
    Logger.log("infAd.dDtConclusao=" + cop.infAdicionais.dDtConclusao);
    Logger.log("outrasInf.dConclusao=" + cop.outrasInf.dConclusao);

    // Busca o movimento no ListarMovimentoEstoque com o codigo_local_estoque da OP
    var opLocal = ident.codigo_local_estoque;
    Logger.log("--- Buscando movimento com codigo_local_estoque=" + opLocal + " ---");
    var m2 = chamarOmie_("/estoque/consulta/", "ListarMovimentoEstoque", {
      nPagina: 1, nRegPorPagina: 100,
      idProd: ident.nCodProduto,
      dDtInicial: "01/03/2026", dDtFinal: "07/08/2026",
      codigo_local_estoque: opLocal
    });
    Logger.log("nTotPaginas=" + m2.nTotPaginas + " registros=" + (m2.movProdutoListar || []).length);
    var achou = (m2.movProdutoListar || []).filter(function(m) { return m.numPedido && m.numPedido.indexOf(opTeste.op) > -1; });
    Logger.log("Movimento da OP " + opTeste.op + ": " + JSON.stringify(achou));
  }
}

function testarSemIdProd() {
  var raw = chamarOmie_("/estoque/consulta/", "ListarMovimentoEstoque", {
    nPagina: 1,
    nRegPorPagina: 3,
    dDtInicial: "01/01/2026",
    dDtFinal: "07/08/2026",
    codigo_local_estoque: CODIGO_LOCAL_ESTOQUE_CD_DEVI
  });
  Logger.log("Keys: " + Object.keys(raw).join(", "));
  Logger.log("nTotPaginas: " + raw.nTotPaginas);
  var arr = raw.movProdutoListar || [];
  Logger.log("movProdutoListar: " + arr.length + " items");
  if (arr.length > 0) {
    Logger.log("First: " + JSON.stringify(arr[0]));
  }
}

// Diagnóstico: o endpoint rápido ListarMovimentos (usado pelo ranking) tem
// codOrigem/tipo/operacao? Se sim, podemos usar ele com filtro OPE/28.
// Diagnóstico: o que a planilha retorna para o mês atual?
// Diagnóstico: quais campos de data as OPs abertas realmente têm preenchidos?
// Investiga códigos de produto não mapeados nos SKUs ativos
function testarCodigosNaoMapeados() {
  var codigos = ["8948828611", "9077307693", "9077311664", "9077313690"];

  // Tenta buscar cada código diretamente na Omie
  codigos.forEach(function(cod) {
    try {
      var r = chamarOmie_("/geral/produtos/", "ConsultarProduto", {
        codigo_produto: parseInt(cod, 10)
      });
      Logger.log("cod:" + cod + " → " + (r.descricao || "sem descricao") +
                 " | codigo: " + (r.codigo || "?") +
                 " | ncm: " + (r.ncm || "?") +
                 " | inativo: " + (r.inativo || "?"));
    } catch(e) {
      Logger.log("cod:" + cod + " → ERRO: " + e.message);
    }
    Utilities.sleep(300);
  });

  // Também lista TODOS os produtos do cache pra ver o que temos mapeado
  var cacheProd = construirCacheProdutos_();
  Logger.log("=== SKUs mapeados no cache: " + Object.keys(cacheProd).length + " ===");
  Object.keys(cacheProd).sort().forEach(function(sku) {
    var p = cacheProd[sku];
    Logger.log(sku + " → cod:" + p.codigo_produto + " | " + p.descricao);
  });
}

function testarPlanejadoPorSku() {
  var hoje = new Date();
  var mesAtual = hoje.getMonth();
  var anoAtual = hoje.getFullYear();
  var cacheProd = construirCacheProdutos_();

  // Mapa codigo_produto → SKU
  var codParaSku = {};
  Object.keys(cacheProd).forEach(function(sku) {
    var cp = cacheProd[sku];
    if (cp && cp.codigo_produto) codParaSku[cp.codigo_produto] = sku;
  });

  // Busca OPs abertas
  var abertas = [];
  var p = 1, tp = 1;
  do {
    var r = chamarOmie_("/produtos/op/", "ListarOrdemProducao", {
      pagina: p, registros_por_pagina: 100, cConcluida: "N"
    });
    tp = r.total_de_paginas || 1;
    abertas = abertas.concat(r.cadastros || []);
    p++;
    if (p <= tp) Utilities.sleep(300);
  } while (p <= tp);

  // Agrupa por SKU
  var porSku = {};
  abertas.forEach(function(op) {
    var ident = op.identificacao || {};
    var sku = codParaSku[ident.nCodProduto] || ("cod:" + ident.nCodProduto);
    var nQtde = ident.nQtde || 0;
    if (!porSku[sku]) porSku[sku] = { qtde: 0, ops: 0 };
    porSku[sku].qtde += nQtde;
    porSku[sku].ops += 1;
  });

  // Ordena por quantidade
  var ordenado = Object.keys(porSku).sort(function(a,b) {
    return porSku[b].qtde - porSku[a].qtde;
  });

  Logger.log("=== Planejado Mês por SKU (" + abertas.length + " OPs abertas) ===");
  var total = 0;
  ordenado.forEach(function(sku) {
    var item = porSku[sku];
    total += item.qtde;
    Logger.log(sku + ": " + Math.round(item.qtde) + " un (" + item.ops + " OPs)");
  });
  Logger.log("TOTAL: " + Math.round(total) + " un");
}

function testarDatasOPs() {
  var hoje = new Date();
  var anoAtual = hoje.getFullYear();

  // Pega todas as OPs abertas
  var abertas = [];
  var p = 1, tp = 1;
  do {
    var r = chamarOmie_("/produtos/op/", "ListarOrdemProducao", {
      pagina: p, registros_por_pagina: 100, cConcluida: "N"
    });
    tp = r.total_de_paginas || 1;
    abertas = abertas.concat(r.cadastros || []);
    p++;
    if (p <= tp) Utilities.sleep(300);
  } while (p <= tp);

  Logger.log("=== OPs abertas: " + abertas.length + " ===");

  // Analisa campos de data
  var comPrevisao = 0, comInicio = 0, comConclusao = 0, semNada = 0;
  var amostras = [];

  abertas.forEach(function(op) {
    var ident = op.identificacao || {};
    var inf = op.infAdicionais || {};
    var outras = op.outrasInf || {};

    var previsao = ident.dDtPrevisao || inf.dDtPrevisao || "";
    var inicio = inf.dDtInicio || "";
    var conclusao = outras.dConclusao || "";
    var nQtde = ident.nQtde || 0;

    if (previsao) comPrevisao++;
    if (inicio) comInicio++;
    if (conclusao) comConclusao++;
    if (!previsao && !inicio && !conclusao) semNada++;

    amostras.push({
      codigo: ident.nCodProduto,
      qtde: nQtde,
      previsao: previsao,
      inicio: inicio,
      conclusao: conclusao,
      status: ident.cStatus || ""
    });
  });

  Logger.log("Com dDtPrevisao: " + comPrevisao);
  Logger.log("Com dDtInicio: " + comInicio);
  Logger.log("Com dConclusao: " + comConclusao);
  Logger.log("Sem NENHUMA data: " + semNada);
  Logger.log("=== Amostras ===");
  amostras.slice(0, 10).forEach(function(a) {
    Logger.log("cod:" + a.codigo + " qtde:" + a.qtde + " prev:" + a.previsao + " ini:" + a.inicio + " status:" + a.status);
  });
}

function testarPlanejadoPlanilha() {
  var hoje = new Date();
  var mesAtual = hoje.getMonth();
  var anoAtual = hoje.getFullYear();

  // Planejadas (col G=6)
  var planejado = buscarProducaoDaPlanilha_(6);
  Logger.log("=== Planejadas (col G) total: " + planejado.length + " linhas ===");

  // Filtra mês atual
  var noMes = planejado.filter(function(p) {
    return p.data.getMonth() === mesAtual && p.data.getFullYear() === anoAtual;
  });
  Logger.log("No mês " + (mesAtual+1) + "/" + anoAtual + ": " + noMes.length + " linhas");
  var total = 0;
  noMes.forEach(function(p) { total += p.entradas; });
  Logger.log("Total planejado mês: " + total);
  noMes.slice(0, 5).forEach(function(p) {
    Logger.log("  " + p.data.toISOString().slice(0,10) + " | " + p.codigo + " | " + p.entradas);
  });

  // Produzidas (col H=7) — pra comparar
  var produzido = buscarProducaoDaPlanilha_();
  var noMesProd = produzido.filter(function(p) {
    return p.data.getMonth() === mesAtual && p.data.getFullYear() === anoAtual;
  });
  var totalProd = 0;
  noMesProd.forEach(function(p) { totalProd += p.entradas; });
  Logger.log("Total produzido mês (col H): " + totalProd + " (" + noMesProd.length + " linhas)");
}

function testarMovimentosKeys() {
  var resultado = chamarOmie_("/estoque/movestoque/", "ListarMovimentos", {
    pagina: 1,
    registros_por_pagina: 3,
    codigo_local_estoque: CODIGO_LOCAL_ESTOQUE_CD_DEVI
  });
  Logger.log("Top-level keys: " + Object.keys(resultado).join(", "));
  var cadastros = resultado.cadastros || [];
  if (cadastros.length > 0) {
    var prod = cadastros[0];
    Logger.log("Produto keys: " + Object.keys(prod).join(", "));
    Logger.log("cCodigo: " + prod.cCodigo);
    var movs = prod.movimentos || [];
    if (movs.length > 0) {
      Logger.log("Movimento keys: " + Object.keys(movs[0]).join(", "));
      Logger.log("Sample: " + JSON.stringify(movs[0]));
    }
  }
}

function testarMovimentoEstoqueRealizadoRaw() {
  // Varredura completa: coleta todos os valores unicos de codOrigem, tipo e operacao
  // para descobrir qual combinacao representa entrada de producao
  var origens = {}, tipos = {}, operacoes = {}, entradasOpe = [];
  var pagina = 1, totalPaginas = 1;
  do {
    var raw = chamarOmie_("/estoque/consulta/", "ListarMovimentoEstoque", {
      nPagina: pagina,
      nRegPorPagina: 100,
      idProd: 8962006988, // CH001
      dDtInicial: "01/01/2026",
      dDtFinal: "07/08/2026",
      codigo_local_estoque: CODIGO_LOCAL_ESTOQUE_CD_DEVI
    });
    totalPaginas = raw.nTotPaginas || 1;
    // Loga a estrutura na primeira pagina
    if (pagina === 1) {
      Logger.log("Top-level keys: " + Object.keys(raw).join(", "));
      Logger.log("nTotPaginas: " + raw.nTotPaginas);
      // Procura qual campo contem os movimentos
      Object.keys(raw).forEach(function(k) {
        var v = raw[k];
        if (Array.isArray(v)) {
          Logger.log("Array field '" + k + "': " + v.length + " items");
          if (v.length > 0) {
            Logger.log("  first item keys: " + Object.keys(v[0]).join(", "));
          }
        }
      });
    }
    (raw.movProdutoListar || []).forEach(function(mov) {
      origens[mov.codOrigem || "null"] = mov.desOrigem || "";
      tipos[mov.tipo || "null"] = 1;
      operacoes[mov.operacao || "null"] = 1;
      // Coleta amostras de entradas (independente da origem)
      if (mov.tipo === "entrada" && mov.qtde > 0) {
        entradasOpe.push({
          codOrigem: mov.codOrigem,
          desOrigem: mov.desOrigem,
          operacao: mov.operacao,
          qtde: mov.qtde,
          dtMov: mov.dtMov,
          numPedido: mov.numPedido
        });
      }
    });
    pagina++;
  } while (pagina <= totalPaginas);

  Logger.log("=== Valores unicos no ListarMovimentoEstoque (CH001, 2026) ===");
  Logger.log("codOrigem: " + JSON.stringify(origens));
  Logger.log("tipo: " + JSON.stringify(Object.keys(tipos)));
  Logger.log("operacao: " + JSON.stringify(Object.keys(operacoes)));
  Logger.log("=== Entradas (tipo=entrada, qtde>0): " + entradasOpe.length + " ===");
  Logger.log(JSON.stringify(entradasOpe.slice(0, 5), null, 2));
}

function testarMovimentoEstoqueRealizado() {
  var cacheProd = construirCacheProdutos_();
  var resultado = buscarMovimentoEstoqueRealizado_(cacheProd);
  Logger.log("Total de movimentos OPE realizados: " + resultado.length);
  Logger.log("Amostra: " + JSON.stringify(resultado.slice(0, 5), null, 2));
  var totais = {};
  resultado.forEach(function(m) {
    totais[m.codigo] = (totais[m.codigo] || 0) + m.entradas;
  });
  Logger.log("Totais por SKU: " + JSON.stringify(totais, null, 2));
}

function testarSiglasDaPlanilha() {
  var ss = getSpreadsheet();
  var loteSheet = ss.getSheetByName(LOTE_SHEET_NAME);
  if (!loteSheet) { Logger.log("Aba '" + LOTE_SHEET_NAME + "' nao encontrada."); return; }
  var lastRow = loteSheet.getLastRow();
  var vals = loteSheet.getRange(5, 1, lastRow - 4, 8).getValues();
  var siglas = {};
  vals.forEach(function(row) {
    var d = row[0];
    if (Object.prototype.toString.call(d) !== "[object Date]" || isNaN(d)) return;
    var sigla = String(row[1] || "").trim();
    var sufixo = String(row[2] || "").trim();
    if (!sigla) return;
    var produzida = toNumber(row[7]) || 0;
    if (!siglas[sigla]) siglas[sigla] = { total: 0, sufixos: {} };
    siglas[sigla].total += produzida;
    if (sufixo) siglas[sigla].sufixos[sufixo] = (siglas[sigla].sufixos[sufixo] || 0) + produzida;
  });
  Logger.log("=== Siglas unicas na Planilha PCP ===");
  Object.keys(siglas).sort().forEach(function(s) {
    Logger.log(s + ": " + siglas[s].total.toLocaleString("pt-BR") + " latas" +
      (Object.keys(siglas[s].sufixos).length > 0 ? " (sufixos: " + JSON.stringify(siglas[s].sufixos) + ")" : ""));
  });
}

function contarLatasRF001DaPlanilha() {
  var ss = getSpreadsheet();
  var loteSheet = ss.getSheetByName(LOTE_SHEET_NAME);
  if (!loteSheet) { Logger.log("Aba '" + LOTE_SHEET_NAME + "' nao encontrada."); return; }

  var lastRow = loteSheet.getLastRow();
  var vals = loteSheet.getRange(5, 1, lastRow - 4, 8).getValues(); // A:H a partir da linha 5
  var total = 0, porMes = {};
  var hoje = new Date();
  var dataLimite = new Date(hoje.getFullYear(), hoje.getMonth() - 7, 1);

  vals.forEach(function(row) {
    var d = row[0];
    if (Object.prototype.toString.call(d) !== "[object Date]" || isNaN(d)) return;
    var sigla = String(row[1] || "").trim();
    var sufixo = String(row[2] || "").trim();
    var siglaCompleta = sufixo.toLowerCase().includes("sem") || !sufixo ? sigla : sigla + sufixo;
    // RF001 = RLS na planilha
    if (sigla !== "RLS" && sigla !== "RF001") return;
    var produzida = toNumber(row[7]) || 0;
    total += produzida;
    var mes = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    porMes[mes] = (porMes[mes] || 0) + produzida;
  });

  Logger.log("=== RF001 na planilha PCP (todos os tempos) ===");
  Logger.log("Total: " + total.toLocaleString("pt-BR"));
  Logger.log("Por mes: " + JSON.stringify(porMes, null, 2));

  // Agora compara com o Omie
  var doOmie = 0;
  var omiePorMes = {};
  var cacheProd = construirCacheProdutos_();
  var movimentos = buscarMovimentosEstoqueSKUsAtivos_();
  movimentos.forEach(function(m) {
    if (m.codigo !== "RF001") return;
    doOmie += m.entradas;
    var mes = m.data.getFullYear() + "-" + String(m.data.getMonth() + 1).padStart(2, "0");
    omiePorMes[mes] = (omiePorMes[mes] || 0) + m.entradas;
  });

  Logger.log("=== RF001 via Omie (8 meses, nQtdeEntradas) ===");
  Logger.log("Total: " + doOmie.toLocaleString("pt-BR"));
  Logger.log("Por mes: " + JSON.stringify(omiePorMes, null, 2));
}

function testarMovimentosEstoque() {
  // COM filtro de data (igual ao gatilho)
  const resultado = buscarMovimentosEstoqueSKUsAtivos_();
  Logger.log("=== COM filtro data_inicial/data_final (8 meses) ===");
  Logger.log("Total de movimentos: " + resultado.length);
  var totais = {};
  resultado.forEach(function(m) {
    totais[m.codigo] = (totais[m.codigo] || 0) + m.entradas;
  });
  Logger.log("Totais por SKU: " + JSON.stringify(totais, null, 2));

  // SEM filtro de data — primeiras 5 páginas, MOSTRANDO AS DATAS
  var semFiltro = [];
  var p = 1, tp = 1;
  do {
    var r = chamarOmie_("/estoque/movestoque/", "ListarMovimentos", {
      pagina: p,
      registros_por_pagina: 100,
      codigo_local_estoque: CODIGO_LOCAL_ESTOQUE_CD_DEVI
    });
    tp = r.total_de_paginas || 1;
    (r.cadastros || []).forEach(function(prod) {
      if (SKUS_ATIVOS.indexOf(prod.cCodigo) === -1) return;
      (prod.movimentos || []).forEach(function(mov) {
        var d = parseDataBr_(mov.dDataMovimento);
        if (!d) return;
        var e = mov.nQtdeEntradas || 0;
        if (e <= 0) return;
        semFiltro.push({ codigo: prod.cCodigo, entradas: e, data: d.toISOString().slice(0,10) });
      });
    });
    p++;
  } while (p <= Math.min(tp, 5));
  Logger.log("=== SEM filtro (primeiras 5 páginas, com datas) ===");
  Logger.log("Total: " + semFiltro.length);
  // Mostra a distribuição de datas (ano-mês) dos movimentos sem filtro
  var porMes = {};
  semFiltro.forEach(function(m) {
    var mes = m.data.slice(0, 7); // "2026-01"
    porMes[mes] = (porMes[mes] || 0) + m.entradas;
  });
  Logger.log("Distribuição mensal (entradas): " + JSON.stringify(porMes, null, 2));
}

// Testa a busca do nome de um cliente específico — troca o código abaixo por
// um "codigo_cliente" real (aparece dentro do cabecalho de ConsultarPedido).
function testarConsultarCliente() {
  const CODIGO_CLIENTE_DE_TESTE = 9197025903; // exemplo já visto num pedido real
  const resultado = chamarOmie_("/geral/clientes/", "ConsultarCliente", {
    codigo_cliente_omie: CODIGO_CLIENTE_DE_TESTE
  });
  Logger.log(JSON.stringify(resultado, null, 2));
}

// ============================================================================
// GRAVADOR AUTOMÁTICO DOS INDICADORES OMIE
// ============================================================================
// Mesmo padrão que já usamos pro dashboard de produção: roda sozinho, num
// gatilho de tempo, escreve numa aba oculta publicada como CSV — a página
// indicadores.html só lê esse CSV, nunca toca na API do Omie diretamente.
//
// COMO CONFIGURAR (uma vez só):
//
// 1. No editor do Apps Script, ícone de relógio ⏰ (Acionadores).
// 2. "+ Adicionar acionador":
//      - Função: atualizarCacheOmieAutomatico
//      - Origem do evento: Baseado em tempo
//      - Tipo: Temporizador por minutos
//      - Intervalo: A cada 15 ou 30 minutos (indicadores financeiros/estoque
//        não precisam ser tão frequentes quanto o dashboard de produção)
// 3. Confirme que surgiu a aba "_IndicadoresOmie" na planilha.
// 4. Arquivo > Compartilhar > Publicar na Web > escolha a aba
//    "_IndicadoresOmie" > formato CSV > Publicar > copie o link.
// 5. Cole esse link no arquivo indicadores.html, na constante CSV_URL.
// ============================================================================

const CACHE_OMIE_SHEET_NAME = "_IndicadoresOmie";
const CACHE_FILA_SHEET = "_FilaOmie";
const CACHE_ESTOQUE_SHEET = "_EstoqueOmie";
const CACHE_RANKING_SHEET = "_RankingOmie";

function _getOrCreateSheet(name) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); sheet.hideSheet(); }
  return sheet;
}

// Garante intervalo mínimo entre execuções do mesmo trigger (evita "consumo redundante")
function _podeExecutar(nome, segundosMin) {
  var cache = CacheService.getScriptCache();
  var chave = "lock_" + nome;
  var ultimo = cache.get(chave);
  var agora = Date.now();
  if (ultimo && (agora - parseInt(ultimo, 10)) < segundosMin * 1000) {
    Logger.log("⏳ " + nome + " pulou: ultima execucao foi ha " + Math.round((agora - parseInt(ultimo,10))/1000) + "s");
    return false;
  }
  cache.put(chave, String(agora), 21600); // 6h TTL
  return true;
}

// Trigger individual: só Fila de Pedidos (rápido, ~15s)
function atualizarFilaAutomatico() {
  if (!_podeExecutar("fila", 180)) return;
  var data = { geradoEm: new Date().toISOString() };
  try {
    data.filaDePedidos = buscarFilaDePedidos();
    Logger.log("✅ Fila: " + data.filaDePedidos.length + " pedidos");
  } catch (err) {
    data.filaDePedidos = { erro: err.message };
    Logger.log("❌ Fila falhou: " + err.message);
  }
  _getOrCreateSheet(CACHE_FILA_SHEET).getRange("A1").setValue(JSON.stringify(data));
}

// Trigger individual: só Estoque (médio, ~15s com batch)
function atualizarEstoqueAutomatico() {
  if (!_podeExecutar("estoque", 360)) return;
  var data = { geradoEm: new Date().toISOString() };
  var cacheProd = construirCacheProdutos_();
  try {
    data.estoque = buscarEstoque(cacheProd);
    Logger.log("✅ Estoque: " + data.estoque.length + " SKUs");
  } catch (err) {
    data.estoque = { erro: err.message };
    Logger.log("❌ Estoque falhou: " + err.message);
  }
  _getOrCreateSheet(CACHE_ESTOQUE_SHEET).getRange("A1").setValue(JSON.stringify(data));
}

// Trigger individual: só Ranking + Tendência (médio, ~30s com ListarOrdemProducao)
// Detalha a produção de cada mês por SKU (pro diagnóstico automatizado).
// Retorna { "Jan": { "CH001": 5000, ... }, "Fev": {...}, ... }
function _detalharProducaoMensal(producao, meses) {
  var detalhe = {};
  meses.forEach(function (mesLabel, i) {
    detalhe[mesLabel] = {};
  });

  producao.forEach(function (p) {
    var mesIdx = p.data.getMonth();
    var mesLabel = MESES_ABREV[mesIdx];
    if (!detalhe[mesLabel]) return;
    detalhe[mesLabel][p.codigo] = (detalhe[mesLabel][p.codigo] || 0) + p.entradas;
  });

  return detalhe;
}

function atualizarRankingAutomatico() {
  if (!_podeExecutar("ranking", 600)) return;
  var data = { geradoEm: new Date().toISOString() };
  var cacheProd = construirCacheProdutos_();
  try {
    var descricoes = {};
    Object.keys(cacheProd).forEach(function(k) { descricoes[k] = abreviarDescricao_(k, cacheProd[k].descricao); });
    var producao = buscarOPsConcluidas_(cacheProd);
    data.tendenciaProducao = calcularTendenciaDeMovimentos_(producao);
    data.rankingProducao = calcularRankingDeMovimentos_(producao, descricoes);
    data.detalheMensal = _detalharProducaoMensal(producao, data.tendenciaProducao.meses);
    Logger.log("✅ Ranking: " + producao.length + " OPs concluidas");
  } catch (err) {
    data.tendenciaProducao = { erro: err.message };
    data.rankingProducao = { erro: err.message };
    data.detalheMensal = { erro: err.message };
    Logger.log("❌ Ranking falhou: " + err.message);
  }
  _getOrCreateSheet(CACHE_RANKING_SHEET).getRange("A1").setValue(JSON.stringify(data));
}

// Trigger completo (todos os indicadores) — mantido por compatibilidade
function atualizarCacheOmieAutomatico() {
  const ss = getSpreadsheet();
  let cacheSheet = ss.getSheetByName(CACHE_OMIE_SHEET_NAME);
  if (!cacheSheet) {
    cacheSheet = ss.insertSheet(CACHE_OMIE_SHEET_NAME);
    cacheSheet.hideSheet();
  }

  const data = { geradoEm: new Date().toISOString() };

  // Cache de produtos compartilhado (evita dupla chamada ao ListarProdutos)
  var cacheProd = construirCacheProdutos_();

  // Cada indicador é buscado separadamente, e um erro num não derruba os
  // outros — assim, se o Omie tiver algum soluço num indicador específico,
  // os outros continuam atualizando normalmente. Cada erro também vai pro
  // Log de execução, pra facilitar diagnóstico sem precisar testar um por um.
  try {
    data.filaDePedidos = buscarFilaDePedidos();
    Logger.log("✅ Fila de Pedidos: " + data.filaDePedidos.length + " pedidos");
  } catch (err) {
    data.filaDePedidos = { erro: err.message };
    Logger.log("❌ Fila de Pedidos falhou: " + err.message);
  }

  try {
    data.estoque = buscarEstoque(cacheProd);
    Logger.log("✅ Estoque: " + data.estoque.length + " SKUs");
  } catch (err) {
    data.estoque = { erro: err.message };
    Logger.log("❌ Estoque falhou: " + err.message);
  }

  // KPIs + Ranking/Tendência: UMA ÚNICA chamada ao ListarOrdemProducao.
  // buscarKPIsOmie() devolve _opsConcluidas com {nCodProduto, nQtde, dataStr}
  // que reaproveitamos pra tendência/ranking — sem segunda chamada ao mesmo
  // endpoint (evita "Consumo redundante" da Omie).

  // Respiro antes dos KPIs: Fila + Estoque já consumiram chamadas da Omie.
  // Dar 5s pra janela de rate limit respirar evita 429 em cascata.
  Logger.log("⏸️  Aguardando 5s antes dos KPIs (respiro pós Fila+Estoque)...");
  Utilities.sleep(5000);

  var kpisResult = null;
  try {
    kpisResult = buscarKPIsOmie(cacheProd);
    data.kpis = {
      planejadoAno: kpisResult.planejadoAno,
      realizadoAno: kpisResult.realizadoAno,
      eficienciaAno: kpisResult.eficienciaAno,
      ocupacaoAno: kpisResult.ocupacaoAno,
      planejadoMes: kpisResult.planejadoMes,
      realizadoMes: kpisResult.realizadoMes,
      eficienciaMes: kpisResult.eficienciaMes,
      pendentesMes: kpisResult.pendentesMes
    };
    Logger.log("✅ KPIs Omie calculados");
  } catch (err) {
    data.kpis = { erro: err.message };
    Logger.log("❌ KPIs Omie falharam: " + err.message);
  }

  // Tendência/Ranking: reaproveita os dados de OPs concluídas já buscados
  try {
    var descricoes = {};
    Object.keys(cacheProd).forEach(function(k) { descricoes[k] = abreviarDescricao_(k, cacheProd[k].descricao); });

    var producao = [];
    // _opsConcluidas agora vem dos movimentos reais (OPE/entrada/28) e já inclui o SKU
    if (kpisResult && kpisResult._opsConcluidas) {
      kpisResult._opsConcluidas.forEach(function(op) {
        if (!op.codigo) return;
        var data = parseDataBr_(op.dataStr);
        if (!data) return;
        producao.push({ codigo: op.codigo, data: data, entradas: op.nQtde });
      });
    }

    data.tendenciaProducao = calcularTendenciaDeMovimentos_(producao);
    data.rankingProducao = calcularRankingDeMovimentos_(producao, descricoes);
    Logger.log("✅ Tendência/Ranking (dos KPIs): " + producao.length + " OPs");
  } catch (err) {
    data.tendenciaProducao = { erro: err.message };
    data.rankingProducao = { erro: err.message };
    Logger.log("❌ Tendência/Ranking falhou: " + err.message);
  }

  cacheSheet.getRange("A1").setValue(JSON.stringify(data));
  Logger.log("Gravação concluída às " + new Date().toLocaleTimeString());
}