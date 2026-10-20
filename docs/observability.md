# 可观测性与告警

Z Reader 内置低基数、Prometheus 兼容的指标，不需要引入额外 SDK。默认不公开指标；仅在
受信任的内网监控网络中启用。

## 启用指标

在 Compose 部署的 `.env` 中设置：

```dotenv
METRICS_ENABLED=true
```

重启服务后，后端会在内部地址 `http://z-reader:8080/metrics` 提供指标。默认
`docker-compose.yml` 不会将 8080 映射到宿主机，也不会经 Caddy 公开 `/metrics`；请保持这
一边界，不要将指标端点直接暴露到公网。

## Prometheus 与 Grafana

仓库提供了以下可直接复用的资产：

- [`observability/prometheus.yml`](../observability/prometheus.yml)：15 秒抓取配置。
- [`observability/alerts.yml`](../observability/alerts.yml)：目标不可达、5xx 比例、操作 p95
  延迟、TTS 队列饱和、备份失败与备份超期六条告警规则。
- [`observability/grafana-dashboard.json`](../observability/grafana-dashboard.json)：可在 Grafana
  的 **Dashboards → New → Import** 导入的总览 dashboard。

Prometheus 必须加入与 `z-reader` 相同的 Docker 网络，或将 `z-reader:8080` 替换为你的内部
服务地址。配置中的 `rule_files` 假定 `alerts.yml` 与 `prometheus.yml` 被挂载到同一目录。
导入 dashboard 时选择你的 Prometheus 数据源即可。

## 指标范围

HTTP 指标以请求方法、路由模板和状态码聚合，不包含用户、书名、查询词、文件名或书籍 ID。
操作直方图目前覆盖：

- `book_search`
- `book_preview`
- `book_upload_write`
- `cover_thumbnail`
- `progress_save`

当 TTS 首次被实际使用后，还会输出以下指标；单独访问 `/metrics` 不会初始化 TTS，
也不会创建音频缓存目录：

- `z_reader_tts_active_syntheses`：正在合成的请求数。
- `z_reader_tts_queue_depth`：等待合成槽位的请求数（不含正在合成的请求）。
- `z_reader_tts_concurrency_limit` 与 `z_reader_tts_queue_capacity`：当前配置的并发与排队上限。
- `z_reader_tts_cache_requests_total{layer,result}`：缓存查询次数。`layer` 固定为 `memory`、
  `disk`，`result` 固定为 `hit`、`miss`。内存命中时不查询磁盘；并发合并的调用各自记录缓存查询。
- `z_reader_tts_requests_total{result}`：已完成的调用次数，包括缓存命中和等待共享合成的调用。
  `result` 固定为 `success`、`failure`、`cancelled`、`busy`；超时、上游限流与服务错误计入
  `failure`，本地队列拒绝计入 `busy`，调用方取消计入 `cancelled`。
- `z_reader_tts_queue_wait_seconds`：每份实际合成任务等待槽位的耗时直方图，包括队列拒绝、
  排队超时与取消；缓存命中和加入已有任务的调用不产生新的样本。
- `z_reader_tts_synthesis_duration_seconds`：获取槽位后到合成结束的耗时直方图，包含凭证端点
  获取、刷新和上游响应，排除排队与缓存读写。共享合成只记录一个样本，成功与失败均记录。

两个 TTS 直方图均输出 `_bucket`、`_sum` 和 `_count`，秒数桶上界固定为
`0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10, 30, 55, +Inf`。所有计数和直方图更新均同步保护。
标签不包含文本、SSML、缓存键、声音名称、输出格式、用户、凭证或上游响应正文。


自动备份启用后，还会输出以下 backup 指标。它们只记录聚合状态，不包含备份路径或错误详情：

- `z_reader_backup_enabled`、`z_reader_backup_interval_seconds`：是否启用及其配置间隔。
- `z_reader_backup_attempts_total`、`z_reader_backup_failures_total`：已完成尝试与失败次数。
- `z_reader_backup_last_success_timestamp_seconds`、`z_reader_backup_last_duration_seconds`：最近一次
  已校验备份的完成时间与耗时。

限流拒绝会输出 `z_reader_rate_limit_rejections_total`，其中 `scope` 只可能是 `client_ip`、`user`
或 `custom`。它不包含真实 IP 或用户标识；如需定位具体接口，请结合 HTTP 指标中的 429 路由聚合。

以下 PromQL 可直接用于排障：

