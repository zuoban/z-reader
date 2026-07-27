# Contributing

感谢你愿意为 Z Reader 做贡献。

## 开始之前

- 先阅读根目录的 [README.md](README.md) 与工程路线图 [ROADMAP.md](ROADMAP.md)
- 讨论较大的功能改动时，建议先开 issue 说明背景和方案
- 提交前请确保没有把本地密钥、数据库、上传文件或构建产物带进仓库

## 找任务

适合第一次贡献的入口：

| 入口 | 说明 |
| --- | --- |
| [good first issue](https://github.com/zuoban/z-reader/labels/good%20first%20issue) | 范围小、路径清楚，适合新人 |
| [help wanted](https://github.com/zuoban/z-reader/labels/help%20wanted) | 欢迎外部协助，可能需要更多上下文 |
| [security](https://github.com/zuoban/z-reader/labels/security) | 非敏感的加固或公开跟进；**漏洞请走** [SECURITY.md](SECURITY.md) |

认领前请在 issue 下留言，避免重复劳动。安全漏洞不要开公开 issue。

当前种子任务示例：

- [#50](https://github.com/zuoban/z-reader/issues/50) docs: production Web Vitals measurement steps (`good first issue`)
- [#51](https://github.com/zuoban/z-reader/issues/51) test: a11y for empty/error shelf states (`good first issue`)
- [#52](https://github.com/zuoban/z-reader/issues/52) loadtest upload/TTS scenarios (`help wanted`)
- [#53](https://github.com/zuoban/z-reader/issues/53) production Web Vitals archive script (`help wanted`)

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
(
  cd backend
  go test ./...
  go test ./handlers ./middleware ./services ./storage -coverprofile=coverage.out
  go run ./cmd/check-coverage --profile coverage.out --baseline coverage-baseline.json
)

(
  cd frontend
  npm run lint:strict
  npm run test:unit
  npm run test:coverage:check
  npm run build
  npm run test:js-budget
)

# 功能 E2E（与 CI 门禁一致：auth / 虚拟书架 / 阅读器 / 串联 / 搜索 / 批量 / a11y / 性能预算；首次需安装浏览器）
npx playwright install chromium
npm run test:e2e:ci

# 改了纸质 UI / 布局时：用 Docker 更新 Linux 基线（与 CI 一致）
# npm run test:visual:update:linux
# 本机 macOS 可选：npm run test:visual:update  （写入 darwin/）
```

CI 在 push/PR 会跑后端测试、lint、unit、功能 E2E、**Linux 视觉回归**与前端 build。  
视觉截图以 `tests/e2e/.../snapshots/linux/` 为准；请用 Docker 脚本更新，勿直接提交 macOS 截图当 Linux 基线。

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
