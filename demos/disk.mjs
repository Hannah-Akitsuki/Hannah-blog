import { shell, Player, field, esc, paramNum, paramStr, svgEl } from './ui.mjs';
import { DISK_ALGOS, simulateDisk } from './engines/disk.mjs';

const META = {
  course: '操作系统',
  title: '磁盘调度六算法',
  desc: '同一串磁道请求，六种算法各跑一遍：磁头轨迹、访问顺序、总移动磁道数与平均寻道长度并排对比。'
};

const DEFAULT_REQ = [98, 183, 37, 122, 14, 124, 65, 67];

export function mount(host, ctx) {
  const o = shell(host, META, ctx.params);
  let start = paramNum(ctx.params, 'start', 53, 0, 1023);
  let dir = paramStr(ctx.params, 'dir', 'up') === 'down' ? 'down' : 'up';
  let requests = parseReq(paramStr(ctx.params, 'req', '')) || DEFAULT_REQ;
  let minTrack = paramNum(ctx.params, 'min', 0, 0, 1023);
  let maxTrack = paramNum(ctx.params, 'max', 199, 1, 1023);
  if (maxTrack <= minTrack) maxTrack = minTrack + 1;
  let focus = paramStr(ctx.params, 'algo', '');
  if (focus && !DISK_ALGOS.some(a => a.id === focus)) focus = '';
  const player = new Player(o.bar, o.explain, { onShow: draw });
  o.getParams = () => `algo=${focus || 'all'}&start=${start}&dir=${dir}&req=${requests.join(',')}&min=${minTrack}&max=${maxTrack}`;

  host.querySelector('.demo-params-body').innerHTML = `
    <div class="demo-param-grid">
      ${field('初始磁头位置', `<input data-p="start" type="number" min="${minTrack}" max="${maxTrack}" value="${start}">`)}
      ${field('初始方向', `<select data-p="dir"><option value="up"${dir === 'up' ? ' selected' : ''}>向大磁道方向 →</option><option value="down"${dir === 'down' ? ' selected' : ''}>向小磁道方向 ←</option></select>`)}
      ${field('磁道范围', `<span class="demo-range"><input data-p="min" type="number" min="0" max="1023" value="${minTrack}"> – <input data-p="max" type="number" min="1" max="1023" value="${maxTrack}"></span>`)}
      ${field('高亮算法（只影响显示）', `<select data-p="focus"><option value="">六个并排</option>${DISK_ALGOS.map(a => `<option value="${a.id}"${a.id === focus ? ' selected' : ''}>${a.name}</option>`).join('')}</select>`)}
    </div>
    ${field('磁道请求（逗号分隔）', `<input data-p="req" type="text" value="${esc(requests.join(', '))}" spellcheck="false">`)}`;

  const body = host.querySelector('.demo-params-body');
  body.addEventListener('change', e => {
    const el = e.target.closest('[data-p]');
    if (!el) return;
    if (el.dataset.p === 'start') start = Math.max(minTrack, Math.min(maxTrack, +el.value || 0));
    else if (el.dataset.p === 'dir') dir = el.value;
    else if (el.dataset.p === 'min') minTrack = Math.max(0, Math.min(maxTrack - 1, +el.value || 0));
    else if (el.dataset.p === 'max') maxTrack = Math.min(1023, Math.max(minTrack + 1, +el.value || 0));
    else if (el.dataset.p === 'focus') focus = el.value;
    else if (el.dataset.p === 'req') {
      const next = parseReq(el.value);
      if (next) requests = next;
      el.value = requests.join(', ');
    }
    rebuild();
  });

  let results = [];
  let steps = [];

  function rebuild() {
    requests = requests.filter(t => t >= minTrack && t <= maxTrack);
    if (!requests.length) requests = [Math.round((minTrack + maxTrack) / 2)];
    results = DISK_ALGOS.map(a => simulateDisk(a.id, { start, dir, requests, minTrack, maxTrack }));
    steps = [{ partial: 0, msg: `磁头从 ${start} 出发，${dir === 'up' ? '向磁道号增大' : '向磁道号减小'}方向移动；六个算法开始跑同一串请求。` }];
    for (let k = 1; k <= requests.length; k++) {
      steps.push({
        partial: k,
        msg: `已经服务 ${k} 个请求：FCFS 走到 ${lastTrack(results[0], k)}，SSTF 走到 ${lastTrack(results[1], k)}，SCAN 走到 ${lastTrack(results[2], k)}，LOOK 走到 ${lastTrack(results[3], k)}，C-SCAN 走到 ${lastTrack(results[4], k)}，C-LOOK 走到 ${lastTrack(results[5], k)}。`
      });
    }
    steps.push({ partial: requests.length, done: true, msg: '全部请求完成；对比每一格的总移动磁道数（含回程跳转）与平均寻道长度。' });
    player.load(steps);
  }

  function draw(step) {
    const focusCell = focus;
    o.stage.innerHTML = `<div class="disk-grid">${results.map(res => {
      const segs = partialPath(res, step.partial);
      return `<section class="disk-cell ${focusCell === res.algo ? 'focus' : ''}" data-algo="${res.algo}">
        <div class="disk-cell-head"><b>${nameOf(res.algo)}</b><span>${fullOf(res.algo)}</span></div>
        <svg class="disk-canvas" role="img" aria-label="${nameOf(res.algo)} 磁头轨迹"></svg>
        <div class="disk-stats">
          <span>总移动 <b>${res.total}</b> 磁道</span>
          <span>平均 <b>${(res.avg).toFixed(2)}</b> 磁道/次</span>
        </div>
        <div class="disk-order"><b>访问顺序</b><span>${res.order.join(' → ')}</span></div>
      </section>`;
    }).join('')}</div>
        <div class="demo-stats">
          <span>请求数 <b>${requests.length}</b></span>
          <span>范围 <b>${minTrack} – ${maxTrack}</b></span>
          <span>已服务 <b>${step.partial}</b> / ${requests.length}</span>
        </div>`;
    o.stage.querySelectorAll('.disk-cell').forEach((cell, ci) => {
      drawTrajectory(cell.querySelector('.disk-canvas'), results[ci], partialPath(results[ci], step.partial), minTrack, maxTrack);
    });
  }

  rebuild();
  return { dispose() { player.stop(); } };
}

