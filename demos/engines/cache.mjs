/* Cache 映射：直接映射 / 全相联 / 组相联。
   地址真实拆成 tag / index / offset，逐行比较 tag，并按 LRU 替换。 */

export const MAPPINGS = [
  { id: 'direct', name: '直接映射', assoc: 1 },
  { id: 'full', name: '全相联', assoc: 0 },
  { id: 'set', name: '组相联', assoc: 2 }
];

export function configOf(mapping, addrBits, cacheSize, blockSize, assoc) {
  const lines = Math.floor(cacheSize / blockSize);
  let sets, ways;
  if (mapping === 'direct') { sets = lines; ways = 1; }
  else if (mapping === 'full') { sets = 1; ways = lines; }
  else { ways = Math.max(2, assoc); sets = Math.max(1, Math.floor(lines / ways)); }
  const offBits = Math.round(Math.log2(blockSize));
  const idxBits = sets > 1 ? Math.round(Math.log2(sets)) : 0;
  const tagBits = addrBits - idxBits - offBits;
  return { mapping, addrBits, cacheSize, blockSize, lines, sets, ways, offBits, idxBits, tagBits };
}

export function decode(addr, cfg) {
  const off = addr & ((1 << cfg.offBits) - 1);
  const idx = cfg.sets > 1 ? Math.floor(addr / cfg.blockSize) % cfg.sets : 0;
  const tag = Math.floor(addr / (cfg.blockSize * cfg.sets));
  return { tag, idx, off };
}

export function simulateCache(mapping, addrBits, cacheSize, blockSize, assoc, addrs) {
  const cfg = configOf(mapping, addrBits, cacheSize, blockSize, assoc);
  const sets = Array.from({ length: cfg.sets }, () =>
    Array.from({ length: cfg.ways }, () => ({ tag: -1, valid: false, lru: 0 })));
  const steps = [];
  let tick = 1;
  let hits = 0, misses = 0;

  const snapState = () => sets.map(s => s.map(l => Object.assign({}, l)));
  const push = (msg, extra) => steps.push(Object.assign({
    cfg, state: snapState(), hits, misses, msg
  }, extra || {}));

  push(`Cache 配置：${cacheSize} B，块 ${blockSize} B，共 ${cfg.lines} 行；${cfg.sets} 组 × ${cfg.ways} 路。地址 ${addrBits} 位 → tag ${cfg.tagBits} + index ${cfg.idxBits} + offset ${cfg.offBits}。`, { phase: 'config' });

  addrs.forEach((addr, ai) => {
    const d = decode(addr, cfg);
    push(`第 ${ai + 1} 次访问地址 ${addr.toString(16).toUpperCase()}：tag = ${d.tag}，组号 index = ${d.idx}，块内偏移 = ${d.off}。`, { phase: 'split', access: ai, addr, dec: d });
    const set = sets[d.idx];
    let hitLine = -1;
    for (let w = 0; w < set.length; w++) {
      if (set[w].valid && set[w].tag === d.tag) { hitLine = w; break; }
    }
    if (hitLine >= 0) {
      hits++;
      set[hitLine].lru = tick++;
      push(`命中：组 ${d.idx} 的第 ${hitLine + 1} 路 tag = ${d.tag} 与地址相同${cfg.sets === 1 ? '' : '，直接取出数据'}。`, { phase: 'hit', access: ai, addr, dec: d, way: hitLine, hit: true });
    } else {
      misses++;
      let victim = set.findIndex(l => !l.valid);
      if (victim < 0) {
        victim = 0;
        for (let w = 1; w < set.length; w++) if (set[w].lru < set[victim].lru) victim = w;
      }
      const old = Object.assign({}, set[victim]);
      const evicted = old.valid;
      set[victim] = { tag: d.tag, valid: true, lru: tick++ };
      push(`缺失：组 ${d.idx} 里${evicted ? `没有 tag = ${d.tag} 的行，按 LRU 淘汰第 ${victim + 1} 路（tag ${old.tag}）` : `有空行，直接填入第 ${victim + 1} 路`}，把块 ${addr.toString(16).toUpperCase()} 装入。`, { phase: 'fill', access: ai, addr, dec: d, way: victim, hit: false, evicted });
    }
  });
  push(`访问结束：命中 ${hits} 次，缺失 ${misses} 次，命中率 ${addrs.length ? (hits / addrs.length * 100).toFixed(1) : '0'}%。`, { phase: 'done', done: true });
  return { steps, stats: { hits, misses, rate: addrs.length ? hits / addrs.length : 0 }, cfg };
}
