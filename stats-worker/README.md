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
- 免费额度（以 Cloudflare 当期政策为准）：Workers 每日 10 万请求；KV 免费版每日 10 万读 + **1000 写**。每次新访客最多 3 次写（去重标记 + 当日计数 + 累计），老访客 0 次写，因此**每天大约 330 位新访客**就会接近写入上限；超限后 KV 写入失败，Worker 仍会用已读到的数字正常返回（前端继续显示，只是不再增长），不会报错弹窗，也不会显示假数字。
- 本地 `npx wrangler dev` 调试时通常没有 `CF-Connecting-IP`，接口会返回 400，属正常现象。

## 四、一键部署脚本

`stats-worker/` 下提供了 `deploy.ps1`（双击 `deploy.bat` 也可）：

```powershell
# 在 stats-worker 目录执行
powershell -ExecutionPolicy Bypass -File .\deploy.ps1            # 部署并自动回填 ../config.json
powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -NoConfig  # 只部署，不改前端配置
```

脚本会依次做：

1. 检查 `wrangler` 与登录状态（**未登录会提示你先执行 `npx wrangler login`，脚本不会替你授权**）；
2. 若 `wrangler.toml` 里的 KV id 还是占位符，自动 `kv namespace create STATS` 并写回 id；
3. 生成 32 字节随机盐，通过 stdin 直接 `secret put IP_SALT`（只进 Cloudflare secret，不回显、不落盘、不进仓库）；
4. `wrangler deploy`，从输出里提取 `*.workers.dev` 地址；
5. 把地址写进根目录 `config.json` 的 `stats.endpoint`（可用 `-NoConfig` 关闭）。

命令清单（手动版）：

```bash
npx wrangler login
npx wrangler kv namespace create STATS      # 把 id 填进 wrangler.toml
npx wrangler secret put IP_SALT             # 粘贴随机串
npx wrangler deploy
```

## 五、凭证与安全说明（必读）

### 1. GitHub fine-grained PAT（网页端发布计划用）

- 只授予**本仓库**（`Hannah-Akitsuki/Hannah-blog`）的 **Contents: Read and write**，不要给 Actions、Secrets、Administration 等任何其它权限。
- 建议有效期 **90 天**，到期重新生成；不用时随时撤销。
- 只保存在你浏览器的 `localStorage`（键名 `plan:pat`），随站点脚本读取，**不写入代码、不提交仓库、不出现在任何示例里**；发布面板有「清除 token」按钮。
- 别在公用电脑或别人浏览器里粘贴；清除 token 后再离开。

### 2. Cloudflare API Token（仅在用 token 方式部署时需要）

如果用 `wrangler login` 走浏览器 OAuth，就**不需要**创建 API Token。若要在 CI 或脚本里用 token，最小权限为：

- `Account · Workers Scripts · Edit`
- `Account · Workers KV Storage · Edit`
- `Account · Account Settings · Read`（`wrangler whoami` 需要）
- 资源范围限定到你自己那一个账号，不要选「所有账号」。

Token 只放在本机环境变量（`CLOUDFLARE_API_TOKEN`）或 GitHub Actions Secrets，绝不写进 `wrangler.toml`、脚本或提交。

### 3. 打开 GitHub 的密钥扫描与推送保护

仓库页 → **Settings → Code security and analysis**：

- 开启 **Secret scanning**（公开仓库免费）；
- 开启 **Push protection**（拦截含 token 的推送）；
- 如已有泄露记录，在 **Security → Secret scanning** 里查看并处理。

`.github/workflows` 里的工作流只使用 `GITHUB_TOKEN`（`permissions: contents: write`）与官方 Action，没有硬编码凭证；仓库当前与历史提交中均未发现常见 token 形态。

### 4. 万一泄露怎么撤销

- **GitHub PAT**：GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → 找到该 token → **Delete / Revoke**；然后重新生成并只在网页端填入。
- **Cloudflare API Token**：Cloudflare Dashboard → My Profile → API Tokens → 对应 token → **Roll**（轮换）或 **Delete**。
- **`IP_SALT`**：`npx wrangler secret put IP_SALT` 写入新盐即可，旧哈希立即失去关联；如需彻底清零，删除 KV 命名空间后重建。
- 若 token 已进入提交历史：立即撤销该 token（撤销比改历史重要），再视情况用 `git filter-repo` 清理；**不要**用 force push 掩盖。

## 六、文件

| 文件 | 作用 |
| --- | --- |
| `worker.js` | Worker 逻辑：CORS、限频、哈希、按日去重计数 |
| `wrangler.toml` | 部署配置：KV 绑定、允许来源、时区偏移（不含任何密钥） |
| `deploy.ps1` / `deploy.bat` | 一键部署：检查登录、建 KV、生成盐写 secret、deploy、回填 config |
| `README.md` | 本说明 |
