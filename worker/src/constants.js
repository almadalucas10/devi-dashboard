// ============================================================================
// CONSTANTES — Dashboard PCP Bebidas (Cloudflare Worker)
// Migrado de apps_script_dashboard_api.gs
// ============================================================================

// Google Sheets
export const SPREADSHEET_ID = "1dVTXuNhf9QWrz0kyh7i9S0SNJ43O5GZD";
export const SHEET_NAMES = {
  dashboard: "Dashboard",
  lote: "Produção por Lote",
  trend: "Realizado Mensal por SKU",
  cacheDashboard: "_DashboardCache",
  cacheOmie: "_IndicadoresOmie",
  cacheFila: "_FilaOmie",
  cacheEstoque: "_EstoqueOmie",
  cacheRanking: "_RankingOmie",
};

// CSV GIDs (para referência — o frontend usa os CSVs publicados como fallback)
export const GID_DASHBOARD_CACHE = "1158403049";
export const GID_INDICADORES_OMIE = "1172546852";

// Omie
export const CODIGO_LOCAL_ESTOQUE_CD_DEVI = 3125334492; // "CD DÊVI - PRODUTO ACABADO"

// SKUs ativos (17)
export const SKUS_ATIVOS = [
  "CH001", "CH002", "CH003", "CH004",
  "FX001", "FX002", "FX003", "FX006", "FX007",
  "RF001", "RF002", "RF003", "RF004", "RF005",
  "RTM001", "RTM002", "RTM003",
];

// SKU → nome curto para exibição
export const NOME_CURTO = {
  CH001: "Chá Verde Pêssego",
  CH002: "Chá Hibisco Morango",
  CH003: "Chá Camomila Maracujá",
  CH004: "Chá Mate Limão",
  FX001: "Komb Frutas Vermelhas",
  FX002: "Komb Abacaxi Gengibre",
  FX003: "Komb Maçã Gengibre",
  FX006: "Komb Mirtilo Morango",
  FX007: "Komb Pink Lemonade",
  RF001: "Refri Limão Siciliano",
  RF002: "Refri Frutas Vermelhas",
  RF003: "Refri Guaraná Açaí",
  RF004: "Refri Uva",
  RF005: "Refri Laranja",
  RTM001: "Refri Limão Mônica",
  RTM002: "Refri Uva Mônica",
  RTM003: "Refri Laranja Mônica",
};

// Sigla da planilha "Produção por Lote" → SKU Omie
export const PLANILHA_PARA_SKU = {
  CVP: "CH001", CHM: "CH002", CCM: "CH003", CML: "CH004",
  KFV: "FX001", KABX: "FX002", "KMÇ": "FX003", KMC: "FX003",
  KMIR: "FX006", KPL: "FX007",
  RLS: "RF001", RFV: "RF002", RGA: "RF003", RUV: "RF004", RLA: "RF005",
  RTMLS: "RTM001", RTMUV: "RTM002", RTMLA: "RTM003",
  CHMSAMS: null, CMLSAMS: null, CVPSAMS: null, RLSSAMS: null, RTMSAMS: null,
  "RFV/RGASAMS": null,
};

export const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export const MONTH_MAP = {
  janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

// Etapas de pedido (Omie → label)
export const ETAPA_LABELS = {
  "00": "Orçamento", "10": "Em carteira", "20": "Em separação",
  "30": "Em separação", "40": "Faturamento parcial",
  "50": "A faturar", "60": "Faturado",
};

// R2 keys
export const R2_KEYS = {
  dashboard: "dashboard.json",
  omie: "omie.json",
  syncMeta: "sync-meta.json",
  token: "google-token.json",
};