```promql
# 某个操作的五分钟 p95
histogram_quantile(
  0.95,
  sum by (operation, le) (
    rate(z_reader_operation_duration_seconds_bucket[5m])
  )
)

# 五分钟服务端错误比例
sum(rate(z_reader_http_requests_total{status=~"5.."}[5m]))
/
clamp_min(sum(rate(z_reader_http_requests_total[5m])), 0.001)
```

```promql
# 最近一次已校验备份距今的秒数；超过两个备份周期会触发告警
time() - z_reader_backup_last_success_timestamp_seconds
```

```promql
# 五分钟内按限流策略分组的拒绝速率
sum by (scope) (rate(z_reader_rate_limit_rejections_total[5m]))
```


## TTS 时限与错误契约

每份共享合成任务从进入队列前开始使用同一个 **55 秒**工作时限，覆盖排队、凭证端点等待与
刷新、认证重试以及上游音频读取。默认排队时限为 30 秒，凭证端点每次刷新最多 10 秒，两者均
受剩余工作时限约束。前端单次请求使用 **65 秒**时限，为后端返回明确错误留出余量。
缓存命中直接返回；缓存写入不属于上游合成耗时统计。

相同 SSML 与输出格式共享一次合成。一个调用取消仅退出自身等待；最后一个调用取消时立即
取消上游工作并移除合并记录，使立即重试能够启动新任务。凭证刷新同样共享，但每个等待者
独立响应自己的取消信号，首个调用的取消不会影响其他调用。

`/api/tts` 与 `/api/ssml` 保持音频成功响应及 JSON 的 `error` 字段，合成错误还返回有限的
`code` 字段：

| HTTP 状态 | `code` | 含义与处理 |
| --- | --- | --- |
| 400 / 422 | `invalid_ssml` | 上游拒绝语音内容格式，可尝试一次纯文本回退；不刷新凭证。 |
| 429 | `rate_limited` / `busy` | 上游限流或本地队列繁忙，按 `Retry-After` 延迟重试。 |
| 503 | `authentication` | 上游 401/403 在一次凭证刷新后仍失败，稍后重试；不代表用户登录失效。 |
| 502 / 503 / 504 | `unavailable` | 上游、凭证端点或网络暂时不可用，使用退避重试。 |
| 504 | `deadline` | 工作时限或网络超时，使用退避重试。 |

调用方已断开时不会尝试写回错误。服务内部取消错误使用 `cancelled`（503）。参数缺失、
请求体过大等输入校验保留原有 400/413 响应，不附 `invalid_ssml`，也不应触发纯文本回退。
上游凭证端点自身的 400/422 映射为 502，避免把服务端错误误认为用户 SSML 错误。

`Retry-After` 仅接受有效的非负秒数或 HTTP 日期，统一输出秒数并限制为最多 300 秒；上游
429 缺失或返回无效值时使用 30 秒，本地繁忙同样使用 30 秒。不会将任意上游头、响应正文、
令牌或 URL 透传给调用方。日志仅记录合成内容的散列键、字节数、格式和安全错误分类；内存
及私有目录中的磁盘缓存包含音频本身，应按书籍内容的隐私要求保护和清理。监控指标均为进程
生命周期内的聚合值，进程重启后重置。

## 运行告警与外部采集器

备份与 TTS 使用应用指标；就绪状态和磁盘空间则应由相应基础设施采集器负责：

| 风险 | 推荐信号 | 建议阈值 |
| --- | --- | --- |
| 就绪失败 | Blackbox exporter 采集 `/readyz` 的 `probe_success` | 连续 5 分钟失败，紧急 |
| 备份失败 | `increase(z_reader_backup_failures_total[1h])` | 任意一次失败，紧急 |
| 备份超期 | 备份距今时间超过两个 `z_reader_backup_interval_seconds` | 持续 15 分钟，警告 |
| 数据盘空间不足 | Node exporter 的 `node_filesystem_avail_bytes / node_filesystem_size_bytes` | 少于 10%，警告；少于 5%，紧急 |
| TTS 过载 | `z_reader_tts_queue_depth / z_reader_tts_queue_capacity` | 超过 80% 持续 5 分钟，警告 |

告警应发送到你能实际响应的渠道。个人部署通常只需一个即时通知渠道；不要为单人项目配置
无人值守的多级值班流程。处理告警时记录时间、影响、根因和修复，作为每月可靠性复盘的输入。
