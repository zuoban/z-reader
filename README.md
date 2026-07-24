# Z Reader

Z Reader 是一个面向个人书架场景的在线电子书阅读器，提供图书管理、阅读进度同步、
分类管理和响应式阅读体验。

项目目前以自部署为主要使用方式，欢迎 issue、讨论和 PR。

## 功能概览

- 支持 `EPUB`、`MOBI`、`AZW3`、`PDF` 文件上传与阅读
- 支持书架管理、封面上传、分类筛选与排序
- 自动保存阅读进度，支持多设备续读
- 可按需将当前图书保存为本机离线副本；副本按账号隔离并在退出登录时清除
- 支持开放注册，多用户各自维护独立书库
- 移动端和桌面端都可用的阅读界面
- 可选 TTS 能力
  TTS 需要额外部署配置，开源仓库不会附带可直接使用的第三方服务凭据

## 技术栈

| 组件 | 技术 |
| --- | --- |
| 后端 | Go 1.25+, Gin, bbolt |
| 前端 | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| 阅读引擎 | foliate-js |
| 反向代理 | Caddy |

## 快速开始

### Docker

```bash
docker run -d \
  --name z-reader \
  -p 80:80 \
  -v z-reader-data:/app/data \
  -v z-reader-uploads:/app/uploads \
  -v z-reader-caddy-data:/data \
  -v z-reader-caddy-config:/config \
  ghcr.io/zuoban/z-reader:latest
```

