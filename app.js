/* 寒鹤 · 个人博客 —— 纯静态前端逻辑 */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bust = p => p + (p.includes('?') ? '&' : '?') + 't=' + Date.now();

/* ---------------- 通用工具 ---------------- */
function stripFrontMatter(text) {
  const t = String(text == null ? '' : text);
  if (!/^---\s*\r?\n/.test(t)) return t;
  const m = t.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/);
  return m ? t.slice(m[0].length) : t;
}
/* 字数口径：中文按字、英文按单词（数字串算 1 词）；
   去掉 front matter、Markdown 符号、图片地址与链接地址；
   围栏代码块整体不计入。 */
function countWords(md) {
  let t = stripFrontMatter(md);
  t = t.replace(/```[\s\S]*?```/g, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  t = t.replace(/[#>*_`~|=+\-\[\]()]/g, ' ');
  const cjk = (t.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
  const words = (t.match(/[A-Za-z]+(?:['’][A-Za-z]+)?|\d+(?:\.\d+)?/g) || []).length;
  return cjk + words;
}
function readMinutes(n) { return Math.max(1, Math.ceil(n / 350)); }
function wordLabel(n) { return n ? ('约 ' + n.toLocaleString('zh-CN') + ' 字 · 阅读 ' + readMinutes(n) + ' 分钟') : ''; }
function slugify(text) {
  return String(text == null ? '' : text)
    .replace(/\*\*|__/g, '')
    .replace(/[\s\u3000]+/g, '-')
    .replace(/[，。！？、：；（）【】《》「」『』“”‘’"'!?,.:;()\[\]<>\/\\|@#$%^&*+=~`]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}
const safeDecode = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
function reduceMotion() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
let vtBusy = false;
function withVT(fn) {
  if (!document.startViewTransition || reduceMotion() || vtBusy ||
      document.documentElement.classList.contains('booting')) { fn(); return; }
  try {
    vtBusy = true;
    const t = document.startViewTransition(fn);
    if (t) {
      [t.finished, t.ready, t.updateCallbackDone].forEach(p => { if (p && p.catch) p.catch(() => {}); });
      if (t.finished) t.finished.catch(() => {}).then(() => { vtBusy = false; });
      else vtBusy = false;
    } else vtBusy = false;
  } catch (e) { vtBusy = false; fn(); }
}
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 240);
  }, 2000);
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => legacyCopy(text));
  }
  return Promise.resolve(legacyCopy(text));
}
function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}


const state = {
  config: null, docs: [], photos: [], links: [], music: null, diary: [], now: null, books: null,
  current: -1, sourceText: '', photoShown: 0, track: 0, giscusLoaded: false
};
const PAGE_SIZE = 60;

/* ---------------- 站主模式 ----------------
   仅隐藏编辑入口，不构成安全防护：静态站无法验证身份。
   ?owner=1 进入（写入 localStorage，本机长期有效）；?owner=0 或面板内按钮退出。 */
const OWNER_KEY = 'owner';
function isOwner() { try { return localStorage.getItem(OWNER_KEY) === '1'; } catch (e) { return false; } }
function setOwner(on) {
  try { on ? localStorage.setItem(OWNER_KEY, '1') : localStorage.removeItem(OWNER_KEY); } catch (e) {}
  document.body.classList.toggle('owner', !!on);
}
function refreshOwnerViews() {
  renderLinks();
  renderMusic();
  renderDiary();
}
function toggleOwner() {
  setOwner(!isOwner());
  const dlg = $('#customize');
  if (!isOwner() && dlg && dlg.open) dlg.close();
  refreshOwnerViews();
}
function initOwner() {
  const p = new URLSearchParams(location.search);
  const flag = p.get('owner');
  if (flag === '1') setOwner(true);
  else if (flag === '0') setOwner(false);
  else setOwner(isOwner());
  if (flag === '1' || flag === '0') {
    p.delete('owner');
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  /* 连点品牌 5 次进入 / 退出（触屏同样可用） */
  let taps = 0, timer = null;
  $('.brand').addEventListener('click', e => {
    taps++;
    clearTimeout(timer);
    timer = setTimeout(() => { taps = 0; }, 2500);
    if (taps >= 5) {
      taps = 0;
      e.preventDefault();
      toggleOwner();
    }
  });
}

/* ---------------- 主题 ---------------- */
function currentTheme() { return document.documentElement.getAttribute('data-theme') || 'light'; }
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('theme', t); } catch (e) {}
  const btn = $('#themeToggle');
  if (btn) btn.textContent = t === 'dark' ? '☀' : '☾';
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#121417' : '#f7f6f2');
  syncGiscusTheme(t);
}
function syncGiscusTheme(t) {
  const f = $('iframe.giscus-frame');
  if (f) f.contentWindow.postMessage({ giscus: { setConfig: { theme: t === 'dark' ? 'dark' : 'light' } } }, 'https://giscus.app');
}

/* ---------------- 数据 ---------------- */
const locked = d => !!(d.locked || (d.publishAfter && new Date() < new Date(d.publishAfter + 'T00:00:00')));
const isIntro = d => (d.title || '').indexOf('寒鹤') === 0;
const fmtDate = s => (s || '').replace(/-/g, '.');
const docRef = (d, i) => d.id || String(i);
function docIndex(ref) {
  if (/^\d+$/.test(ref)) {
    const n = +ref;
    const byLegacy = state.docs.findIndex(d => d.legacyIndex === n);
    if (byLegacy >= 0) return byLegacy;
    return n >= 0 && n < state.docs.length ? n : -1;
  }
  return state.docs.findIndex(d => String(d.id) === String(ref));
}

async function loadJSON(path) {
  const res = await fetch(bust(path));
  if (!res.ok) throw new Error('load fail: ' + path);
  return res.json();
}

async function bootstrap() {
  try {
    const [config, docs, photos, links, music, diary, now, books] = await Promise.all([
      loadJSON('config.json'), loadJSON('manifest.json'), loadJSON('data/photos.json'),
      loadJSON('data/links.json'), loadJSON('data/music.json'), loadJSON('data/diary.json'),
      loadJSON('data/now.json').catch(() => null), loadJSON('data/books.json').catch(() => null)
    ]);
    state.config = config; state.docs = docs || [];
    state.photos = (photos && photos.photos) || [];
    state.links = links || []; state.music = music; state.diary = diary || [];
    state.now = now || {}; state.books = books || {};
  } catch (e) {
    console.error(e);
  }
  applySiteConfig();
  renderNavs();
  renderHome();
  renderArchive();
  renderLinks();
  renderMusic();
  renderPhotos();
  /* 把照片数据交给 3D 相框墙（scene3d.js 按需使用） */
  window.HanheBlog = { photos: state.photos };
  window.dispatchEvent(new Event('hanhe:photos'));
  renderDiary();
  initArticleTools();
  route();
  /* 首屏不做切换动画：先给当前视图打上 initial，再放开后续过渡 */
  $$('.view').forEach(v => v.classList.add('initial'));
  requestAnimationFrame(() => {
    document.documentElement.classList.add('ready');
    document.documentElement.classList.remove('booting');
  });
}

/* ---------------- 站点配置 ---------------- */
function applySiteConfig() {
  const s = (state.config && state.config.site) || {};
  const set = (sel, txt) => { const el = $(sel); if (el && txt) el.textContent = txt; };
  set('#brandMark', s.brandMark);
  set('#brandName', s.brandName);
  set('#brandSub', s.brandSub);
  set('#heroTitle', s.heroTitle);
  set('#heroSub', s.heroSubtitle);
  set('#heroEyebrow', s.heroEyebrow);
  set('#profileName', s.nickname);
  set('#profileSign', s.signature);
  if (s.brandName) document.title = s.brandName + ' · 个人博客';

  const avatar = localStorage.getItem('custom:avatar') || s.avatar;
  const hero = localStorage.getItem('custom:hero') || s.heroImage;
  if (avatar) { $('#profileAvatar').src = avatar; }
  if (hero) { $('#heroImg').src = hero; }
  $('#year').textContent = new Date().getFullYear();
  applyTheme(currentTheme());
}

/* ---------------- 导航渲染 ---------------- */
function renderNavs() {
  const course = state.docs.filter(d => !isIntro(d));
  const introIdx = state.docs.findIndex(isIntro);
  const intro = introIdx >= 0 ? `<a class="side-link" href="#note-${docRef(state.docs[introIdx], introIdx)}" data-i="${introIdx}">${esc(state.docs[introIdx].title)}</a>` : '';
  const items = course.map(d => {
    const i = state.docs.indexOf(d);
    return `<a class="side-link" href="#note-${docRef(d, i)}" data-i="${i}">${esc(d.title)}${locked(d) ? '　<span class="lock-label">未公开</span>' : ''}</a>`;
  }).join('');
  const html = intro + '<div class="side-group">FZU 课程</div>' + items;
  $('#notesNav').innerHTML = html;
  $('#articleNav').innerHTML = html;
  $('#notesCount').textContent = String(course.length).padStart(2, '0');
  $('#articleCount').textContent = String(course.length).padStart(2, '0');
  $('#notesTotal').textContent = String(course.length).padStart(2, '0') + ' 篇笔记';

  $$('#notesNav, #articleNav').forEach(box => box.addEventListener('click', e => {
    const a = e.target.closest('[data-i]');
    if (a) { e.preventDefault(); openDoc(+a.dataset.i); }
  }));
}

/* ---------------- 现在（Now） ---------------- */
const NOW_SECTIONS = [
  { key: 'reading', label: '在读', sub: 'READING' },
  { key: 'watching', label: '在追', sub: 'WATCHING' },
  { key: 'writing', label: '在写', sub: 'WRITING' },
  { key: 'plans', label: '近期计划', sub: 'PLANS' }
];
function nowItems(now, key) {
  const v = now && now[key];
  if (!Array.isArray(v)) return [];
  return v.map(x => (typeof x === 'string' ? { title: x, note: '' } : { title: (x && x.title) || '', note: (x && x.note) || '' }))
    .filter(x => x.title);
}
function daysAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(String(dateStr) + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return diff >= 0 ? diff : null;
}
function agoLabel(dateStr) {
  const n = daysAgo(dateStr);
  if (n == null) return '还没有填写更新日期';
  if (n === 0) return '最后更新于今天';
  return '最后更新于 ' + n + ' 天前';
}
function renderNowCard() {
  const now = state.now || {};
  const first = NOW_SECTIONS.map(s => nowItems(now, s.key)[0]).filter(Boolean)[0];
  const line = $('#nowCardLine');
  const meta = $('#nowCardMeta');
  if (line) line.textContent = first ? first.title : '还没填';
  if (meta) meta.textContent = now.updated ? agoLabel(now.updated) : '等你补上';
}
function renderNow() {
  const now = state.now || {};
  const stamp = $('#nowStamp');
  if (stamp) stamp.textContent = agoLabel(now.updated);
  const body = $('#nowBody');
  if (!body) return;
  const total = NOW_SECTIONS.reduce((n, s) => n + nowItems(now, s.key).length, 0);
  body.innerHTML = NOW_SECTIONS.map(s => {
    const list = nowItems(now, s.key);
    return `<section class="now-sec">
      <div class="now-sec-head"><span class="eyebrow">${s.sub}</span><h2>${s.label}</h2></div>
      ${list.length ? `<ul class="now-list">${list.map(it =>
        `<li><b>${esc(it.title)}</b>${it.note ? `<span>${esc(it.note)}</span>` : ''}</li>`).join('')}</ul>`
        : '<p class="now-empty">还没填</p>'}
    </section>`;
  }).join('') + (total ? '' : '<p class="now-hint tiny owner-only">在 <code>data/now.json</code> 或 Pages CMS 的「现在（Now）」里填上几条，这里就会显示出来。</p>');
}

/* ---------------- 书单 ---------------- */
const COVER_COLORS = ['#6f7f6a', '#a8895f', '#8a7d97', '#7c8d93', '#a37a6a', '#7f8b7d'];
let shelfKey = 'books';
function shelfItems(key) {
  const v = state.books && state.books[key];
  return Array.isArray(v) ? v : [];
}
function bookStars(n) {
  const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return `<span class="book-stars" aria-label="${v} 星">${'★'.repeat(v)}${'☆'.repeat(5 - v)}</span>`;
}
function bookExcerpts(b) {
  return (Array.isArray(b.excerpts) ? b.excerpts : [])
    .map(x => (typeof x === 'string' ? x : (x && x.text) || ''))
    .filter(Boolean);
}
function coverColor(title) {
  let h = 0;
  const s = String(title || '书');
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % COVER_COLORS.length;
  return COVER_COLORS[h];
}
function bookCover(b, big) {
  const letter = esc(String(b.title || '书').trim().charAt(0) || '书');
  const img = b.cover ? `<img src="${esc(b.cover)}" alt="${esc(b.title || '封面')}" loading="lazy" decoding="async">` : '';
  return `<div class="book-cover${big ? ' big' : ''}" style="--cover:${coverColor(b.title)}"><span class="book-letter">${letter}</span>${img}</div>`;
}
function bindCoverErrors(root) {
  $$('.book-cover img', root).forEach(img => {
    img.addEventListener('error', () => { img.remove(); }, { once: true });
  });
}
function bookCard(b, i) {
  return `<article class="book-card" data-i="${i}" tabindex="0" role="button" aria-label="查看《${esc(b.title || '未命名')}》的摘抄">
    ${bookCover(b)}
    <div class="book-info">
      <b>${esc(b.title || '未命名')}</b>
      <span class="book-author">${esc(b.author || '')}</span>
      ${b.review ? `<p>${esc(b.review)}</p>` : ''}
      ${bookStars(b.rating)}
    </div>
  </article>`;
}
function renderBooks() {
  const grid = $('#bookGrid');
  if (!grid) return;
  const nb = shelfItems('books').length, nf = shelfItems('films').length;
  $('#booksCount').textContent = nb || nf ? ` 共 ${nb} 本书、${nf} 部片` : '';
  $$('.shelf-tab').forEach(btn => {
    const on = btn.dataset.shelf === shelfKey;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const items = shelfItems(shelfKey);
  if (!items.length) {
    grid.innerHTML = '<div class="empty">' + (shelfKey === 'books' ? '书单' : '观影记录') +
      '还是空的 —— 站主还没有往里填，这里不会编造书目。</div>';
    return;
  }
  grid.innerHTML = items.map(bookCard).join('');
  bindCoverErrors(grid);
}
function openBookDrawer(b) {
  const excerpts = bookExcerpts(b);
  $('#bookDrawerBody').innerHTML = `
    <div class="book-drawer-head">
      ${bookCover(b, true)}
      <div>
        <h2>${esc(b.title || '未命名')}</h2>
        <p class="book-author">${esc(b.author || '')}</p>
        ${bookStars(b.rating)}
      </div>
    </div>
    ${b.review ? `<p class="book-review">${esc(b.review)}</p>` : ''}
    <div class="book-excerpts">
      <h3>摘抄</h3>
      ${excerpts.length ? excerpts.map(t => `<blockquote>${esc(t)}</blockquote>`).join('') : '<p class="tiny">还没有摘抄。</p>'}
    </div>`;
  bindCoverErrors($('#bookDrawerBody'));
  $('#bookMask').hidden = false;
  $('#bookDrawer').hidden = false;
}
function closeBookDrawer() {
  const d = $('#bookDrawer');
  if (!d || d.hidden) return;
  d.hidden = true;
  $('#bookMask').hidden = true;
}

/* ---------------- 笔记知识图谱 ----------------
   节点 = 文章；边 = 共享标签 / related 显式关联 / 正文双链（只读解析）。
   手写 SVG 力导向，无第三方图表库；节点超过 80 个或窄屏/省动效时降级静态布局。 */
const GRAPH_NS = 'http://www.w3.org/2000/svg';
const GRAPH_LIVE_LIMIT = 80;
let graphMode = false, graphRaf = 0, graphData = null;
let graphView = { x: 0, y: 0, k: 1 };

function svgEl(tag, attrs) {
  const el = document.createElementNS(GRAPH_NS, tag);
  if (attrs) Object.keys(attrs).forEach(k => el.setAttribute(k, attrs[k]));
  return el;
}
function buildGraphData() {
  const nodes = state.docs.map((d, i) => ({
    id: String(d.id || d.title || i),
    title: String(d.title || ('笔记 ' + i)),
    index: i,
    tags: Array.isArray(d.tags) ? d.tags : [],
    related: Array.isArray(d.related) ? d.related : [],
    links: Array.isArray(d.links) ? d.links : [],
    locked: locked(d),
    x: 0, y: 0, vx: 0, vy: 0, pinned: false
  }));
  const byRef = new Map();
  nodes.forEach(n => {
    byRef.set(n.id.toLowerCase(), n);
    byRef.set(n.title.toLowerCase(), n);
  });
  const resolve = ref => byRef.get(String(ref).trim().toLowerCase()) || null;
  const edges = new Map();
  function addEdge(a, b, kind, label) {
    if (!a || !b || a === b) return;
    const key = [a.id, b.id].sort().join('|');
    if (edges.has(key)) return;
    edges.set(key, { a: a, b: b, kind: kind, label: label });
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const shared = nodes[i].tags.filter(t => nodes[j].tags.indexOf(t) >= 0);
      if (shared.length) addEdge(nodes[i], nodes[j], 'tag', shared.join('、'));
    }
  }
  nodes.forEach(n => {
    n.related.forEach(r => addEdge(n, resolve(r), 'related', '显式关联'));
    n.links.forEach(r => addEdge(n, resolve(r), 'link', '双链'));
  });
  return { nodes: nodes, edges: [...edges.values()], W: 800, H: 560 };
}
function renderGraph() {
  const canvas = $('#graphCanvas');
  const list = $('#graphList');
  if (!canvas) return;
  stopGraph();
  graphData = buildGraphData();
  const g = graphData;
  const W = Math.max(320, Math.round(canvas.getBoundingClientRect().width || $('#graphWrap').clientWidth || 800));
  g.W = W; g.H = 560;
  canvas.setAttribute('viewBox', '0 0 ' + W + ' ' + g.H);
  canvas.innerHTML = '';
  const view = svgEl('g', { class: 'graph-view' });
  canvas.appendChild(view);
  const R = Math.min(W, g.H) * 0.32;
  g.nodes.forEach((n, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / Math.max(1, g.nodes.length);
    n.x = W / 2 + Math.cos(a) * R;
    n.y = g.H / 2 + Math.sin(a) * R;
    n.r = 30;
  });
  g.edges.forEach(e => {
    const line = svgEl('line', { class: 'graph-edge ' + e.kind, x1: 0, y1: 0, x2: 0, y2: 0 });
    const t = svgEl('title');
    t.textContent = e.label || '关联';
    line.appendChild(t);
    view.appendChild(line);
    e.el = line;
  });
  g.nodes.forEach(n => {
    const el = svgEl('g', { class: 'graph-node' + (n.locked ? ' locked' : '') });
    el.appendChild(svgEl('circle', { r: n.r, cx: 0, cy: 0 }));
    const txt = svgEl('text');
    txt.textContent = n.title.length > 5 ? n.title.slice(0, 5) + '…' : n.title;
    el.appendChild(txt);
    el.addEventListener('pointerenter', () => highlightGraphNode(n));
    el.addEventListener('pointerleave', clearGraphHighlight);
    view.appendChild(el);
    n.el = el;
  });
  applyGraphTransform();
  drawGraph();
  renderGraphList();
  const hint = $('#graphHint');
  if (hint) {
    hint.textContent = g.nodes.length > GRAPH_LIVE_LIMIT
      ? '节点超过 ' + GRAPH_LIVE_LIMIT + ' 个，已降级为静态布局；仍可缩放、点开阅读。'
      : '节点是笔记，连线是共享标签或显式关联。拖拽移动、滚轮缩放、点节点阅读。';
  }
}
function drawGraph() {
  const g = graphData;
  if (!g) return;
  g.edges.forEach(e => {
    e.el.setAttribute('x1', e.a.x);
    e.el.setAttribute('y1', e.a.y);
    e.el.setAttribute('x2', e.b.x);
    e.el.setAttribute('y2', e.b.y);
  });
  g.nodes.forEach(n => n.el.setAttribute('transform', 'translate(' + n.x + ',' + n.y + ')'));
}
function stepPhysics(g, alpha) {
  const nodes = g.nodes;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 100) { dx = (Math.random() - .5) * 8; dy = (Math.random() - .5) * 8; d2 = 64; }
      const d = Math.sqrt(d2);
      const f = Math.min(4000 / d2, 40) + (d < 76 ? (76 - d) * 0.5 : 0);
      const fx = dx / d * f, fy = dy / d * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
  }
  g.edges.forEach(e => {
    const a = e.a, b = e.b;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const f = (d - 150) * 0.016;
    const fx = dx / d * f, fy = dy / d * f;
    if (!a.pinned) { a.vx += fx; a.vy += fy; }
    if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
  });
  nodes.forEach(n => {
    if (n.pinned) { n.vx = 0; n.vy = 0; return; }
    n.vx += (g.W / 2 - n.x) * 0.0035;
    n.vy += (g.H / 2 - n.y) * 0.0035;
    n.vx *= 0.86; n.vy *= 0.86;
    n.x = Math.max(40, Math.min(g.W - 40, n.x + n.vx * alpha));
    n.y = Math.max(40, Math.min(g.H - 40, n.y + n.vy * alpha));
  });
}
function startGraphSim() {
  stopGraph();
  const g = graphData;
  if (!g) return;
  const narrow = window.matchMedia('(max-width:700px)').matches;
  if (reduceMotion() || narrow || g.nodes.length > GRAPH_LIVE_LIMIT) {
    drawGraph();
    return;
  }
  let alpha = 1;
  const step = () => {
    stepPhysics(g, alpha);
    alpha *= 0.98;
    drawGraph();
    if (alpha > 0.03) graphRaf = requestAnimationFrame(step);
    else graphRaf = 0;
  };
  graphRaf = requestAnimationFrame(step);
}
function stopGraph() {
  if (graphRaf) cancelAnimationFrame(graphRaf);
  graphRaf = 0;
}
function highlightGraphNode(node) {
  if (!graphData) return;
  const ids = {};
  ids[node.id] = true;
  graphData.edges.forEach(e => {
    const hot = e.a.id === node.id || e.b.id === node.id;
    e.el.classList.toggle('hot', hot);
    if (hot) { ids[e.a.id] = true; ids[e.b.id] = true; }
  });
  graphData.nodes.forEach(n => n.el.classList.toggle('dim', !ids[n.id]));
}
function clearGraphHighlight() {
  if (!graphData) return;
  graphData.edges.forEach(e => e.el.classList.remove('hot'));
  graphData.nodes.forEach(n => n.el.classList.remove('dim'));
}
function applyGraphTransform() {
  const canvas = $('#graphCanvas');
  const g = canvas && canvas.querySelector('.graph-view');
  if (g) g.setAttribute('transform', 'translate(' + graphView.x + ',' + graphView.y + ') scale(' + graphView.k + ')');
}
function renderGraphList() {
  const list = $('#graphList');
  if (!list || !graphData) return;
  const rel = {};
  graphData.edges.forEach(e => {
    (rel[e.a.id] = rel[e.a.id] || []).push(e.b.title);
    (rel[e.b.id] = rel[e.b.id] || []).push(e.a.title);
  });
  list.innerHTML = graphData.nodes.map(n =>
    `<button type="button" class="graph-rel" data-i="${n.index}">
      <b>${esc(n.title)}</b>
      <span>${n.tags.length ? '标签：' + esc(n.tags.join('、')) : '暂无标签'}</span>
      ${rel[n.id] ? '<span>关联：' + esc(rel[n.id].join('、')) + '</span>' : ''}
    </button>`).join('');
}
function setGraphMode(on) {
  graphMode = !!on;
  const cards = $('#notesCards'), wrap = $('#graphWrap');
  if (cards) cards.hidden = graphMode;
  if (wrap) wrap.hidden = !graphMode;
  const btnCards = $('#notesModeCards'), btnGraph = $('#notesModeGraph');
  if (btnCards) { btnCards.classList.toggle('on', !graphMode); btnCards.setAttribute('aria-selected', !graphMode ? 'true' : 'false'); }
  if (btnGraph) { btnGraph.classList.toggle('on', graphMode); btnGraph.setAttribute('aria-selected', graphMode ? 'true' : 'false'); }
  if (graphMode) {
    renderGraph();
    startGraphSim();
  } else {
    stopGraph();
  }
}
function graphPoint(e) {
  const canvas = $('#graphCanvas');
  const view = canvas.querySelector('.graph-view');
  const pt = canvas.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(view.getScreenCTM().inverse());
}

function renderHome() {
  const course = state.docs.filter(d => !isIntro(d));
  $('#homeCards').innerHTML = course.map(d => {
    const i = state.docs.indexOf(d);
    return `<a class="card ${locked(d) ? 'locked' : ''}" href="#note-${docRef(d, i)}" data-i="${i}">
      <span class="arrow">${locked(d) ? '◷' : '↗'}</span>
      <span class="num">${fmtDate(d.date) || 'NOTE'}　/　${locked(d) ? '未公开' : 'NOTE'}</span>
      <b>${esc(d.title)}</b>
      <p>${locked(d) ? '将于 2026.12.21 公开' : esc(d.excerpt || d.source || '课程学习笔记')}</p></a>`;
  }).join('');
  $('#homeCards').addEventListener('click', e => {
    const a = e.target.closest('[data-i]');
    if (a) { e.preventDefault(); openDoc(+a.dataset.i); }
  });

  const items = state.photos.slice(0, 8).map(photoCard).join('');
  $('#homePhotos').innerHTML = items || '<div class="empty">相册还是空的 —— 把照片放进 <code>photos/</code> 就会出现在这里。</div>';
  $('#homePhotos').addEventListener('click', e => {
    const fig = e.target.closest('.ph');
    if (fig) openLightbox(fig.dataset.src, fig.dataset.at, fig.dataset.place);
  });
  renderNowCard();
  const nb = shelfItems('books').length, nf = shelfItems('films').length;
  $('#booksCardLine').textContent = (nb || nf) ? ('书 ' + nb + ' · 片 ' + nf) : '还没填';
  $('#booksCardMeta').textContent = (nb || nf) ? '点开看摘抄' : '等你补上';
}

/* ---------------- 归档 ---------------- */
function renderArchive() {
  const sorted = [...state.docs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const groups = {};
  sorted.forEach(d => {
    const y = (d.date || '2026').slice(0, 4);
    (groups[y] = groups[y] || []).push(d);
  });
  const years = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  $('#archiveList').innerHTML = years.map(y => `
    <div class="year-group"><h2>${y}</h2>
      ${groups[y].map(d => {
        const i = state.docs.indexOf(d);
        return `<a class="arch-item" href="#note-${docRef(d, i)}" data-i="${i}">
          <time>${fmtDate(d.date || '')}</time>
          <b>${esc(d.title)}</b>${locked(d) ? '<span class="lock-label">未公开</span>' : ''}
        </a>`;
      }).join('')}
    </div>`).join('');
  $('#archiveList').addEventListener('click', e => {
    const a = e.target.closest('[data-i]');
    if (a) { e.preventDefault(); openDoc(+a.dataset.i); }
  });
}

/* ---------------- Links ---------------- */
function renderLinks() {
  const box = $('#linkGrid');
  if (!state.links.length) {
    box.innerHTML = isOwner()
      ? '<div class="empty">还没有添加链接。编辑 <code>data/links.json</code> 后刷新即可显示。</div>'
      : '<div class="empty">还没有整理好链接，稍后再来看看。</div>';
    return;
  }
  box.innerHTML = state.links.map(l => `
    <a class="link-card" href="${esc(l.url)}" target="_blank" rel="noopener">
      <span class="tag">${esc(l.tag || 'LINK')}</span>
      <b>${esc(l.name)}</b>
      <span>${esc(l.desc || l.url)}</span>
    </a>`).join('');
}

/* ---------------- 照片墙（按年份分卷 + 胶卷条） ---------------- */
function photoAlt(p) {
  return [p.at, p.place].filter(Boolean).join('　') || '照片';
}
function photoCard(p) {
  return `<figure class="ph" data-src="${esc(p.src)}" data-at="${esc(p.at || '')}" data-place="${esc(p.place || '')}" tabindex="0" role="button" aria-label="${esc(photoAlt(p))}"><img src="${esc(p.src)}" alt="${esc(photoAlt(p))}" loading="lazy" decoding="async" width="1" height="1"></figure>`;
}
function photoYear(p) { return Number(p.year) || 0; }
function renderPhotos() {
  const box = $('#photoGrid');
  $('#photoTotal').textContent = state.photos.length;
  state.photoShown = 0;
  box.innerHTML = '';
  if (!state.photos.length) {
    box.innerHTML = '<div class="empty">相册还是空的 —— 把照片放进 <code>photos/</code> 就会出现在这里。</div>';
    $('#photoMore').hidden = true;
    return;
  }
  appendPhotos();
  box.addEventListener('click', e => {
    const fig = e.target.closest('.ph');
    if (fig) openLightbox(fig.dataset.src, fig.dataset.at, fig.dataset.place);
  });
  box.addEventListener('keydown', e => {
    const fig = e.target.closest('.ph');
    if (fig && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openLightbox(fig.dataset.src, fig.dataset.at, fig.dataset.place);
    }
  });
}
function appendPhotos() {
  const box = $('#photoGrid');
  const next = state.photos.slice(state.photoShown, state.photoShown + PAGE_SIZE);
  const totals = {};
  state.photos.forEach(p => { totals[photoYear(p)] = (totals[photoYear(p)] || 0) + 1; });
  next.forEach(p => {
    const y = photoYear(p);
    let roll = box.querySelector('.roll[data-year="' + y + '"]');
    if (!roll) {
      roll = document.createElement('section');
      roll.className = 'roll';
      roll.dataset.year = y;
      roll.innerHTML = `<div class="roll-head"><b>${y || '未分卷'}</b><span>${totals[y] || 0} 张</span></div><div class="roll-strip"></div>`;
      const before = [...box.querySelectorAll('.roll')].find(el => Number(el.dataset.year) < y);
      if (before) box.insertBefore(roll, before); else box.appendChild(roll);
    }
    roll.querySelector('.roll-strip').insertAdjacentHTML('beforeend', photoCard(p));
  });
  state.photoShown += next.length;
  $('#photoMore').hidden = state.photoShown >= state.photos.length;
}

function openLightbox(src, at, place) {
  const lb = $('#lightbox');
  $('#lightboxImg').src = src;
  $('#lbDate').textContent = at ? fmtDate(at) : '';
  $('#lbPlace').textContent = place || '';
  $('#lbCaption').hidden = !(at || place);
  lb.hidden = false;
}
function closeLightbox() {
  $('#lightbox').hidden = true;
  $('#lightboxImg').src = '';
  $('#lbDate').textContent = '';
  $('#lbPlace').textContent = '';
  $('#lbCaption').hidden = true;
}

/* ---------------- 音乐 ---------------- */
let audio = null;
function ensureAudio() {
  if (!audio) {
    audio = new Audio();
    audio.addEventListener('timeupdate', paintProgress);
    audio.addEventListener('ended', () => nextTrack());
    audio.addEventListener('play', paintPlayState);
    audio.addEventListener('pause', paintPlayState);
  }
  return audio;
}
function tracks() { return (state.music && state.music.tracks) || []; }
function curTrack() { return tracks()[state.track] || null; }
function fmtTime(t) {
  if (!isFinite(t)) return '0:00';
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return m + ':' + String(s).padStart(2, '0');
}
function miniMusicHTML() {
  const list = tracks();
  const cover = (state.music && state.music.cover) || '';
  const t = curTrack();
  return `<div class="mc-cover">${cover ? `<img src="${esc(cover)}" alt="">` : '<span>♪</span>'}</div>
    <p class="mc-title">${esc(t ? t.title : (state.music && state.music.title) || '暂无歌单')}</p>
    <p class="mc-artist">${esc(t ? (t.artist || (state.music && state.music.artist) || '') : (list.length ? '' : '音乐页可查看说明'))}</p>
    <div class="mc-bar"><i id="mcFill"></i></div>
    <div class="mc-time"><span id="mcNow">0:00</span><span id="mcDur">0:00</span></div>
    <div class="mc-controls">
      <button class="mc-sub" data-act="prev" title="上一首">⏮</button>
      <button class="mc-play" data-act="toggle" title="播放/暂停">▶</button>
      <button class="mc-sub" data-act="next" title="下一首">⏭</button>
    </div>`;
}
function renderMusic() {
  $('#miniMusic').innerHTML = miniMusicHTML();
  const list = tracks();
  const cover = (state.music && state.music.cover) || '';
  $('#player').innerHTML = `
    <div class="mc-cover">${cover ? `<img src="${esc(cover)}" alt="">` : '<span>♪</span>'}</div>
    <div>
      <p class="pl-title">${esc((state.music && state.music.title) || '歌单')}</p>
      <p class="pl-artist">${esc((state.music && state.music.artist) || '')}</p>
      <div class="mc-bar"><i id="mcFill2"></i></div>
      <div class="mc-time"><span id="mcNow2">0:00</span><span id="mcDur2">0:00</span></div>
      <div class="mc-controls" style="justify-content:flex-start">
        <button class="mc-sub" data-act="prev">⏮</button>
        <button class="mc-play" data-act="toggle">▶</button>
        <button class="mc-sub" data-act="next">⏭</button>
      </div>
      ${list.length ? `<ul class="pl-list" id="plList">${list.map((t, i) =>
        `<li data-track="${i}" class="${i === state.track ? 'on' : ''}"><span>${esc(t.title)}</span><span>${esc(t.artist || '')}</span></li>`).join('')}</ul>`
      : `<div class="empty" style="margin-top:18px">${isOwner()
          ? '还没有音频文件。把 mp3 放进仓库（例如 <code>audio/xxx.mp3</code>），然后在 <code>data/music.json</code> 的 <code>tracks</code> 里加一条 <code>{"title":"歌名","artist":"歌手","src":"audio/xxx.mp3"}</code> 即可播放。'
          : '博主还没有上传音乐。'}</div>`}
    </div>`;

  $$('[data-act]').forEach(btn => btn.addEventListener('click', () => {
    const act = btn.dataset.act;
    if (act === 'toggle') togglePlay();
    if (act === 'next') nextTrack();
    if (act === 'prev') prevTrack();
  }));
  const pl = $('#plList');
  if (pl) pl.addEventListener('click', e => {
    const li = e.target.closest('[data-track]');
    if (li) { state.track = +li.dataset.track; loadTrack(true); }
  });
}
function loadTrack(play) {
  const t = curTrack();
  if (!t) return false;
  const a = ensureAudio();
  a.src = t.src;
  $$('#plList li').forEach(li => li.classList.toggle('on', +li.dataset.track === state.track));
  if (play) a.play().catch(() => {});
  return true;
}
function togglePlay() {
  if (!tracks().length) return;
  const a = ensureAudio();
  if (!a.src) { loadTrack(true); return; }
  if (a.paused) a.play().catch(() => {}); else a.pause();
}
function nextTrack() {
  if (!tracks().length) return;
  state.track = (state.track + 1) % tracks().length;
  loadTrack(true);
}
function prevTrack() {
  if (!tracks().length) return;
  state.track = (state.track - 1 + tracks().length) % tracks().length;
  loadTrack(true);
}
function paintProgress() {
  if (!audio) return;
  const pct = audio.duration ? (audio.currentTime / audio.duration * 100) : 0;
  ['#mcFill', '#mcFill2'].forEach(s => { const el = $(s); if (el) el.style.width = pct + '%'; });
  ['#mcNow', '#mcNow2'].forEach(s => { const el = $(s); if (el) el.textContent = fmtTime(audio.currentTime); });
  ['#mcDur', '#mcDur2'].forEach(s => { const el = $(s); if (el) el.textContent = fmtTime(audio.duration); });
}
function paintPlayState() {
  $$('.mc-play').forEach(b => b.textContent = (audio && !audio.paused) ? '❚❚' : '▶');
}

/* ---------------- 日记 ---------------- */
function renderDiary() {
  const box = $('#diaryList');
  if (!state.diary.length) {
    box.innerHTML = `<div class="empty">还没有公开的日记。<br>
      ${isOwner() ? '在 <code>data/diary-all.json</code> 写好内容后运行 <code>python tools/filter_diary.py</code>，只有 <code>public: true</code> 的条目会出现在这里。' : '博主还没有公开任何日记。'}</div>`;
  } else {
    box.innerHTML = state.diary.map(e => `
      <article class="diary-item">
        <time>${fmtDate(e.date || '')}</time>
        <h3>${esc(e.title || '无题')}</h3>
        <div class="body">${window.marked ? marked.parse(e.body || '') : esc(e.body || '')}</div>
      </article>`).join('');
  }
  const saved = localStorage.getItem('diary:draft');
  if (saved) $('#draftBox').value = saved;
}
function initDiaryDraft() {
  $('#draftSave').addEventListener('click', () => {
    localStorage.setItem('diary:draft', $('#draftBox').value);
    $('#draftStatus').textContent = '已保存到本机 ' + new Date().toLocaleTimeString();
  });
  $('#draftExport').addEventListener('click', () => {
    const text = $('#draftBox').value || '';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    a.download = 'diary-' + new Date().toISOString().slice(0, 10) + '.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#draftClear').addEventListener('click', () => {
    localStorage.removeItem('diary:draft');
    $('#draftBox').value = '';
    $('#draftStatus').textContent = '已清空';
  });
}

/* ---------------- 留言榜 ---------------- */
function renderGuestbook() {
  const g = (state.config && state.config.giscus) || {};
  const wrap = $('#giscusWrap');
  if (!g.enabled || !g.repoId || !g.categoryId) {
    if (!isOwner()) {
      wrap.innerHTML = '<div class="empty">留言板还在准备中，稍后再来看看。</div>';
      return;
    }
    wrap.innerHTML = `<div class="gb-steps">
      <b>留言板还没启用，需要你完成三步（约 3 分钟）：</b>
      <ol>
        <li>打开 GitHub 仓库 <code>${esc(g.repo || '你的仓库')}</code> → Settings → 勾选 <b>Discussions</b>。</li>
        <li>访问 <a href="https://github.com/apps/giscus" target="_blank" rel="noopener">github.com/apps/giscus</a>，安装到该仓库。</li>
        <li>打开 <a href="https://giscus.app/zh-CN" target="_blank" rel="noopener">giscus.app/zh-CN</a>，填入仓库名，复制生成的
          <code>data-repo-id</code> 与 <code>data-category-id</code>，填进 <code>config.json</code> 的
          <code>giscus.repoId</code> / <code>giscus.categoryId</code>，并把 <code>enabled</code> 改为 <code>true</code>。</li>
      </ol>
      <pre><code>"giscus": {
  "enabled": true,
  "repo": "${esc(g.repo || '用户名/仓库名')}",
  "repoId": "R_xxxxxxx",
  "category": "${esc(g.category || 'Announcements')}",
  "categoryId": "DIC_xxxxxxx"
}</code></pre>
      <p class="tiny">保存后提交推送，刷新本页即可看到评论区。在此之前这里只显示这段说明，不会报错。</p>
    </div>`;
    return;
  }
  if (state.giscusLoaded) return;
  wrap.innerHTML = '';
  const s = document.createElement('script');
  s.src = 'https://giscus.app/client.js';
  s.async = true;
  s.crossOrigin = 'anonymous';
  const attrs = {
    'data-repo': g.repo, 'data-repo-id': g.repoId, 'data-category': g.category,
    'data-category-id': g.categoryId, 'data-mapping': g.mapping || 'specific',
    'data-term': g.term || '留言榜',
    'data-strict': '0', 'data-reactions-enabled': g.reactionsEnabled || '1',
    'data-emit-metadata': g.emitMetadata || '0', 'data-input-position': g.inputPosition || 'top',
    'data-theme': currentTheme() === 'dark' ? 'dark' : 'light',
    'data-lang': g.lang || 'zh-CN', 'data-loading': 'eager'
  };
  Object.keys(attrs).forEach(k => s.setAttribute(k, attrs[k]));
  wrap.appendChild(s);
  state.giscusLoaded = true;
}

/* ---------------- 关于 ---------------- */
async function renderAbout() {
  const box = $('#aboutBody');
  if (box.dataset.done) return;
  try {
    const res = await fetch(bust('articles/寒鹤.md'));
    const text = stripFrontMatter(await res.text());
    box.innerHTML = window.marked ? marked.parse(text) : '<pre>' + esc(text) + '</pre>';
    box.dataset.done = '1';
  } catch (e) {
    box.innerHTML = '<div class="empty">介绍文章加载失败。</div>';
  }
}

/* ---------------- 文章 ---------------- */
let tocItems = [];
function setArticleChrome(mode) {
  $('#content').hidden = mode !== 'read';
  $('#writer').hidden = mode !== 'edit';
  $('#edit').hidden = mode !== 'read';
  $('#save').hidden = mode !== 'edit';
  $('#cancel').hidden = mode !== 'edit';
}
function drawPreview() {
  $('#preview').innerHTML = window.marked ? marked.parse(stripFrontMatter($('#source').value)) : '<pre>' + esc($('#source').value) + '</pre>';
}
function navOffset() {
  const bar = $('.topbar');
  return (bar ? bar.offsetHeight : 70) + 16;
}
function setActiveToc(slug) {
  $$('#toc a, #tocSheetList a').forEach(a => a.classList.toggle('on', a.dataset.sec === slug));
}
function updateTocActive() {
  if (!tocItems.length) return;
  const view = $('#view-article');
  if (!view || !view.classList.contains('active')) return;
  const limit = navOffset() + 10;
  let active = tocItems[0].id;
  for (const t of tocItems) {
    if (t.el.getBoundingClientRect().top <= limit) active = t.id;
    else break;
  }
  setActiveToc(active);
}
function scrollToSection(slug, smooth) {
  const el = slug ? document.getElementById(slug) : null;
  if (!el) return false;
  const top = el.getBoundingClientRect().top + (window.scrollY || 0) - navOffset();
  window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  setActiveToc(slug);
  return true;
}
function openTocSheet() { const s = $('#tocSheet'); if (s) s.hidden = false; }
function closeTocSheet() { const s = $('#tocSheet'); if (s) s.hidden = true; }
function setTocAvailable(on) {
  const col = $('#tocCol');
  if (col) col.hidden = !on;
  const layout = $('#view-article .layout');
  if (layout) layout.classList.toggle('no-toc', !on);
  const fab = $('#tocFab');
  if (fab) fab.classList.toggle('has-toc', !!on);
  if (!on) closeTocSheet();
}
/* 等正文图片加载完（或 1.2s 超时）再滚动，避免深链落到空位置 */
function afterImagesThen(cb) {
  const imgs = $$('#content img');
  let done = false;
  const run = () => { if (!done) { done = true; cb(); } };
  const pending = imgs.filter(im => !im.complete);
  if (!pending.length) { requestAnimationFrame(() => requestAnimationFrame(run)); return; }
  let left = pending.length;
  const tick = () => { if (--left <= 0) run(); };
  pending.forEach(im => {
    im.addEventListener('load', tick, { once: true });
    im.addEventListener('error', tick, { once: true });
  });
  setTimeout(run, 1200);
}
async function openDoc(i, section) {
  const d = state.docs[i];
  if (!d) return;
  const already = state.current === i && $('#content').dataset.rendered === '1';
  state.current = i;
  const want = '#note-' + encodeURIComponent(docRef(d, i)) + (section ? '/' + encodeURIComponent(section) : '');
  if (safeDecode(location.hash || '') !== safeDecode(want)) history.replaceState(null, '', want);
  if (already) { if (section) scrollToSection(section, true); return; }

  showView('article', true);
  $$('#articleNav .side-link, #notesNav .side-link').forEach(a => a.classList.toggle('active', +a.dataset.i === i));
  $('#content').dataset.rendered = '0';
  $('#toc').innerHTML = '';
  $('#tocSheetList').innerHTML = '';
  tocItems = [];
  setTocAvailable(false);
  $('#wordCount').textContent = '';

  if (locked(d)) {
    $('#content').innerHTML = `<div class="locked-page"><div class="eyebrow">COMING SOON</div>
      <h1>${esc(d.title)}</h1><p>计划于 <b>2026.12.21</b> 公开。</p><p>当前仅显示未公开状态。</p></div>`;
    $('#status').textContent = '尚未公开';
    setArticleChrome('read');
    $('#edit').hidden = true;
    $('#content').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  $('#status').textContent = '正在加载…';
  setArticleChrome('read');
  $('#content').hidden = false;
  try {
    const res = await fetch(bust(d.file));
    if (!res.ok) throw new Error('missing');
    state.sourceText = await res.text();
    const rendered = stripFrontMatter(state.sourceText);
    $('#source').value = localStorage.getItem('draft:' + d.file) || state.sourceText;
    $('#content').innerHTML = window.marked ? marked.parse(rendered) : '<pre>' + esc(rendered) + '</pre>';
    $('#content').dataset.rendered = '1';
    buildToc(d);
    $('#wordCount').textContent = wordLabel(countWords(state.sourceText));
    updateWriterCount($('#source').value);
    $('#status').textContent = '阅读模式 · ' + d.title;
    if (section) afterImagesThen(() => scrollToSection(section, false));
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    $('#content').innerHTML = '<p>文章加载失败。请刷新页面后重试。</p>';
    $('#status').textContent = '文章加载失败';
  }
}
function buildToc(doc) {
  tocItems = [];
  const headings = $$('#content h1, #content h2, #content h3, #content h4');
  const title = ((doc && doc.title) || '').trim();
  const used = Object.create(null);
  headings.forEach((h, idx) => {
    const clone = h.cloneNode(true);
    const old = clone.querySelector('.sec-anchor');
    if (old) old.remove();
    const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    /* 跳过与文章标题重复的首个 h1（例如「# 编译原理」） */
    if (idx === 0 && h.tagName === 'H1' && title && (text.indexOf(title) >= 0 || title.indexOf(text) >= 0)) return;
    let slug = slugify(text);
    if (used[slug]) { used[slug] += 1; slug = slug + '-' + used[slug]; }
    else used[slug] = 1;
    h.id = slug;
    h.classList.add('has-anchor');
    if (!h.querySelector('.sec-anchor')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sec-anchor';
      btn.title = '复制本节链接';
      btn.setAttribute('aria-label', '复制本节链接');
      btn.textContent = '#';
      h.appendChild(btn);
    }
    tocItems.push({ id: slug, text: text, el: h, tag: +h.tagName.slice(1), level: 0 });
  });
  if (tocItems.length) {
    const minTag = Math.min.apply(null, tocItems.map(t => t.tag));
    tocItems.forEach(t => { t.level = Math.min(t.tag - minTag, 2); });
  }
  const ref = doc ? docRef(doc, state.current) : '';
  const html = tocItems.map(t =>
    `<a class="toc-link lv${t.level}" href="#note-${encodeURIComponent(ref)}/${encodeURIComponent(t.id)}" data-sec="${esc(t.id)}">${esc(t.text)}</a>`
  ).join('');
  $('#toc').innerHTML = html;
  $('#tocSheetList').innerHTML = html;
  setTocAvailable(tocItems.length > 0);
  updateTocActive();
}
function updateWriterCount(text) {
  const n = countWords(text || '');
  const el = $('#writerCount');
  if (el) el.textContent = n ? wordLabel(n) : '';
}
function initArticleTools() {
  $('#edit').addEventListener('click', () => {
    const d = state.docs[state.current];
    if (!d || locked(d)) return;
    $('#source').value = state.sourceText;
    drawPreview();
    updateWriterCount($('#source').value);
    setArticleChrome('edit');
    $('#status').textContent = '编辑模式 · 支持 Markdown、图片和即时预览';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('#cancel').addEventListener('click', () => {
    const d = state.docs[state.current];
    if (!d) return;
    $('#source').value = state.sourceText;
    localStorage.removeItem('draft:' + d.file);
    setArticleChrome('read');
    $('#status').textContent = '阅读模式';
  });
  $('#source').addEventListener('input', () => {
    const d = state.docs[state.current];
    drawPreview();
    updateWriterCount($('#source').value);
    if (d) localStorage.setItem('draft:' + d.file, $('#source').value);
  });
  $('#save').addEventListener('click', () => {
    const d = state.docs[state.current];
    if (!d) return;
    const text = $('#source').value;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    a.download = d.file.split('/').pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    state.sourceText = text;
    $('#content').innerHTML = window.marked ? marked.parse(stripFrontMatter(text)) : '<pre>' + esc(text) + '</pre>';
    buildToc(d);
    $('#wordCount').textContent = wordLabel(countWords(text));
    setArticleChrome('read');
    $('#status').textContent = '修改稿已下载 · 上传替换 articles 里的同名文件即可发布';
  });
  $('#insertImage').addEventListener('click', () => $('#imageFile').click());
  $('#imageFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const data = await new Promise(ok => {
      const im = new Image(), url = URL.createObjectURL(file);
      im.onload = () => {
        const scale = Math.min(1, 1600 / im.width, 1600 / im.height);
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * scale);
        c.height = Math.round(im.height * scale);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/webp', .82));
      };
      im.src = url;
    });
    const label = file.name.replace(/[[\]()]/g, '_');
    const insert = '\n\n![' + label + '](' + data + ')\n\n';
    const ta = $('#source');
    const a = ta.selectionStart, b = ta.selectionEnd;
    ta.setRangeText(insert, a, b, 'end');
    ta.dispatchEvent(new Event('input'));
    e.target.value = '';
  });
}

/* ---------------- 视图路由 ---------------- */
const VIEWS = ['home', 'now', 'books', 'notes', 'article', 'links', 'archive', 'music', 'photos', 'diary', 'guestbook', 'about'];
function showView(name, keepScroll) {
  if (VIEWS.indexOf(name) < 0) name = 'home';
  withVT(() => {
    $$('.view').forEach(v => { v.classList.remove('initial'); v.classList.toggle('active', v.dataset.view === name); });
    $('#hero').hidden = name !== 'home';
    const navKey = name === 'article' ? 'notes' : name;
    $$('#mainNav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + navKey));

    if (name === 'about') renderAbout();
    if (name === 'guestbook') renderGuestbook();
    if (name === 'now') renderNow();
    if (name === 'books') renderBooks();
    if (name !== 'notes') stopGraph();
    if (name === 'notes' && graphMode) {
      if (!graphData) renderGraph();
      startGraphSim();
    }

    if (!keepScroll) window.scrollTo({ top: 0, behavior: 'auto' });
    document.body.classList.remove('mobile-open');
    $('#drawerMask').hidden = true;
    onScroll();
  });
}
function route() {
  const h = (location.hash || '#home').replace(/^#/, '');
  if (h.indexOf('note-') === 0) {
    const rest = h.slice(5);
    const cut = rest.indexOf('/');
    const ref = safeDecode(cut >= 0 ? rest.slice(0, cut) : rest);
    const sec = cut >= 0 ? safeDecode(rest.slice(cut + 1)) : '';
    const idx = docIndex(ref);
    if (idx >= 0) { openDoc(idx, sec); return; }
  }
  if (h === 'library') { location.replace('#notes'); return; }
  showView(safeDecode(h));
}

/* ---------------- 本篇目录交互 ---------------- */
function initToc() {
  const onLink = e => {
    const a = e.target.closest('[data-sec]');
    if (!a) return;
    const view = $('#view-article');
    if (!view || !view.classList.contains('active')) return;
    e.preventDefault();
    const id = a.dataset.sec;
    const d = state.docs[state.current];
    if (!d) return;
    scrollToSection(id, true);
    history.replaceState(null, '', '#note-' + encodeURIComponent(docRef(d, state.current)) + '/' + encodeURIComponent(id));
    closeTocSheet();
  };
  $('#toc').addEventListener('click', onLink);
  $('#tocSheetList').addEventListener('click', onLink);

  $('#content').addEventListener('click', e => {
    const b = e.target.closest('.sec-anchor');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const h = b.parentElement;
    const d = state.docs[state.current];
    if (!h || !d) return;
    const url = location.origin + location.pathname + '#note-' +
      encodeURIComponent(docRef(d, state.current)) + '/' + encodeURIComponent(h.id);
    copyText(url).then(ok => toast(ok ? '已复制本节链接' : '复制失败，请手动复制地址栏'));
  });

  $('#tocFab').addEventListener('click', openTocSheet);
  $('#tocSheetClose').addEventListener('click', closeTocSheet);
  $('#tocSheetMask').addEventListener('click', closeTocSheet);
}

/* ---------------- 顶栏交互 ---------------- */
let scrollRaf = 0;
function onScroll() {
  const y = window.scrollY || 0;
  const scrolled = y > 40;
  document.body.classList.toggle('scrolled', scrolled);
  const isHome = $('#hero') && !$('#hero').hidden;
  $('.topbar').classList.toggle('over-hero', !!isHome && !scrolled);
  if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; updateTocActive(); });
}

/* ---------------- 搜索 ---------------- */
function searchDocs(q) {
  const key = q.trim().toLowerCase();
  if (!key) return [];
  return state.docs.filter(d =>
    (d.title || '').toLowerCase().includes(key) ||
    (d.excerpt || '').toLowerCase().includes(key)
  );
}
function paintSearch(q) {
  const box = $('#searchResults');
  const key = q.trim();
  if (!key) { box.innerHTML = ''; return; }
  const hits = searchDocs(key);
  box.innerHTML = hits.length
    ? hits.map(d => { const i = state.docs.indexOf(d); return `<a href="#note-${docRef(d, i)}" data-i="${i}">
        <span>${esc(d.title)}</span><span class="lock-label">${locked(d) ? '未公开' : (d.date || '')}</span></a>`; }).join('')
    : '<div class="empty">没有匹配的笔记</div>';
}
function openSearch(prefill) {
  const p = $('#searchPanel');
  p.hidden = false;
  const input = $('#searchInput');
  input.value = prefill || '';
  paintSearch(input.value);
  input.focus();
}
function closeSearch() { $('#searchPanel').hidden = true; }

/* ---------------- 设置面板 ---------------- */
function initCustomize() {
  const dlg = $('#customize');
  $('#customizeBtn').addEventListener('click', () => dlg.showModal());
  $('#custClose').addEventListener('click', () => dlg.close());
  const readFile = (file) => new Promise(ok => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);
    fr.readAsDataURL(file);
  });
  $('#pickAvatar').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const data = await readFile(f);
    localStorage.setItem('custom:avatar', data);
    $('#profileAvatar').src = data;
    $('#custStatus').textContent = '头像已在本浏览器生效；要发布请替换 assets/avatar.jpg。';
  });
  $('#pickHero').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const data = await readFile(f);
    localStorage.setItem('custom:hero', data);
    $('#heroImg').src = data;
    $('#custStatus').textContent = '背景已在本浏览器生效；要发布请替换 assets/hero.webp。';
  });
  $('#custReset').addEventListener('click', () => {
    localStorage.removeItem('custom:avatar');
    localStorage.removeItem('custom:hero');
    const s = (state.config && state.config.site) || {};
    if (s.avatar) $('#profileAvatar').src = s.avatar;
    if (s.heroImage) $('#heroImg').src = s.heroImage;
    $('#custStatus').textContent = '已恢复为 config.json 中的默认图片。';
  });
  $('#custExit').addEventListener('click', () => {
    setOwner(false);
    dlg.close();
    refreshOwnerViews();
  });
}

