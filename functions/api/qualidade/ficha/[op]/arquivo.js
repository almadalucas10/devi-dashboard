// Proxy: PDF da ficha (anexo Omie ou gerado do R2) via worker — mesmo domínio
export async function onRequest(context) {
  const { env, params, request } = context;
  const op = params.op;
  const nCodOP = new URL(request.url).searchParams.get('nCodOP') || op;
  const key = env.QUALIDADE_API_KEY || '';
  const upstream = `https://devi-dashboard-worker.almadalucas.workers.dev/api/qualidade/ficha/${encodeURIComponent(op)}/arquivo?nCodOP=${encodeURIComponent(nCodOP)}&key=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(upstream);
    if (!r.ok) {
      const txt = await r.text();
      return new Response(txt, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
    const headers = new Headers();
    const ct = r.headers.get('content-type') || 'application/pdf';
    headers.set('Content-Type', ct);
    const cd = r.headers.get('content-disposition');
    if (cd) headers.set('Content-Disposition', cd);
    const loc = r.headers.get('location');
    if (loc) { headers.set('Location', loc); return new Response(null, { status: 302, headers }); }
    return new Response(r.body, { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ erro: e.message }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
}
