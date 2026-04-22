# Contributing

感谢你愿意为 Z Reader 做贡献。

## 开始之前

- 先阅读根目录的 [README.md](README.md)
- 讨论较大的功能改动时，建议先开 issue 说明背景和方案
- 提交前请确保没有把本地密钥、数据库、上传文件或构建产物带进仓库

## 本地开发

```bash
cp .env.example .env

# backend
make dev

# frontend
cd frontend
npm install
npm run dev
```

## 提交前检查

```bash
cd backend && go test ./...
cd frontend && npm run lint
cd frontend && npm run build
```

如果你的改动影响了 API、环境变量、部署方式或交互行为，请同步更新文档。

## Pull Request 建议

- PR 标题尽量直接描述改动目的
- 在描述里写清楚背景、改动点和验证方式
- 如果改动影响 UI，附上截图或录屏会很有帮助
- 避免把不相关的重构、格式化和功能修改混在同一个 PR

## 代码风格

- Go 代码请保持错误处理明确、导入分组清晰
- 前端以 TypeScript 严格模式和函数组件为主
- 优先写小而清晰的改动，必要时补充简短注释

## 行为准则

参与本项目即视为同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
