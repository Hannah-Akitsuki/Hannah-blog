/**
 * 寒鹤博客 · 访问计数 Worker（Cloudflare Workers + KV，免费计划可用）
 *
 * 只写入「按日期去重的 IP 哈希」和两个计数，不保存原始 IP。
 * - 绑定：KV 命名空间 STATS
 * - 密钥：IP_SALT（用 wrangler secret put 设置，不要写进仓库）
 * - 返回：{ today, total }
 */

const DEFAULT_ORIGINS = 'https://hannah-akitsuki.github.io';
const DAY_TTL = 172800; // 去重标记保留 2 天，过期自动清理

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return json({ error: '只支持 GET' }, 405, cors);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/' && url.pathname !== '/stats') {
      return json({ error: 'Not Found' }, 404, cors);
    }

    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (!ip) return json({ error: '缺少 CF-Connecting-IP' }, 400, cors);
    if (!env.STATS) return json({ error: 'KV 未绑定 STATS' }, 500, cors);

    const salt = env.IP_SALT || '';
    if (!salt) return json({ error: '未设置 IP_SALT' }, 500, cors);

    // 哈希后只取前 32 位十六进制，够用且更短
    const visitor = (await hashIp(ip, salt)).slice(0, 32);
    if (rateLimited(visitor)) {
      return json({ error: '请求过于频繁，请稍后再试' }, 429, cors);
    }

    const day = todayIn(Number(env.TZ_OFFSET || 8));
    const dayKey = `t:${day}`;
    const seenKey = `d:${day}:${visitor}`;

    let total = toCount(await env.STATS.get('total'));
    let today = toCount(await env.STATS.get(dayKey));

    // 同一哈希当天只 +1；KV 最终一致，高并发下可能少计，个人站可接受
    const seen = await env.STATS.get(seenKey);
    if (!seen) {
      today += 1;
      total += 1;
      await env.STATS.put(seenKey, '1', { expirationTtl: DAY_TTL });
      await Promise.all([
        env.STATS.put(dayKey, String(today)),
        env.STATS.put('total', String(total))
      ]);
    }

    return json({ today, total }, 200, cors);
  }
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

/* CORS 白名单：ALLOWED_ORIGINS 里用逗号分隔多个来源，* 表示全部放行 */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const list = String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS)
    .split(',').map(s => s.trim()).filter(Boolean);
  const allowAll = list.includes('*');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  if (origin && (allowAll || list.includes(origin))) {
    headers['Access-Control-Allow-Origin'] = allowAll ? '*' : origin;
  }
  return headers;
}

/* HMAC-SHA256(盐, IP)：盐只存在 Worker secret 里，无法反推原始 IP */
async function hashIp(ip, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(ip));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* 按 UTC+8 取日期（TZ_OFFSET 可改） */
function todayIn(offsetHours) {
  const t = new Date(Date.now() + (Number.isFinite(offsetHours) ? offsetHours : 8) * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}

function toCount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/* 最基础的频率限制：每个 Worker 实例内存里按访客 60 秒最多 30 次。
   Cloudflare 会跨实例调度，所以只是尽力而为的防线，不是硬性配额。 */
const hits = new Map();
function rateLimited(visitor, limit = 30, windowMs = 60000) {
  const now = Date.now();
  const arr = (hits.get(visitor) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(visitor, arr);
    return true;
  }
  arr.push(now);
  hits.set(visitor, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
    }
  }
  return false;
}
