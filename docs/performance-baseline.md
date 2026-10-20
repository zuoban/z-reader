# 性能基线与回归预算

这里记录的是可复现的比较基线，不是跨机器的绝对性能门槛。性能改动应在相同命令、相近硬件
和相近运行时版本下重新测量，并在 PR 中说明差异。任何 P95、吞吐或首屏 JS 体积超过 10%
的退化都应说明原因并获得批准。

## 2026-10-18 优化结果与测量范围

同机对照使用 Apple M1、darwin/arm64、Go 1.27.2、10,000 本书、每页 50 本、
`-benchtime=100x -count=1`。基线为 `ec862923`，完整原始输出、夹具与复现方法见
[后端测量记录](performance/backend-2026-10-18.txt)。以下是存储层 microbenchmark，
不代表线上 HTTP P95。

| 场景 | 优化前 | 优化后 |
| --- | ---: | ---: |
| 精确标题搜索 | 1.970 ms | 0.110 ms |
| 宽泛搜索 | 39.802 ms | 0.095 ms |
| 深游标宽泛搜索 | 31.155 ms | 0.106 ms |
| 单字搜索 | 0.097 ms | 0.085 ms |
| 书架首批 50 本 | 0.085 ms | 0.086 ms |
| 分类搜索 / 分类深分页 | 无同功能基线 | 0.092 / 0.083 ms |

进度保存保留同步落盘与并发冲突检查。单次对照是 8.429 → 9.356 ms；后续五次复测为
8.332–8.609 ms，中位数 8.539 ms。因此没有证明延迟下降。分配内存约 104 KB → 81 KB，
分配次数 342 → 约 293；只更新发生变化的最近阅读排序键，避免重写其他排序索引。

本轮实现还包括：

- 书架先显示图书，进度与统计独立补齐；搜索、分类与排序切换取消过时请求，并拒绝旧结果。
  统计使用独立请求代次，避免修改分类或删除后被旧统计覆盖；处理状态按每批最多 500 本刷新。
- 服务端分类索引在分页前过滤，搜索也保留相同分类约束。分类改名/清空在同一事务中处理整个
  用户分类，包含未加载的页面；随后刷新书架查询与游标。
- 下载时最多两批约 1 MiB 缓存写入排队，一个写入会话复用缓存与元数据，每 8 MiB 检查容量。
  中断保留已提交前缀，续传带 Range/If-Range。共享下载允许消费者独立取消；最后一个取消后，
  下一次真实写入等待旧写入结束，但等待者仍可以立即取消。
- 显式保存的离线副本按账号隔离；联网复用前校验认证和内容哈希，登录变化、权限错误或哈希
  不符均不复用。断网仍保留原有离线阅读行为。阅读器仍在整本 Blob 下载完成后打开，未实现
  按章节远程 ZIP 读取。下载实现自身也按需加载，登录页无需执行下载代码。
- 缺失哈希用持久索引定位，由一个后台线程每批 16 本回填并一次提交。失败文件保留索引，
  重启/定时重试；存在历史未回填记录时，上传仍等待该用户补齐以保持重复检测语义。
- ZIP 解码使用本地模块 Worker，启动/解码失败回退到主线程，关闭图书终止 Worker。
  核心模块预加载；可选弹窗、阅读设置、TTS 面板和声音列表延迟加载。
- Foliate 保留可读源码，构建时生成带内容哈希的原生 ESM。20 个模块由 273,543 B 缩为
  136,442 B，约减少 50%；PDF/MOBI 及 Worker 相对路径保留，PDF 字体目录保持末尾斜杠。
- 中文字体使用本地 Unicode 分片；补充三份共 17,664 B 的罕用字形兼容资源。400/600/700
  权重逐一比较 cmap，原有 7,946 个码点无丢失，覆盖增至 13,686。原三份整包 WOFF2 共
  4,592,840 B，这是资源大小，不应与单页实际网络流量直接作百分比比较。

数据库 schema 10 在一个事务中重建分类索引、gram 计数、缺失哈希索引和重复哈希成员索引；
启动迁移需要遍历一次书籍元数据，失败会回滚。文件哈希在服务启动后回填。新增持久索引以
数据库空间和写入成本换取查询速度；没有启用 NoSync，也没有新增外部服务。

## 生产浏览器门槛

最终本地记录使用 Apple M1、Node 22.22.3、Next.js 16.4.2、Go 1.27.2 与 Chromium 1217。
以下为隔离运行的一次生产构建结果，属于优化后的测量值，没有同场景浏览器优化前对照。
完整命令、原始指标与验证范围见[前端测量记录](performance/frontend-2026-10-18.txt)。

