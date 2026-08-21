// ============================================================================
// Pages Functions middleware — proteção por OAuth Google (@devikombucha.com)
// Substitui o antigo Basic Auth por senha. Ver: functions/_oauth.js
// ============================================================================
import { NOME_COOKIE, cookieValido } from "./_oauth.js";

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  // Sem credenciais OAuth configuradas, o painel segue aberto (não derruba o site)
  if (!env.GOOGLE_CLIENT_ID) return next();

  // Rotas de autenticação passam por fora do bloqueio (login/callback/logout)
  if (url.pathname.startsWith("/oauth/")) return next();

  // Já autenticado via cookie de sessão → segue
  const sessao = await cookieValido(env, request.headers.get("Cookie") || "");
  if (sessao) return next();

  // Não autenticado → redireciona para /oauth/login (mantém o caminho original)
  return Response.redirect(("/oauth/login?cb=" + encodeURIComponent(url.pathname + url.search)), 302);
}
