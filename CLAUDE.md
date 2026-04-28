# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Z Reader is an online e-book reader application for personal library management, supporting EPUB, MOBI, AZW3, and PDF formats. It features book management, reading progress sync across devices, category management, and responsive reading experience.

## Tech Stack

| Component | Technology |
| --- | --- |
| Backend | Go 1.23+, Gin, bbolt (embedded KV database) |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| Reading Engine | foliate-js (vendored in `frontend/public/foliate/`) |
| Reverse Proxy | Caddy |

## Essential Commands

### Backend (Go)

```bash
# Development (from project root)
make dev
# or: cd backend && go run main.go

# Build
make build          # outputs z-reader binary to project root
make run            # run built binary

# Tests
cd backend && go test ./...
cd backend && go test -v ./handlers   # specific package
```

### Frontend (Next.js)

```bash
cd frontend

npm run dev         # dev server at localhost:3000
npm run build       # production build
npm run start       # production server
npm run lint        # ESLint check

# Tests
npm run test:unit         # Vitest unit tests
npm run test:unit:watch   # Vitest watch mode
npm run test:e2e          # Playwright E2E tests
```

### Docker

```bash
docker build -t z-reader .
docker compose up -d
```

## Environment Variables

Key variables loaded from `.env` file:

| Variable | Description | Default |
| --- | --- | --- |
| `APP_PASSWORD` | Login password (required) | - |
| `APP_PORT` | Backend port | `8080` |
| `UPLOAD_DIR` | Book storage directory | `./uploads` |
| `DB_PATH` | Database path | `./data.db` |
| `NEXT_SERVER_API_URL` | Next.js SSR proxy to backend | `http://127.0.0.1:8080` |
| `NEXT_PUBLIC_API_URL` | Browser-side direct URL to backend | empty (uses `/api/*` same-origin) |

## Architecture

### Backend Structure (`backend/`)

```
backend/
├── main.go           # Entry point: route registration, server lifecycle
├── config/           # Environment configuration loading
├── handlers/         # HTTP request handlers (auth, books, progress, tts, users)
├── middleware/       # Auth, rate limiting middleware
├── models/           # Data structures
├── storage/          # bbolt database operations (db.go)
├── services/         # Business logic services
├── response/         # Standardized response helpers
├── utils/            # Utility functions
└── logger/           # Logging initialization
```

**Key patterns:**
- Handler structs use `NewXxxHandler(cfg, db)` constructor pattern
- Database layer is `storage.DB` wrapping bbolt, with methods like `EnsureDefaultAdmin`, `CleanExpiredSessions`
- Auth uses token-based auth with `middleware.AuthRequired()` and `middleware.AdminRequired()`
- Session cleanup runs hourly via `startSessionCleaner`

**API Routes** (defined in `main.go`):
- `POST /api/login`, `POST /api/logout` - public
- `GET /api/auth/verify` - authenticated
- `GET/POST/PATCH/DELETE /api/books/*` - authenticated (book CRUD, covers, categories)
- `GET/POST /api/progress/*` - authenticated (reading progress)
- `GET /api/tts`, `POST /api/ssml`, `GET /api/voices` - authenticated (TTS)
- `GET/POST/PATCH/DELETE /api/users/*` - admin only

### Frontend Structure (`frontend/src/`)

```
src/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home/shelf page
│   ├── login/              # Login page
│   ├── shelf/              # Shelf page
│   └── read/[id]/          # Reader page (dynamic route)
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── reader/             # Reader-specific components
│   ├── AppShell.tsx        # Main app shell
│   ├── BookCard.tsx        # Book card component
│   ├── TTSControls.tsx     # TTS controls
│   └── ...
├── hooks/
│   ├── useAuth.ts          # Authentication hook
│   ├── useApi.ts           # API usage patterns
│   ├── useProgress.ts      # Reading progress hook
│   ├── useFoliateReader.ts # foliate-js integration
│   ├── useTTS.ts           # TTS hook
│   └── ...
├── lib/
│   ├── api.ts              # API client with typed interfaces
│   ├── config.ts           # Frontend configuration
│   ├── utils.ts            # Utility functions (cn() helper)
│   └── types.ts            # Shared TypeScript types
├── registry/               # Service worker registration
└── test/                   # Test utilities
```

**Key patterns:**
- Components use `'use client'` for client-side interactivity
- API client (`@/lib/api`) exports `api` object with typed methods and `auth` object for token management
- Reading engine integrates foliate-js via `useFoliateReader` and `useFoliateView` hooks
- Styling uses Tailwind CSS with `cn()` from `@/lib/utils` for conditional class merging
- shadcn/ui components in `@/components/ui/`

## Important Conventions

### Go Backend
- Import grouping: standard library → third-party → local packages (blank line separated)
- Naming: `PascalCase` exported, `camelCase` private
- Error handling: always check errors, return `gin.H{"error": "message"}` with appropriate HTTP status
- Handler files: `XxxHandler` pattern with `NewXxxHandler()` constructor

### TypeScript Frontend
- Import order: React/Next.js → third-party → local (`@/`) → types
- Components: functional with hooks, named exports
- Hooks: `use` prefix (`useAuth`, `useProgress`)
- Files: match primary export name
- Button elements: never nest `<button>` inside each other

### Next.js 16 Notes
- This project uses Next.js 16 which has breaking changes from earlier versions
- Check `node_modules/next/dist/docs/` for current API documentation
- Turbopack is the default in development mode
