/* 树形 SVG 绘制工具：中序定 x、深度定 y，供二叉树 / AVL / 红黑树复用。 */
import { svgEl } from './ui.mjs';

export function drawTree(svg, root, opts = {}) {
  svg.innerHTML = '';
  if (!root) {
    svgEl('text', { x: 8, y: 24, class: 'tv-empty' }, svg).textContent = '空树';
    svg.setAttribute('viewBox', '0 0 200 60');
    return;
  }
  const nodes = [];
  let idx = 0;
  const walk = (n, depth) => {
    if (!n) return;
    walk(n.left, depth + 1);
    nodes.push({ n, x: idx++, y: depth });
    walk(n.right, depth + 1);
  };
  walk(root, 0);
  const dx = 54, dy = 64, padX = 32, padY = 34;
  const w = Math.max(180, (idx - 1) * dx + padX * 2);
  const h = (Math.max(...nodes.map(o => o.y)) + 1) * dy + padY * 2;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const pos = new Map();
  nodes.forEach(o => pos.set(o.n.id, { x: padX + o.x * dx, y: padY + o.y * dy }));

  const edges = [];
  const collect = n => {
    if (!n) return;
    if (n.left) edges.push([n, n.left]);
    if (n.right) edges.push([n, n.right]);
    collect(n.left); collect(n.right);
  };
  collect(root);
  edges.forEach(([a, b]) => {
    const pa = pos.get(a.id), pb = pos.get(b.id);
    svgEl('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, class: 'tv-edge' }, svg);
  });
  const hl = new Set(opts.hl || []);
  const visited = new Set(opts.visited || []);
  nodes.forEach(({ n }) => {
    const p = pos.get(n.id);
    const g = svgEl('g', { class: 'tv-node' + (hl.has(n.id) ? ' hl' : '') + (visited.has(n.id) ? ' visited' : '') + (opts.cur === n.id ? ' cur' : '') + (n.color === 'R' ? ' red' : n.color === 'B' ? ' black' : '') }, svg);
    svgEl('circle', { cx: p.x, cy: p.y, r: n.color ? 19 : 18 }, g);
    const t = svgEl('text', { x: p.x, y: p.y + 1, class: 'tv-key' }, g);
    t.textContent = n.key;
    if (opts.heights && n.h != null) {
      svgEl('text', { x: p.x + 22, y: p.y - 10, class: 'tv-height' }, g).textContent = 'h' + n.h;
    }
    if (n.color === 'R') svgEl('circle', { cx: p.x + 13, cy: p.y - 14, r: 3.5, class: 'tv-dot red' }, g);
    if (n.color === 'B') svgEl('circle', { cx: p.x + 13, cy: p.y - 14, r: 3.5, class: 'tv-dot black' }, g);
  });
}