/* ---------------- 交互反馈：触感 + 点击音效 ---------------- */
const FX_KEY = 'fx';
const fx = { haptic: true, sound: false };
let actx = null;
let fxHinted = false;
function loadFx() {
  try {
    const raw = localStorage.getItem(FX_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (typeof o.haptic === 'boolean') fx.haptic = o.haptic;
      if (typeof o.sound === 'boolean') fx.sound = o.sound;
    }
    fxHinted = localStorage.getItem('hint:fx') === '1';
  } catch (e) {}
}
function saveFx() { try { localStorage.setItem(FX_KEY, JSON.stringify(fx)); } catch (e) {} }
function coarsePointer() { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } }
function hapticTap(strong) {
  if (!fx.haptic || !coarsePointer() || !navigator.vibrate) return;
  try { navigator.vibrate(strong ? 12 : 8); } catch (e) {}
}
function ensureAudioCtx() {
  if (actx) {
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  try { actx = new C(); } catch (e) { actx = null; }
  return actx;
}
function clickSound(kind) {
  if (!fx.sound) return;
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const base = kind === 'tab' ? 880 : 620;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 0.55, t + 0.05);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.045, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  } catch (e) {}
}
const FX_TARGETS = 'button,.chip,.card,.side-link,.main-nav a,.icon-btn,.link-card,.ph,.arch-item,.pl-list li,.toc-col a,.toc-sheet-list a,.feed-head a,.gb-tip a';
function initFx() {
  loadFx();
  const hap = $('#optHaptic');
  const snd = $('#optSound');
  if (hap) hap.checked = !!fx.haptic;
  if (snd) snd.checked = !!fx.sound;
  if (hap) hap.addEventListener('change', () => { fx.haptic = hap.checked; saveFx(); });
  if (snd) snd.addEventListener('change', () => {
    fx.sound = snd.checked;
    saveFx();
    if (fx.sound) { ensureAudioCtx(); clickSound('tab'); }
  });

  const panel = $('#fxPanel');
  const btn = $('#fxToggle');
  if (btn) btn.addEventListener('click', e => { e.stopPropagation(); if (panel) panel.hidden = !panel.hidden; });
  document.addEventListener('click', e => {
    if (panel && !panel.hidden && !panel.contains(e.target) && e.target !== btn) panel.hidden = true;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel) panel.hidden = true; });

  document.addEventListener('pointerdown', e => {
    const el = e.target.closest(FX_TARGETS);
    if (!el) return;
    const isTab = el.matches('.main-nav a,.chip,.toc-col a,.toc-sheet-list a,.pl-list li');
    if (e.pointerType === 'touch') hapticTap(isTab);
    clickSound(isTab ? 'tab' : 'tap');
    if (!fxHinted) {
      fxHinted = true;
      try { localStorage.setItem('hint:fx', '1'); } catch (err) {}
      if (!fx.sound) toast('可在右上角 ⚙ 里开启点击音效与触感反馈');
    }
  }, { passive: true });
}

