# AGENTS.md - Z Reader Project Guide

This document provides essential information for AI coding agents working on the Z Reader codebase.

## Project Overview

Z Reader is an online EPUB reader application with:
- **Backend**: Go 1.26+ with Gin framework and bbolt embedded database
- **Frontend**: Next.js 16 with React 19, Tailwind CSS 4, and Shadcn/ui

## Build Commands

### Full Stack (Development)

```bash
# Run frontend and backend together in development mode
make dev

# Or run individually
make dev-backend
make dev-frontend
```

### Backend (Go)

```bash
# Run backend only in development mode
make dev-backend
# or: cd backend && go run main.go

# Build binary
make build

# Run built binary
make run

# Tidy dependencies
make deps
```

### Frontend (Next.js)

```bash
cd frontend

# Install dependencies
npm install

# Development server (http://localhost:3000)
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Run ESLint
npm run lint
```

## Test Commands

Run the lightweight checks matching PR CI for the area you change (or `make check` for both):

- **Backend**: Place Go tests alongside source files with `_test.go` suffix.
  ```bash
  make check-backend
  # or: cd backend && go test ./... && go vet ./...
  ```

- **Frontend**: Use Vitest and React Testing Library for unit/component tests.
  ```bash
  make check-frontend
  # or: cd frontend && npm run lint:strict && npm run test:unit && npm run build
  ```

- **Release / heavy checks** (`test:coverage:check`, `test:js-budget`, `test:e2e:ci`, `test:visual`,
  `govulncheck`): Run locally only when relevant to the change; in CI they run on `v*.*.*`
  release tags or manual `workflow_dispatch`.

## Workflow & Commits

- This is a single-maintainer repository. For routine fixes, features, and dependency updates,
  edit and commit directly in the current checkout; do not create a separate Git worktree,
  feature branch, or Draft PR unless the user explicitly requests one.

## Code Style Guidelines

### General

- Use UTF-8 encoding for all files
- Keep lines under 100 characters where possible
- Remove console.log statements before committing (production code)

### Go Backend

**Imports**: Group imports in this order (separated by blank lines):
1. Standard library
2. Third-party packages
3. Local packages

```go
import (
    "net/http"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/google/uuid"

    "z-reader/backend/config"
    "z-reader/backend/models"
)
```

**Naming**:
- Use PascalCase for exported functions/types
- Use camelCase for private functions/variables
- Handler structs: `XxxHandler` (e.g., `AuthHandler`, `BooksHandler`)
- Constructor pattern: `NewXxxHandler()` for struct initialization

**Error Handling**:
- Always check errors
- Return JSON error responses with appropriate HTTP status
- Use `gin.H{"error": "message"}` for error responses

```go
if err != nil {
    c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to..."})
    return
}
```

**Project Structure**:
- `config/` - Configuration loading
- `handlers/` - HTTP request handlers (grouped by domain)
- `middleware/` - Gin middleware
- `models/` - Data structures
- `storage/` - Database operations

### TypeScript/React Frontend

**Imports**: Order imports as follows:
1. React/Next.js imports
2. Third-party libraries
3. Local components/hooks/lib (use `@/` alias)
4. Types (import type separately)

```typescript
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { api, Book } from '@/lib/api';
import type { Metadata } from 'next';
```

**Component Style**:
- Use functional components with hooks
- Add `'use client'` directive for client components
- Use named exports for components

```typescript
'use client';

export function MyComponent() {
  // hooks at top
  const [state, setState] = useState('');
  
  // effects
  useEffect(() => {}, []);
  
  // event handlers
  function handleClick() {}
  
  // return JSX
  return <div>...</div>;
}
```

**Naming**:
- Components: PascalCase (`BookCard`, `ThemeSettings`)
- Hooks: camelCase with `use` prefix (`useAuth`, `useProgress`)
- Files: match primary export (`use-auth.ts` or `BookCard.tsx`)
- CSS classes: use Tailwind utility classes via `cn()` helper

**Types**:
- Define interfaces in the same file or `lib/` for shared types
- Export interfaces that are reused
- Use TypeScript strict mode features

**State Management**:
- Local state: `useState`
- Server state: Fetch in useEffect or custom hooks
- Theme/preferences: localStorage with custom hooks

**Error Handling**:
- Use try-catch in async functions
- Show user-friendly error messages
- Log errors to console in development only

### CSS/Styling

- Use Tailwind CSS utility classes
- Use `cn()` function from `@/lib/utils` for conditional class merging
- Define custom utilities in `globals.css` under `@layer utilities`
- Use CSS variables for theming (defined in `:root` and `.dark`)

## Important Notes

### Next.js 16 Breaking Changes

This project uses Next.js 16 which has breaking changes. Check `node_modules/next/dist/docs/` for current API documentation. Key points:
- Dev uses Turbopack by default (`next dev`); production build uses webpack (`next build --webpack`)
- Check deprecation notices before using familiar patterns

### Avoid Common Issues

1. **Button nesting**: Never nest `<button>` elements. When using Tooltip/Dialog triggers with Buttons:
   - Use `title` attribute on buttons instead of Tooltip wrapper
   - Or use `<span>` inside trigger instead of `<Button>`

2. **Client components**: Components using hooks or browser APIs need `'use client'`

3. **Environment variables**: 
   - Backend: Use `.env` file, accessed via `os.Getenv()`
   - Frontend: Prefix with `NEXT_PUBLIC_` for client-side access

### API Base URL

Frontend connects to backend at `http://localhost:8080` by default. Override with `NEXT_PUBLIC_API_URL` environment variable.

## File Structure

```
z-reader/
├── backend/           # Go backend
│   ├── main.go        # Entry point, route setup
│   ├── config/        # Environment config
│   ├── handlers/      # HTTP handlers
│   ├── middleware/    # Auth middleware
│   ├── models/        # Data models
│   └── storage/       # bbolt database layer
├── frontend/          # Next.js frontend
│   └── src/
│       ├── app/       # App router pages
│       ├── components/# React components
│       │   └── ui/    # Shadcn UI components
│       ├── hooks/     # Custom React hooks
│       └── lib/       # Utilities, API client
├── uploads/           # EPUB file storage
├── Makefile           # Build commands
└── AGENTS.md          # This file
```
