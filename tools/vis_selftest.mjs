/* 交互演示自检：直接 import 纯算法引擎，用独立基准对拍。
   运行：node tools/vis_selftest.mjs */
import { SORT_ALGOS, runSort } from '../demos/engines/sort.mjs';
import { buildBST, traceTraversal, referenceOrders } from '../demos/engines/tree.mjs';
import { insertAVL, resetAvlUid, checkAVL } from '../demos/engines/avl.mjs';
import { loserMerge, naiveMerge } from '../demos/engines/loser.mjs';
import { insertRB, resetRbUid, checkRB } from '../demos/engines/rb.mjs';
import { parseAddr, simulateVmem } from '../demos/engines/vmem.mjs';
import { simulateCache, decode, configOf } from '../demos/engines/cache.mjs';
import { simulatePage } from '../demos/engines/page.mjs';
import { DISK_ALGOS, simulateDisk, DISK_CASES } from '../demos/engines/disk.mjs';
import { tcpTrace } from '../demos/engines/tcp.mjs';

let failed = 0;
function ok(cond, name, detail) {
  if (cond) console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
  else { failed++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const R = rng(20261108);
const ints = (n, max) => Array.from({ length: n }, () => Math.floor(R() * max));

/* 1. 排序：结果对拍 JS 标准库；每一步数组都是原数组的排列 */
const FIXED = [5, 2, 9, 1, 7, 3, 8, 4, 6, 10];
const fixedStandard = FIXED.slice().sort((a, b) => a - b).join(',');
for (const algo of SORT_ALGOS) {
  let allOk = true, bad = '';
  const cases = [FIXED, ...Array.from({ length: 12 }, () => ints(2 + Math.floor(R() * 12), 60))];
  for (const input of cases) {
    const res = runSort(algo.id, input);
    const got = res.sorted.join(',');
    const want = input.slice().sort((a, b) => a - b).join(',');
    if (got !== want) { allOk = false; bad = `输入 ${input} 得到 ${got} 期望 ${want}`; break; }
    const src = input.slice().sort((a, b) => a - b).join(',');
    for (const st of res.steps) {
      if (st.a.slice().sort((a, b) => a - b).join(',') !== src) { allOk = false; bad = '步骤数组不是原数组的排列'; break; }
    }
  }
  const fixed = runSort(algo.id, FIXED);
  ok(allOk, `排序 ${algo.name}`, `排序结果=标准库；固定数组比较 ${fixed.stats.cmp} / 交换 ${fixed.stats.swp} / 移动 ${fixed.stats.mov}；共 ${fixed.steps.length} 步`);
}
ok(runSort('insert', FIXED).sorted.join(',') === fixedStandard, '排序基准数组', fixedStandard);

/* 2. 二叉树遍历：最终访问序列对拍递归参考实现 */
for (let t = 0; t < 8; t++) {
  const vals = Array.from(new Set(ints(10, 100))).slice(0, 9);
  const root = buildBST(vals);
  const keyById = new Map();
  (function walk(n) { if (!n) return; keyById.set(n.id, n.key); walk(n.left); walk(n.right); })(root);
  const ref = referenceOrders(root);
  for (const kind of ['pre', 'in', 'post', 'level']) {
    const steps = traceTraversal(root, kind);
    const got = (steps[steps.length - 1].visited || []).map(id => keyById.get(id));
    const want = ref[kind];
    ok(got.join(',') === want.join(','), `二叉树 ${kind} 遍历 #${t + 1}`, `得到 ${got.join('→')}`);
  }
}

/* 3. AVL：每次插入后检查 BST + 平衡；四种旋转都出现 */
const AVL_PRESETS = { LL: [30, 20, 10], RR: [10, 20, 30], LR: [30, 10, 20], RL: [10, 30, 20] };
for (const [type, seq] of Object.entries(AVL_PRESETS)) {
  resetAvlUid();
  const rootRef = { root: null };
  let steps = [];
  seq.forEach(k => { steps = steps.concat(insertAVL(rootRef, k)); });
  const seen = steps.some(s => s.type === type);
  const chk = checkAVL(rootRef.root);
  ok(seen && chk.ok, `AVL ${type} 旋转`, `出现 ${seen ? type : '未出现旋转'}；BST=${chk.bst} 平衡=${chk.balanced}；共 ${steps.length} 步`);
}
for (let t = 0; t < 6; t++) {
  resetAvlUid();
  const rootRef = { root: null };
  const seq = Array.from(new Set(ints(12, 100))).slice(0, 12);
  let allOk = true, bad = '';
  seq.forEach(k => {
    const steps = insertAVL(rootRef, k);
    const chk = checkAVL(rootRef.root);
    if (!chk.ok) { allOk = false; bad = `插入 ${k} 后：${chk.errors.join('；')}`; }
    if (!steps.length) { allOk = false; bad = `插入 ${k} 没有产生步骤`; }
  });
  ok(allOk, `AVL 随机插入 #${t + 1}`, allOk ? `序列 ${seq.join(',')} 全部平衡` : bad);
}

/* 4. 败者树：与朴素排序归并对拍 */
let loserAll = true, loserBad = '';
for (let t = 0; t < 12; t++) {
  const k = 2 + Math.floor(R() * 5);
  const runs = Array.from({ length: k }, () => ints(2 + Math.floor(R() * 4), 50).sort((a, b) => a - b));
  const res = loserMerge(runs);
  const got = res.output.join(',');
  const want = naiveMerge(runs).join(',');
  if (got !== want) { loserAll = false; loserBad = `${runs.map(r => '[' + r + ']').join(' ')} 得到 ${got} 期望 ${want}`; break; }
}
ok(loserAll, '败者树 k 路归并', loserAll ? '12 组随机 k=2..6 有序段输出均与朴素归并一致' : loserBad);
const demoLoser = loserMerge([[3, 9, 15], [5, 11, 17], [7, 13, 19], [1, 8, 14]]);
ok(demoLoser.output.join(',') === '1,3,5,7,8,9,11,13,14,15,17,19', '败者树默认示例', `输出 ${demoLoser.output.join(' ')}`);

/* 5. 红黑树：每次插入后检查 BST / 红红 / 根黑 / 黑高 */
let rbAll = true, rbBad = '', rbSize = 0;
for (let t = 0; t < 8; t++) {
  resetRbUid();
  const rootRef = { root: null };
  const seq = Array.from(new Set(ints(12, 100))).slice(0, 12);
  seq.forEach(k => {
    insertRB(rootRef, k);
    const chk = checkRB(rootRef.root);
    if (!chk.ok) { rbAll = false; rbBad = `插入 ${k} 后：${chk.errors.join('；')}`; }
  });
  rbSize = checkRB(rootRef.root).size;
}
ok(rbAll, '红黑树插入性质', rbAll ? `随机序列插入后均满足 BST、根黑、无红红、黑高一致（末组 ${rbSize} 节点）` : rbBad);

/* 6. 虚拟地址 → 物理地址：用 BigInt 独立算一次 */
const cases = [
  { addr: '0x000052A8', page: 4096, expVpn: 5, expOff: 0x2A8, expPfn: 9, expPa: 0x92A8, hit: true },
  { addr: '0x000062A8', page: 4096, expVpn: 6, expOff: 0x2A8, expPfn: 10, expPa: 0xA2A8, hit: false },
  { addr: '0x000032A8', page: 4096, expVpn: 3, expOff: 0x2A8, expPfn: null, expPa: null }
];
for (const c of cases) {
  const addr = parseAddr(c.addr);
  const vpn = Number(BigInt(addr) >> 12n);
  const off = Number(BigInt(addr) & 4095n);
  const res = simulateVmem(addr, c.page);
  const tail = res.steps[res.steps.length - 1];
  const okCase = vpn === c.expVpn && off === c.expOff && (c.expPa == null ? res.pa === null : res.pa === c.expPa) && (c.expPfn == null || res.pfn === c.expPfn);
  ok(okCase, `虚拟地址 ${c.addr}`, `VPN=${vpn} offset=0x${off.toString(16)} PFN=${res.pfn == null ? '无效' : res.pfn} PA=${res.pa == null ? '无' : '0x' + res.pa.toString(16).toUpperCase()} 命中=${res.hit} 末步=${tail.phase}`);
}
const page1024 = simulateVmem(parseAddr('0x00001234'), 1024);
ok(page1024.vpn === 4 && page1024.offset === 0x234, '页大小 1KB 拆分', `VPN=${page1024.vpn} offset=0x${page1024.offset.toString(16)}`);

/* 7. Cache：地址拆分独立复算 + 直接映射命中模式 */
const cfg = configOf('direct', 16, 256, 16, 1);
const samples = [
  { a: 0x0000, tag: 0, idx: 0, off: 0 },
  { a: 0x0010, tag: 0, idx: 1, off: 0 },
  { a: 0x0120, tag: 1, idx: 2, off: 0 },
  { a: 0x1234, tag: 0x12, idx: 3, off: 4 }
];
let cacheDecOk = true, cacheBad = '';
for (const s of samples) {
  const d = decode(s.a, cfg);
  const idx = Number((BigInt(s.a) >> 4n) & 15n);
  const tag = Number(BigInt(s.a) >> 8n);
  const off = Number(BigInt(s.a) & 15n);
  if (d.tag !== tag || d.idx !== idx || d.off !== off || s.tag !== tag || s.idx !== idx || s.off !== off) {
    cacheDecOk = false; cacheBad = `地址 ${s.a.toString(16)} 得到 tag ${d.tag} idx ${d.idx} off ${d.off}`;
  }
}
ok(cacheDecOk, 'Cache 地址拆分（直接映射 16 位 / 256B / 16B 块）', cacheDecOk ? '4 个地址的 tag/index/offset 与 BigInt 位运算一致' : cacheBad);
const seqC = [0x0000, 0x0010, 0x0020, 0x0000, 0x0120, 0x0000, 0x0010, 0x0020];
const cres = simulateCache('direct', 16, 256, 16, 1, seqC);
const pattern = cres.steps.filter(s => s.phase === 'hit' || s.phase === 'fill').map(s => s.hit ? 'H' : 'M').join('');
ok(pattern === 'MMMHMHHM' && cres.stats.hits === 3, 'Cache 直接映射命中模式', `得到 ${pattern}，命中 ${cres.stats.hits} / 缺失 ${cres.stats.misses}`);
const fullRes = simulateCache('full', 16, 256, 16, 0, seqC);
const fullPattern = fullRes.steps.filter(s => s.phase === 'hit' || s.phase === 'fill').map(s => s.hit ? 'H' : 'M').join('');
ok(fullPattern === 'MMMHMHHH' && fullRes.stats.hits === 4, 'Cache 全相联命中模式', `得到 ${fullPattern}，命中 ${fullRes.stats.hits}`);
const setRes = simulateCache('set', 16, 256, 16, 2, seqC);
const setPattern = setRes.steps.filter(s => s.phase === 'hit' || s.phase === 'fill').map(s => s.hit ? 'H' : 'M').join('');
ok(setPattern === 'MMMHMHHH' && setRes.stats.hits === 4, 'Cache 2 路组相联命中模式', `得到 ${setPattern}，命中 ${setRes.stats.hits}`);

/* 8. 页面置换：手算基准 */
const classic = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];
const pr = simulatePage(classic, 3);
ok(pr.totals.fifo === 15, '页面置换 FIFO 经典串', `缺页 ${pr.totals.fifo} 次（手算 15）`);
ok(pr.totals.lru === 12, '页面置换 LRU 经典串', `缺页 ${pr.totals.lru} 次（手算 12）`);
ok(pr.totals.opt === 9, '页面置换 OPT 经典串', `缺页 ${pr.totals.opt} 次（手算 9）`);
const short = simulatePage([1, 2, 3, 4, 1, 2, 5, 1], 3);
ok(short.totals.fifo === 7 && short.totals.lru === 7 && short.totals.opt === 5 && short.totals.clock === 7, '页面置换短串（含 Clock）', `FIFO ${short.totals.fifo} / LRU ${short.totals.lru} / OPT ${short.totals.opt} / Clock ${short.totals.clock}（手算 7 / 7 / 5 / 7）`);

/* 9. 磁盘调度：两组请求 × 六个算法，总移动磁道数与手算基准 */
for (const cs of DISK_CASES) {
  const parts = [];
  let allOk = true;
  for (const a of DISK_ALGOS) {
    const res = simulateDisk(a.id, cs);
    const want = cs.expected[a.id];
    if (res.total !== want) allOk = false;
    parts.push(`${a.name} ${res.total}${res.total === want ? '' : '(期望 ' + want + ')'}`);
  }
  ok(allOk, `磁盘调度案例 ${cs.name}`, parts.join(' / '));
}

/* 10. TCP */
const hs = tcpTrace('handshake');
const td = tcpTrace('teardown');
ok(hs[hs.length - 1].arrows.length === 3, 'TCP 三次握手报文数', `末态 ${hs[hs.length - 1].client} / ${hs[hs.length - 1].server}，报文 3 条`);
ok(hs[hs.length - 1].client === 'ESTABLISHED' && hs[hs.length - 1].server === 'ESTABLISHED', 'TCP 握手终态', '两端 ESTABLISHED');
ok(td[td.length - 1].arrows.length === 4, 'TCP 四次挥手报文数', `末态 ${td[td.length - 1].client} / ${td[td.length - 1].server}，报文 4 条`);
ok(td[td.length - 1].client === 'CLOSED' && td[td.length - 1].server === 'CLOSED', 'TCP 挥手终态', '两端 CLOSED');

console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}：${failed} 项失败`);
process.exit(failed ? 1 : 0);
