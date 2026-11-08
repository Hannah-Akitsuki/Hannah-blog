/* 排序引擎：八种算法真实执行并记录每一步快照（数组 + 比较/交换/移动计数）。
   steps 里不含任何预置动画序列，全部由算法运行产生。 */

export const SORT_ALGOS = [
  { id: 'insert', name: '插入排序', en: 'INSERTION' },
  { id: 'shell', name: '希尔排序', en: 'SHELL' },
  { id: 'bubble', name: '冒泡排序', en: 'BUBBLE' },
  { id: 'quick', name: '快速排序', en: 'QUICK' },
  { id: 'select', name: '选择排序', en: 'SELECTION' },
  { id: 'heap', name: '堆排序', en: 'HEAP' },
  { id: 'merge', name: '归并排序', en: 'MERGE' },
  { id: 'radix', name: '基数排序', en: 'RADIX' }
];

export function algoById(id) {
  return SORT_ALGOS.find(a => a.id === id) || null;
}

export function runSort(algo, input) {
  const a = input.map(Number).filter(n => isFinite(n) && n >= 0);
  const n = a.length;
  let cmp = 0, swp = 0, mov = 0;
  const steps = [];
  const sorted = new Set();
  let callStack = [];

  const snap = (msg, hl = [], extra = {}) => {
    steps.push(Object.assign({
      a: a.slice(),
      hl: hl.slice(),
      sorted: [...sorted],
      stack: callStack.map(r => r.slice()),
      cmp, swp, mov, msg
    }, extra));
  };

  if (!n) {
    snap('没有数据，先在上面的参数里填几个数。');
    return { steps, stats: { cmp, swp, mov }, sorted: [] };
  }

  switch (algo) {
    case 'insert': {
      snap('从左到右，把每个元素插入左边已经有序的部分。');
      for (let i = 1; i < n; i++) {
        let j = i;
        snap(`从 a[${i}] = ${a[i]} 开始，向左找插入位置。`, [i]);
        while (j > 0) {
          cmp++;
          if (a[j - 1] > a[j]) {
            const t = a[j - 1]; a[j - 1] = a[j]; a[j] = t;
            swp++; mov += 2;
            snap(`a[${j - 1}] = ${a[j]} > a[${j}] = ${a[j - 1]}，交换继续左移。`, [j - 1, j]);
            j--;
          } else {
            snap(`a[${j - 1}] = ${a[j - 1]} ≤ a[${j}] = ${a[j]}，位置找到了。`, [j - 1, j]);
            break;
          }
        }
        for (let k = 0; k <= i; k++) sorted.add(k);
        snap(`第 ${i} 个元素归位，左侧 0…${i} 已有序。`, [j]);
      }
      snap('排序完成，整个数组有序。', [], { done: true });
      break;
    }
    case 'shell': {
      snap('按增量分组做插入排序，增量逐次减半。');
      for (let gap = Math.floor(n / 2); gap > 0; gap = Math.floor(gap / 2)) {
        snap(`增量 gap = ${gap}：对相隔 ${gap} 的元素分别做插入排序。`, [], { gap });
        for (let i = gap; i < n; i++) {
          let j = i;
          snap(`从 a[${i}] = ${a[i]} 开始，在同组内向左找位置。`, [i], { gap });
          while (j >= gap) {
            cmp++;
            if (a[j - gap] > a[j]) {
              const t = a[j - gap]; a[j - gap] = a[j]; a[j] = t;
              swp++; mov += 2;
              snap(`a[${j - gap}] = ${a[j]} > a[${j}] = ${a[j - gap]}，同组交换并向左移 ${gap} 位。`, [j - gap, j], { gap });
              j -= gap;
            } else {
              snap(`a[${j - gap}] = ${a[j - gap]} ≤ a[${j}]，停止。`, [j - gap, j], { gap });
              break;
            }
          }
          snap(`a[${j}] = ${a[j]} 在本组就位。`, [j], { gap });
        }
      }
      for (let i = 0; i < n; i++) sorted.add(i);
      snap('增量降到 1 并完成，数组有序。', [], { done: true });
      break;
    }
    case 'bubble': {
      snap('相邻两两比较，大的逐步冒到右端。');
      for (let end = n - 1; end > 0; end--) {
        let swapped = false;
        for (let i = 0; i < end; i++) {
          cmp++;
          if (a[i] > a[i + 1]) {
            const t = a[i]; a[i] = a[i + 1]; a[i + 1] = t;
            swp++; mov += 2; swapped = true;
            snap(`a[${i}] = ${a[i + 1]} 与 a[${i + 1}] = ${a[i]} 逆序，交换。`, [i, i + 1], { range: [0, end] });
          } else {
            snap(`a[${i}] = ${a[i]} ≤ a[${i + 1}] = ${a[i + 1]}，不交换。`, [i, i + 1], { range: [0, end] });
          }
        }
        sorted.add(end);
        snap(`本轮结束后 a[${end}] = ${a[end]} 归位。`, [end], { range: [0, end] });
        if (!swapped) {
          for (let i = 0; i < end; i++) sorted.add(i);
          snap('本轮没有发生交换，说明前半段已经有序，提前结束。', [], { done: true });
          break;
        }
      }
      if (sorted.size < n) for (let i = 0; i < n; i++) sorted.add(i);
      snap('排序完成。', [], { done: true });
      break;
    }
    case 'quick': {
      const qs = (lo, hi) => {
        if (lo > hi) return;
        if (lo === hi) {
          sorted.add(lo);
          snap(`区间 [${lo}, ${hi}] 只剩一个元素，直接归位。`, [lo], { range: [lo, hi] });
          return;
        }
        callStack.push([lo, hi]);
        const pivot = a[hi];
        snap(`处理区间 [${lo}, ${hi}]，选 a[${hi}] = ${pivot} 作为基准。`, [hi], { range: [lo, hi] });
        let i = lo;
        for (let j = lo; j < hi; j++) {
          cmp++;
          if (a[j] < pivot) {
            if (i !== j) {
              const t = a[i]; a[i] = a[j]; a[j] = t;
              swp++; mov += 2;
              snap(`a[${j}] = ${a[j]} < ${pivot}，换到左区 a[${i}]。`, [i, j], { range: [lo, hi] });
            } else {
              snap(`a[${j}] = ${a[j]} < ${pivot}，本来就在左区。`, [j], { range: [lo, hi] });
            }
            i++;
          } else {
            snap(`a[${j}] = ${a[j]} ≥ ${pivot}，留在右区。`, [j], { range: [lo, hi] });
          }
        }
        if (i !== hi) {
          const t = a[i]; a[i] = a[hi]; a[hi] = t;
          swp++; mov += 2;
        }
        sorted.add(i);
        callStack.pop();
        snap(`基准 ${pivot} 归位到 a[${i}]；左边都小于它，右边都不小于它。`, [i], { range: [lo, hi] });
        qs(lo, i - 1);
        callStack.push([lo, hi]);
        qs(i + 1, hi);
        callStack.pop();
      };
      qs(0, n - 1);
      for (let i = 0; i < n; i++) sorted.add(i);
      snap('所有区间处理完毕，排序完成。', [], { done: true });
      break;
    }
    case 'select': {
      snap('每一轮从无序区选出最小的元素，放到当前起点。');
      for (let i = 0; i < n - 1; i++) {
        let min = i;
        snap(`无序区从 a[${i}] 开始，先假设最小值是 ${a[i]}。`, [i], { range: [i, n - 1] });
        for (let j = i + 1; j < n; j++) {
          cmp++;
          if (a[j] < a[min]) {
            min = j;
            snap(`发现更小的 a[${j}] = ${a[j]}，更新最小值下标。`, [j, min], { range: [i, n - 1] });
          } else {
            snap(`a[${j}] = ${a[j]} 不小于当前最小 ${a[min]}。`, [j, min], { range: [i, n - 1] });
          }
        }
        if (min !== i) {
          const t = a[i]; a[i] = a[min]; a[min] = t;
          swp++; mov += 2;
        }
        sorted.add(i);
        snap(`把本轮最小 ${a[i]} 换到 a[${i}]，前缀有序。`, [i], { range: [i, n - 1] });
      }
      sorted.add(n - 1);
      snap('最后一元素自然归位，排序完成。', [], { done: true });
      break;
    }
    case 'heap': {
      const siftDown = (root, size) => {
        let i = root;
        while (true) {
          let big = i;
          const l = i * 2 + 1, r = i * 2 + 2;
          if (l < size) {
            cmp++;
            if (a[l] > a[i]) big = l;
            snap(`比较左孩子 a[${l}] = ${a[l]} 与 a[${i}] = ${a[i]}。`, [i, l]);
          }
          if (r < size) {
            cmp++;
            if (a[r] > a[big]) big = r;
            snap(`比较右孩子 a[${r}] = ${a[r]} 与当前最大 a[${big}] = ${a[big]}。`, [big, r]);
          }
          if (big === i) {
            snap(`a[${i}] = ${a[i]} 已经比孩子大，下沉结束。`, [i]);
            return;
          }
          const t = a[i]; a[i] = a[big]; a[big] = t;
          swp++; mov += 2;
          snap(`交换 a[${i}] 与更大的孩子 a[${big}]，继续下沉。`, [i, big]);
          i = big;
        }
      };
      for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
        snap(`建大顶堆：从 a[${i}] 开始下沉。`, [i]);
        siftDown(i, n);
      }
      snap('大顶堆建立完成，堆顶是最大值。', [0]);
      for (let end = n - 1; end > 0; end--) {
        const t = a[0]; a[0] = a[end]; a[end] = t;
        swp++; mov += 2;
        sorted.add(end);
        snap(`堆顶 ${a[end]} 与末尾交换并归位到 a[${end}]，堆规模减 1。`, [0, end]);
        siftDown(0, end);
      }
      sorted.add(0);
      snap('堆排完成。', [], { done: true });
      break;
    }
    case 'merge': {
      const merge = (lo, mid, hi) => {
        const L = a.slice(lo, mid + 1), R = a.slice(mid + 1, hi + 1);
        let i = 0, j = 0;
        const buf = [];
        snap(`合并 [${lo}, ${mid}] 与 [${mid + 1}, ${hi}] 两段，先写进合并缓冲。`, [], { range: [lo, hi] });
        while (i < L.length && j < R.length) {
          cmp++;
          let v;
          if (L[i] <= R[j]) {
            v = L[i++];
            snap(`比较 ${L[i - 1]} ≤ ${R[j]}，取左边 ${v} 进缓冲。`, [], { range: [lo, hi], buf: buf.concat(v), bufRange: [lo, hi] });
          } else {
            v = R[j++];
            snap(`比较 ${L[i]} > ${R[j - 1]}，取右边 ${v} 进缓冲。`, [], { range: [lo, hi], buf: buf.concat(v), bufRange: [lo, hi] });
          }
          buf.push(v);
          mov++;
        }
        while (i < L.length) {
          buf.push(L[i++]);
          mov++;
          snap(`左段剩余 ${buf[buf.length - 1]} 直接进缓冲。`, [], { range: [lo, hi], buf: buf.slice(), bufRange: [lo, hi] });
        }
        while (j < R.length) {
          buf.push(R[j++]);
          mov++;
          snap(`右段剩余 ${buf[buf.length - 1]} 直接进缓冲。`, [], { range: [lo, hi], buf: buf.slice(), bufRange: [lo, hi] });
        }
        for (let k = 0; k < buf.length; k++) { a[lo + k] = buf[k]; mov++; }
        for (let x = lo; x <= hi; x++) sorted.delete(x);
        snap(`把缓冲 ${buf.join(' ')} 写回 a[${lo}…${hi}]，这一段合并完成。`, [], { range: [lo, hi] });
      };
      const ms = (lo, hi) => {
        if (lo >= hi) return;
        const mid = (lo + hi) >> 1;
        callStack.push([lo, hi]);
        snap(`拆分区间 [${lo}, ${hi}]，中点 ${mid}。`, [], { range: [lo, hi] });
        ms(lo, mid);
        ms(mid + 1, hi);
        merge(lo, mid, hi);
        callStack.pop();
      };
      ms(0, n - 1);
      for (let i = 0; i < n; i++) sorted.add(i);
      snap('归并完成，整个数组有序。', [], { done: true });
      break;
    }
    case 'radix': {
      const max = Math.max(...a);
      let digit = 1;
      for (let exp = 1; Math.floor(max / exp) > 0; exp *= 10, digit++) {
        const buckets = Array.from({ length: 10 }, () => []);
        for (const v of a) {
          buckets[Math.floor(v / exp) % 10].push(v);
          mov++;
        }
        snap(`按${['个', '十', '百', '千', '万'][digit - 1] || digit + '位'}位分配进 10 个桶。`, [], { buckets: buckets.map(b => b.slice()), digit });
        let k = 0;
        for (const b of buckets) for (const v of b) { a[k++] = v; mov++; }
        snap('从 0 到 9 号桶依次收集回数组，当前位已经有序。', [], { buckets: buckets.map(b => b.slice()), digit });
      }
      for (let i = 0; i < n; i++) sorted.add(i);
      snap('所有位处理完毕，排序完成（基数排序不需要比较）。', [], { done: true });
      break;
    }
    default:
      snap('未知算法。');
  }
  return { steps, stats: { cmp, swp, mov }, sorted: a.slice() };
}
