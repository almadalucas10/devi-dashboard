// ============================================================================
// Cliente Omie API — com backoff exponencial + jitter
// Port de chamarOmie_() de apps_script_dashboard_api.gs (linhas 437-497)
// ============================================================================

const MAX_TENTATIVAS = 8;
const BASE_URL = "https://app.omie.com.br/api/v1";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Chama a API Omie com retry e backoff.
 * @param {object} env - Worker env (contém OMIE_APP_KEY, OMIE_APP_SECRET)
 * @param {string} caminho - Path relativo (ex: "/produtos/op/")
 * @param {string} metodo - Método Omie (ex: "ListarOrdemProducao")
 * @param {object} [params={}] - Parâmetros da chamada
 * @returns {Promise<object>} Resposta parseada da Omie
 */
export async function chamarOmie(env, caminho, metodo, params = {}) {
  const { OMIE_APP_KEY, OMIE_APP_SECRET } = env;
  if (!OMIE_APP_KEY || !OMIE_APP_SECRET) {
    throw new Error("OMIE_APP_KEY e OMIE_APP_SECRET são obrigatórios. Configure via wrangler secret put.");
  }

  const payload = {
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    call: metodo,
    param: [params],
  };

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    let res;
    try {
      res = await fetch(BASE_URL + caminho, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      if (tentativa === MAX_TENTATIVAS) throw new Error(`Rede Omie falhou: ${e.message}`);
      await sleep(2000 + Math.random() * 1000);
      continue;
    }

    const status = res.status;
    const texto = await res.text();

    // 429 — rate limit: backoff exponencial com jitter
    if (status === 429) {
      if (tentativa === MAX_TENTATIVAS) {
        throw new Error(`Omie continuou limitando (429) mesmo após ${MAX_TENTATIVAS} tentativas.`);
      }
      const retryAfter = parseInt(res.headers.get("Retry-After") || "0", 10);
      if (retryAfter > 0) {
        console.log(`⏳ Omie pediu ${retryAfter}s (Retry-After). Aguardando...`);
        await sleep(retryAfter * 1000);
      } else if (tentativa === 1) {
        // Primeiro 429: cooldown longo de 65s pra resetar janela de rate limit
        console.log("⏳ Primeiro 429 — cooldown de 65s...");
        await sleep(65000);
      } else {
        const base = Math.pow(2, tentativa + 1) * 1000; // 8s → 16s → 32s → 64s
        const jitter = Math.random() * 3000;
        console.log(`⏳ Backoff ${(base + jitter) / 1000}s (tentativa ${tentativa}/${MAX_TENTATIVAS})`);
        await sleep(base + jitter);
      }
      continue;
    }

    // Trata REDUNDANT mesmo em HTTP 500
    if (status !== 200) {
      if (texto.includes("REDUNDANT") || texto.includes("Consumo redundante")) {
        const match = texto.match(/Aguarde (\d+) segundos/);
        const espera = match ? parseInt(match[1], 10) * 1000 : 45000;
        console.log(`⏳ Omie REDUNDANT (HTTP ${status}), aguardando ${espera / 1000}s...`);
        await sleep(espera);
        if (tentativa === MAX_TENTATIVAS) {
          throw new Error(`Omie continuou redundante mesmo após ${MAX_TENTATIVAS} tentativas.`);
        }
        continue;
      }
      throw new Error(`Omie retornou status ${status}: ${texto.slice(0, 200)}`);
    }

    let resultado;
    try {
      resultado = JSON.parse(texto);
    } catch (e) {
      throw new Error(`Omie retornou JSON inválido: ${texto.slice(0, 200)}`);
    }

    // Consumo redundante — Omie pede espera explícita
    if (resultado.faultstring && resultado.faultstring.includes("REDUNDANT")) {
      const match = resultado.faultstring.match(/Aguarde (\d+) segundos/);
      const espera = match ? parseInt(match[1], 10) * 1000 : 45000;
      console.log(`⏳ Omie: Consumo redundante, aguardando ${espera / 1000}s...`);
      await sleep(espera);
      if (tentativa === MAX_TENTATIVAS) {
        throw new Error(`Omie continuou redundante mesmo após ${MAX_TENTATIVAS} tentativas.`);
      }
      continue;
    }

    if (resultado.faultstring) {
      throw new Error(`Omie API: ${resultado.faultstring}`);
    }

    return resultado;
  }
}

// ============================================================================
// Funções paginadas — port dos helpers do Apps Script
// ============================================================================

/**
 * Busca TODAS as páginas de um endpoint paginado da Omie.
 * @param {object} env
 * @param {string} caminho
 * @param {string} metodo
 * @param {function} buildParams - (pagina) => objeto de parâmetros
 * @param {object} opts
 * @param {string} [opts.arrayKey] - chave do array no resultado (ex: "cadastros")
 * @param {string} [opts.totalPagesKey] - chave do total de páginas (default: "total_de_paginas")
 * @param {number} [opts.pageDelay] - ms entre páginas (default: 300)
 * @param {number} [opts.maxPages] - limite de páginas (default: 100)
 * @returns {Promise<Array>}
 */
export async function buscarTodasPaginas(env, caminho, metodo, buildParams, opts = {}) {
  const {
    arrayKey = "cadastros",
    totalPagesKey = "total_de_paginas",
    pageDelay = 300,
    maxPages = 100,
  } = opts;

  const results = [];
  let pagina = 1;
  let totalPaginas = 1;

  do {
    const params = buildParams(pagina);
    const result = await chamarOmie(env, caminho, metodo, params);
    totalPaginas = result[totalPagesKey] || result.nTotPaginas || 1;

    const arr = result[arrayKey] || [];
    results.push(...arr);

    pagina++;
    if (pagina <= totalPaginas && pagina <= maxPages) {
      await sleep(pageDelay);
    }
  } while (pagina <= totalPaginas && pagina <= maxPages);

  return results;
}

/**
 * Busca TODAS as páginas de ListarOrdemProducao.
 * Este endpoint usa as chaves: "cadastros" e "total_de_paginas".
 */
export async function buscarOPs(env, paramsBase = {}) {
  return buscarTodasPaginas(env, "/produtos/op/", "ListarOrdemProducao", (pagina) => ({
    pagina,
    registros_por_pagina: 100,
    ...paramsBase,
  }));
}

/**
 * Busca TODAS as páginas de ListarMovimentoEstoque para um SKU específico.
 * Chaves: "movProdutoListar", "nTotPaginas".
 */
export async function buscarMovimentoEstoque(env, idProd, dataInicio, dataFim) {
  return buscarTodasPaginas(
    env,
    "/estoque/consulta/",
    "ListarMovimentoEstoque",
    (pagina) => ({
      nPagina: pagina,
      nRegPorPagina: 100,
      idProd,
      dDtInicial: dataInicio,
      dDtFinal: dataFim,
      codigo_local_estoque: 3125334492, // CD DEVI
    }),
    { arrayKey: "movProdutoListar", totalPagesKey: "nTotPaginas" }
  );
}

/**
 * Busca produtos via ListarProdutos (paginated).
 */
export async function buscarProdutos(env) {
  return buscarTodasPaginas(env, "/geral/produtos/", "ListarProdutos", (pagina) => ({
    pagina,
    registros_por_pagina: 100,
  }));
}

/**
 * Consulta um produto específico por código.
 */
export async function consultarProduto(env, codigo) {
  return chamarOmie(env, "/geral/produtos/", "ConsultarProduto", { codigo });
}
