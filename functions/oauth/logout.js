// Encerra a sessão: apaga o cookie e volta ao login.
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const cb = url.searchParams.get("cb") || "/oauth/login";
  return new Response(null, {
    status: 302,
    headers: {
      Location: cb,
      "Set-Cookie": "devi_session=removida; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    },
  });
}