启动后访问 [http://localhost](http://localhost)。

首次访问时在登录页创建账号，注册成功后会自动进入书架。

### Docker Compose

```bash
git clone https://github.com/zuoban/z-reader.git
cd z-reader
cp .env.example .env

docker compose up -d
```

### 本地开发

环境要求：

- Go 1.25+
- Node.js 20+
- npm

安装与启动：

```bash
cp .env.example .env

# 终端 1：后端
make dev

# 终端 2：前端
cd frontend
npm install
npm run dev
```

前端默认运行在 [http://localhost:3000](http://localhost:3000)，后端默认运行在
[http://localhost:8080](http://localhost:8080)。

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `APP_PORT` | 后端端口 | `8080` |
| `UPLOAD_DIR` | 图书存储目录 | `./uploads` |
| `DB_PATH` | 数据库路径 | `./data.db` |
| `MAX_UPLOAD_BYTES` | 单个上传文件最大字节数 | `268435456` |
| `MAX_REQUEST_BODY_BYTES` | 非文件请求体最大字节数 | `1048576` |
| `ALLOWED_ORIGINS` | 允许访问后端的前端来源，逗号分隔 | `http://localhost:3000,http://localhost:8080` |
| `TRUSTED_PROXIES` | 可信反向代理 IP/CIDR，影响登录限流等客户端 IP 判断 | `127.0.0.1,::1` |
| `NEXT_SERVER_API_URL` | Next.js 开发/SSR 代理到后端时使用的地址 | `http://127.0.0.1:8080` |
| `NEXT_PUBLIC_API_URL` | 浏览器端直连后端时使用的地址，可选 | 空 |
| `TTS_CACHE_DIR` | TTS 磁盘缓存目录 | `./data/tts-cache` |
| `TTS_CACHE_MAX_BYTES` | TTS 缓存最大字节数 | `67108864` |
| `TTS_CACHE_MAX_ITEMS` | TTS 缓存最大条目数 | `128` |
| `TTS_CACHE_TTL_SECONDS` | TTS 缓存保留秒数 | `86400` |
| `TTS_MAX_CONCURRENCY` | TTS 合成请求最大并发数 | `3` |
| `TTS_MAX_QUEUED` | TTS 等待队列最大请求数 | `12` |
| `TTS_QUEUE_WAIT_SECONDS` | TTS 请求最大排队秒数 | `30` |
| `METRICS_ENABLED` | 是否公开 Prometheus 格式的 `/metrics`（建议只在内网启用） | `false` |
| `BACKUP_DIR` | 自动备份目录 | `./backups` |
| `BACKUP_INTERVAL_HOURS` | 自动备份间隔；设为 `0` 可关闭 | `24` |
| `BACKUP_RETENTION_DAYS` | 备份保留天数；设为 `0` 不自动清理 | `7` |
| `CADDY_SITE` | Caddy 站点地址；配置域名时自动启用 HTTPS | `:80` |

说明：

- Docker / Compose 部署下，前端默认通过同源 `/api/*` 访问后端，通常不需要设置
  `NEXT_PUBLIC_API_URL`
- 公网部署请将 `CADDY_SITE` 设为域名（如 `reader.example.com`），并映射/开放 80/443；Caddy 会自动申请并续期 HTTPS 证书。
- 服务启动后会立即生成一份在线备份，并按 `BACKUP_INTERVAL_HOURS` 周期执行。备份包含主数据库、会话数据库、上传文件、SHA-256 清单，并在发布前执行校验；请将 `BACKUP_DIR` 所在持久化目录同步到异地存储。
- 恢复前先停止服务，再使用 `cd backend && go run ./cmd/verify-backup --dir <备份目录>` 验证清单和数据库快照；随后用备份中的 `data.db`、`data.db.sessions` 与 `uploads/` 替换对应持久化文件，最后启动服务并验证 `/readyz`。
- `/healthz` 是存活探针，`/readyz` 会检查数据库与上传目录；启用 `METRICS_ENABLED=true` 后可在内网采集 `/metrics`。
- `NEXT_SERVER_API_URL` 主要用于本地开发或 SSR 代理到独立后端
- 如需启用 TTS，请使用你自己的语音服务配置，不要把可直接使用的密钥提交到仓库

## 常用命令

```bash
# 后端测试
cd backend && go test ./...

# 后端核心模块覆盖率基线（handlers / middleware / services / storage）
cd backend && go test ./handlers ./middleware ./services ./storage -coverprofile=coverage.out
cd backend && go run ./cmd/check-coverage --profile coverage.out --baseline coverage-baseline.json

# 书库性能基准（先运行 1,000 本书规模）
cd backend && go test ./storage -run '^$' -bench 'BenchmarkLibrary.*1000$' -benchtime=3x

# 10,000 本书规模基准（耗时更长，建议在 CI 或独立机器执行）
cd backend && go test ./storage -run '^$' -bench 'BenchmarkLibrary.*10000$' -benchtime=3x

# 前端检查
cd frontend && npm run lint
cd frontend && npm run test:coverage:check
cd frontend && npm run build

# Docker 构建
docker build -t z-reader .
```

覆盖率基线只应在测试范围有意调整、且 PR 说明原因时更新：

```bash
cd backend && go run ./cmd/check-coverage --profile coverage.out --baseline coverage-baseline.json --write
cd frontend && npm run test:coverage:baseline
```

不得通过降低基线来掩盖未覆盖的新增或变更逻辑。

## 项目结构

```text
z-reader/
├── backend/
├── frontend/
├── docker/
├── uploads/
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## CI

仓库当前包含两条 GitHub Actions 工作流：

- `CI`（`.github/workflows/ci.yml`）
  - 触发：`main` push、符合 SemVer 的发布 tag、PR、`workflow_dispatch`
  - **Backend**：`go test` / `go vet` / govulncheck
  - **Coverage**：核心后端模块与前端数据链路不低于提交的覆盖率基线
  - **Frontend**：lint、build、Vitest unit、功能 E2E（含搜索/批量）、**视觉回归（Linux 基线）**
  - **Docker**：镜像构建检查（不推送）
  - 视觉基线按平台分目录：`linux/`（CI 门禁）与 `darwin/`（本机 macOS 可选）
  - 更新 Linux 基线：`cd frontend && npm run test:visual:update:linux`（需 Docker）
- `CodeQL`（`.github/workflows/codeql.yml`）
  - 分析 Go 与 TypeScript/JavaScript 代码；在 PR、主分支变更及每周定时运行
- `Dependabot`（`.github/dependabot.yml`）
  - 每周检查 GitHub Actions、Docker、Go modules 与 npm 依赖更新
- `Build and Push Docker Image`
  在 `main` 分支、发布 tag 或手动触发时构建并推送镜像到 `ghcr.io`

## 参与贡献

开源协作约定见：

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [发布检查清单](docs/release-checklist.md)

## 许可证

本项目使用 [MIT License](LICENSE)。

仓库中 vendored 的第三方依赖保留其各自许可证，例如
`frontend/public/foliate/` 下附带了上游许可证文件。
