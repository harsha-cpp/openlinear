#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.preview.yml"
CONTAINER=openlinear

usage() {
  cat <<EOF
OpenLinear preview container control

Usage: $(basename "$0") <command>

Commands:
  build      Build the openlinear:preview image (no cache for first run)
  up         Start the container in the background
  down       Stop the container (data persists in named volumes)
  restart    Restart the container
  status     Show container + health status
  logs       Tail all service logs (Postgres, API, UI, landing)
  shell      Open an interactive shell inside the running container
  destroy    Stop AND remove the container + all named volumes (DESTRUCTIVE)
  rebuild    Down + rebuild image + up
EOF
}

cmd="${1:-}"
case "$cmd" in
  build)
    docker compose -f "$COMPOSE_FILE" build --pull
    ;;
  up)
    docker compose -f "$COMPOSE_FILE" up -d
    echo ""
    echo "Container starting in the background. First boot can take 60-90s."
    echo "Watch progress with: $(basename "$0") logs"
    ;;
  down)
    docker compose -f "$COMPOSE_FILE" down
    ;;
  restart)
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate
    ;;
  status)
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    echo "--- health ---"
    docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "(no container)"
    ;;
  logs)
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
      docker exec "$CONTAINER" sh -c 'tail -F /var/log/openlinear/*.log' || \
        docker compose -f "$COMPOSE_FILE" logs -f
    else
      docker compose -f "$COMPOSE_FILE" logs -f
    fi
    ;;
  shell)
    docker exec -it "$CONTAINER" bash
    ;;
  destroy)
    docker compose -f "$COMPOSE_FILE" down -v
    docker volume rm openlinear-pgdata openlinear-repos openlinear-logs 2>/dev/null || true
    echo "Container, image data, and volumes removed."
    ;;
  rebuild)
    docker compose -f "$COMPOSE_FILE" down
    docker compose -f "$COMPOSE_FILE" build --pull
    docker compose -f "$COMPOSE_FILE" up -d
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    echo "Unknown command: $cmd"
    usage
    exit 1
    ;;
esac
