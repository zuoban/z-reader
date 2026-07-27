# 架构决策记录（ADR）

ADR 用于记录影响架构、数据安全、部署方式或维护成本的重要技术决定。记录一旦接受，不应
为匹配现状而改写；后续改变应新建 ADR 并标明替代关系。

本项目采用轻量格式：

- **状态**：Proposed、Accepted、Superseded 或 Deprecated。
- **背景**：需要解决的约束或问题。
- **决策**：采取的方案。
- **后果**：收益、限制和必须遵守的运行要求。

## 已接受的决策

- [ADR-0001：bbolt 与本地文件存储](0001-bbolt-and-local-file-storage.md)
- [ADR-0002：Caddy 作为同源公网入口](0002-caddy-as-the-public-gateway.md)
- [ADR-0003：私有、低基数指标](0003-private-low-cardinality-metrics.md)
