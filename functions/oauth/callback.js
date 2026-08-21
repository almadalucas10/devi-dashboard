// CALLBACK do Google: troca code → e-mail, valida domínio, define cookie, redireciona.
import { montaUrlLogin, trocarCodePorEmail, valorCookie } from "../_oauth.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const erro = url.searchParams.get("error");
  const stateRaw = url.searchParams.get("state");

  let redirectUri = env.GOOGLE_REDIRECT_URI || url.origin + "/oauth/callback";

  let cb = "/";
  if (stateRaw) {
    try { cb = (JSON.parse(stateRaw).cb || "/"); } catch (e) { cb = "/"; }
  }
  cb = String(cb || "/");

  if (erro) {
    return Response.redirect(new URL("/oauth/login?cb=" + encodeURIComponent(cb) + "&erro=" + encodeURIComponent(erro), request.url), 302);
  }
  if (!code) {
    return Response.redirect(new URL("/oauth/login?cb=" + encodeURIComponent(cb) + "&erro=" + encodeURIComponent("sem_code"), request.url), 302);
  }

  try {
    const { email } = await trocarCodePorEmail(env, redirectUri, code);
    const { exp, valor } = await valorCookie(env, email);
    const maxAge = Math.max(1, Math.floor((exp - Date.now()) / 1000));
    return new Response(null, {
      status: 302,
      headers: {
        Location: cb,
        "Set-Cookie":
          `devi_session=${valor}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  } catch (e) {
    return Response.redirect(new URL("/oauth/login?cb=" + encodeURIComponent(cb) + "&erro=" + encodeURIComponent(e.message), request.url), 302);
  }
}
