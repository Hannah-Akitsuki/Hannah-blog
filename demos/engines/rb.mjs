/* 红黑树：CLRS 版插入 + 上浮修复（变色 / 旋转）。
   步骤由真实修复循环产生，慢速播放可以看到颜色与父子关系变化。 */

let uid = 0;
function makeNode(key, parent, color) {
  return { id: 'r' + (uid++), key, left: null, right: null, color: color || 'R', parent: parent || null };
}
function clone(n) {
  if (!n) return null;
  return { id: n.id, key: n.key, color: n.color, left: clone(n.left), right: clone(n.right) };
}
function colorOf(n) { return n ? n.color : 'B'; }

export function resetRbUid() { uid = 0; }

export function insertRB(rootRef, key) {
  const steps = [];
  const snap = (msg, hl = [], extra = {}) => {
    steps.push(Object.assign({
      tree: clone(rootRef.root),
      hl: hl.slice(),
      msg
    }, extra));
  };
  if (!rootRef.root) {
    rootRef.root = makeNode(key, null, 'B');
    snap(`空树：插入 ${key} 并直接设为黑色根。`, [rootRef.root.id]);
    return steps;
  }
  let cur = rootRef.root, parent = null;
  while (cur) {
    parent = cur;
    if (key === cur.key) {
      snap(`${key} 已存在，不重复插入。`, [cur.id]);
      return steps;
    }
    cur = key < cur.key ? cur.left : cur.right;
  }
  const z = makeNode(key, parent, 'R');
  if (key < parent.key) parent.left = z; else parent.right = z;
  snap(`按 BST 插入 ${key}，新节点先染成红色。`, [z.id]);
  fixup(rootRef, z, snap);
  rootRef.root.color = 'B';
  snap('修复结束，根节点强制为黑色，红黑性质恢复。', [rootRef.root.id]);
  return steps;
}

function rootOf(n) {
  let r = n;
  while (r && r.parent) r = r.parent;
  return r;
}
function rotateL(rootRef, x, snap) {
  const y = x.right;
  x.right = y.left;
  if (y.left) y.left.parent = x;
  y.parent = x.parent;
  if (!x.parent) rootRef.root = y;
  else if (x === x.parent.left) x.parent.left = y;
  else x.parent.right = y;
  y.left = x;
  x.parent = y;
  snap(`左旋 ${x.key}：${y.key} 上移，${x.key} 成为它的左孩子。`, [x.id, y.id], { rotate: 'L' });
}
function rotateR(rootRef, x, snap) {
  const y = x.left;
  x.left = y.right;
  if (y.right) y.right.parent = x;
  y.parent = x.parent;
  if (!x.parent) rootRef.root = y;
  else if (x === x.parent.right) x.parent.right = y;
  else x.parent.left = y;
  y.right = x;
  x.parent = y;
  snap(`右旋 ${x.key}：${y.key} 上移，${x.key} 成为它的右孩子。`, [x.id, y.id], { rotate: 'R' });
}

function fixup(rootRef, z, snap) {
  let guard = 0;
  while (z.parent && z.parent.color === 'R' && guard++ < 64) {
    const p = z.parent;
    const g = p.parent;
    if (!g) break;
    if (p === g.left) {
      const u = g.right;
      if (u && u.color === 'R') {
        p.color = 'B'; u.color = 'B'; g.color = 'R';
        snap(`叔叔 ${u.key} 是红色：父 ${p.key} 与叔叔变黑，祖父 ${g.key} 变红，问题上移到祖父。`, [p.id, u.id, g.id], { recolor: true });
        z = g;
      } else {
        if (z === p.right) {
          z = p;
          rotateL(rootRef, z, snap);
        }
        z.parent.color = 'B';
        z.parent.parent.color = 'R';
        rotateR(rootRef, z.parent.parent, snap);
      }
    } else {
      const u = g.left;
      if (u && u.color === 'R') {
        p.color = 'B'; u.color = 'B'; g.color = 'R';
        snap(`叔叔 ${u.key} 是红色：父 ${p.key} 与叔叔变黑，祖父 ${g.key} 变红，问题上移到祖父。`, [p.id, u.id, g.id], { recolor: true });
        z = g;
      } else {
        if (z === p.left) {
          z = p;
          rotateR(rootRef, z, snap);
        }
        z.parent.color = 'B';
        z.parent.parent.color = 'R';
        rotateL(rootRef, z.parent.parent, snap);
      }
    }
  }
}

export function checkRB(root) {
  let bst = true, redRed = false, rootBlack = false, bhOk = true, size = 0;
  const errors = [];
  if (root) {
    rootBlack = root.color === 'B';
    if (!rootBlack) errors.push('根节点不是黑色');
  }
  const walk = (n, min, max) => {
    if (!n) return 1;
    size++;
    if ((min != null && n.key <= min) || (max != null && n.key >= max)) {
      bst = false; errors.push(`BST 性质在 ${n.key} 处被破坏`);
    }
    if (n.color === 'R' && (colorOf(n.left) === 'R' || colorOf(n.right) === 'R')) {
      redRed = true; errors.push(`红节点 ${n.key} 有红色孩子`);
    }
    const lh = walk(n.left, min, n.key);
    const rh = walk(n.right, n.key, max);
    if (lh !== rh) { bhOk = false; errors.push(`${n.key} 左右黑高不一致 (${lh} vs ${rh})`); }
    return lh + (n.color === 'B' ? 1 : 0);
  };
  walk(root, null, null);
  return { bst, redRed, rootBlack, bhOk, size, ok: bst && !redRed && rootBlack && bhOk, errors };
}

export { rootOf };
