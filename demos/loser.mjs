import { shell, Player, field, esc, paramStr, svgEl } from './ui.mjs';
import { loserMerge } from './engines/loser.mjs';

const META = {
  course: '数据结构',
  title: '败者树 k 路归并',
  desc: 'k 个有序段的队首作为叶子；每场比赛把败者留在父节点，胜者继续上浮。输出最小值后沿路径重赛。'
};

const DEFAULT_RUNS = [[3, 9, 15], [5, 11, 17], [7, 13, 19], [1, 8, 14]];

export function mount(host, ctx) {
  const o = shell(host, META, ctx.params);
  let runs = parseRuns(paramStr(ctx.params, 'runs', '')) || DEFAULT_RUNS;
  const player = new Player(o.bar, o.explain, { onShow: draw });
  o.getParams = () => `runs=${runs.map(r => r.join(' ')).join('|')}`;

  host.querySelector('.demo-params-body').innerHTML = `
    <div class="demo-param-grid wide">
      ${field('k 个有序段（用 | 分隔，每段用空格或逗号分隔）', `<input data-p="runs" type="text" value="${esc(runs.map(r => r.join(' ')).join(' | '))}" spellcheck="false">`)}
    </div>
    <p class="tiny">示例：3 9 15 | 5 11 17 | 7 13 19 | 1 8 14。最多 6 段、每段最多 6 个数。</p>`;

  host.querySelector('.demo-params-body').addEventListener('change', e => {
    const el = e.target.closest('[data-p]');
    if (!el) return;
    const next = parseRuns(el.value);
    if (next) runs = next;
    el.value = runs.map(r => r.join(' ')).join(' | ');
    rebuild();
  });

  function rebuild() {
    const res = loserMerge(runs);
    player.load(res.steps);
  }

  function draw(step) {
    const k = step.k;
    const pos = new Map();
    const round = v => v === Infinity ? '∞' : v;
    const xOf = t => t >= k ? 64 + (t - k) * 68 : (xOf(2 * t) + xOf(2 * t + 1)) / 2;
    const levelOf = t => { let d = 0; while (t > 1) { t = Math.floor(t / 2); d++; } return d; };
    let maxLeaf = 0;
    for (let t = 0; t < k; t++) maxLeaf = Math.max(maxLeaf, levelOf(k + t));
    const width = 64 + (k - 1) * 68 + 16;
    const height = 90 + (maxLeaf + 1) * 76;
    const winner = step.win[1];

    o.stage.innerHTML = `
      <div class="ls-wrap">
        <div class="ls-output">
          <b>已输出</b>
          <div class="ls-out-chips">${step.output.length ? step.output.map(v => `<span>${v}</span>`).join('') : '<em>还没有输出</em>'}</div>
        </div>
        <svg class="ls-canvas" role="img" aria-label="败者树结构"></svg>
      </div>
      <div class="demo-stats">
        <span>当前胜者 <b>第 ${winner + 1} 段 · ${round(step.b[winner])}</b></span>
        <span>已输出 <b>${step.output.length}</b> 个</span>
      </div>`;
    const svg = o.stage.querySelector('.ls-canvas');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    /* 内部节点 */
    for (let t = 1; t < k; t++) {
      const x = xOf(t), y = 20 + levelOf(t) * 76;
      svgEl('line', { x1: x, y1: y + 22, x2: xOf(2 * t), y2: 20 + levelOf(2 * t) * 76 - 22, class: 'ls-edge' }, svg);
      svgEl('line', { x1: x, y1: y + 22, x2: xOf(2 * t + 1), y2: 20 + levelOf(2 * t + 1) * 76 - 22, class: 'ls-edge' }, svg);
    }
    for (let t = 1; t < k; t++) {
      const x = xOf(t), y = 20 + levelOf(t) * 76;
      const loser = step.lose[t];
      const hot = step.node === t;
      svgEl('rect', { x: x - 32, y: y - 22, width: 64, height: 44, rx: 10, class: 'ls-node' + (hot ? ' hot' : '') }, svg);
      svgEl('text', { x, y: y - 4, class: 'ls-node-label' }, svg).textContent = '败者';
      svgEl('text', { x, y: y + 13, class: 'ls-node-value' }, svg).textContent = loser >= 0 ? `第${loser + 1}段 ${round(step.b[loser])}` : '—';
    }
    /* 叶子：k 个段 */
    for (let i = 0; i < k; i++) {
      const x = xOf(k + i), y = 20 + levelOf(k + i) * 76;
      const done = step.b[i] === Infinity;
      svgEl('rect', { x: x - 31, y: y - 26, width: 62, height: 52, rx: 10, class: 'ls-leaf' + (done ? ' done' : '') + (step.current === i ? ' hot' : '') }, svg);
      svgEl('text', { x, y: y - 8, class: 'ls-leaf-name' }, svg).textContent = `段 ${i + 1}`;
      svgEl('text', { x, y: y + 10, class: 'ls-leaf-value' }, svg).textContent = done ? '∞' : String(step.b[i]);
      svgEl('text', { x, y: y + 22, class: 'ls-leaf-sub' }, svg).textContent = done ? '已取空' : `位置 ${step.pos[i] + 1}`;
    }
    /* 胜者 */
    const winIdx = step.win[1];
    svgEl('rect', { x: width / 2 - 70, y: height - 46, width: 140, height: 30, rx: 15, class: 'ls-winner' }, svg);
    svgEl('text', { x: width / 2, y: height - 26, class: 'ls-winner-text' }, svg).textContent = `胜者：第 ${winIdx + 1} 段 · ${round(step.b[winIdx])}`;
  }

  rebuild();
  return { dispose() { player.stop(); } };
}

function parseRuns(text) {
  if (!text) return null;
  const groups = String(text).split(/[|；;]+/).map(g => g.split(/[,，\s]+/).map(Number).filter(n => isFinite(n) && n >= 0));
  const ok = groups.filter(g => g.length);
  return ok.length >= 2 && ok.length <= 6 && ok.every(g => g.length <= 6) ? ok : null;
}
