import { shell, Player, field, esc, paramStr, svgEl } from './ui.mjs';
import { tcpTrace } from './engines/tcp.mjs';

const META = {
  course: '计算机网络',
  title: 'TCP 三次握手与四次挥手',
  desc: '两端状态机随报文推进；每个 SYN / ACK / FIN 都对应真实的迁移，而不是画好的箭头。'
};

const MODES = [
  { id: 'both', name: '握手 + 挥手' },
  { id: 'handshake', name: '只看三次握手' },
  { id: 'teardown', name: '只看四次挥手' }
];

export function mount(host, ctx) {
  const o = shell(host, META, ctx.params);
  let mode = paramStr(ctx.params, 'mode', 'both');
  if (!MODES.some(m => m.id === mode)) mode = 'both';
  const player = new Player(o.bar, o.explain, { onShow: draw });
  o.getParams = () => `mode=${mode}`;

  host.querySelector('.demo-params-body').innerHTML = `
    <div class="demo-param-grid">
      ${field('演示范围', `<select data-p="mode">${MODES.map(m => `<option value="${m.id}"${m.id === mode ? ' selected' : ''}>${m.name}</option>`).join('')}</select>`)}
    </div>
    <p class="tiny">握手阶段服务器从 LISTEN 开始；挥手阶段双方从 ESTABLISHED 开始，客户端在 TIME_WAIT 等 2MSL。</p>`;

  host.querySelector('.demo-params-body').addEventListener('change', e => {
    const el = e.target.closest('[data-p]');
    if (!el) return;
    mode = el.value;
    rebuild();
  });

  function rebuild() {
    player.load(tcpTrace(mode));
  }

  function draw(step) {
    o.stage.innerHTML = `
      <svg class="tcp-canvas" role="img" aria-label="TCP 报文与状态"></svg>
      <div class="tcp-legend">
        <span class="lg syn">SYN</span><span class="lg ack">ACK</span><span class="lg fin">FIN</span>
        <span>报文按时间从上往下排列，箭头指向接收方。</span>
      </div>
      <div class="demo-stats">
        <span>客户端 <b>${esc(step.client)}</b></span>
        <span>服务器 <b>${esc(step.server)}</b></span>
        <span>报文 <b>${step.arrows.length}</b> 条</span>
      </div>`;
    const svg = o.stage.querySelector('.tcp-canvas');
    const W = 460, H = 400, cx = 100, sx = 360, top = 42, bottom = 372;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svgEl('line', { x1: cx, y1: top, x2: cx, y2: bottom, class: 'tcp-life' }, svg);
    svgEl('line', { x1: sx, y1: top, x2: sx, y2: bottom, class: 'tcp-life' }, svg);
    svgEl('rect', { x: cx - 62, y: 6, width: 124, height: 26, rx: 8, class: 'tcp-state' }, svg);
    svgEl('text', { x: cx, y: 24, class: 'tcp-state-text' }, svg).textContent = '客户端 · ' + step.client;
    svgEl('rect', { x: sx - 62, y: 6, width: 124, height: 26, rx: 8, class: 'tcp-state' }, svg);
    svgEl('text', { x: sx, y: 24, class: 'tcp-state-text' }, svg).textContent = '服务器 · ' + step.server;

    svgEl('defs', {}, svg).innerHTML = '<marker id="tcpArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>';
    let y = top + 34;
    step.arrows.forEach((a, i) => {
      const fromX = a.from === 'C' ? cx : sx;
      const toX = a.from === 'C' ? sx : cx;
      const cls = 'tcp-arrow ' + (a.kind === 'SYN' ? 'syn' : a.kind === 'SYN-ACK' ? 'synack' : a.kind === 'FIN' ? 'fin' : 'ack') + (i === step.current ? ' hot' : '');
      const line = svgEl('line', { x1: fromX, y1: y, x2: toX, y2: y, class: cls, 'marker-end': 'url(#tcpArrow)' }, svg);
      line.style.color = 'var(--green)';
      svgEl('text', { x: (cx + sx) / 2, y: y - 7, class: 'tcp-label', 'text-anchor': 'middle' }, svg).textContent = a.label;
      svgEl('circle', { cx: fromX, cy: y, r: 3, class: 'tcp-end' }, svg);
      y += 34;
    });
    svgEl('text', { x: cx, y: bottom + 18, class: 'tcp-foot', 'text-anchor': 'middle' }, svg).textContent = '客户端';
    svgEl('text', { x: sx, y: bottom + 18, class: 'tcp-foot', 'text-anchor': 'middle' }, svg).textContent = '服务器';
  }

  rebuild();
  return { dispose() { player.stop(); } };
}
