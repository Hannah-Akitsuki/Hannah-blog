import { shell, Player, field, esc, paramStr, paramNum } from './ui.mjs';
import { PAGE_SIZES, PAGE_TABLE, parseAddr, simulateVmem, hex } from './engines/vmem.mjs';

const META = {
  course: '计算机组成原理',
  title: '虚拟地址 → 物理地址',
  desc: '按位拆分虚拟地址，先查 TLB，未命中再走页表，最后拼出物理地址；TLB 按 LRU 回填。'
};

const EXAMPLES = [
  { label: 'TLB 命中（VPN 5）', addr: '0x000052A8' },
  { label: 'TLB 未命中（VPN 6）', addr: '0x000062A8' },
  { label: '页表项无效（VPN 3）', addr: '0x000032A8' },
  { label: '高位地址（VPN 10）', addr: '0x0000A2A8' }
];

export function mount(host, ctx) {
  const o = shell(host, META, ctx.params);
  let addrText = paramStr(ctx.params, 'addr', EXAMPLES[1].addr);
  let pageSize = paramNum(ctx.params, 'page', 4096, 1024, 16384);
  if (!PAGE_SIZES.includes(pageSize)) pageSize = 4096;
  const player = new Player(o.bar, o.explain, { onShow: draw });
  o.getParams = () => `addr=${encodeURIComponent(addrText)}&page=${pageSize}`;

  host.querySelector('.demo-params-body').innerHTML = `
    <div class="demo-param-grid">
      ${field('示例', `<select data-p="example">${EXAMPLES.map((x, i) => `<option value="${i}"${x.addr === addrText ? ' selected' : ''}>${x.label}</option>`).join('')}</select>`)}
      ${field('虚拟地址（十六进制）', `<input data-p="addr" type="text" value="${esc(addrText)}" spellcheck="false">`)}
      ${field('页大小', `<select data-p="page">${PAGE_SIZES.map(p => `<option value="${p}"${p === pageSize ? ' selected' : ''}>${p} B（${Math.round(Math.log2(p))} 位偏移）</option>`).join('')}</select>`)}
    </div>`;

  const body = host.querySelector('.demo-params-body');
  body.addEventListener('change', e => {
    const el = e.target.closest('[data-p]');
    if (!el) return;
    if (el.dataset.p === 'example') addrText = EXAMPLES[+el.value].addr;
    else if (el.dataset.p === 'addr') addrText = el.value.trim();
    else if (el.dataset.p === 'page') pageSize = +el.value;
    body.querySelector('[data-p="addr"]').value = addrText;
    rebuild();
  });

  function rebuild() {
    const addr = parseAddr(addrText);
    if (addr == null) {
      o.stage.innerHTML = '<div class="empty">地址格式不对：可以写 0x000052A8 或十进制整数。</div>';
      o.explain.textContent = '请输入合法地址。';
      return;
    }
    const res = simulateVmem(addr, pageSize);
    player.load(res.steps);
  }

  function draw(step) {
    const bits = step.addr.toString(2).padStart(32, '0');
    const offBits = step.offBits;
    const vpnBits = 32 - offBits;
    const tlbHit = step.tlbHit, tlbFill = step.tlbFill;
    const paInfo = step.pa != null;
    const bitCells = bits.split('').map((b, i) =>
      `<span class="${i < vpnBits ? 'vb-vpn' : 'vb-off'}">${b}</span>`).join('');
    const tlbRows = step.tlb.map((t, i) => `
      <tr class="${tlbHit === i || tlbFill === i ? 'hot' : ''}">
        <td>${i + 1}</td>
        <td>${t.valid ? t.vpn : '—'}</td>
        <td>${t.valid ? hex(t.pfn) : '—'}</td>
        <td>${t.valid ? '1' : '0'}</td>
      </tr>`).join('');
    const pte = step.pte;
    const pteRows = PAGE_TABLE.map(e => `
      <tr class="${pte && pte.vpn === e.vpn ? 'hot' : ''}">
        <td>${e.vpn}</td><td>${e.valid ? '1' : '0'}</td><td>${e.valid ? hex(e.pfn) : '—'}</td>
      </tr>`).join('');
    const phaseText = {
      split: '第 1 步 · 地址拆分', 'tlb-hit': '第 2 步 · TLB 命中', 'tlb-miss': '第 2 步 · TLB 未命中（查页表）',
      pte: '第 3 步 · 页表项', pa: '第 4 步 · 拼装物理地址', 'tlb-fill': '第 5 步 · 回填 TLB', 'page-fault': '页表项无效'
    }[step.phase] || '';

    o.stage.innerHTML = `
      <div class="vm-phase">${phaseText}</div>
      <div class="vm-bits-label"><span>VPN = ${hex(step.vpn).slice(-6)}（${vpnBits} 位）</span><span>页内偏移 = ${hex(step.offset).slice(-4)}（${offBits} 位）</span></div>
      <div class="vm-bits">${bitCells}</div>
      <div class="vm-grid">
        <section class="vm-panel"><h3>TLB（4 项）</h3>
          <table class="vm-table"><thead><tr><th>#</th><th>VPN</th><th>PFN</th><th>V</th></tr></thead><tbody>${tlbRows}</tbody></table>
        </section>
        <section class="vm-panel"><h3>页表（页表基址 + VPN）</h3>
          <table class="vm-table"><thead><tr><th>VPN</th><th>V</th><th>PFN</th></tr></thead><tbody>${pteRows}</tbody></table>
        </section>
        <section class="vm-panel vm-result">
          <h3>物理地址</h3>
          <div class="vm-pa">${paInfo ? hex(step.pa) : (step.fault ? '缺页' : '—')}</div>
          ${paInfo ? `<p>PFN ${hex(step.pfn)} × ${step.pageSize} + 偏移 ${hex(step.offset)}</p>` : ''}
          ${step.fault ? '<p class="vm-fault">该页不在内存，需操作系统处理缺页。</p>' : ''}
        </section>
      </div>`;
  }

  rebuild();
  return { dispose() { player.stop(); } };
}
