/* 页面置换：FIFO / LRU / OPT / Clock 四种算法在同一个引用串上并排跑。
   每一步都是把当前引用真正交给四个算法后得到的物理块状态。 */

export const PAGE_ALGOS = [
  { id: 'lru', name: 'LRU', full: '最近最久未使用' },
  { id: 'fifo', name: 'FIFO', full: '先进先出' },
  { id: 'opt', name: 'OPT', full: '最佳置换（Belady）' },
  { id: 'clock', name: 'Clock', full: '时钟 / 二次机会' }
];

export function simulatePage(refs, frameCount) {
  const n = Math.max(1, Math.min(8, frameCount));
  const runners = {
    lru: lruRun(refs, n),
    fifo: fifoRun(refs, n),
    opt: optRun(refs, n),
    clock: clockRun(refs, n)
  };
  const steps = [];
  for (let i = 0; i < refs.length; i++) {
    const results = {};
    for (const id of Object.keys(runners)) results[id] = runners[id].snaps[i];
    const faults = {};
    for (const id of Object.keys(runners)) faults[id] = runners[id].snaps[i].faults;
    steps.push({
      index: i, ref: refs[i], refs: refs.slice(), frames: n, results, faults,
      msg: `第 ${i + 1} 次访问页 ${refs[i]}：LRU ${tag(runners.lru.snaps[i])}，FIFO ${tag(runners.fifo.snaps[i])}，OPT ${tag(runners.opt.snaps[i])}，Clock ${tag(runners.clock.snaps[i])}。`
    });
  }
  const totals = {};
  const finalResults = {};
  for (const id of Object.keys(runners)) {
    totals[id] = runners[id].faults;
    finalResults[id] = runners[id].snaps[runners[id].snaps.length - 1];
  }
  steps.push({
    index: refs.length, ref: null, refs: refs.slice(), frames: n, results: finalResults, faults: totals,
    msg: `共 ${refs.length} 次访问：${PAGE_ALGOS.map(a => `${a.name} ${totals[a.id]} 次缺页`).join('，')}。`
  });
  return { steps, totals, frames: n };
}

function blank(n) { return Array.from({ length: n }, () => null); }
function tag(s) { return `${s.fault ? '缺页' : '命中'}（${s.frames.filter(x => x != null).map(x => x == null ? '空' : x).join(' ')}）`; }
function snapBase(frames, extra) {
  return Object.assign({ frames: frames.slice() }, extra);
}

function fifoRun(refs, n) {
  const frames = blank(n);
  let ptr = 0, faults = 0;
  const snaps = [];
  for (const ref of refs) {
    const at = frames.indexOf(ref);
    let fault = false, evicted = null;
    if (at >= 0) {
      /* 命中：FIFO 不改变淘汰顺序 */
    } else {
      fault = true; faults++;
      evicted = frames[ptr];
      frames[ptr] = ref;
      ptr = (ptr + 1) % n;
    }
    snaps.push(snapBase(frames, { fault, evicted, faults, ptr }));
  }
  return { snaps, faults };
}

function lruRun(refs, n) {
  const frames = blank(n);
  const last = Array.from({ length: n }, () => -1);
  let tick = 0, faults = 0;
  const snaps = [];
  for (const ref of refs) {
    const at = frames.indexOf(ref);
    let fault = false, evicted = null;
    if (at >= 0) {
      last[at] = tick++;
    } else {
      fault = true; faults++;
      let v = frames.findIndex(x => x == null);
      if (v < 0) {
        v = 0;
        for (let i = 1; i < n; i++) if (last[i] < last[v]) v = i;
      }
      evicted = frames[v];
      frames[v] = ref;
      last[v] = tick++;
    }
    snaps.push(snapBase(frames, { fault, evicted, faults, last: last.slice() }));
  }
  return { snaps, faults };
}

function optRun(refs, n) {
  const frames = blank(n);
  let faults = 0;
  const snaps = [];
  refs.forEach((ref, i) => {
    const at = frames.indexOf(ref);
    let fault = false, evicted = null;
    if (at >= 0) {
      /* 命中 */
    } else {
      fault = true; faults++;
      let v = frames.findIndex(x => x == null);
      if (v < 0) {
        let farthest = -1;
        for (let f = 0; f < n; f++) {
          let next = -1;
          for (let j = i + 1; j < refs.length; j++) {
            if (refs[j] === frames[f]) { next = j; break; }
          }
          if (next === -1) { v = f; farthest = Infinity; break; }
          if (next > farthest) { farthest = next; v = f; }
        }
        if (v < 0) v = 0;
      }
      evicted = frames[v];
      frames[v] = ref;
    }
    snaps.push(snapBase(frames, { fault, evicted, faults }));
  });
  return { snaps, faults };
}

function clockRun(refs, n) {
  const frames = blank(n);
  const use = Array.from({ length: n }, () => 0);
  let ptr = 0, faults = 0;
  const snaps = [];
  for (const ref of refs) {
    const at = frames.indexOf(ref);
    let fault = false, evicted = null;
    if (at >= 0) {
      use[at] = 1;
    } else {
      fault = true; faults++;
      while (frames[ptr] != null && use[ptr] === 1) {
        use[ptr] = 0;
        ptr = (ptr + 1) % n;
      }
      evicted = frames[ptr];
      frames[ptr] = ref;
      use[ptr] = 1;
      ptr = (ptr + 1) % n;
    }
    snaps.push(snapBase(frames, { fault, evicted, faults, use: use.slice(), ptr }));
  }
  return { snaps, faults };
}