function partialPath(res, k) {
  if (!k) return [];
  const out = [];
  let served = 0;
  for (const seg of res.path) {
    out.push(seg);
    if (seg.kind === 'serve') {
      served++;
      if (served >= k) break;
    }
  }
  return out;
}
function lastTrack(res, k) {
  const segs = partialPath(res, k);
  return segs.length ? segs[segs.length - 1].to : res.start;
}
function drawTrajectory(svg, res, segs, minT, maxT) {
  const W = 300, H = 268, padL = 22, padR = 14, top = 14, bottom = 28;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const xOf = t => padL + (t - minT) / Math.max(1, maxT - minT) * (W - padL - padR);
  const rowH = segs.length ? Math.min(24, (H - top - bottom) / segs.length) : 0;
  const yOf = i => top + i * rowH;
  svgEl('line', { x1: padL, y1: H - bottom, x2: W - padR, y2: H - bottom, class: 'disk-axis' }, svg);
  svgEl('text', { x: padL, y: H - 10, class: 'disk-axis-label' }, svg).textContent = String(minT);
  svgEl('text', { x: W - padR, y: H - 10, class: 'disk-axis-label', 'text-anchor': 'end' }, svg).textContent = String(maxT);
  svgEl('circle', { cx: xOf(res.start), cy: yOf(0) + 4, r: 4, class: 'disk-start' }, svg);
  let y = yOf(0) + 4;
  let served = 0;
  segs.forEach((seg, i) => {
    const x1 = xOf(seg.from), x2 = xOf(seg.to);
    const y1 = y, y2 = yOf(i + 1) - 4;
    const cls = seg.kind === 'serve' ? 'disk-seg serve' : seg.kind === 'jump' ? 'disk-seg jump' : 'disk-seg travel';
    svgEl('line', { x1, y1, x2, y2, class: cls }, svg);
    if (seg.kind === 'serve') {
      served++;
      svgEl('circle', { cx: x2, cy: y2, r: 3.5, class: 'disk-stop' }, svg);
      if (segs.length <= 14) {
        svgEl('text', { x: x2, y: y2 - 5, class: 'disk-order-label', 'text-anchor': 'middle' }, svg).textContent = served;
      }
    }
  });
}

function nameOf(id) { return (DISK_ALGOS.find(a => a.id === id) || {}).name || id; }
function fullOf(id) { return (DISK_ALGOS.find(a => a.id === id) || {}).full || ''; }
function parseReq(text) {
  if (!text) return null;
  const list = String(text).split(/[,，\s]+/).map(Number).filter(n => isFinite(n) && n >= 0 && n <= 1023);
  return list.length >= 1 && list.length <= 20 ? list : null;
}
