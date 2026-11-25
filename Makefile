.PHONY: run build deps clean dev dev-backend dev-frontend check check-gofmt check-backend check-scripts check-frontend check-release

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

check: check-gofmt check-backend check-scripts check-frontend

check-gofmt:
	@unformatted="$$(find backend -name '*.go' -type f -exec gofmt -l {} +)"; \
	if [ -n "$$unformatted" ]; then \
		echo "The following Go files need gofmt:"; \
		echo "$$unformatted"; \
		exit 1; \
	fi

check-backend:
	cd backend && go test ./... && go vet ./...

check-scripts:
	node --test scripts/dev.test.mjs frontend/scripts/build-foliate.test.mjs frontend/scripts/measure-tts-provider.test.mjs

check-frontend:
	cd frontend && npm run lint:strict && npm run test:unit && npm run build

check-release: check-gofmt check-scripts
	cd backend && go test -race ./... && go vet ./...
	cd backend && tmp="$$(mktemp)" && trap 'rm -f "$$tmp"' EXIT && \
		go test ./backup ./handlers ./middleware ./services ./storage -coverprofile="$$tmp" && \
		go run ./cmd/check-coverage --profile "$$tmp" --baseline coverage-baseline.json
	cd frontend && npm run lint:strict && npm run test:coverage:check && npm run build && npm run test:js-budget
