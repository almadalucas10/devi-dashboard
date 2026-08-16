// Proxy: PDF do POP do Drive via worker — servido pelo próprio domínio (devikombucha.com)
// O worker exige a chave; ela fica no env do Pages (QUALIDADE_API_KEY), nunca no navegador.
export async function onRequest(context) {
  const { env, params } = context;
  const id = params.id;
  const key = env.QUALIDADE_API_KEY || '';
  const upstream = `https://devi-dashboard-worker.almadalucas.workers.dev/api/qualidade/pops/${encodeURIComponent(id)}/pdf?key=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(upstream);
    if (!r.ok) {
      const txt = await r.text();
      return new Response(txt, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
    const headers = new Headers();
    headers.set('Content-Type', r.headers.get('content-type') || 'application/pdf');
    const cd = r.headers.get('content-disposition');
    if (cd) headers.set('Content-Disposition', cd);
    return new Response(r.body, { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ erro: e.message }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
}
