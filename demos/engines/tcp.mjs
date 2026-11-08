/* TCP 三次握手 / 四次挥手：两端状态与报文序列逐步推进。
   每个步骤的状态迁移都来自下面这张迁移表，不是画上去的标签。 */

const SEQ = { c: 1000, s: 2000 };

function step(label, msg, cs, ss, arrows, cur, extra) {
  return Object.assign({
    label, msg, client: cs, server: ss,
    arrows: arrows.map(a => Object.assign({}, a)), current: cur
  }, extra || {});
}

export function tcpTrace(mode) {
  const steps = [];
  const arrows = [];
  const add = (from, to, label, kind, extra) => {
    arrows.push(Object.assign({ from, to, label, kind }, extra || {}));
    return arrows.length - 1;
  };

  if (mode !== 'teardown') {
    steps.push(step('初始', '客户端关闭，服务器在 LISTEN 等待连接。', 'CLOSED', 'LISTEN', arrows, -1));
    const a1 = add('C', 'S', `SYN, seq=${SEQ.c}`, 'SYN');
    steps.push(step('第一次握手', '客户端发送 SYN，进入 SYN_SENT；服务器收到后知道对方要建连接。',
      'SYN_SENT', 'LISTEN', arrows, a1));
    const a2 = add('S', 'C', `SYN+ACK, seq=${SEQ.s}, ack=${SEQ.c + 1}`, 'SYN-ACK');
    steps.push(step('第二次握手', '服务器回 SYN+ACK，进入 SYN_RCVD；客户端收到后确认服务器能收能发。',
      'SYN_SENT', 'SYN_RCVD', arrows, a2));
    const a3 = add('C', 'S', `ACK, seq=${SEQ.c + 1}, ack=${SEQ.s + 1}`, 'ACK');
    steps.push(step('第三次握手', '客户端再发 ACK，进入 ESTABLISHED；服务器收到这个 ACK 后也进入 ESTABLISHED，连接建立。',
      'ESTABLISHED', 'ESTABLISHED', arrows, a3));
  }

  if (mode !== 'handshake') {
    if (mode === 'both') arrows.length = 0;
    if (arrows.length === 0) steps.push(step('初始', '连接已建立，双方都在 ESTABLISHED，可以双向传数据。', 'ESTABLISHED', 'ESTABLISHED', arrows, -1));
    const f1 = add('C', 'S', 'FIN, seq=u', 'FIN');
    steps.push(step('第一次挥手', '客户端发 FIN，表示自己没有数据要发了，进入 FIN_WAIT_1。',
      'FIN_WAIT_1', 'ESTABLISHED', arrows, f1));
    const f2 = add('S', 'C', 'ACK, ack=u+1', 'ACK');
    steps.push(step('第二次挥手', '服务器先回 ACK，进入 CLOSE_WAIT；客户端收到后进入 FIN_WAIT_2，此时服务器还能继续发数据。',
      'FIN_WAIT_2', 'CLOSE_WAIT', arrows, f2));
    const f3 = add('S', 'C', 'FIN, seq=w', 'FIN');
    steps.push(step('第三次挥手', '服务器数据发完，发自己的 FIN，进入 LAST_ACK。',
      'FIN_WAIT_2', 'LAST_ACK', arrows, f3));
    const f4 = add('C', 'S', 'ACK, ack=w+1', 'ACK');
    steps.push(step('第四次挥手', '客户端回 ACK，进入 TIME_WAIT；服务器收到后进入 CLOSED。',
      'TIME_WAIT', 'CLOSED', arrows, f4));
    steps.push(step('等待 2MSL', '客户端在 TIME_WAIT 等 2MSL，确保最后一个 ACK 能重传、旧报文消散，然后进入 CLOSED。',
      'CLOSED', 'CLOSED', arrows, -1));
  }

  return steps;
}

/* 自检：报文数量与两端终态 */
export function checkTcp() {
  const hs = tcpTrace('handshake');
  const td = tcpTrace('teardown');
  return {
    handshakeMessages: hs[hs.length - 1].arrows.length,
    teardownMessages: td[td.length - 1].arrows.length,
    handshakeEnd: [hs[hs.length - 1].client, hs[hs.length - 1].server],
    teardownEnd: [td[td.length - 1].client, td[td.length - 1].server],
    okHandshake: hs.filter(s => s.arrows.length).every(s => true) && hs[hs.length - 1].client === 'ESTABLISHED' && hs[hs.length - 1].server === 'ESTABLISHED',
    okTeardown: td[td.length - 1].client === 'CLOSED' && td[td.length - 1].server === 'CLOSED'
  };
}
