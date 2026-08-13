const COOKIE = 'pcp_auth';

export async function onRequest({ request, env, next }) {
  const senha = env.DASH_SENHA;

  // sem senha configurada, o painel segue aberto —
  // evita derrubar o dashboard se a variável faltar
  if (!senha) return next();

  const url = new URL(request.url);
  const cookies = request.headers.get('Cookie') || '';

  if (cookies.includes(`${COOKIE}=${senha}`)) return next();

  const liberar = () => new Response(null, {
    status: 302,
    headers: {
      'Location': url.pathname,
      'Set-Cookie': `${COOKIE}=${senha}; Path=/; Max-Age=31536000; Secure; SameSite=Lax`
    }
  });

  // entrada da TV: ?k=SENHA
  if (url.searchParams.get('k') === senha) return liberar();

  // entrada por navegador: Basic Auth
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Basic ')) {
    const [, valor] = atob(auth.slice(6)).split(':');
    if (valor === senha) return liberar();
  }

  return new Response('Acesso restrito', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Dashboard PCP Dêvi"',
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}
