# Z Reader

Z Reader 是一个面向个人书架场景的在线电子书阅读器，提供图书管理、阅读进度同步、
分类管理和响应式阅读体验。

项目目前以自部署为主要使用方式，欢迎 issue、讨论和 PR。

## 功能概览

- 支持 `EPUB`、`MOBI`、`AZW3`、`PDF` 文件上传与阅读
- 支持书架管理、封面上传、分类筛选与排序
- 自动保存阅读进度，支持多设备续读
- 提供管理员/普通用户角色与基础用户管理
- 移动端和桌面端都可用的阅读界面
- 可选 TTS 能力
  TTS 需要额外部署配置，开源仓库不会附带可直接使用的第三方服务凭据

## 技术栈

| 组件 | 技术 |
| --- | --- |
| 后端 | Go 1.23+, Gin, bbolt |
| 前端 | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| 阅读引擎 | foliate-js |
| 反向代理 | Caddy |

## 快速开始

### Docker

```bash
docker run -d \
  --name z-reader \
  -p 80:80 \
  -e APP_PASSWORD=your_password \
  ghcr.io/zuoban/z-reader:latest
```

启动后访问 [http://localhost](http://localhost)。

默认用户：`admin`，默认密码：`your_password`

### Docker Compose

```bash
git clone https://github.com/zuoban/z-reader.git
cd z-reader
cp .env.example .env

# 至少设置 APP_PASSWORD
docker compose up -d
```

### 本地开发

环境要求：

- Go 1.23+
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
| `APP_PASSWORD` | 登录密码，必填 | - |
| `APP_PORT` | 后端端口 | `8080` |
| `UPLOAD_DIR` | 图书存储目录 | `./uploads` |
| `DB_PATH` | 数据库路径 | `./data.db` |
| `MAX_UPLOAD_BYTES` | 单个上传文件最大字节数 | `268435456` |
| `ALLOWED_ORIGINS` | 允许访问后端的前端来源，逗号分隔 | `http://localhost:3000,http://localhost:8080` |
| `TRUSTED_PROXIES` | 可信反向代理 IP/CIDR，影响登录限流等客户端 IP 判断 | `127.0.0.1,::1` |
| `NEXT_SERVER_API_URL` | Next.js 开发/SSR 代理到后端时使用的地址 | `http://127.0.0.1:8080` |
| `NEXT_PUBLIC_API_URL` | 浏览器端直连后端时使用的地址，可选 | 空 |
| `TTS_CACHE_DIR` | TTS 磁盘缓存目录 | `./data/tts-cache` |
| `TTS_CACHE_MAX_BYTES` | TTS 缓存最大字节数 | `67108864` |
| `TTS_CACHE_MAX_ITEMS` | TTS 缓存最大条目数 | `128` |
| `TTS_CACHE_TTL_SECONDS` | TTS 缓存保留秒数 | `86400` |
| `TTS_MAX_CONCURRENCY` | TTS 合成请求最大并发数 | `3` |

说明：

- Docker / Compose 部署下，前端默认通过同源 `/api/*` 访问后端，通常不需要设置
  `NEXT_PUBLIC_API_URL`
- `NEXT_SERVER_API_URL` 主要用于本地开发或 SSR 代理到独立后端
- 如需启用 TTS，请使用你自己的语音服务配置，不要把可直接使用的密钥提交到仓库

## 常用命令

```bash
# 后端测试
cd backend && go test ./...

# 前端检查
cd frontend && npm run lint
cd frontend && npm run build

# Docker 构建
docker build -t z-reader .
```

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

- `CI`
  在 `main` 分支 push、PR 和手动触发时运行后端测试、前端 lint、Docker 构建检查
- `Build and Push Docker Image`
  在 `main` 分支 push 和手动触发时构建并推送镜像到 `ghcr.io`

## 参与贡献

开源协作约定见：

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## 许可证

本项目使用 [MIT License](LICENSE)。

仓库中 vendored 的第三方依赖保留其各自许可证，例如
`frontend/public/foliate/` 下附带了上游许可证文件。
