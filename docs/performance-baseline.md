# 性能基线与回归预算

这里记录的是可复现的比较基线，不是跨机器的绝对性能门槛。性能改动应在相同命令、相近硬件
和相近运行时版本下重新测量，并在 PR 中说明差异。任何 P95、吞吐或首屏 JS 体积超过 10%
的退化都应说明原因并获得批准。

## 后端：固定书架数据集

`backend/storage/performance_test.go` 会为 `benchmark-user` 构造确定性的 1,000 本和
10,000 本书架：10 个分类、50 位作者、排序索引、搜索索引、搜索 gram 索引和书架摘要均与
生产读取路径一致。每种规模的夹具在一次测试进程中只构建一次，再复制给各场景；夹具构建
不计入单次查询耗时。

```bash
cd backend
go test ./storage -run '^$' -bench '^BenchmarkLibrary' -benchmem -benchtime=100x -count=1
```

完整运行会花约 1–2 分钟，主要时间用于一次 10,000 本的真实索引夹具构建。

### 当前 microbenchmark 基线

记录日期：2026-07-24

- 系统：macOS 27.0，Apple M1，arm64
- Go：go1.26.5
- 命令：上面的固定命令，`go test` 显示 `-8`

| 场景 | 1,000 本 | 10,000 本 |
| --- | ---: | ---: |
| 精准标题搜索 | 172,434 ns/op · 53,464 B/op · 2,208 allocs/op | 2,027,845 ns/op · 843,386 B/op · 39,656 allocs/op |
| 书架首屏（50 本） | 120,144 ns/op · 43,728 B/op · 782 allocs/op | 144,196 ns/op · 46,336 B/op · 1,098 allocs/op |
| 书架摘要 | 4,286 ns/op · 2,072 B/op · 43 allocs/op | 4,659 ns/op · 2,072 B/op · 43 allocs/op |
| 阅读进度保存（顺序） | 8,062,225 ns/op · 63,856 B/op · 286 allocs/op | 8,900,058 ns/op · 105,286 B/op · 383 allocs/op |
| 阅读进度保存（并发，100 本工作集） | 8,111,222 ns/op · 107,791 B/op · 298 allocs/op | 9,059,568 ns/op · 147,773 B/op · 408 allocs/op |

10,000 本的首屏保持在亚毫秒、摘要保持在微秒级，说明持久化索引有效。标题搜索从候选数最少
的 gram 开始交集，并复用查询键缓冲区；相对本次优化前的 2,515,262 / 34,425,925 ns/op，
分别提升约 15 倍和 17 倍。相对优化前的 1,287,664 / 23,112,504 B/op，分配也显著下降。
优化依据来自 `pprof`：原路径从常见 gram 开始，导致大量 bbolt 查找和键分配。

进度保存基准会更新书籍的最近阅读时间、书架排序索引和进度时间索引。并发场景通过
`b.RunParallel` 模拟多个设备在 100 本活跃书籍间保存进度；bbolt 的单写事务会让该场景对
写锁持有时间的回归保持敏感。

## 后端：HTTP 核心链路压测

仓库提供不依赖外部压测平台的 HTTP 压测命令。它会登录一次来建立会话并报告登录延迟，然后
分别压测书架首屏、搜索和进度保存，输出请求数、失败数、P50/P95/P99 和吞吐。登录接口有意
启用限流，因此不会被重复压测。

只在非生产环境或专用测试账号运行；进度场景会更新指定测试书的阅读位置。先准备测试账号、
至少一本测试书和可搜索的关键词。密码默认从环境变量读取，避免写入终端历史和进程列表：

```bash
read -r -s -p 'Load-test password: ' Z_READER_LOADTEST_PASSWORD
export Z_READER_LOADTEST_PASSWORD
cd backend
go run ./cmd/loadtest \
  --base-url http://127.0.0.1:8080 \
  --username <load-test-user> \
  --book-id <test-book-id> \
  --search-query <known-title-token> \
  --concurrency 4 \
  --duration 30s
unset Z_READER_LOADTEST_PASSWORD
```

同一硬件、Go 版本、数据规模和命令下保存输出，才能用于比较。建议在输出旁记录进程 CPU
与 RSS（例如 `ps` / Activity Monitor），性能问题再用 `go tool pprof` 定位。

