# 访问统计 Worker（Cloudflare · 免费计划）

GitHub Pages 是纯静态托管，前端拿不到访客 IP，也没有访问日志，所以「每日访问人数」必须有一个服务端。
这里用 Cloudflare Workers + KV 实现：读取 `CF-Connecting-IP`，加盐做 SHA-256（HMAC）哈希，同一天同一哈希只计一次，返回：

```json
{ "today": 12, "total": 345 }
```

只保存哈希与计数，不落原始 IP。

## 一、部署步骤

1. **注册 Cloudflare**：<https://dash.cloudflare.com/sign-up>（免费计划即可，Workers 与 KV 都有免费额度）。
2. **安装并登录 wrangler**（在 `stats-worker/` 目录里执行）：
   ```bash
   npx wrangler login
   ```
3. **创建 KV 命名空间**：
   ```bash
   npx wrangler kv namespace create STATS
   ```
   命令会输出一段 `[[kv_namespaces]]` 配置和一个 `id`，把 `wrangler.toml` 里的
   `id = "请替换为你的 KV 命名空间 ID"` 换成这个 id。
4. **设置盐（secret）**：
   ```bash
   npx wrangler secret put IP_SALT
   ```
   粘贴一段足够长的随机字符串（例如 32 位以上），不要提交进仓库。
5. **部署**：
   ```bash
   npx wrangler deploy
   ```
   成功后终端会给出地址，形如：
   ```
   https://hanhe-visit-stats.<你的子域>.workers.dev
   ```
6. **填进前端配置**：编辑站点根目录 `config.json`：
   ```json
   "stats": { "endpoint": "https://hanhe-visit-stats.xxx.workers.dev" }
   ```
   提交推送后，GitHub Pages 构建完成即可在页脚看到「今日访问 / 累计」。

## 二、验证

```bash
curl -s https://hanhe-visit-stats.xxx.workers.dev
```

- 第一次返回 `{"today":1,"total":1}`；
- 同一出口 IP 立刻再请求，数字不变（当天已去重）；
- 换网络 / 换设备后会再 +1。

## 三、隐私与限制（如实说明）

- 只写入 `d:<日期>:<哈希>` 去重标记（保留 2 天）与两个计数键，**不保存原始 IP**；盐只在 Worker secret 中，泄露 KV 也无法直接还原 IP。
- KV 是最终一致存储，同一秒大量并发时计数可能少计 1–2 次；个人博客场景可接受。
- 前端有 5 秒超时与失败降级：接口未配置、报错或返回格式不对时，页脚整块保持隐藏，不会显示 0 或错误提示。
- CORS 白名单在 `wrangler.toml` 的 `ALLOWED_ORIGINS`（默认只允许 `https://hannah-akitsuki.github.io`）。这只限制浏览器跨域读取，不能让接口变成公开计数服务以外的用途。
- 频率限制是每个 Worker 实例内存里的 60 秒 30 次，属于基础防线；Cloudflare 会跨实例调度，不是硬配额。
- 免费额度（以 Cloudflare 当期政策为准）：Workers 每日 10 万请求、KV 每日 10 万读 / 1000 写。按个人站的访问量足够。
- 本地 `npx wrangler dev` 调试时通常没有 `CF-Connecting-IP`，接口会返回 400，属正常现象。

## 四、文件

| 文件 | 作用 |
| --- | --- |
| `worker.js` | Worker 逻辑：CORS、限频、哈希、按日去重计数 |
| `wrangler.toml` | 部署配置：KV 绑定、允许来源、时区偏移 |
| `README.md` | 本说明 |
