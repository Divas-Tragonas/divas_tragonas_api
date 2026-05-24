#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "Pulling..."
git pull
echo "Rebuilding..."
docker compose build api
docker compose up -d --force-recreate api
echo "Cleaning up..."
docker image prune -f
echo "Done. Logs:"
docker compose logs -f api
