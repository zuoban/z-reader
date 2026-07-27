# 部署与运维手册

本手册面向单人或家庭自部署。目标是在不增加值班、审批或额外平台的前提下，让部署、升级、
恢复和排障都有可复现的最小步骤。

## 运行边界

Compose 部署使用以下持久化目录；升级、重建容器和清理镜像时都必须保留它们：

| 路径 | 内容 | 处理原则 |
| --- | --- | --- |
| `./data/` | 主数据库、会话数据库和自动备份 | 不要用 `docker compose down -v` 或清理脚本删除 |
| `./uploads/` | 原始图书与封面 | 与 `data/` 一起备份和恢复 |
| Caddy named volumes | HTTPS 证书和 Caddy 运行状态 | 域名部署时保留 |

先确认 Compose 实际解析出的挂载和环境变量：

```bash
docker compose config
docker compose ps
```

## 首次部署与启动检查

```bash
git clone https://github.com/zuoban/z-reader.git
cd z-reader
cp .env.example .env
# 公网部署时，把 .env 中的 CADDY_SITE 改为自己的域名。
docker compose up -d --build

docker compose ps
curl --fail --show-error http://127.0.0.1/healthz
curl --fail --show-error http://127.0.0.1/readyz
```

`/healthz` 仅代表进程存活；`/readyz` 还会检查数据库和上传目录。生产探测应使用
`/readyz`。`/metrics` 只有设置 `METRICS_ENABLED=true` 才存在，且只应由内网采集器
访问；详细配置见[可观测性说明](observability.md)。

## 备份与恢复演练

服务会在启动时创建已校验的备份，之后按 `BACKUP_INTERVAL_HOURS`（默认 24）执行。Compose
下备份位于 `./data/backups/`，其中包含数据库、会话、上传文件和 SHA-256 清单。不要把
“目录存在”当成可恢复；每次升级前和每月至少一次，都应校验最近备份：

```bash
backup_dir="$(find data/backups -mindepth 1 -maxdepth 1 -type d -name 'backup-*' | sort | tail -n 1)"
test -n "$backup_dir"
(cd backend && go run ./cmd/verify-backup --dir "../$backup_dir")
```

将**已验证**的备份同步到异地存储，并保留至少一份不受本机磁盘故障影响的副本。同步失败、
校验失败或没有新备份时，先暂停升级和清理操作，保留现场并检查日志：

```bash
docker compose logs --tail=200 z-reader
```

每月在隔离主机或独立目录完成一次恢复演练：恢复到全新的、空的路径，启动一个隔离的
Z Reader 实例，访问 `/readyz`，并确认至少一本书和登录会话可用。记录开始/结束时间、
备份时间、问题和处理结果；以 RPO 不超过 24 小时、RTO 不超过 30 分钟为初始目标。

### 每月演练清单

在**非生产**空目录或隔离主机上按顺序执行；不要覆盖正在使用的 `data/` / `uploads/`。

1. **取异地副本**：从本机磁盘以外的位置（另一台机器、对象存储、外置盘）复制最近一份
   `backup-*` 目录。若只有本机副本，先 `cp -R` 到隔离路径以模拟“脱离原卷”。
2. **校验**：
   ```bash
   (cd backend && go run ./cmd/verify-backup --dir "<offsite-or-isolated-backup-dir>")
   ```
3. **恢复到空目标**（示例路径可改）：
   ```bash
   mkdir -p /tmp/z-reader-drill/restored
   (cd backend && go run ./cmd/restore-backup \
     --dir "<offsite-or-isolated-backup-dir>" \
     --db /tmp/z-reader-drill/restored/data.db \
     --uploads /tmp/z-reader-drill/restored/uploads)
   ```
4. **启动隔离实例并探活**（Compose 示例：把挂载指到演练目录，或临时改端口）：
   ```bash
   curl --fail --show-error http://127.0.0.1:<drill-port>/readyz
   ```
5. **业务抽查**：登录成功；书架至少可见一本已恢复图书（或上传列表非空）。
6. **记录**下方表格：开始/结束、备份 `created_at`、RTO、问题与跟进。
7. **清理**：确认生产未被动后，删除演练目录与临时容器。

