# Z Reader

一个简单的在线 EPUB 电子书阅读器。

## 功能特性

- 密码登录认证
- 书架管理（上传/删除图书）
- EPUB 阅读器（基于 foliate-js）
- 阅读进度自动保存与多设备同步
- 目录导航

## 技术栈

**后端：**
- Go 1.21+
- Gin Web Framework
- bbolt（嵌入式数据库）

**前端：**
- Next.js 16
- Shadcn/ui + Tailwind CSS
- foliate-js（EPUB 渲染）

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 设置密码
```

环境变量说明：
- `APP_PASSWORD` - 登录密码
- `APP_PORT` - 服务端口（默认 8080）
- `UPLOAD_DIR` - 图书存储目录（默认 ./uploads）
- `DB_PATH` - 数据库路径（默认 ./data.db）

### 2. 启动后端

```bash
make run
# 或
cd backend && go run main.go
```

### 3. 启动前端开发服务器

```bash
cd frontend
npm install
npm run dev
```

### 4. 访问应用

打开 http://localhost:3000，使用配置的密码登录。

## 项目结构

```
z-reader/
├── backend/              # Go 后端
│   ├── main.go          # 入口文件
│   ├── config/          # 配置管理
│   ├── handlers/        # HTTP 处理器
│   ├── middleware/      # 认证中间件
│   ├── models/          # 数据模型
│   └── storage/         # bbolt 存储层
├── frontend/            # Next.js 前端
│   ├── src/app/         # 页面路由
│   ├── src/components/  # UI 组件
│   ├── src/hooks/       # React hooks
│   └── src/lib/         # API 客户端
├── uploads/             # 图书文件存储
└── Makefile
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/login | 登录认证 |
| POST | /api/logout | 退出登录 |
| GET | /api/books | 获取书架列表 |
| POST | /api/books | 上传图书 |
| DELETE | /api/books/:id | 删除图书 |
| GET | /api/books/:id/file | 获取图书文件 |
| GET | /api/books/:id/cover | 获取封面图片 |
| GET | /api/progress/:id | 获取阅读进度 |
| POST | /api/progress/:id | 保存阅读进度 |

## 构建

```bash
# 构建后端
make build

# 构建前端
cd frontend && npm run build
```

## License

MIT