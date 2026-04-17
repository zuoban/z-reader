# Z Reader

一个简洁优雅的在线 EPUB 电子书阅读器，支持语音朗读。

## 功能特性

- 🔐 **密码认证** - 简单安全的登录机制
- 📚 **书架管理** - 上传、删除、管理 EPUB 图书
- 📖 **流畅阅读** - 基于 foliate-js 的高质量 EPUB 渲染
- 💾 **进度同步** - 自动保存阅读进度，多设备无缝切换
- 📑 **目录导航** - 快速定位章节内容
- 🔊 **语音朗读** - Azure TTS 高质量语音，支持多语言、语速调节
- 🌙 **深色模式** - 舒适的夜间阅读体验
- 📱 **响应式设计** - 完美适配桌面与移动设备

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Go 1.21+, Gin, bbolt |
| 前端 | Next.js 16, React 19, Tailwind CSS 4, Shadcn/ui |
| 阅读引擎 | foliate-js |
| TTS | Azure Cognitive Services |
| 反向代理 | Caddy |

## 快速部署

### Docker（推荐）

```bash
# 拉取镜像
docker pull ghcr.io/zuoban/z-reader:latest

# 运行容器
docker run -d \
  --name z-reader \
  -p 80:80 \
  -e APP_PASSWORD=your_password \
  -e MAX_UPLOAD_BYTES=268435456 \
  -v ./uploads:/app/uploads \
  -v ./data:/app/data \
  ghcr.io/zuoban/z-reader:latest
```

如果启用了 TTS，也可以一并传入缓存相关配置：

```bash
-e TTS_CACHE_DIR=/app/data/tts-cache \
-e TTS_CACHE_MAX_BYTES=67108864 \
-e TTS_CACHE_MAX_ITEMS=128 \
-e TTS_CACHE_TTL_SECONDS=86400 \
-e TTS_MAX_CONCURRENCY=3
```

### Docker Compose

```bash
# 克隆项目
git clone https://github.com/zuoban/z-reader.git
cd z-reader

# 复制环境变量模板并设置密码
cp .env.example .env
# 编辑 .env，至少设置 APP_PASSWORD

# 启动服务
docker compose up -d
```

访问 http://localhost 即可使用。

## 本地开发

### 环境要求

- Go 1.21+
- Node.js 20+
- npm 或 pnpm

### 1. 配置环境

```bash
cp .env.example .env
# 编辑 .env 设置密码和 Azure TTS 密钥
```

环境变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `APP_PASSWORD` | 登录密码 | - |
| `APP_PORT` | 后端端口 | 8080 |
| `UPLOAD_DIR` | 图书存储目录 | ./uploads |
| `DB_PATH` | 数据库路径 | ./data.db |
| `MAX_UPLOAD_BYTES` | 单个上传文件最大字节数 | 268435456 |
| `ALLOWED_ORIGINS` | 允许访问后端的前端来源（逗号分隔） | http://localhost:3000,http://localhost:8080 |
| `NEXT_SERVER_API_URL` | Next.js 开发/SSR 代理到后端时使用的地址 | http://127.0.0.1:8080 |
| `TTS_CACHE_DIR` | TTS 磁盘缓存目录 | ./data/tts-cache |
| `TTS_CACHE_MAX_BYTES` | TTS 缓存最大字节数 | 67108864 |
| `TTS_CACHE_MAX_ITEMS` | TTS 缓存最大条目数 | 128 |
| `TTS_CACHE_TTL_SECONDS` | TTS 缓存保留秒数 | 86400 |
| `TTS_MAX_CONCURRENCY` | TTS 真实合成请求最大并发数 | 3 |

说明：

- `APP_PASSWORD` 现在是必填项，未设置时后端不会启动。
- 在 Docker / Compose 部署下，前端默认通过同源 `/api/*` 访问后端，通常不需要设置 `NEXT_PUBLIC_API_URL`。
- `NEXT_SERVER_API_URL` 主要用于本地开发或 SSR 代理到独立后端时使用。

### 2. 启动后端

```bash
make dev
# 或
cd backend && go run main.go
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端依赖管理以 `npm` 为准，使用 [frontend/package-lock.json](/Users/wangjinqiang/ZCodeProject/z-reader/frontend/package-lock.json:1)。

### 4. 访问应用

打开 http://localhost:3000，使用配置的密码登录。

## TTS 语音朗读

Z Reader 支持高质量的 Azure TTS 语音朗读功能：

- **多语言支持** - 中文、英文、日语等多种语言
- **语音选择** - 多种神经网络语音可选
- **语速调节** - 自定义朗读速度
- **朗读缓存** - 内存与磁盘缓存复用已合成音频
- **断点恢复** - 刷新或回到书籍后可从上次朗读位置继续

> TTS 合成结果会按 SSML 与音频格式缓存，重复朗读同一段内容时会优先复用本地缓存。

## 项目结构

```
z-reader/
├── backend/           # Go 后端
│   ├── main.go       # 入口文件
│   ├── config/       # 配置管理
│   ├── handlers/     # HTTP 处理器
│   ├── middleware/   # 认证中间件
│   ├── models/       # 数据模型
│   ├── services/     # 业务服务（TTS）
│   ├── storage/      # bbolt 存储层
│   └── utils/        # 工具函数
├── frontend/         # Next.js 前端
│   ├── src/app/      # 页面路由
│   ├── src/components/  # UI 组件
│   ├── src/hooks/    # React hooks
│   ├── src/lib/      # API 客户端、TTS
│   └── public/foliate/  # foliate-js 库
├── uploads/          # 图书文件存储
├── Dockerfile        # 多阶段 Docker 构建
├── Caddyfile         # Caddy 反向代理配置
└── docker-compose.yml
```

## API 接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/login | 登录认证 | ❌ |
| POST | /api/logout | 退出登录 | ❌ |
| GET | /api/auth/verify | 验证 token | ✅ |
| GET | /api/books | 获取书架列表 | ✅ |
| POST | /api/books | 上传图书 | ✅ |
| DELETE | /api/books/:id | 删除图书 | ✅ |
| GET | /api/books/:id/file | 获取图书文件 | ✅ |
| GET | /api/books/:id/cover | 获取封面图片 | ✅ |
| GET | /api/progress/:id | 获取阅读进度 | ✅ |
| POST | /api/progress/:id | 保存阅读进度 | ✅ |
| GET | /api/tts | TTS 文本转语音 | ✅ |
| POST | /api/ssml | SSML 转语音 | ✅ |
| GET | /api/voices | 获取可用语音列表 | ✅ |

## 构建

```bash
# 本地构建后端
make build

# 本地构建前端
cd frontend && npm run build

# Docker 构建
docker build -t z-reader .
```

## CI

仓库现在包含两条 GitHub Actions 工作流：

- `CI`：在 `main` 分支 push、PR 和手动触发时运行后端测试、前端 lint、Docker 构建检查
- `Build and Push Docker Image`：只在 `main` 分支 push 和手动触发时构建并推送镜像到 `ghcr.io`

## License

MIT