初始目标：

| 指标 | 目标 |
| --- | --- |
| RPO | ≤ 24 小时（最近已校验备份的年龄） |
| RTO | ≤ 30 分钟（从开始取副本到 `/readyz` 成功） |

### 恢复演练记录

新完成的演练追加一行；不要改写历史行。`范围` 写清是否包含完整 `/readyz` 与登录抽查。

| 日期 (UTC) | 操作者 | 备份 `created_at` | 异地/隔离来源 | 开始 | 结束 | RTO | 范围 | 结果 | 问题与跟进 |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |
| 2026-07-27 | maintainer | 2026-07-26T21:04:26.135553Z | 本机 backup 复制到 `/tmp` 隔离目录 | 13:22:49Z | 13:22:50Z | 1s | CLI：`verify-backup` + `restore-backup`；14 个上传文件落盘 | 通过 | 未拉起 Compose `/readyz`；下次月度演练补完整探活与登录抽查 |

## 从备份恢复

恢复会拒绝覆盖已有数据库和上传目录。这是防止误覆盖的保护，不能绕过。以下示例适用于
Compose 部署，且必须在服务停止后执行：

```bash
docker compose down

timestamp="$(date +%Y%m%d-%H%M%S)"
mv data "data.before-restore-$timestamp"
mv uploads "uploads.before-restore-$timestamp"

backup_dir="data.before-restore-$timestamp/backups/<backup-name>"
(cd backend && go run ./cmd/restore-backup \
  --dir "../$backup_dir" \
  --db ../data/data.db \
  --uploads ../uploads)

docker compose up -d --build
curl --fail --show-error http://127.0.0.1/readyz
```

只有最后一条命令成功，恢复才算完成。确认书库和登录正常前，不要删除
`data.before-restore-*` 与 `uploads.before-restore-*`；它们是最直接的回退点。

## 升级与回滚

每次升级前，先确认工作区没有意外修改、当前实例健康，并校验一份最新备份：

```bash
git status --short
curl --fail --show-error http://127.0.0.1/readyz
# 按上一节执行备份校验。
git rev-parse --short HEAD
```

记录当前提交或发布标签后，使用快进更新和 Compose 重建。不要在生产环境使用
`git reset --hard` 或强推来“修复”升级：

```bash
git pull --ff-only origin main
docker compose up -d --build --remove-orphans
docker compose ps
curl --fail --show-error http://127.0.0.1/healthz
curl --fail --show-error http://127.0.0.1/readyz
```

升级失败且尚未写入不兼容的数据时，可切回刚才记录的提交或正式版本标签，再重建容器：

```bash
docker compose down
git checkout <known-good-commit-or-tag>
docker compose up -d --build --remove-orphans
curl --fail --show-error http://127.0.0.1/readyz
```

如果数据库或上传内容已损坏，或者不确定版本兼容性，不要只回滚镜像；按“从备份恢复”恢复到
新的空目录，并保留故障目录供排查。

## 常见故障

| 现象 | 先做什么 | 后续处理 |
| --- | --- | --- |
| 容器不是 `healthy` | `docker compose logs --tail=200 z-reader` | 确认 `data/`、`uploads/` 可读写，修复配置后重启 |
| `/healthz` 成功但 `/readyz` 失败 | 查看同一段日志 | 检查数据库与上传目录；必要时从已验证备份恢复 |
| 没有新备份或备份校验失败 | 停止升级与清理 | 保留最近可用备份，检查磁盘和 `Failed to create verified backup` 日志 |
| 磁盘空间不足 | `df -h`，检查数据和 Docker 占用 | 确认异地备份可恢复后，再清理过期备份或无用镜像 |
| 响应慢或 5xx 增加 | 查看日志与[可观测性说明](observability.md) | 检查 `/readyz`、磁盘空间、TTS 限流和外部依赖 |
| HTTPS 证书异常 | 确认 `CADDY_SITE` 是公开域名，80/443 可达 | 保留 Caddy volumes，查看 Caddy 日志 |

完成任何恢复、升级或故障处理后，记录影响范围、时间线、根因和下一步改进。这份简短记录会让
下次操作更快，也能作为每月可靠性复盘的输入。
