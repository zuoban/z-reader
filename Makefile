.PHONY: run build deps clean dev dev-backend dev-frontend check check-backend check-frontend

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

check: check-backend check-frontend

check-backend:
	cd backend && go test ./... && go vet ./...

check-frontend:
	cd frontend && npm run lint:strict && npm run test:unit && npm run build
