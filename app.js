/* 寒鹤 · 个人博客 —— 纯静态前端逻辑 */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bust = p => p + (p.includes('?') ? '&' : '?') + 't=' + Date.now();

const state = {
  config: null, docs: [], photos: [], links: [], music: null, diary: [],
  current: -1, sourceText: '', photoShown: 0, track: 0, giscusLoaded: false
};
const PAGE_SIZE = 60;

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

async function loadJSON(path) {
  const res = await fetch(bust(path));
  if (!res.ok) throw new Error('load fail: ' + path);
  return res.json();
}

async function bootstrap() {
  try {
    const [config, docs, photos, links, music, diary] = await Promise.all([
      loadJSON('config.json'), loadJSON('manifest.json'), loadJSON('data/photos.json'),
      loadJSON('data/links.json'), loadJSON('data/music.json'), loadJSON('data/diary.json')
    ]);
    state.config = config; state.docs = docs || [];
    state.photos = (photos && photos.photos) || [];
    state.links = links || []; state.music = music; state.diary = diary || [];
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
  renderDiary();
  renderGuestbook();
  initArticleTools();
  route();
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
  const intro = introIdx >= 0 ? `<a class="side-link" href="#note-${introIdx}" data-i="${introIdx}">${esc(state.docs[introIdx].title)}</a>` : '';
  const items = course.map(d => {
    const i = state.docs.indexOf(d);
    return `<a class="side-link" href="#note-${i}" data-i="${i}">${esc(d.title)}${locked(d) ? '　<span class="lock-label">未公开</span>' : ''}</a>`;
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

function renderHome() {
  const course = state.docs.filter(d => !isIntro(d));
  $('#homeCards').innerHTML = course.map(d => {
    const i = state.docs.indexOf(d);
    return `<a class="card ${locked(d) ? 'locked' : ''}" href="#note-${i}" data-i="${i}">
      <span class="arrow">${locked(d) ? '◷' : '↗'}</span>
      <span class="num">${fmtDate(d.date) || 'NOTE'}　/　${locked(d) ? '未公开' : 'NOTE'}</span>
      <b>${esc(d.title)}</b>
      <p>${locked(d) ? '将于 2026.12.21 公开' : esc(d.excerpt || d.source || '课程学习笔记')}</p></a>`;
  }).join('');
  $('#homeCards').addEventListener('click', e => {
    const a = e.target.closest('[data-i]');
    if (a) { e.preventDefault(); openDoc(+a.dataset.i); }
  });

  const items = state.photos.slice(0, 8).map(p =>
    `<figure class="ph"><img src="${esc(p.src)}" alt="${esc(p.album)}" loading="lazy" decoding="async"></figure>`).join('');
  $('#homePhotos').innerHTML = items;
  $('#homePhotos').addEventListener('click', e => {
    const img = e.target.closest('img');
    if (img) openLightbox(img.src);
  });
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
        return `<a class="arch-item" href="#note-${i}" data-i="${i}">
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
    box.innerHTML = '<div class="empty">还没有添加链接。编辑 <code>data/links.json</code> 后刷新即可显示。</div>';
    return;
  }
  box.innerHTML = state.links.map(l => `
    <a class="link-card" href="${esc(l.url)}" target="_blank" rel="noopener">
      <span class="tag">${esc(l.tag || 'LINK')}</span>
      <b>${esc(l.name)}</b>
      <span>${esc(l.desc || l.url)}</span>
    </a>`).join('');
}

/* ---------------- 照片墙 ---------------- */
function photoCard(p) {
  return `<figure class="ph" data-src="${esc(p.src)}"><img src="${esc(p.src)}" alt="${esc(p.album)}" loading="lazy" decoding="async"></figure>`;
}
function renderPhotos() {
  const grid = $('#photoGrid');
  $('#photoTotal').textContent = state.photos.length;
  state.photoShown = 0;
  if (!state.photos.length) {
    grid.innerHTML = '<div class="empty">images/ 目录里没有找到图片。</div>';
    return;
  }
  grid.innerHTML = '';
  appendPhotos();
  grid.addEventListener('click', e => {
    const fig = e.target.closest('.ph');
    if (fig) openLightbox(fig.dataset.src);
  });
}
function appendPhotos() {
  const grid = $('#photoGrid');
  const next = state.photos.slice(state.photoShown, state.photoShown + PAGE_SIZE);
  grid.insertAdjacentHTML('beforeend', next.map(photoCard).join(''));
  state.photoShown += next.length;
  $('#photoMore').hidden = state.photoShown >= state.photos.length;
}

function openLightbox(src) {
  const lb = $('#lightbox');
  $('#lightboxImg').src = src;
  lb.hidden = false;
}
function closeLightbox() { $('#lightbox').hidden = true; $('#lightboxImg').src = ''; }

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
      : `<div class="empty" style="margin-top:18px">还没有音频文件。把 mp3 放进仓库（例如 <code>audio/xxx.mp3</code>），
          然后在 <code>data/music.json</code> 的 <code>tracks</code> 里加一条
          <code>{"title":"歌名","artist":"歌手","src":"audio/xxx.mp3"}</code> 即可播放。</div>`}
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
    box.innerHTML = `<div class="empty">还没有公开的日记条目。<br>
      在 <code>data/diary-all.json</code> 写好内容后运行 <code>python tools/filter_diary.py</code>，
      只有 <code>public: true</code> 的条目会出现在这里。</div>`;
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
    'data-category-id': g.categoryId, 'data-mapping': g.mapping || 'pathname',
    'data-strict': '0', 'data-reactions-enabled': g.reactionsEnabled || '1',
    'data-emit-metadata': g.emitMetadata || '0', 'data-input-position': g.inputPosition || 'top',
    'data-theme': currentTheme() === 'dark' ? 'dark' : 'light',
    'data-lang': g.lang || 'zh-CN', 'data-loading': 'lazy'
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
    const text = await res.text();
    box.innerHTML = window.marked ? marked.parse(text) : '<pre>' + esc(text) + '</pre>';
    box.dataset.done = '1';
  } catch (e) {
    box.innerHTML = '<div class="empty">介绍文章加载失败。</div>';
  }
}

/* ---------------- 文章 ---------------- */
function setArticleChrome(mode) {
  $('#content').hidden = mode !== 'read';
  $('#writer').hidden = mode !== 'edit';
  $('#edit').hidden = mode !== 'read';
  $('#save').hidden = mode !== 'edit';
  $('#cancel').hidden = mode !== 'edit';
}
function drawPreview() {
  $('#preview').innerHTML = window.marked ? marked.parse($('#source').value) : '<pre>' + esc($('#source').value) + '</pre>';
}
async function openDoc(i) {
  const d = state.docs[i];
  if (!d) return;
  state.current = i;
  if (location.hash !== '#note-' + i) history.replaceState(null, '', '#note-' + i);
  showView('article', true);
  $$('#articleNav .side-link, #notesNav .side-link').forEach(a => a.classList.toggle('active', +a.dataset.i === i));
  $('#toc').innerHTML = '';

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
    $('#source').value = localStorage.getItem('draft:' + d.file) || state.sourceText;
    $('#content').innerHTML = window.marked ? marked.parse(state.sourceText) : '<pre>' + esc(state.sourceText) + '</pre>';
    buildToc();
    $('#status').textContent = '阅读模式 · ' + d.title;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    $('#content').innerHTML = '<p>文章加载失败。请刷新页面后重试。</p>';
    $('#status').textContent = '文章加载失败';
  }
}
function buildToc() {
  const hs = $$('#content h2, #content h3');
  $('#toc').innerHTML = hs.map((h, n) => {
    h.id = 'sec' + n;
    return `<a href="#sec${n}" data-sec="sec${n}">${esc(h.textContent)}</a>`;
  }).join('');
  $('#toc').onclick = e => {
    const a = e.target.closest('[data-sec]');
    if (a) {
      e.preventDefault();
      const el = document.getElementById(a.dataset.sec);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
}
function initArticleTools() {
  $('#edit').addEventListener('click', () => {
    const d = state.docs[state.current];
    if (!d || locked(d)) return;
    $('#source').value = state.sourceText;
    drawPreview();
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
    $('#content').innerHTML = window.marked ? marked.parse(text) : '<pre>' + esc(text) + '</pre>';
    buildToc();
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
const VIEWS = ['home', 'notes', 'article', 'links', 'archive', 'music', 'photos', 'diary', 'guestbook', 'about'];
function showView(name, keepScroll) {
  if (VIEWS.indexOf(name) < 0) name = 'home';
  $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === name));
  $('#hero').hidden = name !== 'home';
  const navKey = name === 'article' ? 'notes' : name;
  $$('#mainNav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + navKey));

  if (name === 'about') renderAbout();
  if (name === 'guestbook') renderGuestbook();

  if (!keepScroll) window.scrollTo({ top: 0, behavior: 'auto' });
  document.body.classList.remove('mobile-open');
  $('#drawerMask').hidden = true;
  onScroll();
}
function route() {
  const h = (location.hash || '#home').replace(/^#/, '');
  const m = h.match(/^note-(\d+)$/);
  if (m) { openDoc(+m[1]); return; }
  if (h === 'library') { location.replace('#notes'); return; }
  showView(h);
}

/* ---------------- 顶栏交互 ---------------- */
function onScroll() {
  const y = window.scrollY || 0;
  document.body.classList.toggle('scrolled', y > 12);
  const isHome = $('#hero') && !$('#hero').hidden;
  $('.topbar').classList.toggle('over-hero', isHome && y < 40 && !document.body.classList.contains('scrolled'));
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
    ? hits.map(d => `<a href="#note-${state.docs.indexOf(d)}" data-i="${state.docs.indexOf(d)}">
        <span>${esc(d.title)}</span><span class="lock-label">${locked(d) ? '未公开' : (d.date || '')}</span></a>`).join('')
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
    $('#custStatus').textContent = '背景已在本浏览器生效；要发布请替换 assets/hero.jpg。';
  });
  $('#custReset').addEventListener('click', () => {
    localStorage.removeItem('custom:avatar');
    localStorage.removeItem('custom:hero');
    const s = (state.config && state.config.site) || {};
    if (s.avatar) $('#profileAvatar').src = s.avatar;
    if (s.heroImage) $('#heroImg').src = s.heroImage;
    $('#custStatus').textContent = '已恢复为 config.json 中的默认图片。';
  });
}

/* ---------------- 启动 ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(currentTheme());

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
    if (e.key === 'Escape') { closeSearch(); closeLightbox(); }
  });

  $('#photoMore').addEventListener('click', appendPhotos);
  $('#lightbox').addEventListener('click', e => {
    if (e.target.id === 'lightbox' || e.target.id === 'lbClose') closeLightbox();
  });

  initDiaryDraft();
  initCustomize();
  bootstrap();
});