上传与 TTS 队列对外部依赖和副作用更敏感：上传会写入书库，TTS 依赖外部语音服务和本地
缓存；请在隔离环境中按需压测，不要把生产数据当作压测夹具。

## 后端：按需 pprof 排障

性能问题先用指标和压测确认，再短时启用 `PPROF_ENABLED=true` 重启后端。该开关默认关闭；pprof
端点没有应用认证，Compose 的 Caddy 也不会代理 `/debug/pprof/*`，因此只能通过受信任内网或容器
内部访问，绝不能公开到互联网。

本地开发可采集 30 秒 CPU profile：

```bash
cd backend
PPROF_ENABLED=true go run .
go tool pprof 'http://127.0.0.1:8080/debug/pprof/profile?seconds=30'
```

Compose 部署时，先在 `.env` 临时设置 `PPROF_ENABLED=true` 并重启服务；然后从容器内部采集，
再复制到本机分析：

```bash
docker compose exec z-reader wget -O /tmp/z-reader-cpu.pprof \
  'http://127.0.0.1:8080/debug/pprof/profile?seconds=30'
docker cp z-reader:/tmp/z-reader-cpu.pprof ./z-reader-cpu.pprof
go tool pprof ./z-reader-cpu.pprof
```

排障结束后立刻把 `PPROF_ENABLED` 改回 `false` 并重启。除 CPU profile 外，还可采集
`/debug/pprof/heap`、`/debug/pprof/goroutine?debug=1` 和 `/debug/pprof/trace?seconds=5`。

## 前端：首屏 JavaScript 预算

生产构建后，从预渲染 HTML 统计关键页面首屏同步/异步脚本体积。预算保存在
[`frontend/performance-budget.json`](../frontend/performance-budget.json)，CI 在
`frontend-build` 任务中执行检查。

```bash
cd frontend
npm run build
npm run test:js-budget
```

### 当前首屏 JS 基线

记录日期：2026-07-27

- 来源：`npm run build` 后的 `.next/server/app/{index,login,shelf}.html`
- 规则：`maxBytes ≈ 记录值 × 1.1`；超过预算时 CI 失败

| 页面 | 记录体积 | 回归预算（max） | 脚本数 |
| --- | ---: | ---: | ---: |
| home (`/`) | 644.4 KiB | 708.9 KiB | 11 |
| login (`/login`) | 649.1 KiB | 714.0 KiB | 12 |
| shelf (`/shelf`) | 897.1 KiB | 986.8 KiB | 13 |

有意提高体积时，先解释原因，再运行：

```bash
cd frontend
npm run test:js-budget:baseline
```

## 前端：Web Vitals 与离线命中率

关键页面的 LCP / CLS / INP 代理预算写在 `performance-budget.json` 的 `webVitals` 字段：

| 页面 | LCP max | CLS max | INP proxy max |
| --- | ---: | ---: | ---: |
| login | 3500 ms | 0.10 | — |
| shelf | 4000 ms | 0.15 | 300 ms |

Playwright 套件 `tests/e2e/performance-budget.spec.ts` 在开发服务器上测量这些指标，并对
LCP/INP 使用 3× 放宽上限，以吸收 Fast Refresh 与未压缩资源噪声；CLS 仍按生产预算硬约束。
CI 的 `test:e2e:ci` 已包含该套件。本地单独运行：

```bash
cd frontend
npm run test:e2e:perf
```

生产环境下的精确值应在 `npm run build && npm run start` 后记录，并与上述预算比较。开发
服务器结果只用于防灾难性回归，不作为跨机器的绝对排名。

### 离线 shell 命中率

Service Worker（`frontend/public/sw.js`）预缓存静态 shell：

- `/`
- `/login`
- `/manifest.json`
- 图标资源

`performance-budget.json` 的 `offline.minHitRate`（当前 0.8）表示：在生产构建注册 SW 并
完成预缓存后，再次访问上述 shell 路由时，静态请求从 Cache Storage 命中的最低比例目标。
单元测试会核对预缓存列表与预算中的 shell 路由一致；真实命中率请在生产构建下用
DevTools → Application → Cache Storage / Network（`from ServiceWorker`）复核。

注意：`/shelf` 与 `/api/*` 故意不进入共享 SW 缓存，避免多账号浏览器配置下的隐私串扰。
