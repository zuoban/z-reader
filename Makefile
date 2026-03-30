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
	cd backend && go run main.go