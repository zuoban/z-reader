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

run_as_user=()
if [[ "$(id -u)" -eq 0 ]]; then
  for dir in /app/data /app/uploads /data /config; do
    mkdir -p "${dir}"
    find "${dir}" \( ! -user zreader -o ! -group zreader \) -exec chown zreader:zreader {} +
  done
  run_as_user=(su-exec zreader)
fi

cd /app
"${run_as_user[@]}" ./z-reader &
backend_pid=$!

cd /app/frontend
"${run_as_user[@]}" node server.js &
frontend_pid=$!

"${run_as_user[@]}" caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
caddy_pid=$!

wait -n "${backend_pid}" "${frontend_pid}" "${caddy_pid}"
exit_code=$?

terminate_children
wait || true

exit "${exit_code}"
