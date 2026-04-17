#!/usr/bin/env bash
set -Eeuo pipefail

backend_pid=""
frontend_pid=""
caddy_pid=""

terminate_children() {
  local pids=()

  if [[ -n "${backend_pid}" ]] && kill -0 "${backend_pid}" 2>/dev/null; then
    pids+=("${backend_pid}")
  fi
  if [[ -n "${frontend_pid}" ]] && kill -0 "${frontend_pid}" 2>/dev/null; then
    pids+=("${frontend_pid}")
  fi
  if [[ -n "${caddy_pid}" ]] && kill -0 "${caddy_pid}" 2>/dev/null; then
    pids+=("${caddy_pid}")
  fi

  if ((${#pids[@]} > 0)); then
    kill "${pids[@]}" 2>/dev/null || true
  fi
}

cleanup() {
  terminate_children
  wait || true
}

trap cleanup EXIT
trap 'exit 0' INT TERM

cd /app
./z-reader &
backend_pid=$!

cd /app/frontend
node server.js &
frontend_pid=$!

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
caddy_pid=$!

wait -n "${backend_pid}" "${frontend_pid}" "${caddy_pid}"
exit_code=$?

terminate_children
wait || true

exit "${exit_code}"
