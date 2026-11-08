import { shell, Player, field, esc, paramStr } from './ui.mjs';
import { buildBST, traceTraversal } from './engines/tree.mjs';
import { drawTree } from './treeview.mjs';

const META = {
  course: '数据结构',
  title: '二叉树遍历',
  desc: '前序、中序、后序与层序四种方式，单步高亮当前节点，并同步显示真实的调用栈或队列。'
};

const ORDER_NAMES = { pre: '前序 Preorder', in: '中序 Inorder', post: '后序 Postorder', level: '层序 Level' };

export function mount(host, ctx) {
  const o = shell(host, META, ctx.params);
  let order = paramStr(ctx.params, 'order', 'in');
  if (!ORDER_NAMES[order]) order = 'in';
  let vals = parseVals(paramStr(ctx.params, 'vals', '')) || [50, 30, 70, 20, 40, 60, 80, 35, 45, 65];
  let root = buildBST(vals);
  let keyById = new Map();
  let steps = [];
  const player = new Player(o.bar, o.explain, { onShow: draw });
  o.getParams = () => `order=${order}&vals=${vals.join(',')}`;

  host.querySelector('.demo-params-body').innerHTML = `
    <div class="demo-param-grid">
      ${field('遍历方式', `<select data-p="order">${Object.keys(ORDER_NAMES).map(k => `<option value="${k}"${k === order ? ' selected' : ''}>${ORDER_NAMES[k]}</option>`).join('')}</select>`)}
      ${field('建树序列（逗号分隔）', `<input data-p="vals" type="text" value="${esc(vals.join(', '))}" spellcheck="false">`)}
    </div>
    <p class="tiny">按输入顺序插入二叉排序树；重复的键会被忽略。</p>`;

  host.querySelector('.demo-params-body').addEventListener('change', e => {
    const el = e.target.closest('[data-p]');
    if (!el) return;
    if (el.dataset.p === 'order') order = el.value;
    if (el.dataset.p === 'vals') {
      const next = parseVals(el.value);
      if (next) vals = next;
      el.value = vals.join(', ');
      root = buildBST(vals);
    }
    rebuild();
  });

  function rebuild() {
    if (!root) return;
    keyById.clear();
    (function walk(n) {
      if (!n) return;
      keyById.set(n.id, n.key);
      walk(n.left); walk(n.right);
    })(root);
    steps = traceTraversal(root, order);
    player.load(steps);
  }

  function draw(step) {
    const visited = step.visited || [];
    const stackKeys = (step.stack || []).map(n => n && n.key != null ? n.key : n);
    const doneStack = step.doneStack || [];
    const qKeys = (step.queue || []).map(n => n && n.key != null ? n.key : n);
    o.stage.innerHTML = `
      <div class="tree-stage">
        <svg class="tv-canvas" role="img" aria-label="二叉树结构与当前访问节点"></svg>
        <div class="tree-side"></div>
      </div>
      <div class="demo-stats">
        <span>已访问 <b>${visited.length}</b> / ${keyById.size}</span>
        <span>遍历 <b>${esc(ORDER_NAMES[order].split(' ')[0])}</b></span>
      </div>`;
    const svg = o.stage.querySelector('.tv-canvas');
    drawTree(svg, root, { visited, cur: step.cur, hl: step.cur ? [step.cur] : [] });
    const side = o.stage.querySelector('.tree-side');
    const curKey = step.cur ? keyById.get(step.cur) : null;
    side.innerHTML = `
      <div class="tree-now">${curKey == null ? '等待访问' : `当前节点 <b>${curKey}</b>`}</div>
      ${order === 'level'
        ? `<div class="tree-chipbox"><b>队列</b><div class="tree-chips">${qKeys.length ? qKeys.map(k => `<span>${k}</span>`).join('') : '<em>空</em>'}</div></div>`
        : `<div class="tree-chipbox"><b>栈</b><div class="tree-chips">${stackKeys.length ? stackKeys.map((k, i) => `<span${doneStack[i] ? ' class="done"' : ''}>${k}</span>`).join('') : '<em>空</em>'}</div></div>`}
      <div class="tree-chipbox"><b>访问序列</b><div class="tree-seq">${visited.map(id => keyById.get(id)).join(' → ') || '<em>—</em>'}</div></div>`;
  }

  rebuild();
  return { dispose() { player.stop(); } };
}

function parseVals(text) {
  if (!text) return null;
  const list = String(text).split(/[,，\s]+/).map(x => Number(x)).filter(n => isFinite(n) && n >= 0 && n <= 999);
  return list.length >= 2 && list.length <= 15 ? list : null;
}
