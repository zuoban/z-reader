# Stage 1: Build Go backend
FROM --platform=$BUILDPLATFORM golang:1.27.4-alpine AS backend-builder

WORKDIR /app/backend

RUN apk add --no-cache git ca-certificates tzdata

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -ldflags="-w -s" -o /app/z-reader main.go

# Stage 2: Build Next.js frontend
FROM node:26-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --legacy-peer-deps

COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# Stage 3: Final image with Caddy
FROM caddy:2-alpine AS final

LABEL maintainer="zuoban"
LABEL org.opencontainers.image.source="https://github.com/zuoban/z-reader"

# Install runtime dependencies
RUN apk add --no-cache bash nodejs ca-certificates tini tzdata libcap su-exec && \
    addgroup -g 1000 -S zreader && \
    adduser -u 1000 -S -G zreader zreader && \
    setcap cap_net_bind_service=+ep /usr/bin/caddy

# Create directories
RUN mkdir -p /app/data /app/uploads /app/frontend /data /config

# Copy backend binary
COPY --from=backend-builder /app/z-reader /app/z-reader
RUN machine="$(od -An -t x1 -j 18 -N 2 /app/z-reader | tr -d '[:space:]')" && \
    case "$(uname -m):$machine" in \
      x86_64:3e00|aarch64:b700) ;; \
      *) echo "Backend binary does not match image architecture" >&2; exit 1 ;; \
    esac

# Copy Next.js standalone output
COPY --from=frontend-builder /app/frontend/.next/standalone /app/frontend
COPY --from=frontend-builder /app/frontend/.next/static /app/frontend/.next/static
COPY --from=frontend-builder /app/frontend/public /app/frontend/public

# Copy Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile
COPY docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh && \
    chown -R zreader:zreader /app/data /app/uploads /data /config

WORKDIR /app

ENV APP_PORT=8080
ENV GIN_MODE=release
ENV UPLOAD_DIR=/app/uploads
ENV DB_PATH=/app/data/data.db
ENV PORT=3000
ENV HOSTNAME="127.0.0.1"
ENV XDG_DATA_HOME=/data
ENV XDG_CONFIG_HOME=/config

EXPOSE 80 443

VOLUME ["/app/uploads", "/app/data"]

# Entrypoint repairs mounted volume ownership from legacy root installs,
# then drops privileges to zreader (1000:1000) via su-exec before starting services.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- --tries=1 http://127.0.0.1:8080/readyz >/dev/null && wget -qO- --tries=1 http://127.0.0.1:3000/login >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/start.sh"]
