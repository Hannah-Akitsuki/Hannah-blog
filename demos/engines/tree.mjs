/* 二叉树：建树、四种遍历的单步记录（真实使用栈/队列）。
   布局用中序序号做 x、深度做 y，保证节点不重叠。 */

let uid = 0;

export function buildBST(values) {
  uid = 0;
  let root = null;
  const insert = (node, key) => {
    if (!node) return { id: 'n' + (uid++), key, left: null, right: null, depth: 0 };
    if (key < node.key) node.left = insert(node.left, key);
    else if (key > node.key) node.right = insert(node.right, key);
    return node;
  };
  for (const v of values) root = insert(root, Number(v));
  const setDepth = (n, d) => {
    if (!n) return;
    n.depth = d;
    setDepth(n.left, d + 1);
    setDepth(n.right, d + 1);
  };
  setDepth(root, 0);
  return root;
}

export function layout(root) {
  const nodes = [];
  let idx = 0;
  const walk = n => {
    if (!n) return;
    walk(n.left);
    nodes.push({ node: n, x: idx++, y: n.depth });
    walk(n.right);
  };
  walk(root);
  const edges = [];
  const walk2 = n => {
    if (!n) return;
    if (n.left) edges.push([n, n.left]);
    if (n.right) edges.push([n, n.right]);
    walk2(n.left);
    walk2(n.right);
  };
  walk2(root);
  return { nodes, edges, width: Math.max(1, idx), height: root ? root.depth + 1 : 1 };
}

function snapshot(kind, msg, cur, visited, stack, queue, extra) {
  return Object.assign({
    kind, msg,
    cur: cur ? cur.id : null,
    visited: visited.slice(),
    stack: stack.slice(),
    queue: queue ? queue.slice() : []
  }, extra || {});
}

export function traceTraversal(root, kind) {
  const steps = [];
  const visited = [];
  const stack = [];
  const queue = [];
  if (!root) return [snapshot(kind, '空树，没有可访问的节点。', null, visited, stack, queue)];

  if (kind === 'pre') {
    stack.push(root);
    steps.push(snapshot(kind, `前序：根 → 左 → 右。先把根 ${root.key} 压栈。`, null, visited, stack, queue));
    while (stack.length) {
      const n = stack.pop();
      visited.push(n.id);
      steps.push(snapshot(kind, `弹出并访问 ${n.key}；先压右孩子、再压左孩子，保证左子树先出栈。`, n, visited, stack, queue));
      if (n.right) stack.push(n.right);
      if (n.left) stack.push(n.left);
      steps.push(snapshot(kind, `访问 ${n.key} 后栈内容：${stack.map(x => x.key).join(' ') || '空'}。`, n, visited, stack, queue));
    }
  } else if (kind === 'in') {
    let cur = root;
    steps.push(snapshot(kind, '中序：左 → 根 → 右。从根开始一路向左压栈。', null, visited, stack, queue));
    while (cur || stack.length) {
      while (cur) {
        stack.push(cur);
        steps.push(snapshot(kind, `向左走，把 ${cur.key} 压栈。`, cur, visited, stack, queue));
        cur = cur.left;
      }
      const n = stack.pop();
      visited.push(n.id);
      steps.push(snapshot(kind, `左子树走到底，弹出并访问 ${n.key}。`, n, visited, stack, queue));
      cur = n.right;
      if (cur) steps.push(snapshot(kind, `转向 ${n.key} 的右孩子 ${cur.key}。`, cur, visited, stack, queue));
    }
  } else if (kind === 'post') {
    stack.push({ n: root, done: false });
    steps.push(snapshot(kind, '后序：左 → 右 → 根。用「展开 / 收尾」标记模拟递归。', null, visited, stack.map(x => x.n), queue));
    while (stack.length) {
      const top = stack.pop();
      if (!top.done) {
        stack.push({ n: top.n, done: true });
        if (top.n.right) stack.push({ n: top.n.right, done: false });
        if (top.n.left) stack.push({ n: top.n.left, done: false });
        steps.push(snapshot(kind, `展开 ${top.n.key}：先处理左子树，再处理右子树，最后回来访问它。`,
          top.n, visited, stack.map(x => x.n), queue, { doneStack: stack.map(x => !!x.done) }));
      } else {
        visited.push(top.n.id);
        steps.push(snapshot(kind, `左右子树都处理完了，现在访问 ${top.n.key}。`,
          top.n, visited, stack.map(x => x.n), queue, { doneStack: stack.map(x => !!x.done) }));
      }
    }
  } else {
    queue.push(root);
    steps.push(snapshot(kind, `层序：根入队。`, null, visited, stack, queue));
    while (queue.length) {
      const n = queue.shift();
      visited.push(n.id);
      steps.push(snapshot(kind, `出队并访问 ${n.key}，把它的孩子依次入队。`, n, visited, stack, queue));
      if (n.left) queue.push(n.left);
      if (n.right) queue.push(n.right);
      steps.push(snapshot(kind, `队列：${queue.map(x => x.key).join(' ') || '空'}。`, n, visited, stack, queue));
    }
  }
  steps.push(snapshot(kind, `${kind === 'pre' ? '前序' : kind === 'in' ? '中序' : kind === 'post' ? '后序' : '层序'}完成，访问序列：${visited.map(id => findKey(root, id)).join(' → ')}。`,
    null, visited, stack, queue));
  return steps;
}

function findKey(root, id) {
  if (!root) return '';
  if (root.id === id) return root.key;
  return findKey(root.left, id) || findKey(root.right, id);
}

/* 自检用：递归参考实现 */
export function referenceOrders(root) {
  const pre = [], ino = [], post = [];
  const walk = n => {
    if (!n) return;
    pre.push(n.key);
    walk(n.left);
    ino.push(n.key);
    walk(n.right);
    post.push(n.key);
  };
  walk(root);
  const level = [];
  if (root) {
    const q = [root];
    while (q.length) {
      const n = q.shift();
      level.push(n.key);
      if (n.left) q.push(n.left);
      if (n.right) q.push(n.right);
    }
  }
  return { pre, in: ino, post, level };
}
