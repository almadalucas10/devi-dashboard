// ============================================================================
// OAuth Google (Sign in with Google) — restrito ao domínio @devikombucha.com
// Uso em Pages Functions: dashboard, painel de qualidade e portal de fichas.
//
// Variáveis (secrets/vars do Pages):
//   GOOGLE_CLIENT_ID      — OAuth 2.0 Client ID (tipo "Web") no Google Cloud Console
//   GOOGLE_CLIENT_SECRET  — secret do mesmo client
//   GOOGLE_REDIRECT_URI   — ex.: https://dashboard.devikombucha.com/oauth/callback
//   ALLOWED_EMAIL_DOMAIN  — ex.: "devikombucha.com" (padrão; só esse domínio entra)
//   AUTH_SECRET           — chave p/ assinar o cookie de sessão (≥ 32 chars, aleatória)
//
// fail-closed: envia hd=devikombucha.com e valida claim "hd"/sufixo do e-mail.
// ============================================================================

export const NOME_COOKIE = "devi_session";

const DOMAIN = "devikombucha.com";

function b64urlDecode(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(b64 + pad);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

export function dominioPermitido(email, hd) {
  if (hd && String(hd).toLowerCase() === DOMAIN) return true;
  return !!email && String(email).toLowerCase().endsWith("@" + DOMAIN);
}

export async function criaHmacHex(chave, texto) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(chave),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(texto));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Monta a URL de redirecionamento para o Google (openid) com o caminho de retorno `cb`. */
export async function montaUrlLogin(env, redirectUri, cb) {
  const cbVal = String(cb || "/");
  const cbPath = cbVal.startsWith("http")
    ? new URL(cbVal).pathname + new URL(cbVal).search
    : (cbVal.startsWith("/") ? cbVal : "/" + cbVal);
  const cliente = env.GOOGLE_CLIENT_ID;
  const state = await criaHmacHex(env.AUTH_SECRET || "s", cbPath + ":" + Date.now());
  const qs = new URLSearchParams({
    client_id: cliente,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    hd: DOMAIN,
    state: JSON.stringify({ cb: cbPath, nonce: state }),
    prompt: "select_account",
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + qs.toString();
}

/** Troca o code por e-mail (valida domínio). Retorna { email, nome }. */
export async function trocarCodePorEmail(env, redirectUri, code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error("Google token falhou: " + res.status + " " + txt.slice(0, 200));
  }
  const data = await res.json();
  if (!data.id_token) throw new Error("Google não retornou id_token");
  const claims = b64urlDecode(data.id_token.split(".")[1]);
  const email = claims.email || "";
  if (!dominioPermitido(email, claims.hd)) {
    throw new Error("Conta não autorizada — só e-mails @" + DOMAIN + " entram.");
  }
  return { email: String(email).toLowerCase(), nome: claims.name || "", hd: claims.hd || "" };
}

/** Gera o valor do cookie de sessão assinado (exp|email|mac). */
export async function valorCookie(env, email, ttlMs = 12 * 3600 * 1000) {
  const exp = Date.now() + ttlMs;
  const mac = await criaHmacHex(env.AUTH_SECRET || "", `${exp}|${email}`);
  return { exp, valor: `${exp}|${email}|${mac}` };
}

/** Valida um cookie de sessão. Retorna e-mail ou null. */
export async function cookieValido(env, cookie) {
  if (!cookie) return null;
  const m = /devi_session=([^;]+)/.exec(cookie);
  if (!m) return null;
  const raw = m[1];
  const partes = raw.split("|");
  if (partes.length !== 3) return null;
  const [exp, email, mac] = partes;
  if (Number(exp) < Date.now()) return null;
  const esperado = await criaHmacHex(env.AUTH_SECRET || "", `${exp}|${email}`);
  if (!tmEq(esperado, mac)) return null;
  return dominioPermitido(email, "") ? email : null;
}

function tmEq(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
