/* 败者树：把 k 个有序段做多路归并。
   采用堆式完全树（叶子在 k…2k-1），每个内部节点记录「败者」，胜者继续上浮；
   这正是课本里「败者留父节点、胜者上浮」的可视化口径。 */

export function loserMerge(runs) {
  const k = runs.length;
  const src = runs.map(r => r.slice());
  const b = src.map(r => (r.length ? r[0] : Infinity));
  const pos = src.map(() => 0);
  const win = new Array(2 * k).fill(-1);
  const lose = new Array(2 * k).fill(-1);
  const steps = [];
  const output = [];

  const snap = (msg, hl = [], extra = {}) => {
    steps.push(Object.assign({
      k, b: b.slice(), pos: pos.slice(), win: win.slice(), lose: lose.slice(),
      output: output.slice(), msg, hl: hl.slice()
    }, extra));
  };

  for (let i = 0; i < k; i++) win[k + i] = i;

  const play = (t, record) => {
    const a = win[2 * t], c = win[2 * t + 1];
    if (a < 0 || c < 0) return;
    const w = b[a] <= b[c] ? a : c;
    const l = w === a ? c : a;
    win[t] = w; lose[t] = l;
    if (record) {
      snap(`节点 ${t}：第 ${a + 1} 段（${show(b[a])}）对第 ${c + 1} 段（${show(b[c])}）—— 败者 ${l + 1} 段留在节点 ${t}，胜者 ${w + 1} 段上浮。`,
        [w, l], { node: t, compare: [a, c], winner: w, loser: l });
    }
  };

  snap('建树：叶子是 k 个有序段的当前队首，内部节点从下往上比赛。', []);
  for (let t = k - 1; t >= 1; t--) play(t, true);
  snap(`败者树建好，根上传出的胜者是第 ${win[1] + 1} 段的 ${show(b[win[1]])}。`, [win[1]], { current: win[1], built: true });

  let guard = 0;
  while (b[win[1]] !== Infinity && guard++ < 400) {
    const w = win[1];
    const v = b[w];
    output.push(v);
    pos[w]++;
    snap(`输出最小值 ${v}（来自第 ${w + 1} 段），它出队后要把下一元素补到叶子 ${w + 1} 再重赛。`,
      [w], { current: w, picked: v, outputDone: true });
    b[w] = pos[w] < src[w].length ? src[w][pos[w]] : Infinity;
    snap(`第 ${w + 1} 段的队首换成 ${show(b[w])}，沿它到根的路径重新比赛。`, [], { current: w, refill: true });
    let t = Math.floor((w + k) / 2);
    while (t >= 1) {
      play(t, true);
      t = Math.floor(t / 2);
    }
    snap(`这一轮胜者变成第 ${win[1] + 1} 段的 ${show(b[win[1]])}。`, [win[1]], { current: win[1] });
  }
  snap(`k 个段全部取空，归并结果：${output.join(' ')}。`, [], { done: true, current: -1 });
  return { steps, output, k };
}

function show(v) { return v === Infinity ? '∞' : String(v); }

/* 自检用：朴素两两归并 */
export function naiveMerge(runs) {
  const all = [].concat(...runs.map(r => r.slice()));
  return all.sort((x, y) => x - y);
}
