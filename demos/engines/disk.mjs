/* 磁盘调度：六种算法在同一串请求上计算真实访问顺序与磁头移动。
   SCAN 到端点才掉头；LOOK 到最远请求就掉头；C-SCAN / C-LOOK 单向服务，回程跳转不服务。 */

export const DISK_ALGOS = [
  { id: 'fcfs', name: 'FCFS', full: '先来先服务' },
  { id: 'sstf', name: 'SSTF', full: '最短寻道时间优先' },
  { id: 'scan', name: 'SCAN', full: '扫描（电梯）' },
  { id: 'look', name: 'LOOK', full: 'Look 调度' },
  { id: 'cscan', name: 'C-SCAN', full: '循环扫描' },
  { id: 'clook', name: 'C-LOOK', full: '循环 Look' }
];

export function simulateDisk(algo, opts) {
  const start = Number(opts.start);
  const dirUp = opts.dir !== 'down';
  const minT = Math.max(0, Number(opts.minTrack == null ? 0 : opts.minTrack));
  const maxT = Math.max(minT, Number(opts.maxTrack == null ? 199 : opts.maxTrack));
  const reqs = opts.requests.map(Number).filter(t => isFinite(t) && t >= minT && t <= maxT);
  const path = [];
  const order = [];
  let cur = start;

  const serve = t => {
    path.push({ from: cur, to: t, kind: 'serve', track: t });
    cur = t; order.push(t);
  };
  const travel = t => { path.push({ from: cur, to: t, kind: 'travel' }); cur = t; };
  const jump = t => { path.push({ from: cur, to: t, kind: 'jump' }); cur = t; };

  const sorted = reqs.slice().sort((a, b) => a - b);
  const above = sorted.filter(t => t >= start);
  const below = sorted.filter(t => t < start);

  if (algo === 'fcfs') {
    reqs.forEach(serve);
  } else if (algo === 'sstf') {
    const pending = reqs.slice();
    while (pending.length) {
      let k = 0;
      for (let i = 1; i < pending.length; i++) {
        const d1 = Math.abs(pending[i] - cur), d2 = Math.abs(pending[k] - cur);
        if (d1 < d2 || (d1 === d2 && pending[i] < pending[k])) k = i;
      }
      serve(pending.splice(k, 1)[0]);
    }
  } else if (algo === 'scan') {
    if (dirUp) {
      above.forEach(serve);
      travel(maxT);
      below.slice().reverse().forEach(serve);
    } else {
      below.slice().reverse().forEach(serve);
      travel(minT);
      above.forEach(serve);
    }
  } else if (algo === 'look') {
    if (dirUp) {
      above.forEach(serve);
      below.slice().reverse().forEach(serve);
    } else {
      below.slice().reverse().forEach(serve);
      above.forEach(serve);
    }
  } else if (algo === 'cscan') {
    if (dirUp) {
      above.forEach(serve);
      travel(maxT);
      jump(minT);
      below.forEach(serve);
    } else {
      below.slice().reverse().forEach(serve);
      travel(minT);
      jump(maxT);
      above.forEach(serve);
    }
  } else if (algo === 'clook') {
    if (dirUp) {
      above.forEach(serve);
      if (below.length) {
        jump(below[0]);
        below.forEach(serve);
      }
    } else {
      below.slice().reverse().forEach(serve);
      if (above.length) {
        jump(above[above.length - 1]);
        above.forEach(serve);
      }
    }
  }

  const total = path.reduce((s, seg) => s + Math.abs(seg.to - seg.from), 0);
  const service = path.filter(s => s.kind === 'serve').reduce((s, seg) => s + Math.abs(seg.to - seg.from), 0);
  return {
    algo, start, dir: dirUp ? 'up' : 'down', minT, maxT, requests: reqs,
    order, path, total, service,
    avg: reqs.length ? total / reqs.length : 0,
    avgService: reqs.length ? service / reqs.length : 0
  };
}

/* 自检基准：两组请求、六个算法的总移动磁道数（口径：含回程跳转；SCAN 含端点行程） */
export const DISK_CASES = [
  {
    name: 'A',
    start: 53, dir: 'up', minTrack: 0, maxTrack: 199,
    requests: [98, 183, 37, 122, 14, 124, 65, 67],
    expected: { fcfs: 640, sstf: 236, scan: 331, look: 299, cscan: 382, clook: 322 }
  },
  {
    name: 'B',
    start: 100, dir: 'up', minTrack: 0, maxTrack: 199,
    requests: [10, 20, 30, 190, 50, 60],
    expected: { fcfs: 420, sstf: 270, scan: 288, look: 270, cscan: 358, clook: 320 }
  }
];
