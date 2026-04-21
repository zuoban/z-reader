# Stage 1: Build Go backend
FROM golang:1.23-alpine AS backend-builder

WORKDIR /app/backend

RUN apk add --no-cache git ca-certificates tzdata

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o /app/z-reader main.go

# Stage 2: Build Next.js frontend
FROM node:20-alpine AS frontend-builder

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
RUN apk add --no-cache bash nodejs ca-certificates tini tzdata

# Create directories
RUN mkdir -p /app/data /app/uploads /app/frontend

# Copy backend binary
COPY --from=backend-builder /app/z-reader /app/z-reader

# Copy Next.js standalone output
COPY --from=frontend-builder /app/frontend/.next/standalone /app/frontend
COPY --from=frontend-builder /app/frontend/.next/static /app/frontend/.next/static
COPY --from=frontend-builder /app/frontend/public /app/frontend/public

# Copy Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile
COPY docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh

WORKDIR /app

ENV APP_PORT=8080
ENV UPLOAD_DIR=/app/uploads
ENV DB_PATH=/app/data/data.db
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 80 443

VOLUME ["/app/uploads", "/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/start.sh"]
