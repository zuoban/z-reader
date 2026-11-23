.PHONY: run build deps clean dev dev-backend dev-frontend

run:
	./z-reader

build:
	cd backend && go build -o ../z-reader main.go

deps:
	cd backend && go mod tidy

clean:
	rm -f z-reader backend/data.db
	rm -rf uploads/*

dev:
	node scripts/dev.mjs

dev-backend:
	cd backend && go run main.go

dev-frontend:
	cd frontend && npm run dev
