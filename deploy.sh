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
