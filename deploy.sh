#!/usr/bin/env bash
# Despliega La Quinta en el VPS: construye las imagenes aqui (el VPS es pequeno y compilar Nuxt
# alli le quitaria memoria a los demas servicios), las sube y reinicia los contenedores.
# Requiere el host "laquinta-vps" en ~/.ssh/config. El .env de produccion vive solo en el VPS.
set -euo pipefail
cd "$(dirname "$0")"

HOST=laquinta-vps
DIR=/opt/laquinta

docker build -t laquinta-api:latest ./api
docker build -t laquinta-web:latest \
  --build-arg NUXT_PUBLIC_GRAPHQL_HTTP=/graphql \
  --build-arg NUXT_PUBLIC_GRAPHQL_WS=/graphql \
  --build-arg GRAPHQL_HTTP_INTERNAL=http://api:4000/graphql \
  ./web

docker save laquinta-api:latest laquinta-web:latest | gzip -1 | ssh "$HOST" 'gunzip | sudo docker load'
scp docker-compose.prod.yml "$HOST:$DIR/docker-compose.yml"
ssh "$HOST" "cd $DIR && sudo docker compose -p laquinta up -d --remove-orphans && sudo docker image prune -f >/dev/null"
ssh "$HOST" 'sleep 5; curl -fsS http://127.0.0.1:4000/health && echo'
