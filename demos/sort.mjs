import { shell, Player, field, esc, fmt, paramStr } from './ui.mjs';
import { SORT_ALGOS, algoById, runSort } from './engines/sort.mjs';

const META = {
  course: '数据结构',
  title: '排序算法全家桶',
  desc: '八种排序切换，逐步查看比较、交换 / 移动次数与当前递归区间；每一步都由算法真实运行产生。'
};

export function mount(host, ctx) {
  const o = shell(host, META, ctx.params);
  let algo = paramStr(ctx.params, 'algo', 'insert');
  if (!algoById(algo)) algo = 'insert';
  let arr = parseArr(paramStr(ctx.params, 'arr', '')) || [5, 2, 9, 1, 7, 3, 8, 4, 6, 10];
  const player = new Player(o.bar, o.explain, { onShow: draw });

  o.getParams = () => `algo=${algo}&arr=${arr.join(',')}`;

  host.querySelector('.demo-params-body').innerHTML = `
    <div class="demo-param-grid">
      ${field('算法', `<select data-p="algo">${SORT_ALGOS.map(a => `<option value="${a.id}"${a.id === algo ? ' selected' : ''}>${a.name} · ${a.en}</option>`).join('')}</select>`)}
      ${field('数组（逗号或空格分隔，2–20 个数）', `<input data-p="arr" type="text" value="${esc(arr.join(', '))}" spellcheck="false">`)}
    </div>
    <div class="demo-param-actions">
      <button class="ghost-btn" data-act="random" type="button">随机 10 个</button>
      <button class="ghost-btn" data-act="reverse" type="button">逆序 10 个</button>
      <button class="ghost-btn" data-act="nearly" type="button">近乎有序</button>
    </div>`;

  const body = host.querySelector('.demo-params-body');
  body.addEventListener('change', e => {
    const el = e.target.closest('[data-p]');
    if (!el) return;
    if (el.dataset.p === 'algo') algo = el.value;
    if (el.dataset.p === 'arr') {
      const next = parseArr(el.value);
      if (next) arr = next;
      el.value = arr.join(', ');
    }
    rebuild();
  });
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'random') arr = randomArr(10);
    if (b.dataset.act === 'reverse') arr = Array.from({ length: 10 }, (_, i) => 10 - i);
    if (b.dataset.act === 'nearly') arr = [1, 2, 3, 4, 6, 5, 7, 8, 9, 10];
    body.querySelector('[data-p="arr"]').value = arr.join(', ');
    rebuild();
  });

  function rebuild() {
    const res = runSort(algo, arr);
    player.load(res.steps);
  }

  function draw(step) {
    const maxV = Math.max(...step.a, 1);
    const a = step.sorted || [];
    const hl = step.hl || [];
    const range = step.range;
    const stack = step.stack || [];
    const bars = step.a.map((v, i) => {
      const cls = ['sort-bar'];
      if (a.indexOf(i) >= 0) cls.push('sorted');
      if (hl.indexOf(i) >= 0) cls.push('hl');
      if (range && i >= range[0] && i <= range[1]) cls.push('in-range');
      return `<div class="${cls.join(' ')}" style="height:${Math.max(6, Math.round(v / maxV * 100))}%"><span>${v}</span></div>`;
    }).join('');
    let extra = '';
    if (step.buf) {
      extra = `<div class="sort-buffer"><b>合并缓冲</b>${step.buf.map(v => `<span>${v}</span>`).join('')}</div>`;
    }
    if (step.buckets) {
      extra += `<div class="sort-buckets">${step.buckets.map((b, i) =>
        `<div class="sort-bucket"><b>${i}</b><span>${b.length ? b.join(' ') : '—'}</span></div>`).join('')}</div>`;
    }
    o.stage.innerHTML = `
      <div class="sort-head">
        <span class="demo-badge">${esc(algoById(algo).name)}</span>
        ${step.gap != null ? `<span class="demo-badge alt">gap = ${step.gap}</span>` : ''}
        ${step.digit != null ? `<span class="demo-badge alt">第 ${step.digit} 位</span>` : ''}
        ${range ? `<span class="demo-badge alt">区间 [${range[0]}, ${range[1]}]</span>` : ''}
      </div>
      <div class="sort-bars">${bars}</div>
      <div class="sort-vals">${step.a.map(v => `<span>${v}</span>`).join('')}</div>
      ${stack.length ? `<div class="sort-stack"><b>递归栈</b>${stack.map(r => `<span>[${r[0]}, ${r[1]}]</span>`).join('')}</div>` : ''}
      ${extra}
      <div class="demo-stats">
        <span>比较 <b>${fmt(step.cmp)}</b></span>
        <span>交换 <b>${fmt(step.swp)}</b></span>
        <span>移动 <b>${fmt(step.mov)}</b></span>
      </div>`;
  }

  rebuild();
  return { dispose() { player.stop(); } };
}

function parseArr(text) {
  if (!text) return null;
  const list = String(text).split(/[,，\s]+/).map(x => Number(x)).filter(n => isFinite(n) && n >= 0 && n <= 999);
  if (list.length < 2 || list.length > 20) return null;
  return list;
}
function randomArr(n) {
  return Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 60));
}
