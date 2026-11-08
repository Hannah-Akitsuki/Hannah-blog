import { shell, Player, field, esc, paramStr } from './ui.mjs';
import { insertRB, resetRbUid } from './engines/rb.mjs';
import { drawTree } from './treeview.mjs';

const META = {
  course: '数据结构',
  title: '红黑树插入',
  desc: '新节点先染红，再按「叔叔颜色」分支：变色或旋转。每一步都来自真实的 CLRS 修复循环。'
};

export function mount(host, ctx) {
  const o = shell(host, META, ctx.params);
  let seq = parseSeq(paramStr(ctx.params, 'vals', '')) || [10, 20, 30, 15, 25, 5, 1, 7];
  const player = new Player(o.bar, o.explain, { onShow: draw });
  o.getParams = () => `vals=${seq.join(',')}`;

  host.querySelector('.demo-params-body').innerHTML = `
    <div class="demo-param-grid">
      ${field('插入序列', `<input data-p="vals" type="text" value="${esc(seq.join(', '))}" spellcheck="false">`)}
    </div>
    <p class="tiny">建议 6–12 个互不相同的数；红黑性质的自检在 tools/vis_selftest.mjs 里对每个插入点都执行。</p>`;

  host.querySelector('.demo-params-body').addEventListener('change', e => {
    const el = e.target.closest('[data-p]');
    if (!el) return;
    const next = parseSeq(el.value);
    if (next) seq = next;
    el.value = seq.join(', ');
    rebuild();
  });

  function rebuild() {
    resetRbUid();
    const rootRef = { root: null };
    let steps = [];
    seq.forEach(k => { steps = steps.concat(insertRB(rootRef, k)); });
    player.load(steps);
  }

  function draw(step) {
    o.stage.innerHTML = `
      <div class="rb-stage">
        <svg class="tv-canvas" role="img" aria-label="红黑树"></svg>
        <div class="rb-side">
          <div class="rb-legend">
            <span><i class="dot red"></i>红节点</span>
            <span><i class="dot black"></i>黑节点</span>
            <span><i class="dot nil"></i>空指针（视为黑）</span>
          </div>
          <p class="tiny">性质：根为黑；红节点的孩子为黑；任一节点到叶子的每条路径黑节点数相同。</p>
        </div>
      </div>
      <div class="demo-stats">
        <span>节点 <b>${countOf(step.tree)}</b></span>
        <span>当前根 <b>${step.tree ? step.tree.key + '（' + (step.tree.color === 'R' ? '红' : '黑') + '）' : '—'}</b></span>
      </div>`;
    drawTree(o.stage.querySelector('.tv-canvas'), step.tree, { hl: step.hl, cur: step.hl && step.hl[0] });
  }

  rebuild();
  return { dispose() { player.stop(); } };
}

function parseSeq(text) {
  if (!text) return null;
  const list = String(text).split(/[,，\s]+/).map(x => Number(x)).filter(n => isFinite(n) && n > 0 && n < 1000);
  const uniq = Array.from(new Set(list));
  return uniq.length >= 2 && uniq.length <= 14 ? uniq : null;
}
function countOf(n) { return n ? 1 + countOf(n.left) + countOf(n.right) : 0; }
