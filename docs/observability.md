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

当 TTS 首次被实际使用后，还会输出以下 gauge；单独访问 `/metrics` 不会初始化 TTS：

- `z_reader_tts_active_syntheses`：正在合成的请求数。
- `z_reader_tts_queue_depth`：等待合成槽位的请求数（不含正在合成的请求）。
- `z_reader_tts_concurrency_limit` 与 `z_reader_tts_queue_capacity`：当前配置的并发与排队上限。

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