/* ---------------- 启动 ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(currentTheme());
  initOwner();

  window.addEventListener('hashchange', route);
  window.addEventListener('scroll', onScroll, { passive: true });

  $('#themeToggle').addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  });

  $('#menuToggle').addEventListener('click', () => {
    const open = document.body.classList.toggle('mobile-open');
    $('#drawerMask').hidden = !open;
  });
  $('#drawerMask').addEventListener('click', () => {
    document.body.classList.remove('mobile-open');
    $('#drawerMask').hidden = true;
  });
  $('#mainNav').addEventListener('click', e => {
    if (e.target.closest('a')) {
      document.body.classList.remove('mobile-open');
      $('#drawerMask').hidden = true;
    }
  });

  $('#searchOpen').addEventListener('click', () => openSearch(''));
  $('#searchClose').addEventListener('click', closeSearch);
  $('#searchPanel').addEventListener('click', e => {
    if (e.target === $('#searchPanel')) closeSearch();
  });
  $('#searchInput').addEventListener('input', e => paintSearch(e.target.value));
  $('#searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const hits = searchDocs(e.target.value);
      if (hits.length) { closeSearch(); openDoc(state.docs.indexOf(hits[0])); }
    }
    if (e.key === 'Escape') closeSearch();
  });
  $('#searchResults').addEventListener('click', e => {
    const a = e.target.closest('[data-i]');
    if (a) { e.preventDefault(); closeSearch(); openDoc(+a.dataset.i); }
  });
  $('#heroSearch').addEventListener('focus', () => openSearch($('#heroSearch').value));
  $('#heroSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') openSearch($('#heroSearch').value);
  });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); openSearch('');
    }
    if (e.key === 'Escape') { closeSearch(); closeLightbox(); closeBookDrawer(); }
  });

  const notesModeCards = $('#notesModeCards');
  if (notesModeCards) {
    notesModeCards.addEventListener('click', () => setGraphMode(false));
    $('#notesModeGraph').addEventListener('click', () => setGraphMode(true));
    $('#graphReset').addEventListener('click', () => {
      if (!graphMode) return;
      graphView = { x: 0, y: 0, k: 1 };
      applyGraphTransform();
      renderGraph();
      startGraphSim();
    });
    $('#graphList').addEventListener('click', e => {
      const b = e.target.closest('.graph-rel');
      if (b) openDoc(+b.dataset.i);
    });
    const canvas = $('#graphCanvas');
    let gDrag = null, gPan = null;
    canvas.addEventListener('wheel', e => {
      if (!graphMode) return;
      e.preventDefault();
      graphView.k = Math.max(0.5, Math.min(2.6, graphView.k * Math.exp(-e.deltaY * 0.0012)));
      applyGraphTransform();
    }, { passive: false });
    canvas.addEventListener('pointerdown', e => {
      if (!graphMode) return;
      canvas.setPointerCapture(e.pointerId);
      const nodeEl = e.target.closest('.graph-node');
      if (nodeEl) {
        const n = graphData.nodes.find(x => x.el === nodeEl);
        if (n) {
          n.pinned = true;
          gDrag = { n: n, moved: false, sx: e.clientX, sy: e.clientY };
        }
      } else {
        gPan = { sx: e.clientX, sy: e.clientY, vx: graphView.x, vy: graphView.y };
      }
    });
    canvas.addEventListener('pointermove', e => {
      if (gDrag) {
        const p = graphPoint(e);
        gDrag.n.x = p.x;
        gDrag.n.y = p.y;
        if (Math.abs(e.clientX - gDrag.sx) + Math.abs(e.clientY - gDrag.sy) > 6) gDrag.moved = true;
        drawGraph();
      } else if (gPan) {
        graphView.x = gPan.vx + (e.clientX - gPan.sx);
        graphView.y = gPan.vy + (e.clientY - gPan.sy);
        applyGraphTransform();
      }
    });
    canvas.addEventListener('pointerup', () => {
      if (gDrag) {
        const n = gDrag.n;
        n.pinned = false;
        if (!gDrag.moved) openDoc(n.index);
        gDrag = null;
      }
      gPan = null;
    });
    canvas.addEventListener('pointercancel', () => {
      if (gDrag) gDrag.n.pinned = false;
      gDrag = null;
      gPan = null;
    });
  }

  const bookGrid = $('#bookGrid');
  if (bookGrid) {
    bookGrid.addEventListener('click', e => {
      const card = e.target.closest('.book-card');
      if (!card) return;
      const b = shelfItems(shelfKey)[+card.dataset.i];
      if (b) openBookDrawer(b);
    });
    bookGrid.addEventListener('keydown', e => {
      const card = e.target.closest('.book-card');
      if (card && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        const b = shelfItems(shelfKey)[+card.dataset.i];
        if (b) openBookDrawer(b);
      }
    });
  }
  $$('.shelf-tab').forEach(btn => btn.addEventListener('click', () => {
    shelfKey = btn.dataset.shelf === 'films' ? 'films' : 'books';
    renderBooks();
  }));
  $('#bookClose').addEventListener('click', closeBookDrawer);
  $('#bookMask').addEventListener('click', closeBookDrawer);

  const rssCopy = $('#rssCopy');
  if (rssCopy) rssCopy.addEventListener('click', () => {
    const url = new URL('feed.xml', location.href).href;
    copyText(url).then(ok => toast(ok ? '已复制订阅链接' : url));
  });

  $('#photoMore').addEventListener('click', appendPhotos);
  $('#lightbox').addEventListener('click', e => {
    if (e.target.id === 'lightbox' || e.target.id === 'lbClose') closeLightbox();
  });

  initDiaryDraft();
  initCustomize();
  initToc();
  initFx();
  bootstrap();
});
