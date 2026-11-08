/* 演示共用骨架：外壳、播放器、参数面板、深链、SVG 小工具。
   纯 DOM，无图形库；每个演示模块只负责「算步骤 + 画当前步」。 */

const NS = 'http://www.w3.org/2000/svg';

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function reduceMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}
export function fmt(n) {
  return typeof n === 'number' && isFinite(n) ? n.toLocaleString('zh-CN') : String(n == null ? '—' : n);
}
export function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}
export function paramNum(params, key, def, min, max) {
  const raw = params && params.get(key);
  const n = Number(raw);
  if (!raw || !isFinite(n)) return def;
  return Math.min(max == null ? Infinity : max, Math.max(min == null ? -Infinity : min, n));
}
export function paramStr(params, key, def) {
  const v = params && params.get(key);
  return v == null || v === '' ? def : v;
}
export function paramList(params, key, def) {
  const raw = params && params.get(key);
  if (!raw) return def;
  return raw.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean);
}
export function readFileHexList(params, key, def, min, max, maxCount) {
  const list = paramList(params, key, []).map(x => parseInt(x, x.indexOf('0x') === 0 ? 16 : 10));
  const ok = list.filter(n => isFinite(n) && n >= min && n <= max).slice(0, maxCount || 64);
  return ok.length ? ok : def;
}

/* ---------------- 播放器：播放 / 暂停 / 单步 / 上一步 / 速度 / 重置 ---------------- */
export class Player {
  constructor(bar, explain, opts = {}) {
    this.bar = bar;
    this.explain = explain;
    this.opts = opts;
    this.steps = [];
    this.index = -1;
    this.timer = 0;
    this.playing = false;
    this.speed = 1;
    this.reduced = reduceMotion();
    bar.innerHTML = `
      <button class="demo-btn" data-act="prev" type="button">← 上一步</button>
      <button class="demo-btn primary" data-act="play" type="button">播放</button>
      <button class="demo-btn" data-act="next" type="button">下一步 →</button>
      <button class="demo-btn" data-act="reset" type="button">重置</button>
      <label class="demo-speed">速度
        <select aria-label="播放速度">
          <option value="0.5">0.5×</option>
          <option value="1" selected>1×</option>
          <option value="2">2×</option>
          <option value="4">4×</option>
        </select>
      </label>
      <span class="demo-counter" aria-live="polite"></span>`;
    bar.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'play') this.toggle();
      else if (act === 'next') { this.stop(); this.show(this.index + 1); }
      else if (act === 'prev') { this.stop(); this.show(this.index - 1); }
      else if (act === 'reset') { this.stop(); this.show(0); }
    });
    const sel = bar.querySelector('select');
    sel.addEventListener('change', () => { this.speed = Number(sel.value) || 1; });
    explain.addEventListener('click', () => {});
    this.counter = bar.querySelector('.demo-counter');
    this.playBtn = bar.querySelector('[data-act="play"]');
    this.prevBtn = bar.querySelector('[data-act="prev"]');
    this.nextBtn = bar.querySelector('[data-act="next"]');
  }
  get total() { return this.steps.length; }
  load(steps) {
    this.stop();
    this.steps = steps || [];
    this.show(0);
  }
  show(i) {
    if (!this.steps.length) {
      this.index = -1;
      this.counter.textContent = '0 / 0';
      return;
    }
    this.index = Math.max(0, Math.min(this.steps.length - 1, i));
    const s = this.steps[this.index];
    if (this.opts.onShow) this.opts.onShow(s, this.index, this.steps.length);
    if (this.explain) {
      this.explain.textContent = s.msg || '';
      this.explain.classList.remove('flash');
      if (!this.reduced) {
        void this.explain.offsetWidth;
        this.explain.classList.add('flash');
      }
    }
    this.counter.textContent = `${this.index + 1} / ${this.steps.length}`;
    this.prevBtn.disabled = this.index <= 0;
    this.nextBtn.disabled = this.index >= this.steps.length - 1;
    this.playBtn.textContent = this.index >= this.steps.length - 1 && !this.playing ? '重播' : '播放';
  }
  toggle() {
    if (this.playing) { this.stop(); return; }
    if (!this.steps.length) return;
    if (this.index >= this.steps.length - 1) this.show(0);
    if (this.reduced) { this.show(this.steps.length - 1); return; }
    this.playing = true;
    this.playBtn.textContent = '暂停';
    const tick = () => {
      if (!this.playing) return;
      if (this.index >= this.steps.length - 1) { this.stop(); return; }
      this.show(this.index + 1);
      this.timer = setTimeout(tick, 800 / this.speed);
    };
    tick();
  }
  stop() {
    this.playing = false;
    clearTimeout(this.timer);
    if (this.playBtn) this.playBtn.textContent = this.index >= this.steps.length - 1 ? '重播' : '播放';
  }
}

/* ---------------- 外壳 ---------------- */
export function shell(host, meta, params) {
  host.innerHTML = `
    <div class="demo-shell">
      <div class="demo-top">
        <div class="demo-heading">
          <p class="eyebrow">${esc(meta.course)} · PLAYGROUND</p>
          <h2>${esc(meta.title)}</h2>
          <p class="demo-desc">${esc(meta.desc)}</p>
        </div>
        <div class="demo-top-actions">
          <button class="ghost-btn" data-demo="copy" type="button">复制深链</button>
          <a class="ghost-btn" href="#vis">← 全部演示</a>
        </div>
      </div>
      <details class="demo-params">
        <summary>参数</summary>
        <div class="demo-params-body"></div>
        <p class="tiny demo-params-note">改动参数会重新按算法计算，所有步骤都不是预先写死的。</p>
      </details>
      <div class="demo-stage"></div>
      <div class="demo-playbar"></div>
      <p class="demo-explain" aria-live="polite"></p>
      <div class="demo-meta"></div>
    </div>`;
  const root = host.querySelector('.demo-shell');
  if (window.innerWidth >= 900) host.querySelector('.demo-params').open = true;
  const copyBtn = host.querySelector('[data-demo="copy"]');
  const o = {
    root,
    stage: host.querySelector('.demo-stage'),
    bar: host.querySelector('.demo-playbar'),
    explain: host.querySelector('.demo-explain'),
    meta: host.querySelector('.demo-meta'),
    params: params || new URLSearchParams(),
    getParams: () => '',
    onDestroy: null
  };
  copyBtn.addEventListener('click', () => {
    const q = o.getParams();
    const url = location.origin + location.pathname + '#vis-' + meta.id + (q ? '?' + q : '');
    const done = ok => {
      copyBtn.textContent = ok ? '已复制' : '复制失败';
      setTimeout(() => { copyBtn.textContent = '复制深链'; }, 1600);
    };
    const legacy = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        ta.remove(); done(ok);
      } catch (e) { done(false); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => done(true)).catch(legacy);
    } else legacy();
  });
  return o;
}

/* 参数行工具 */
export function field(label, controlHtml) {
  return `<label class="demo-field"><span>${esc(label)}</span>${controlHtml}</label>`;
}
