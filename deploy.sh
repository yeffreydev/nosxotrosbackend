#!/usr/bin/env bash
# Despliegue en el VPS: trae main, instala, sincroniza el esquema y recarga PM2.
#   cd /var/www/nosxotros-api && ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
git pull --ff-only origin main
npm ci
npx prisma generate
# db push sin --accept-data-loss: si un cambio borraría datos, se detiene.
npx prisma db push --skip-generate
npm run build
pm2 startOrReload ecosystem.config.js --update-env
pm2 save
echo "✓ desplegado: $(git log --oneline -1)"
