// Página de login — mostra o botão "Entrar com Google" (Sign in with Google).
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const erro = url.searchParams.get("erro") || "";
  const cb = url.searchParams.get("cb") || "/";

  if (!env.GOOGLE_CLIENT_ID) {
    return new Response("OAuth não configurado (GOOGLE_CLIENT_ID ausente).", { status: 503 });
  }

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acesso · Dêvi Kombucha</title>
<style>
  body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0f1720;color:#e5e7eb;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{background:#1a2430;border:1px solid #2a3a4a;border-radius:12px;padding:34px 30px;width:min(90vw,380px);text-align:center}
  h1{font-size:20px;margin:0 0 6px}
  p{color:#9aa8b6;margin:0 0 20px;font-size:14px}
  .btn{display:inline-flex;align-items:center;gap:10px;background:#fff;color:#1a2430;font-weight:600;border-radius:8px;padding:11px 18px;text-decoration:none;font-size:15px;box-shadow:0 1px 3px rgba(0,0,0,.3)}
  .btn svg{width:20px;height:20px}
  .err{background:#3a1520;border:1px solid #7a2b3f;color:#f0a7bb;border-radius:8px;padding:9px 12px;margin-bottom:16px;font-size:13px;text-align:left;word-break:break-word}
  .foot{color:#5b6a78;font-size:12px;margin-top:18px}
</style>
</head>
<body>
  <form class="card" action="/oauth/start" method="POST">
    <h1>Acesso restrito</h1>
    <p>Entre com sua conta <b>@devikombucha.com</b> para continuar.</p>
    ${erro ? `<div class="err">${erro}</div>` : ""}
    <button type="submit" class="btn">
      <svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      Entrar com Google
    </button>
    <input type="hidden" name="cb" value="${cb}">
    <div class="foot">Apenas contas do domínio @devikombucha.com</div>
  </form>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
