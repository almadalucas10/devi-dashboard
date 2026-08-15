#!/bin/bash
# ============================================================================
# Deploy automatizado — Dashboard PCP Bebidas
# Uso: ./deploy.sh [mensagem de commit]
# ============================================================================
set -e

MSG="${1:-deploy automatizado}"
WORKER_URL="https://devi-dashboard-worker.almadalucas.workers.dev"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Deploy iniciado..."

# 1. Git — commit e push
echo ""
echo "📦 Git commit & push..."
cd "$SCRIPT_DIR"
git add -A
git diff --cached --quiet && echo "   (nada a commitar)" || git commit -m "$MSG

Co-Authored-By: Claude <noreply@anthropic.com>"
GH="$(which gh 2>/dev/null || echo '/tmp/gh_2.75.0_linux_amd64/bin/gh')"
git -c credential.helper="!$GH auth git-credential" push 2>/dev/null || git push
echo "   ✅ Git OK"

# 2. Apps Script — clasp push
echo ""
echo "📜 Apps Script push..."
cd "$SCRIPT_DIR"
npx clasp push --force 2>&1 | tail -1
echo "   ✅ Apps Script OK"

# 3. Cloudflare Worker — wrangler deploy
echo ""
echo "☁️  Cloudflare Worker deploy..."
cd "$SCRIPT_DIR/worker"
npx wrangler deploy 2>&1 | tail -3
echo "   ✅ Worker OK"

# 3.1 Invalida caches de qualidade (fichas/lista) — evita ficha com dados antigos
#     após mudanças no worker (ex.: nomes/insumos corrigidos). Best-effort.
echo ""
echo "🧹 Invalidando caches de qualidade..."
TOKEN_FILE="$HOME/.cache/reasonix-cloudflare/api_token"
if [ -f "$TOKEN_FILE" ]; then
  TOK="$(cat "$TOKEN_FILE")"
  ACCT="293b5ef2f59ca22cef711969b206a3a3"
  BUCKET="devi-dashboard-cache"
  python3 - "$TOK" "$ACCT" "$BUCKET" <<'PY'
import json, sys, urllib.request, urllib.parse
tok, acct, bucket = sys.argv[1], sys.argv[2], sys.argv[3]
base = f"https://api.cloudflare.com/client/v4/accounts/{acct}/r2/buckets/{bucket}/objects"
def req(method, url):
    r = urllib.request.Request(url, method=method, headers={"Authorization": f"Bearer {tok}"})
    with urllib.request.urlopen(r, timeout=40) as resp:
        return json.load(resp)
d = req("GET", f"{base}?limit=1000")
r = d.get("result") or {}
objs = r.get("objects") if isinstance(r, dict) else r
keys = [o.get("key") for o in (objs or []) if str(o.get("key", "")).startswith("qualidade")]
for k in keys:
    req("DELETE", base + "/" + urllib.parse.quote(k, safe=""))
print(f"   ✅ {len(keys)} cache(s) de qualidade invalidadas" if keys else "   (nenhuma cache de qualidade)")
PY
else
  echo "   (token não encontrado — invalidação pulada)"
fi

# 4. Cloudflare Pages — frontend
echo ""
echo "🌐 Cloudflare Pages deploy..."
cd "$SCRIPT_DIR"
rm -rf node_modules package.json package-lock.json 2>/dev/null
npx wrangler pages deploy . --project-name=dashboard 2>&1 | tail -3
echo "   ✅ Pages OK"

# 5. Dispara sync no Worker
echo ""
echo "🔄 Disparando sync..."
curl -sS -X POST "$WORKER_URL/api/sync" --max-time 10 2>/dev/null || true
echo "   ✅ Sync disparado (rodando em background)"

echo ""
echo "🎉 Deploy concluído!"
echo "   Dashboard: https://dashboard.almadalucas.workers.dev"
echo "   Worker:    $WORKER_URL"
echo "   API Omie:  $WORKER_URL/api/omie"
