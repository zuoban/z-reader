# Stage 1: Build Go backend
FROM golang:1.21-alpine AS backend-builder

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

# Install Node.js and ca-certificates
RUN apk add --no-cache nodejs ca-certificates tzdata

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

# Create startup script
RUN printf '#!/bin/sh\n\
cd /app && ./z-reader &\n\
cd /app/frontend && node server.js &\n\
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile\n\
' > /app/start.sh && chmod +x /app/start.sh

WORKDIR /app

ENV APP_PORT=8080
ENV UPLOAD_DIR=/app/uploads
ENV DB_PATH=/app/data/data.db
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 80 443

VOLUME ["/app/uploads", "/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/auth/verify || exit 1

CMD ["/app/start.sh"]