import { shell, Player, field, esc, paramStr } from './ui.mjs';
import { insertAVL, resetAvlUid } from './engines/avl.mjs';
import { drawTree } from './treeview.mjs';

const META = {
  course: '数据结构',
  title: 'AVL 四种旋转',
  desc: '插入后自底向上更新高度；遇到 LL / RR / LR / RL 失衡时真实改接指针并旋转，可逐步查看高度变化。'
};

const PRESETS = {
  LL: { label: 'LL · 右单旋', seq: [30, 20, 10] },
  RR: { label: 'RR · 左单旋', seq: [10, 20, 30] },
  LR: { label: 'LR · 先左后右', seq: [30, 10, 20] },
  RL: { label: 'RL · 先右后左', seq: [10, 30, 20] },
  mix: { label: '混合序列', seq: [40, 20, 60, 10, 30, 50, 70, 25, 35, 55] }
};

export function mount(host, ctx) {
  const o = shell(host, META, ctx.params);
  let seq = parseSeq(paramStr(ctx.params, 'seq', '')) || PRESETS.LR.seq.slice();
  const player = new Player(o.bar, o.explain, { onShow: draw });
  o.getParams = () => `seq=${seq.join(',')}`;

  host.querySelector('.demo-params-body').innerHTML = `
    <div class="demo-param-grid">
      ${field('示例', `<select data-p="preset">${Object.keys(PRESETS).map(k => `<option value="${k}">${PRESETS[k].label}</option>`).join('')}</select>`)}
      ${field('插入序列', `<input data-p="seq" type="text" value="${esc(seq.join(', '))}" spellcheck="false">`)}
    </div>
    <p class="tiny">每次插入后都会检查平衡因子；自检脚本还会验证 BST 性质与所有节点的左右高度差。</p>`;

  const body = host.querySelector('.demo-params-body');
  body.addEventListener('change', e => {
    const el = e.target.closest('[data-p]');
    if (!el) return;
    if (el.dataset.p === 'preset') {
      const p = PRESETS[el.value];
      if (!p) return;
      seq = p.seq.slice();
      body.querySelector('[data-p="seq"]').value = seq.join(', ');
      rebuild();
    } else if (el.dataset.p === 'seq') {
      const next = parseSeq(el.value);
      if (next) seq = next;
      el.value = seq.join(', ');
      rebuild();
    }
  });

  function rebuild() {
    resetAvlUid();
    const rootRef = { root: null };
    let steps = [];
    seq.forEach(k => { steps = steps.concat(insertAVL(rootRef, k)); });
    player.load(steps);
  }

  function draw(step) {
    o.stage.innerHTML = `
      <div class="avl-stage">
        <svg class="tv-canvas" role="img" aria-label="AVL 树"></svg>
        <div class="avl-side"></div>
      </div>
      <div class="demo-stats">
        <span>树高 <b>${step.tree ? heightOf(step.tree) : 0}</b></span>
        <span>节点 <b>${countOf(step.tree)}</b></span>
      </div>`;
    drawTree(o.stage.querySelector('.tv-canvas'), step.tree, { heights: true, hl: step.hl, cur: step.hl && step.hl[0] });
    const side = o.stage.querySelector('.avl-side');
    side.innerHTML = `
      <div class="avl-case ${step.type ? 'on' : ''}">
        <span>当前动作</span>
        <b>${step.type ? step.type + ' 旋转' : (step.alert ? '检测到失衡' : '插入 / 更新高度')}</b>
      </div>
      <div class="avl-tips">
        <p><b>LL</b> 左孩子的左边过高 → 对失衡节点右旋</p>
        <p><b>RR</b> 右孩子的右边过高 → 左旋</p>
        <p><b>LR</b> 左孩子的右边过高 → 先左旋再右旋</p>
        <p><b>RL</b> 右孩子的左边过高 → 先右旋再左旋</p>
      </div>`;
  }

  rebuild();
  return { dispose() { player.stop(); } };
}

function parseSeq(text) {
  if (!text) return null;
  const list = String(text).split(/[,，\s]+/).map(x => Number(x)).filter(n => isFinite(n) && n > 0 && n < 1000);
  return list.length >= 2 && list.length <= 15 ? list : null;
}
function heightOf(n) { return n ? 1 + Math.max(heightOf(n.left), heightOf(n.right)) : 0; }
function countOf(n) { return n ? 1 + countOf(n.left) + countOf(n.right) : 0; }
