import { shell, Player, field, esc, paramStr, paramNum } from './ui.mjs';
import { PAGE_ALGOS, simulatePage } from './engines/page.mjs';

const META = {
  course: '操作系统',
  title: '页面置换四算法',
  desc: '同一串页面引用、同样多的物理块，LRU / FIFO / OPT / Clock 四栏同步推进，逐列高亮淘汰项。'
};

const DEFAULT_REFS = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];

export function mount(host, ctx) {
  const o = shell(host, META, ctx.params);
  let frames = paramNum(ctx.params, 'frames', 3, 1, 6);
  let refs = parseRefs(paramStr(ctx.params, 'refs', '')) || DEFAULT_REFS;
  const player = new Player(o.bar, o.explain, { onShow: draw });
  o.getParams = () => `frames=${frames}&refs=${refs.join(',')}`;

  host.querySelector('.demo-params-body').innerHTML = `
    <div class="demo-param-grid">
      ${field('物理块数', `<select data-p="frames">${[2, 3, 4, 5, 6].map(n => `<option value="${n}"${n === frames ? ' selected' : ''}>${n} 块</option>`).join('')}</select>`)}
      ${field('页面引用串（逗号或空格分隔）', `<input data-p="refs" type="text" value="${esc(refs.join(', '))}" spellcheck="false">`)}
    </div>
    <p class="tiny">缺页次数会在 drill 里与手算基准对拍（经典 3 块引用串：FIFO 15、LRU 12、OPT 9）。</p>`;

  const body = host.querySelector('.demo-params-body');
  body.addEventListener('change', e => {
    const el = e.target.closest('[data-p]');
    if (!el) return;
    if (el.dataset.p === 'frames') frames = +el.value;
    else if (el.dataset.p === 'refs') {
      const next = parseRefs(el.value);
      if (next) refs = next;
      el.value = refs.join(', ');
    }
    rebuild();
  });

  function rebuild() {
    player.load(simulatePage(refs, frames).steps);
  }

  function draw(step) {
    const total = step.refs.length;
    const index = step.index;
    const results = step.results || {};
    const cols = PAGE_ALGOS.map(a => {
      const st = results[a.id];
      if (!st) return '';
      const slots = st.frames.map((v, i) => `
        <div class="pg-slot ${v == null ? 'empty' : ''} ${st.evicted === v && st.fault && step.ref != null ? 'evicted' : ''}">
          <span>${v == null ? '—' : v}</span>
        </div>`).join('');
      const faults = st.faults;
      return `<section class="pg-col">
        <div class="pg-head"><b>${a.name}</b><span>${a.full}</span></div>
        <div class="pg-frames">${slots}</div>
        <div class="pg-badge ${step.ref == null ? 'hit' : st.fault ? 'miss' : 'hit'}">${step.ref == null ? '结束' : st.fault ? '缺页' : '命中'}</div>
        <div class="pg-stat">缺页 <b>${faults}</b> / ${total} · ${(faults / total * 100).toFixed(1)}%</div>
      </section>`;
    }).join('');
    o.stage.innerHTML = `
      <div class="pg-refs">${step.refs.map((r, i) => `<span class="${i === index ? 'on' : ''} ${i < index ? 'past' : ''}">${r}</span>`).join('')}</div>
      <div class="pg-grid">${cols}</div>
      <div class="demo-stats">
        <span>当前访问 <b>${step.ref == null ? '结束' : step.ref}</b></span>
        <span>第 <b>${Math.min(index + 1, total)}</b> / ${total} 次</span>
        <span>${PAGE_ALGOS.map(a => a.name + ' ' + (step.faults[a.id] || 0)).join(' · ')}</span>
      </div>`;
  }

  rebuild();
  return { dispose() { player.stop(); } };
}

function parseRefs(text) {
  if (!text) return null;
  const list = String(text).split(/[,，\s]+/).map(Number).filter(n => isFinite(n) && n >= 0 && n <= 20);
  return list.length >= 2 && list.length <= 30 ? list : null;
}
