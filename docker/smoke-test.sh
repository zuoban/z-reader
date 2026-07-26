#!/usr/bin/env bash
# Verify that a built Z Reader image can start, serve traffic, and retain both
# persistent volumes when its container is replaced. Usage:
#   bash docker/smoke-test.sh [image]
set -Eeuo pipefail

image="${1:-z-reader:ci}"
run_id="${Z_READER_SMOKE_RUN_ID:-$(date +%s)-$$}"
container_name="z-reader-smoke-${run_id}"
data_volume="z-reader-smoke-data-${run_id}"
uploads_volume="z-reader-smoke-uploads-${run_id}"
marker_file=".z-reader-smoke-marker"

cleanup() {
  docker rm --force "${container_name}" >/dev/null 2>&1 || true
  docker volume rm --force "${data_volume}" "${uploads_volume}" >/dev/null 2>&1 || true
}

show_logs_and_fail() {
  echo "Z Reader container did not become healthy:" >&2
  docker logs "${container_name}" >&2 || true
  return 1
}

wait_for_healthy() {
  local status
  for _ in $(seq 1 30); do
    status="$(docker inspect --format '{{.State.Health.Status}}' "${container_name}")"
    case "${status}" in
      healthy)
        return 0
        ;;
      unhealthy)
        show_logs_and_fail
        return 1
        ;;
    esac
    sleep 2
  done
  show_logs_and_fail
}

assert_serving() {
  docker exec "${container_name}" wget --no-verbose --tries=1 --spider \
    http://localhost:8080/healthz
  docker exec "${container_name}" wget --no-verbose --tries=1 --spider \
    http://localhost:8080/readyz
  docker exec "${container_name}" wget --no-verbose --tries=1 --spider http://localhost/
  docker exec "${container_name}" wget --no-verbose --tries=1 --spider http://localhost/healthz
  docker exec "${container_name}" wget --no-verbose --tries=1 --spider http://localhost/readyz
}

start_container() {
  docker run --detach \
    --name "${container_name}" \
    --health-interval 3s \
    --health-timeout 3s \
    --health-retries 10 \
    --health-start-period 5s \
    --volume "${data_volume}:/app/data" \
    --volume "${uploads_volume}:/app/uploads" \
    "${image}" >/dev/null
}

trap cleanup EXIT

docker image inspect "${image}" >/dev/null
docker volume create "${data_volume}" >/dev/null
docker volume create "${uploads_volume}" >/dev/null

start_container
wait_for_healthy
assert_serving

docker exec "${container_name}" sh -c \
  "printf '%s\\n' retained > /app/data/${marker_file}"
docker exec "${container_name}" sh -c \
  "printf '%s\\n' retained > /app/uploads/${marker_file}"

docker rm --force "${container_name}" >/dev/null
start_container
wait_for_healthy
assert_serving

docker exec "${container_name}" grep -qx retained "/app/data/${marker_file}"
docker exec "${container_name}" grep -qx retained "/app/uploads/${marker_file}"

echo "Container smoke test passed for ${image}."
