/* 虚拟地址 → TLB → 页表 → 物理地址。
   页表与 TLB 都是真实数据结构，地址按位拆分后逐项查找。 */

export const PAGE_SIZES = [1024, 4096, 16384];

/* 示例页表：VPN → PFN（未列出的 VPN 视为无效） */
export const PAGE_TABLE = [
  { vpn: 0, pfn: 0x2, valid: true },
  { vpn: 1, pfn: 0x7, valid: true },
  { vpn: 2, pfn: 0x4, valid: true },
  { vpn: 3, pfn: 0, valid: false },
  { vpn: 4, pfn: 0x1, valid: true },
  { vpn: 5, pfn: 0x9, valid: true },
  { vpn: 6, pfn: 0xA, valid: true },
  { vpn: 7, pfn: 0x3, valid: true },
  { vpn: 8, pfn: 0xC, valid: true },
  { vpn: 9, pfn: 0, valid: false },
  { vpn: 10, pfn: 0x5, valid: true },
  { vpn: 11, pfn: 0xE, valid: true }
];

export function initTlb() {
  return [
    { vpn: 2, pfn: 0x4, valid: true, last: 0 },
    { vpn: 5, pfn: 0x9, valid: true, last: 1 },
    { vpn: 0, pfn: 0, valid: false, last: 2 },
    { vpn: 0, pfn: 0, valid: false, last: 3 }
  ];
}

export function parseAddr(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return null;
  const n = s.toLowerCase().indexOf('0x') === 0 ? parseInt(s.slice(2), 16) : (/^[0-9]+$/.test(s) ? parseInt(s, 10) : parseInt(s, 16));
  return isFinite(n) && n >= 0 ? n : null;
}

export function simulateVmem(addr, pageSize) {
  const steps = [];
  const tlb = initTlb();
  const offBits = Math.round(Math.log2(pageSize));
  const vpn = Math.floor(addr / pageSize);
  const offset = addr % pageSize;
  const push = (msg, extra) => steps.push(Object.assign({ addr, pageSize, offBits, vpn, offset, tlb: tlb.map(t => Object.assign({}, t)), msg }, extra || {}));

  push(`先把虚拟地址 ${hex(addr)} 按页大小 ${pageSize} B 拆分：低 ${offBits} 位是页内偏移，高 ${32 - offBits} 位是虚拟页号。`,
    { phase: 'split', hi: vpn, lo: offset });

  let hit = -1;
  for (let i = 0; i < tlb.length; i++) {
    if (tlb[i].valid && tlb[i].vpn === vpn) { hit = i; break; }
  }
  if (hit >= 0) {
    const e = tlb[hit];
    const pa = e.pfn * pageSize + offset;
    push(`TLB 命中：第 ${hit + 1} 项就存着 VPN = ${vpn} → PFN = ${hex(e.pfn)}，直接拼出物理地址。`,
      { phase: 'tlb-hit', tlbHit: hit, pfn: e.pfn, pa, done: false });
    push(`物理地址 = PFN ${hex(e.pfn)} × ${pageSize} + 页内偏移 ${hex(offset)} = ${hex(pa)}。`,
      { phase: 'pa', tlbHit: hit, pfn: e.pfn, pa });
    return { steps, pa, hit: true, vpn, offset, pfn: e.pfn };
  }

  push(`TLB 未命中：4 项里没有 VPN = ${vpn}，只能去查页表。`, { phase: 'tlb-miss', tlbMiss: true });
  const pte = PAGE_TABLE.find(e => e.vpn === vpn);
  if (!pte || !pte.valid) {
    push(`页表中 VPN = ${vpn} 的表项无效（缺页或越界），这里只演示地址翻译，需要操作系统先调入页。`,
      { phase: 'page-fault', pte: pte || null, fault: true });
    return { steps, pa: null, hit: false, vpn, offset, pfn: null, fault: true };
  }
  push(`页表第 ${vpn} 项有效：PFN = ${hex(pte.pfn)}，有效位 = 1。`, { phase: 'pte', pte, pfn: pte.pfn });

  const pa = pte.pfn * pageSize + offset;
  push(`拼装物理地址：PFN ${hex(pte.pfn)} × ${pageSize} + ${hex(offset)} = ${hex(pa)}。`,
    { phase: 'pa', pte, pfn: pte.pfn, pa });

  /* 填入 TLB：优先空位，否则替换 last 最小（LRU）的项 */
  let slot = tlb.findIndex(t => !t.valid);
  if (slot < 0) {
    slot = 0;
    for (let i = 1; i < tlb.length; i++) if (tlb[i].last < tlb[slot].last) slot = i;
  }
  const tick = Math.max(...tlb.map(t => t.last)) + 1;
  const evict = tlb[slot].valid ? Object.assign({}, tlb[slot]) : null;
  tlb[slot] = { vpn, pfn: pte.pfn, valid: true, last: tick };
  push(`把 VPN = ${vpn} → PFN = ${hex(pte.pfn)} 写进 TLB 第 ${slot + 1} 项${evict ? `（替换掉 VPN = ${evict.vpn}）` : '（用了空位）'}，下次再访问就命中。`,
    { phase: 'tlb-fill', tlbFill: slot, evicted: evict, pte, pfn: pte.pfn, pa });

  return { steps, pa, hit: false, vpn, offset, pfn: pte.pfn };
}

export function hex(n) {
  return '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
}
