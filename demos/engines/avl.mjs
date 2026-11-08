/* AVL 树：迭代插入 + 自底向上更新高度 + 四种旋转。
   用 parent 指针真实改接，每一步都从当前根克隆快照，因此旋转过程可见。 */

let uid = 0;
const h = n => (n ? n.h : 0);
const bf = n => (n ? h(n.left) - h(n.right) : 0);

function makeNode(key, parent) {
  return { id: 'a' + (uid++), key, left: null, right: null, h: 1, parent: parent || null };
}
function update(n) {
  if (n) n.h = 1 + Math.max(h(n.left), h(n.right));
}
function clone(n) {
  if (!n) return null;
  return { id: n.id, key: n.key, h: n.h, left: clone(n.left), right: clone(n.right) };
}
function treeRoot(n) {
  let r = n;
  while (r && r.parent) r = r.parent;
  return r;
}

export function insertAVL(rootRef, key) {
  const steps = [];
  const snap = (msg, hl = [], extra = {}) => {
    steps.push(Object.assign({
      tree: clone(rootRef.root),
      hl: hl.slice(),
      msg
    }, extra));
  };

  if (!rootRef.root) {
    rootRef.root = makeNode(key, null);
    snap(`空树，插入 ${key} 作为根。`, [rootRef.root.id]);
    return steps;
  }
  let cur = rootRef.root;
  while (true) {
    if (key === cur.key) {
      snap(`${key} 已存在，AVL 树不插入重复键。`, [cur.id]);
      return steps;
    }
    if (key < cur.key) {
      if (!cur.left) { cur.left = makeNode(key, cur); snap(`插入 ${key} 到 ${cur.key} 的左孩子。`, [cur.left.id]); break; }
      cur = cur.left;
    } else {
      if (!cur.right) { cur.right = makeNode(key, cur); snap(`插入 ${key} 到 ${cur.key} 的右孩子。`, [cur.right.id]); break; }
      cur = cur.right;
    }
  }

  let n = cur;
  while (n) {
    const beforeH = n.h;
    update(n);
    if (beforeH !== n.h) {
      snap(`回到 ${n.key}：更新高度 ${beforeH} → ${n.h}（左高 ${h(n.left)}，右高 ${h(n.right)}）。`, [n.id], { heights: true });
    }
    const b = bf(n);
    if (b > 1 || b < -1) {
      const type = b > 1 ? (bf(n.left) >= 0 ? 'LL' : 'LR') : (bf(n.right) <= 0 ? 'RR' : 'RL');
      snap(`节点 ${n.key} 平衡因子 ${b}，属于 ${type} 型失衡，开始旋转。`, [n.id], { type, alert: true });
      const newSub = rotateAt(n, type, snap);
      if (newSub.parent === null) rootRef.root = newSub;
      snap(`${type} 旋转完成，${newSub.key} 成为该子树的新根，高度回到 ${newSub.h}。`, [newSub.id], { type, doneType: type });
      n = newSub.parent;
    } else {
      n = n.parent;
    }
  }
  return steps;
}

function rotateAt(n, type, snap) {
  if (type === 'LL') return rotR(n, snap, 'LL');
  if (type === 'RR') return rotL(n, snap, 'RR');
  if (type === 'LR') {
    rotL(n.left, snap, 'LR-1');
    return rotR(n, snap, 'LR-2');
  }
  rotR(n.right, snap, 'RL-1');
  return rotL(n, snap, 'RL-2');
}

function linkParent(p, oldChild, sub) {
  if (!p) { sub.parent = null; return; }
  if (p.left === oldChild) p.left = sub;
  else p.right = sub;
  sub.parent = p;
}

function rotR(n, snap, tag) {
  const y = n.left;
  const p = n.parent;
  y.right = (() => { const r = y.right; if (r) r.parent = n; return r; })();
  n.left = y.right;
  if (n.left) n.left.parent = n;
  y.right = n;
  n.parent = y;
  update(n); update(y);
  linkParent(p, n, y);
  snap(`${tag === 'LL' ? 'LL' : 'LR 第二步'}：右旋，${n.key} 下移到 ${y.key} 的右孩子。`, [n.id, y.id], { rotate: 'R' });
  return y;
}

function rotL(n, snap, tag) {
  const y = n.right;
  const p = n.parent;
  n.right = (() => { const l = y.left; if (l) l.parent = n; return l; })();
  y.left = n;
  n.parent = y;
  update(n); update(y);
  linkParent(p, n, y);
  snap(`${tag === 'RR' ? 'RR' : tag === 'RL-1' ? 'RL 第一步（先对右孩子左旋）' : 'LR 第一步（先对左孩子左旋）'}：左旋，${n.key} 下移到 ${y.key} 的左孩子。`, [n.id, y.id], { rotate: 'L' });
  return y;
}

export function checkAVL(root) {
  let bst = true, balanced = true;
  const errors = [];
  const walk = (n, min, max) => {
    if (!n) return 0;
    if ((min != null && n.key <= min) || (max != null && n.key >= max)) {
      bst = false; errors.push(`BST 性质在 ${n.key} 处被破坏`);
    }
    const lh = walk(n.left, min, n.key);
    const rh = walk(n.right, n.key, max);
    if (Math.abs(lh - rh) > 1) { balanced = false; errors.push(`${n.key} 的左右高度差 ${Math.abs(lh - rh)} > 1`); }
    if (n.h !== 1 + Math.max(lh, rh)) errors.push(`${n.key} 的高度字段与实际不符`);
    return 1 + Math.max(lh, rh);
  };
  walk(root, null, null);
  return { bst, balanced, ok: bst && balanced, errors };
}

export function resetAvlUid() { uid = 0; }
