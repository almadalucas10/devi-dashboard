// Inicia o fluxo: redireciona o navegador para o Google (Sign in with Google).
import { montaUrlLogin } from "../_oauth.js";

export async function onRequestPost({ request, env }) {
  const form = await request.formData().catch(() => null);
  const cb = (form && form.get("cb")) || "/";

  const url = new URL(request.url);
  let redirectUri = env.GOOGLE_REDIRECT_URI;
  if (!redirectUri) redirectUri = url.origin + "/oauth/callback";

  const googleUrl = await montaUrlLogin(env, redirectUri, cb);
  return Response.redirect(googleUrl, 302);
}
