import { shell, Player, field, esc, paramStr } from './ui.mjs';
import { simulateCache, configOf } from './engines/cache.mjs';

const META = {
  course: '计算机组成原理',
  title: 'Cache 三种映射',
  desc: '同一串地址分别用直接映射、全相联、组相联跑；地址拆成 tag / index / offset 并分段高亮。'
};

const TEMPLATE_SEQ = [0x0000, 0x0010, 0x0020, 0x0000, 0x0120, 0x0000, 0x0010, 0x0020];

export function mount(host, ctx) {
  const o = shell(host, META, ctx.params);
  let mapping = paramStr(ctx.params, 'map', 'direct');
  if (!['direct', 'full', 'set'].includes(mapping)) mapping = 'direct';
  let addrBits = +paramStr(ctx.params, 'bits', '16');
  if (![16, 32].includes(addrBits)) addrBits = 16;
  let cacheSize = +paramStr(ctx.params, 'size', '256');
  if (![128, 256, 512].includes(cacheSize)) cacheSize = 256;
  let blockSize = +paramStr(ctx.params, 'block', '16');
  if (![16, 32, 64].includes(blockSize)) blockSize = 16;
  let ways = +paramStr(ctx.params, 'ways', '2');
  if (![2, 4].includes(ways)) ways = 2;
  let seq = parseSeq(paramStr(ctx.params, 'seq', '')) || TEMPLATE_SEQ.slice();
  const player = new Player(o.bar, o.explain, { onShow: draw });
  o.getParams = () => `map=${mapping}&bits=${addrBits}&size=${cacheSize}&block=${blockSize}&ways=${ways}&seq=${seq.map(a => a.toString(16)).join(',')}`;

  host.querySelector('.demo-params-body').innerHTML = `
    <div class="demo-param-grid">
      ${field('映射方式', `<select data-p="map">
        <option value="direct"${mapping === 'direct' ? ' selected' : ''}>直接映射</option>
        <option value="full"${mapping === 'full' ? ' selected' : ''}>全相联</option>
        <option value="set"${mapping === 'set' ? ' selected' : ''}>组相联</option>
      </select>`)}
      ${field('地址位宽', `<select data-p="bits"><option value="16"${addrBits === 16 ? ' selected' : ''}>16 位</option><option value="32"${addrBits === 32 ? ' selected' : ''}>32 位</option></select>`)}
      ${field('Cache 容量', `<select data-p="size">${[128, 256, 512].map(s => `<option value="${s}"${s === cacheSize ? ' selected' : ''}>${s} B</option>`).join('')}</select>`)}
      ${field('块大小', `<select data-p="block">${[16, 32, 64].map(s => `<option value="${s}"${s === blockSize ? ' selected' : ''}>${s} B</option>`).join('')}</select>`)}
      ${field('组相联路数', `<select data-p="ways"><option value="2"${ways === 2 ? ' selected' : ''}>2 路</option><option value="4"${ways === 4 ? ' selected' : ''}>4 路</option></select>`)}
    </div>
    ${field('访问序列（十六进制，逗号分隔）', `<input data-p="seq" type="text" value="${esc(seq.map(a => a.toString(16)).join(', '))}" spellcheck="false">`)}`;

  const body = host.querySelector('.demo-params-body');
  body.addEventListener('change', e => {
    const el = e.target.closest('[data-p]');
    if (!el) return;
    if (el.dataset.p === 'map') mapping = el.value;
    else if (el.dataset.p === 'bits') addrBits = +el.value;
    else if (el.dataset.p === 'size') cacheSize = +el.value;
    else if (el.dataset.p === 'block') blockSize = +el.value;
    else if (el.dataset.p === 'ways') ways = +el.value;
    else if (el.dataset.p === 'seq') {
      const next = parseSeq(el.value);
      if (next) seq = next;
      el.value = seq.map(a => a.toString(16)).join(', ');
    }
    rebuild();
  });

  function rebuild() {
    const res = simulateCache(mapping, addrBits, cacheSize, blockSize, ways, seq);
    player.load(res.steps);
  }

  function draw(step) {
    const cfg = step.cfg;
    const dec = step.dec || null;
    const state = step.state || [];
    const bitLen = addrBits;
    const addrForBits = step.addr != null ? step.addr : (seq[0] || 0);
    const bits = addrForBits.toString(2).padStart(bitLen, '0').slice(-bitLen);
    let cursor = 0;
    const tagLen = cfg.tagBits, idxLen = cfg.idxBits, offLen = cfg.offBits;
    const cells = [];
    for (let i = 0; i < tagLen; i++) cells.push(`<span class="cb-tag">${bits[cursor++] || '0'}</span>`);
    for (let i = 0; i < idxLen; i++) cells.push(`<span class="cb-idx">${bits[cursor++] || '0'}</span>`);
    for (let i = 0; i < offLen; i++) cells.push(`<span class="cb-off">${bits[cursor++] || '0'}</span>`);
    const curSet = dec ? dec.idx : -1;
    const curWay = step.way != null ? step.way : -1;
    const setsHtml = state.map((set, si) => `
      <div class="cache-set ${si === curSet ? 'hot' : ''}">
        <div class="cache-set-head">组 ${si}${cfg.sets === 1 ? '（唯一组）' : ''}</div>
        ${set.map((line, wi) => `
          <div class="cache-line ${line.valid ? 'valid' : ''} ${si === curSet && wi === curWay ? 'pick' : ''}">
            <span class="cl-way">路${wi + 1}</span>
            <span>tag ${line.valid ? line.tag : '—'}</span>
            <span>V ${line.valid ? 1 : 0}</span>
            <span class="cl-lru">${line.valid ? 'LRU ' + line.lru : ''}</span>
          </div>`).join('')}
      </div>`).join('');

    o.stage.innerHTML = `
      <div class="cache-head">
        <span class="demo-badge">${cfg.mapping === 'direct' ? '直接映射' : cfg.mapping === 'full' ? '全相联' : cfg.ways + ' 路组相联'}</span>
        <span class="demo-badge alt">${cfg.lines} 行 · ${cfg.sets} 组 × ${cfg.ways} 路</span>
        <span class="demo-badge alt">tag ${tagLen} + index ${idxLen} + offset ${offLen}</span>
      </div>
      <div class="cache-addr">${dec ? `地址 ${addrForBits.toString(16).toUpperCase()} · tag ${dec.tag} · 组 ${dec.idx} · 偏移 ${dec.off}` : '等待访问'}</div>
      <div class="cache-bits">${cells.join('')}</div>
      <div class="cache-sets">${setsHtml}</div>
      <div class="demo-stats">
        <span>命中 <b>${step.hits}</b></span>
        <span>缺失 <b>${step.misses}</b></span>
        <span>命中率 <b>${step.hits + step.misses ? (step.hits / (step.hits + step.misses) * 100).toFixed(1) + '%' : '—'}</b></span>
      </div>`;
  }

  rebuild();
  return { dispose() { player.stop(); } };
}

function parseSeq(text) {
  if (!text) return null;
  const list = String(text).split(/[,，\s]+/).map(x => {
    const s = x.toLowerCase();
    const n = s.indexOf('0x') === 0 ? parseInt(s.slice(2), 16) : parseInt(s, 16);
    return n;
  }).filter(n => isFinite(n) && n >= 0);
  return list.length >= 2 && list.length <= 16 ? list : null;
}
