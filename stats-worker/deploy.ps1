<#
  寒鹤博客 · 访问统计 Worker 一键部署（Windows PowerShell）

  用法：
    powershell -ExecutionPolicy Bypass -File .\deploy.ps1            # 部署并回填 ../config.json
    powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -NoConfig  # 只部署，不改前端

  说明：
    - 本脚本不会替你完成 Cloudflare 授权；未登录时会停下并提示执行 npx wrangler login。
    - 盐在内存里随机生成，只通过 stdin 写入 Cloudflare secret，不回显、不落盘、不进仓库。
#>

param([switch]$NoConfig)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

function Fail($msg) {
  Write-Host ""
  Write-Host "[失败] $msg" -ForegroundColor Red
  exit 1
}

# 1. wrangler 可用性
$verOut = (npx wrangler --version 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or $verOut -notmatch '\d+\.\d+') {
  Fail "wrangler 不可用。请先安装 Node.js，并执行：npm i -g wrangler"
}
Write-Host "[1/5] wrangler 可用：$($verOut.Trim().Split([Environment]::NewLine)[-1])" -ForegroundColor Green

# 2. 登录状态（授权必须由用户本人完成）
$whoOut = (npx wrangler whoami 2>&1 | Out-String)
if ($whoOut -match 'not authenticated') {
  Write-Host ""
  Write-Host "尚未登录 Cloudflare，需要你本人授权：" -ForegroundColor Yellow
  Write-Host "  1) 执行：npx wrangler login"
  Write-Host "  2) 浏览器会打开 Cloudflare 授权页，点【Allow】"
  Write-Host "  3) 页面提示成功后，重新运行本脚本"
  Write-Host ""
  exit 2
}
Write-Host "[2/5] 已登录 Cloudflare" -ForegroundColor Green

# 3. KV 命名空间（占位 id 时自动创建并写回 wrangler.toml）
$tomlPath = Join-Path $here 'wrangler.toml'
$toml = Get-Content -Path $tomlPath -Raw
if ($toml -match '请替换为你的 KV 命名空间 ID') {
  Write-Host "[3/5] 创建 KV 命名空间 STATS ..."
  $kvOut = (npx wrangler kv namespace create STATS 2>&1 | Out-String)
  $m = [regex]::Match($kvOut, 'id\s*=\s*"([0-9a-fA-F]{32})"')
  if (-not $m.Success) {
    Fail "没能从输出中解析 KV id。请手动执行 npx wrangler kv namespace create STATS，把 id 填进 wrangler.toml。`n$kvOut"
  }
  $kvId = $m.Groups[1].Value
  $toml = $toml -replace '请替换为你的 KV 命名空间 ID', $kvId
  Set-Content -Path $tomlPath -Value $toml -Encoding UTF8 -NoNewline
  Write-Host "[3/5] 已写入 KV id：$kvId" -ForegroundColor Green
} else {
  Write-Host "[3/5] wrangler.toml 已有 KV id，跳过创建" -ForegroundColor Green
}

# 4. 生成随机盐并写进 secret（不回显、不落盘）
Write-Host "[4/5] 生成随机盐并写入 secret IP_SALT ..."
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$salt = [Convert]::ToBase64String($bytes)
$secretOut = ($salt | npx wrangler secret put IP_SALT 2>&1 | Out-String)
$salt = $null
[GC]::Collect()
if ($LASTEXITCODE -ne 0) { Fail "写入 secret 失败：`n$secretOut" }
Write-Host "[4/5] IP_SALT 已写入（值不回显）" -ForegroundColor Green

# 5. 部署并回填 config.json
Write-Host "[5/5] 部署 Worker ..."
$depOut = (npx wrangler deploy 2>&1 | Out-String)
Write-Host $depOut
if ($LASTEXITCODE -ne 0) { Fail "部署失败，请查看上方输出" }
$m2 = [regex]::Match($depOut, 'https://[A-Za-z0-9._-]+\.workers\.dev')
if (-not $m2.Success) { Fail "部署成功但未解析到 workers.dev 地址，请手动查看上方输出" }
$endpoint = $m2.Value

if (-not $NoConfig) {
  $cfgPath = Join-Path (Split-Path -Parent $here) 'config.json'
  if (Test-Path $cfgPath) {
    $cfg = Get-Content -Path $cfgPath -Raw
    if ($cfg -match '"endpoint"\s*:\s*"[^"]*"') {
      $cfg = [regex]::Replace($cfg, '("endpoint"\s*:\s*")[^"]*(")', {
        param($mm) $mm.Groups[1].Value + $endpoint + $mm.Groups[2].Value
      })
      Set-Content -Path $cfgPath -Value $cfg -Encoding UTF8 -NoNewline
      Write-Host "已回填 config.json 的 stats.endpoint" -ForegroundColor Green
    } else {
      Write-Host "config.json 里没有 stats.endpoint 字段，请手动添加：" -ForegroundColor Yellow
      Write-Host "  `"stats`": { `"endpoint`": `"$endpoint`" }"
    }
  } else {
    Write-Host "未找到 config.json，请手动填写：$endpoint" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "部署完成：$endpoint" -ForegroundColor Cyan
Write-Host "自查命令："
Write-Host "  curl.exe -s $endpoint"
Write-Host "提交 config.json 后，GitHub Pages 约 1–2 分钟生效，页脚才会显示数字。"
exit 0