| 指标 | 实测 |
| --- | ---: |
| 移动端登录 LCP / CLS | 2124 ms / 0 |
| 登录页字体实际响应总量 | 126,008 B（约 123 KiB） |
| 移动端最长主线程任务 | 110 ms |
| 真实后端书架内容 / LCP / CLS | 392 ms / 276 ms / 0.1058 |
| 约 4 MiB EPUB 首章正文就绪 | 4662 ms |
| 首次音频 playing（确定性 TTS 夹具） | 500.2 ms |

```bash
cd frontend
rtk proxy npx playwright install chromium
rtk npm run test:perf:production
```

该命令构建 Go 和 Next.js standalone，自动选择端口，使用临时数据库、临时上传目录与测试账号，
退出后清理服务器和测试数据。浏览器报告保存在 `frontend/performance-results/`，CI 独立运行
`Production Performance` 并上传报告。测量时应避免并行执行其他压测、构建或浏览器测试。

| 场景 | 硬门槛 |
| --- | ---: |
| 390×844 登录页，CPU 4× / 下行 1.6 Mbps / RTT 40 ms | LCP < 4000 ms，CLS ≤ 0.1 |
| 同场景字体实际响应大小 | < 250,000 B |
| 同场景最长主线程任务 | < 500 ms |
| 真实后端书架内容 / LCP | < 2500 ms，CLS ≤ 0.15 |
| 书架单次交互 Event Timing | ≤ 300 ms |
| 约 4 MiB EPUB，8 Mbps / RTT 40 ms，实际章节正文出现 | < 8000 ms |
| 阅读器最长主线程任务 | < 500 ms |
| 从打开朗读面板到浏览器首次 playing | < 2500 ms |

书架与阅读器使用真实注册、登录、上传、元数据和文件接口；仅外部 TTS/声音服务以确定性
PCM 音频代替。因此首次音频值衡量前端加载/解码链路，不能代表外部语音服务延迟。
Event Timing 的零值表示没有收到超过观察阈值的交互样本，单次脚本交互不等同于用户群体 INP。
首章就绪检查 renderer 文档正文，而非页面标题。用真实浏览器同时确认 Worker 创建和离线副本
重开时不再请求文件内容。开发模式旧套件仍保留，生产套件不使用 3 倍放宽。

## 2026-10-20 TTS 实际服务样本

v0.1.5 的可选 `npm run test:tts:provider` 在临时数据库、临时账号和独立后端上，
通过真实语音服务合成两段通用文本；使用同一个浏览器音频元素，第二段提前准备。
[原始结果](performance/tts-provider-2026-10-20.json)记录首次浏览器播放 2555.2 ms，
两段间隔 27 ms，两次接口请求分别为 2082.6 / 644.2 ms。第二段在第一段结束前就绪。

该样本包含外部网络、后端和解码开销；缓存状态、设备和网络会影响结果，不是服务承诺。
脚本不会输出账号、令牌、URL 或书籍内容。配置和测量范围见
[朗读说明](tts-background-playback.md#real-provider-measurement)。确定性 CI 夹具仍用于
前端性能门槛，不能用它推断外部语音服务延迟。

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

### 历史 microbenchmark 基线（2026-07-24）

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

2026-10-18 最终构建的记录如下。体积包含 HTML 引用的 `nomodule` 脚本，属于原始文件大小，
不等于现代浏览器的实际下载量；上限保持本轮修改前的值，没有随新记录提高。

| 页面 | 当前体积 | 回归预算（max） | 脚本数 |
| --- | ---: | ---: | ---: |
| home (`/`) | 672,633 B | 725,883 B | 11 |
| login (`/login`) | 687,902 B | 731,186 B | 12 |
| shelf (`/shelf`) | 926,602 B | 1,010,472 B | 14 |

```bash
cd frontend
npm run build
npm run test:js-budget
```

### 历史首屏 JS 基线（2026-07-27）

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

生产构建的独立测量与更严格门槛由上文 `test:perf:production` 完成。开发服务器结果只用于
防灾难性回归，不作为跨机器的绝对排名。

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

## 2026-10-18 验证记录

后端完整测试、覆盖率基线、`go vet`、格式检查和相关并发/迁移/回填 race 测试通过。
前端严格 lint、176 项单元测试及覆盖率基线、3 项资源构建测试、生产构建与 JS 预算、
32 项功能 E2E、16 项 macOS 视觉测试和 2 项生产性能测试通过。Linux 视觉基线未在本地
执行，保留原文件并由 CI 校验。生产性能测试在最终代码上独立运行，避免与其他压测争用资源。
