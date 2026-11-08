# -*- coding: utf-8 -*-
"""术语配图生成器。

所有图都是内嵌 SVG：颜色一律走 CSS 变量（--ink / --muted / --green / --accent / --line），
因此亮色与暗色主题都能自动适配；不依赖外部图片文件，也没有额外网络请求。

坐标与波形由脚本按定义计算，避免手画导致的位边界、跳变方向错位。
"""

import math

# --------------------------------------------------------------------------
# 基础工具
# --------------------------------------------------------------------------


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def svg(w, h, inner, label=""):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
        'role="img" aria-label="%s" preserveAspectRatio="xMidYMid meet">%s</svg>'
        % (w, h, esc(label), "".join(inner))
    )


def polyline(points, cls="dg-signal"):
    d = "M " + " L ".join("%.1f,%.1f" % (x, y) for x, y in points)
    return '<path class="%s" d="%s"/>' % (cls, d)


def text(x, y, s, cls="dg-text", anchor="start"):
    return ('<text class="%s" x="%.1f" y="%.1f" text-anchor="%s">%s</text>'
            % (cls, x, y, anchor, esc(s)))


def line(x1, y1, x2, y2, cls="dg-axis"):
    return '<line class="%s" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>' % (cls, x1, y1, x2, y2)


def rect(x, y, w, h, label="", cls="dg-fill", rx=3):
    inner = '<rect class="%s" x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%d"/>' % (
        cls, x, y, w, h, rx)
    if label:
        inner += text(x + w / 2, y + h / 2 + 4, label, "dg-text", "middle")
    return '<g>%s</g>' % inner


# --------------------------------------------------------------------------
# 数字编码波形
# --------------------------------------------------------------------------

HIGH, LOW = 1, 0


def levels_for(enc, bits, init=LOW):
    """返回每个半比特的电平列表；输出长度 = 2 × 位数。"""
    out = []
    state = init
    for b in bits:
        if enc == "nrz":
            out += [b, b]
        elif enc == "nrz-i":
            if b == 1:
                state = 1 - state
            out += [state, state]
        elif enc == "manchester-thomas":       # 高→低 = 1，低→高 = 0
            out += [HIGH, LOW] if b == 1 else [LOW, HIGH]
        elif enc == "manchester-ieee":         # 高→低 = 0，低→高 = 1
            out += [LOW, HIGH] if b == 1 else [HIGH, LOW]
        elif enc == "diff-manchester":         # 位中必跳；位开始有跳变 = 0
            if b == 0:
                state = 1 - state
            out += [state, 1 - state]
            state = 1 - state
        else:
            raise ValueError(enc)
    return out


def clock_levels(bits):
    out = []
    for _ in bits:
        out += [HIGH, LOW]
    return out


def waveform_svg(rows, bits, bit_w=70, label_w=118, amp=24, row_h=52,
                 aria="数字编码波形", head="位值"):
    """rows: [(名称, 半比特电平列表)]；位边界、电平高低、位值全部标注。"""
    n = len(bits)
    W = label_w + n * bit_w + 24
    top = 30
    body_top = top + 30
    H = body_top + len(rows) * row_h + 22
    out = []
    out.append(text(label_w - 10, top, head, "dg-muted", "end"))
    for i, b in enumerate(bits):
        out.append(text(label_w + i * bit_w + bit_w / 2, top, str(b), "dg-text", "middle"))
    for i in range(n + 1):
        x = label_w + i * bit_w
        out.append(line(x, top + 8, x, H - 14, "dg-grid"))
    for ri, (name, levels) in enumerate(rows):
        base = body_top + ri * row_h + amp + 14
        high = base - amp
        out.append(text(label_w - 10, base - amp / 2 + 4, name, "dg-text", "end"))
        out.append(line(label_w, high, W - 18, high, "dg-grid"))
        out.append(line(label_w, base, W - 18, base, "dg-grid"))
        out.append(text(label_w - 6, high + 4, "高", "dg-muted", "end"))
        out.append(text(label_w - 6, base + 4, "低", "dg-muted", "end"))
        pts = []
        for k, lv in enumerate(levels):
            x0 = label_w + k * bit_w / 2
            x1 = x0 + bit_w / 2
            y = high if lv else base
            pts.append((x0, y))
            pts.append((x1, y))
        out.append(polyline(pts))
    out.append(text(label_w + n * bit_w / 2, H - 2, "位边界（虚线）· 每一位等宽", "dg-muted", "middle"))
    return svg(W, H, out, aria)


def encoding_figure(kind):
    bits = [1, 0, 1, 1, 0, 1]
    if kind == "nrz":
        return waveform_svg([("NRZ", levels_for("nrz", bits))], bits,
                            aria="NRZ 编码波形，位值 1 0 1 1 0 1")
    if kind == "nrzi":
        return waveform_svg([("NRZI", levels_for("nrz-i", bits))], bits,
                            aria="NRZI 编码波形，遇 1 翻转")
    if kind == "manchester":
        return waveform_svg([
            ("时钟", clock_levels(bits)),
            ("Thomas 约定", levels_for("manchester-thomas", bits)),
            ("IEEE 802.3", levels_for("manchester-ieee", bits)),
        ], bits, row_h=56, aria="曼彻斯特编码两种电平约定波形")
    if kind == "diff-manchester":
        return waveform_svg([
            ("时钟", clock_levels(bits)),
            ("差分曼彻斯特", levels_for("diff-manchester", bits)),
        ], bits, row_h=62, aria="差分曼彻斯特编码波形")
    raise ValueError(kind)


def four_b_five_b_figure():
    table = [
        ("0000", "11110"), ("0001", "01001"), ("0010", "10100"), ("0011", "10101"),
        ("0100", "01010"), ("0101", "01011"), ("0110", "01110"), ("0111", "01111"),
        ("1000", "10010"), ("1001", "10011"), ("1010", "10110"), ("1011", "10111"),
        ("1100", "11010"), ("1101", "11011"), ("1110", "11100"), ("1111", "11101"),
    ]
    W, H = 760, 430
    out = []
    out.append(text(20, 24, "4B/5B 映射表（IEEE 802.3 标准码组）", "dg-text"))
    cols, cw = 4, 180
    for i, (b4, b5) in enumerate(table):
        cx = 20 + (i % cols) * cw
        cy = 52 + (i // cols) * 30
        out.append(text(cx, cy, b4, "dg-mono-muted"))
        out.append(text(cx + 62, cy, "→ " + b5, "dg-mono"))
    eq = "1010 → 10110"
    out.append(text(20, 190, "例：数据 %s，映射后按 NRZI 发送（1 = 位开始处翻转）" % eq, "dg-text"))
    code = [1, 0, 1, 1, 0]
    bit_w, label_w, amp = 78, 108, 24
    left, right = label_w + 20, label_w + 20 + len(code) * bit_w
    base, high = 290, 266
    out.append(line(left, high, right, high, "dg-grid"))
    out.append(line(left, base, right, base, "dg-grid"))
    out.append(text(left - 8, high + 4, "高", "dg-muted", "end"))
    out.append(text(left - 8, base + 4, "低", "dg-muted", "end"))
    out.append(text(left - 8, 280, "NRZI", "dg-text", "end"))
    lv = levels_for("nrz-i", code)
    pts = []
    for k, v in enumerate(lv):
        x0 = left + k * bit_w / 2
        x1 = x0 + bit_w / 2
        y = high if v else base
        pts += [(x0, y), (x1, y)]
    out.append(polyline(pts))
    for i in range(len(code) + 1):
        x = left + i * bit_w
        out.append(line(x, 250, x, 316, "dg-grid"))
    for i, b in enumerate(code):
        out.append(text(left + i * bit_w + bit_w / 2, 244, str(b), "dg-text", "middle"))
    out.append(text(left, 340, "5 位码组 10110 的每一位电平", "dg-muted"))
    out.append(text(20, 382, "4B/5B 保证每 5 位至少两次跳变，便于接收端恢复时钟；", "dg-muted"))
    out.append(text(20, 402, "编码后波特率是数据率的 1.25 倍（100 Mbps 需 125 MBaud）。", "dg-muted"))
    return svg(W, H, out, "4B/5B 编码映射表与 NRZI 波形")


def modulation_figure():
    W, H = 760, 520
    bits = [1, 0, 1, 1]
    bit_w = 95
    left = 100
    base = 0
    out = []
    out.append(line(left, 40, left + len(bits) * bit_w, 40, "dg-axis"))
    for i, b in enumerate(bits):
        out.append(text(left + i * bit_w + bit_w / 2, 34, str(b), "dg-text", "middle"))
    for i in range(len(bits) + 1):
        out.append(line(left + i * bit_w, 20, left + i * bit_w, 450, "dg-grid"))

    def sine_pts(y0, amp, cycles, phase=0):
        pts = []
        steps = 96
        for k in range(steps + 1):
            x = left + (k / steps) * len(bits) * bit_w
            y = y0 - amp * math.cos(2 * math.pi * (cycles * (k / steps)) + phase)
            pts.append((x, y))
        return pts

    # ASK：bit1 有载波，bit0 无
    y0 = 105
    out.append(text(16, y0 - 40, "ASK", "dg-text"))
    out.append(line(left, y0, left + len(bits) * bit_w, y0, "dg-grid"))
    pts = []
    for i, b in enumerate(bits):
        seg = 48
        for k in range(seg + 1):
            x = left + i * bit_w + (k / seg) * bit_w
            y = y0 - (26 * math.cos(2 * math.pi * 2 * (k / seg)) if b else 0)
            pts.append((x, y))
    out.append(polyline(pts))
    out.append(text(left, y0 + 42, "有载波 = 1，无载波 = 0", "dg-muted"))

    # FSK：bit1 两周期，bit0 一周期
    y0 = 215
    out.append(text(16, y0 - 40, "FSK", "dg-text"))
    out.append(line(left, y0, left + len(bits) * bit_w, y0, "dg-grid"))
    pts = []
    for i, b in enumerate(bits):
        cycles = 2 if b else 1
        seg = 64
        for k in range(seg + 1):
            x = left + i * bit_w + (k / seg) * bit_w
            y = y0 - 24 * math.cos(2 * math.pi * cycles * (k / seg))
            pts.append((x, y))
    out.append(polyline(pts))
    out.append(text(left, y0 + 42, "高频率 = 1，低频率 = 0", "dg-muted"))

    # PSK：相位相反
    y0 = 325
    out.append(text(16, y0 - 40, "PSK", "dg-text"))
    out.append(line(left, y0, left + len(bits) * bit_w, y0, "dg-grid"))
    pts = []
    for i, b in enumerate(bits):
        seg = 48
        phase = 0 if b else math.pi
        for k in range(seg + 1):
            x = left + i * bit_w + (k / seg) * bit_w
            y = y0 - 26 * math.cos(2 * math.pi * 2 * (k / seg) + phase)
            pts.append((x, y))
    out.append(polyline(pts))
    out.append(text(left, y0 + 42, "相位 0 = 1，相位 π = 0", "dg-muted"))

    # 16-QAM 星座图
    cx, cy, gap = 618, 250, 26
    out.append(text(566, 112, "16-QAM 星座", "dg-text"))
    out.append(line(cx - 52, cy, cx + 52, cy, "dg-axis"))
    out.append(line(cx, cy - 52, cx, cy + 52, "dg-axis"))
    out.append(text(cx + 56, cy + 4, "I", "dg-muted"))
    out.append(text(cx + 4, cy - 56, "Q", "dg-muted"))
    for i in range(4):
        for j in range(4):
            x = cx - 39 + i * gap
            y = cy + 39 - j * gap
            out.append('<circle cx="%d" cy="%d" r="3" class="dg-accent"/>' % (x, y))
    out.append(text(cx, cy + 76, "每个符号 4 bit", "dg-muted", "middle"))
    out.append(text(cx, cy + 92, "幅度 + 相位组合", "dg-muted", "middle"))
    out.append(text(16, 480, "ASK / FSK / PSK 分别改变幅度、频率、相位；QAM 同时改变幅度与相位。", "dg-muted"))
    return svg(W, H, out, "ASK、FSK、PSK 波形与 16-QAM 星座图")


# --------------------------------------------------------------------------
# CRC / 海明码
# --------------------------------------------------------------------------

CRC_DATA = "1101011011"
CRC_POLY = "10011"


def crc_remainder(data, poly):
    deg = len(poly) - 1
    bits = [int(c) for c in data] + [0] * deg
    for i in range(len(data)):
        if bits[i]:
            for j, p in enumerate(poly):
                bits[i + j] ^= int(p)
    return "".join(str(b) for b in bits[-deg:]), bits


def crc_figure():
    data, poly = CRC_DATA, CRC_POLY
    rem, _ = crc_remainder(data, poly)
    # 逐步长除，记录每次异或后的被除数
    deg = len(poly) - 1
    cur = [int(c) for c in data] + [0] * deg
    steps = []
    for i in range(len(data)):
        if cur[i]:
            row = [None] * len(cur)
            for j, p in enumerate(poly):
                row[i + j] = int(p)
            steps.append((i, row, list(cur)))
            for j, p in enumerate(poly):
                cur[i + j] ^= int(p)
    W, H = 760, 470
    out = []
    cw = 17
    x0 = 168
    out.append(text(20, 30, "CRC 计算：数据 M = %s，G(x) = x⁴+x+1 即 %s（r = 4）" % (data, poly), "dg-text"))
    out.append(text(20, 88, "M·2⁴ =", "dg-text"))
    y = 88
    for k, c in enumerate(data + "0000"):
        out.append(text(x0 + k * cw, y, c, "dg-mono"))
    y += 26
    for idx, (offset, row, before) in enumerate(steps):
        out.append(text(20, y, "第 %d 次异或" % (idx + 1), "dg-muted"))
        out.append(text(x0 + offset * cw - 10, y, "⊕", "dg-muted"))
        for k, p in enumerate(row):
            if p is not None:
                out.append(text(x0 + k * cw, y, str(p), "dg-mono-muted"))
        out.append(line(x0 + offset * cw, y + 6, x0 + (offset + len(poly)) * cw, y + 6, "dg-axis"))
        y += 26
        if y > 330:
            break
    out.append(text(20, 368, "余数 R = %s（模 2 除法，异或无借位）" % rem, "dg-text"))
    out.append(text(20, 396, "发送帧 = 数据 + 余数 = %s %s" % (data, rem), "dg-mono"))
    out.append(text(20, 432, "接收端用同一 G(x) 除收到的帧：余数为 0 才认为无差错（有差错也可能漏检）。", "dg-muted"))
    return svg(W, H, out, "CRC 模 2 长除过程")


HAM_DATA = "1011"   # d1 d2 d3 d4


def hamming_build(data=HAM_DATA):
    """偶校验 (7,4) 海明码：位置 1,2,4 为校验位。"""
    d = [int(c) for c in data]
    p = [0, 0, 0]
    # p1 覆盖 1,3,5,7；p2 覆盖 2,3,6,7；p4 覆盖 4,5,6,7
    p[0] = d[0] ^ d[1] ^ d[3]
    p[1] = d[0] ^ d[2] ^ d[3]
    p[2] = d[1] ^ d[2] ^ d[3]
    code = [p[0], p[1], d[0], p[2], d[1], d[2], d[3]]
    return code


def hamming_figure():
    code = hamming_build()
    W, H = 760, 440
    cw, x0, ytop = 78, 96, 86
    out = []
    out.append(text(20, 30, "海明码（偶校验，7,4）：数据 1011 → 码字 %s" % "".join(map(str, code)), "dg-text"))
    out.append(text(x0, 66, "位置", "dg-muted"))
    for i, v in enumerate(code):
        pos = i + 1
        cls = "dg-fill-green" if pos in (1, 2, 4) else "dg-fill"
        out.append('<rect class="%s" x="%d" y="%d" width="%d" height="46" rx="4"/>'
                   % (cls, x0 + i * cw, ytop, cw - 8))
        out.append(text(x0 + i * cw + (cw - 8) / 2, ytop + 20, str(pos), "dg-muted", "middle"))
        out.append(text(x0 + i * cw + (cw - 8) / 2, ytop + 39, str(v), "dg-mono", "middle"))
    # 覆盖条
    bands = [("p1 覆盖 1,3,5,7", [1, 3, 5, 7], 170),
             ("p2 覆盖 2,3,6,7", [2, 3, 6, 7], 220),
             ("p4 覆盖 4,5,6,7", [4, 5, 6, 7], 270)]
    for label, positions, y in bands:
        out.append(text(x0 - 8, y + 6, label, "dg-text", "end"))
        for p in positions:
            out.append('<rect class="dg-fill" x="%d" y="%d" width="%d" height="18" rx="2"/>'
                       % (x0 + (p - 1) * cw + 2, y - 8, cw - 12))
        out.append(text(x0 + 7 * cw, y + 6, "异或 = 0（偶校验）", "dg-muted"))
    out.append(text(20, 340, "校验位放在 2^k 位置（1、2、4…），数据位依次填入其余位置。", "dg-muted"))
    out.append(text(20, 366, "校验位每一位覆盖二进制位号中含该位的位置，故覆盖集合是确定的。", "dg-muted"))
    out.append(text(20, 392, "纠错：出错位置 = 各校验方程不成立位之和；本例可纠正 1 位错、检出 2 位错。", "dg-muted"))
    out.append(text(20, 414, "码距 d = 3，因此可纠 1 位或检 2 位（不能同时）。", "dg-muted"))
    return svg(W, H, out, "海明码校验位覆盖示意图")


# --------------------------------------------------------------------------
# 协议结构 / 时序
# ---------------------------------------------------------------------------


def _header_grid(W, rows, title, note, row_labels=None):
    """rows: 每行 [(label, bitwidth)]；按 32 bit 总宽等比分配。"""
    inner = [text(20, 26, title, "dg-text")]
    left, total_w = 126, W - 150
    y = 52
    row_h = 42
    for ri, cells in enumerate(rows):
        total_bits = sum(b for _, b in cells)
        x = left
        for label, bits in cells:
            w = total_w * bits / total_bits
            cls = "dg-fill-green" if ri % 2 == 0 else "dg-fill"
            inner.append('<rect class="%s" x="%.1f" y="%d" width="%.1f" height="%d" rx="3"/>'
                         % (cls, x, y, w, row_h))
            inner.append(text(x + w / 2, y + 17, label, "dg-text", "middle"))
            inner.append(text(x + w / 2, y + 33, "%d bit" % bits, "dg-muted", "middle"))
            x += w
        if row_labels and ri < len(row_labels):
            inner.append(text(left - 10, y + 26, row_labels[ri], "dg-muted", "end"))
        y += row_h + 6
    for i, s in enumerate(note):
        inner.append(text(20, y + 20 + i * 22, s, "dg-muted"))
    return svg(W, y + 20 + len(note) * 22, inner, title)


def ipv4_header_figure():
    rows = [
        [("版本", 4), ("首部长度", 4), ("区分服务", 8), ("总长度", 16)],
        [("标识", 16), ("标志", 3), ("片偏移", 13)],
        [("生存时间 TTL", 8), ("协议", 8), ("首部校验和", 16)],
        [("源 IP 地址", 32)],
        [("目的 IP 地址", 32)],
    ]
    return _header_grid(760, rows, "IPv4 首部（固定部分 20 B = 5 行 × 32 bit）",
                        ["首部长度以 4 B 为单位，最小值 5 即 20 B。",
                         "总长度 = 首部 + 数据，单位 1 B，字段 16 bit 故最大 65535 B。",
                         "标志 3 bit 中最高位保留、DF 禁止分片、MF 还有分片；片偏移以 8 B 为单位。"])


def tcp_header_figure():
    rows = [
        [("源端口", 16), ("目的端口", 16)],
        [("序号 seq", 32)],
        [("确认号 ack", 32)],
        [("数据偏移", 4), ("保留", 3), ("控制位 URG/ACK/PSH/RST/SYN/FIN", 9), ("窗口", 16)],
        [("校验和", 16), ("紧急指针", 16)],
        [("选项（可变，最长 40 B）", 32)],
    ]
    return _header_grid(760, rows, "TCP 首部（固定部分 20 B，选项使首部最长 60 B）",
                        ["数据偏移以 4 B 为单位；窗口字段 16 bit，可配合选项做窗口扩大。",
                         "校验和覆盖首部与数据，计算时包含 12 B 伪首部（源/目的 IP、协议号、TCP 长度）。",
                         "序号对字节编号；SYN 与 FIN 各占用一个序号。"])


def ethernet_frame_figure():
    W, H = 760, 260
    inner = [text(20, 26, "以太网 V2 MAC 帧（单位：字节）", "dg-text")]
    segs = [("前导码", "7", 7), ("SFD", "1", 1), ("目的 MAC", "6", 6),
            ("源 MAC", "6", 6), ("类型", "2", 2), ("数据", "46–1500", 30), ("FCS", "4", 4)]
    left, total_w = 20, 720
    total = sum(s[2] for s in segs)
    x = left
    for i, (name, size, weight) in enumerate(segs):
        w = total_w * weight / total
        cls = "dg-fill-green" if i % 2 == 0 else "dg-fill"
        inner.append('<rect class="%s" x="%.1f" y="60" width="%.1f" height="58" rx="3"/>'
                     % (cls, x, w))
        inner.append(text(x + w / 2, 78, name, "dg-text", "middle"))
        inner.append(text(x + w / 2, 96, size, "dg-muted", "middle"))
        x += w
    inner.append(text(20, 160, "最小帧 64 B = 46 B 数据 + 18 B（6+6+2+4）；前导码与 SFD 不计入帧长。", "dg-muted"))
    inner.append(text(20, 184, "FCS 用 CRC-32；类型字段 0x0800 表示 IPv4、0x0806 表示 ARP。", "dg-muted"))
    inner.append(text(20, 208, "10 Mbps 以太网争用期 2τ = 51.2 μs，故最小帧 512 bit = 64 B，保证发送端在发完前能检测到冲突。", "dg-muted"))
    return svg(W, H, inner, "以太网 MAC 帧格式")


def _sequence(W, H, entities, messages, title, notes=None):
    inner = [text(20, 26, title, "dg-text")]
    top, bottom = 54, H - 34
    for name, x in entities:
        inner.append('<rect class="dg-fill-green" x="%.1f" y="%d" width="116" height="30" rx="4"/>'
                     % (x - 58, top))
        inner.append(text(x, top + 21, name, "dg-text", "middle"))
        inner.append(line(x, top + 30, x, bottom, "dg-grid"))
    for idx, (y, a, b, label) in enumerate(messages):
        ax = dict(entities)[a]
        bx = dict(entities)[b]
        direction = 1 if bx > ax else -1
        inner.append('<line class="dg-green" x1="%.1f" y1="%d" x2="%.1f" y2="%d"/>'
                     % (ax, y, bx, y))
        # 箭头
        inner.append('<path class="dg-green" d="M %.1f,%d L %.1f,%d L %.1f,%d Z"/>'
                     % (bx, y, bx - direction * 9, y - 4, bx - direction * 9, y + 4))
        inner.append(text((ax + bx) / 2, y - 8, label, "dg-text", "middle"))
        inner.append(text(ax - 12, y + 4, str(idx + 1), "dg-muted", "end"))
    if notes:
        for i, s in enumerate(notes):
            inner.append(text(20, H - 14 - (len(notes) - 1 - i) * 18, s, "dg-muted"))
    return svg(W, H, inner, title)


def handshake_figure():
    W, H = 760, 330
    return _sequence(W, H, [("客户端", 170), ("服务端", 590)], [
        (110, "客户端", "服务端", "SYN=1, seq=x（本例 x = 1000）"),
        (180, "服务端", "客户端", "SYN=1, ACK=1, seq=y（2000）, ack=x+1 = 1001"),
        (250, "客户端", "服务端", "ACK=1, seq=x+1 = 1001, ack=y+1 = 2001"),
    ], "TCP 三次握手（序号已验算）", [
        "SYN 占用 1 个序号，所以确认号是 x+1、y+1。",
        "前两次报文不携带数据；第三次可以携带数据。"])


def teardown_figure():
    W, H = 760, 390
    return _sequence(W, H, [("客户端", 170), ("服务端", 590)], [
        (100, "客户端", "服务端", "FIN=1, seq=u（续用 1001）"),
        (170, "服务端", "客户端", "ACK=1, seq=v（2001）, ack=u+1 = 1002"),
        (240, "服务端", "客户端", "FIN=1, ACK=1, seq=w（2001）, ack=u+1 = 1002"),
        (310, "客户端", "服务端", "ACK=1, seq=u+1 = 1002, ack=w+1 = 2002"),
    ], "TCP 四次挥手（无数据时的典型顺序）", [
        "FIN 也各占 1 个序号；第二、三次之间服务端仍可发送剩余数据。",
        "客户端收到第二个 FIN 后进入 TIME_WAIT，等待 2MSL 才关闭。"])


def sliding_window_figure():
    W, H = 760, 330
    inner = [text(20, 26, "停止等待 / 后退 N 帧 / 选择重传 的窗口对比", "dg-text")]
    rows = [
        ("停止等待", 1, 1, "发 1 帧等 1 个 ACK；信道利用率低"),
        ("后退 N 帧", 4, 1, "发送窗口 4；接收窗口 1，按序接收"),
        ("选择重传", 4, 4, "收发窗口都 4；只重传出错帧"),
    ]
    y = 60
    for name, sw, rw, note in rows:
        inner.append(text(20, y + 22, name, "dg-text"))
        for k in range(8):
            cls = "dg-fill-green" if k < sw else "dg-fill"
            inner.append('<rect class="%s" x="%d" y="%d" width="42" height="30" rx="3"/>'
                         % (cls, 140 + k * 46, y))
            inner.append(text(151 + k * 46, y + 21, str(k), "dg-muted", "middle"))
        inner.append(text(150, y + 52, "发送窗口 %d" % sw, "dg-muted"))
        inner.append(text(430, y + 52, "接收窗口 %d" % rw, "dg-muted"))
        inner.append(text(520, y + 22, note, "dg-muted"))
        y += 80
    inner.append(text(20, 310, "计算口径：发送窗口上限 = 2^n − 1（GBN）或 2^(n−1)（SR），n 为序号位数。", "dg-muted"))
    return svg(W, H, inner, "滑动窗口协议对比")


def csma_cd_figure():
    W, H = 760, 380
    inner = [text(20, 26, "CSMA/CD 争用期：最坏冲突往返 2τ", "dg-text")]
    left, right = 120, 720
    tau_x = 420
    bottom_y = 250
    inner.append(line(left, bottom_y, right, bottom_y, "dg-axis"))
    inner.append(text(right, bottom_y + 22, "时间 t", "dg-muted", "end"))
    inner.append(line(left, 70, left, bottom_y, "dg-grid"))
    inner.append(line(right, 70, right, bottom_y, "dg-grid"))
    inner.append(text(left, 60, "站 A", "dg-text", "middle"))
    inner.append(text(right, 60, "站 B", "dg-text", "middle"))
    # A 发送
    inner.append(text(left + 10, 96, "t = 0：A 开始发送", "dg-text"))
    inner.append('<path class="dg-green" d="M %d,110 L %d,110"/>' % (left, right))
    # B 发送接近争用期
    inner.append(text(right - 10, 150, "t = τ−ε：B 也发送（此前未听到 A）", "dg-text", "end"))
    inner.append('<line class="dg-accent" x1="%d" y1="164" x2="%d" y2="164"/>' % (left, right))
    # 冲突
    inner.append(text(tau_x, 196, "τ 处冲突", "dg-text", "middle"))
    inner.append('<circle cx="%d" cy="164" r="4" class="dg-accent"/>' % tau_x)
    # 争用期区间
    inner.append('<rect class="dg-fill" x="%d" y="224" width="%d" height="12" rx="2"/>' % (left, tau_x - left))
    inner.append(text((left + tau_x) / 2, 216, "争用期 2τ", "dg-muted", "middle"))
    inner.append(text(left + 10, 290, "A 最迟在 t = 2τ 收到冲突信号；若此时帧已发完，就无法检测，", "dg-muted"))
    inner.append(text(left + 10, 312, "所以最小帧长 = 2τ × 数据率。10 Mbps 以太网：2τ = 51.2 μs → 512 bit = 64 B。", "dg-muted"))
    inner.append(text(left + 10, 340, "检测到冲突后发强化冲突信号（jam），再按二进制指数退避重传。", "dg-muted"))
    return svg(W, H, inner, "CSMA/CD 冲突窗口示意图")


def subnet_figure():
    W, H = 760, 380
    inner = [text(20, 26, "子网划分：192.168.1.0/24 切成 4 个 /26", "dg-text")]
    # 32 位条
    left, y, cw = 20, 60, 22
    labels = ["11000000", "10101000", "00000001", "00", "000000"]
    colors = ["dg-fill", "dg-fill", "dg-fill", "dg-fill-green", "dg-fill"]
    x = left
    for lab, cls in zip(labels, colors):
        w = cw * len(lab)
        inner.append('<rect class="%s" x="%d" y="%d" width="%d" height="34" rx="2"/>'
                     % (cls, x, y, w - 2))
        inner.append(text(x + w / 2, y + 21, lab, "dg-mono", "middle"))
        x += w
    inner.append(text(left, y + 58, "192 . 168 . 1 . 主机号    ← /24 前缀 24 位，主机号 8 位", "dg-muted"))
    inner.append(text(left + cw * 24, y - 8, "子网号 2 位", "dg-text"))
    inner.append(text(left + cw * 26, y + 58, "剩余主机号 6 位", "dg-muted"))
    # 表格
    ty = 160
    heads = ["子网", "网络地址", "可用主机范围", "广播地址"]
    xs = [20, 150, 310, 570]
    for hx, h in zip(xs, heads):
        inner.append(text(hx, ty, h, "dg-text"))
    rows = [
        ("00", "192.168.1.0/26", "192.168.1.1 – .62", "192.168.1.63"),
        ("01", "192.168.1.64/26", "192.168.1.65 – .126", "192.168.1.127"),
        ("10", "192.168.1.128/26", "192.168.1.129 – .190", "192.168.1.191"),
        ("11", "192.168.1.192/26", "192.168.1.193 – .254", "192.168.1.255"),
    ]
    for ri, row in enumerate(rows):
        yy = ty + 28 + ri * 26
        for hx, cell in zip(xs, row):
            inner.append(text(hx, yy, cell, "dg-mono-muted"))
    inner.append(text(20, ty + 152, "子网掩码 /26 = 255.255.255.192；每个子网 64 个地址，减去网络地址与广播地址后 62 个可分配。", "dg-muted"))
    inner.append(text(20, ty + 176, "CIDR 记法：a.b.c.d/n 表示前 n 位是网络前缀，路由按最长前缀匹配。", "dg-muted"))
    return svg(W, H, inner, "子网划分示意图")


def osi_model_figure():
    W, H = 760, 420
    inner = [text(20, 26, "OSI 七层与 TCP/IP 四层对应关系", "dg-text")]
    osi = ["应用层", "表示层", "会话层", "传输层", "网络层", "数据链路层", "物理层"]
    tcpip = [("应用层", 3), ("传输层", 1), ("网际层", 1), ("网络接口层", 2)]
    y0, h = 56, 42
    for i, name in enumerate(osi):
        inner.append('<rect class="dg-fill" x="60" y="%d" width="220" height="%d" rx="3"/>'
                     % (y0 + i * (h + 6), h))
        inner.append(text(170, y0 + i * (h + 6) + 26, name, "dg-text", "middle"))
    y = y0
    for name, span in tcpip:
        hh = span * (h + 6) - 6
        inner.append('<rect class="dg-fill-green" x="400" y="%d" width="220" height="%d" rx="3"/>'
                     % (y, hh))
        inner.append(text(510, y + hh / 2 + 5, name, "dg-text", "middle"))
        y += span * (h + 6)
    inner.append(text(60, 386, "OSI 是教学参考模型；实际互联网用 TCP/IP 四层，网络接口层对应 OSI 的链路层 + 物理层。", "dg-muted"))
    return svg(W, H, inner, "OSI 与 TCP/IP 分层模型")


# --------------------------------------------------------------------------
# 操作系统
# --------------------------------------------------------------------------


def arrow(x1, y1, x2, y2, label="", cls="dg-green", lx=0, ly=0):
    ang = math.atan2(y2 - y1, x2 - x1)
    inner = ['<line class="%s" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>'
             % (cls, x1, y1, x2, y2)]
    for side in (-1, 1):
        a = ang + side * 0.42
        inner.append('<path class="%s" d="M %.1f,%.1f L %.1f,%.1f L %.1f,%.1f Z" fill="currentColor" stroke="none"/>'
                     % (cls, x2, y2, x2 + 10 * math.cos(a), y2 + 10 * math.sin(a),
                        x2 + 10 * math.cos(ang - side * 0.42), y2 + 10 * math.sin(ang - side * 0.42)))
    if label:
        inner.append(text((x1 + x2) / 2 + lx, (y1 + y2) / 2 + ly, label, "dg-muted", "middle"))
    return "".join(inner)


def process_state_figure():
    W, H = 760, 390
    inner = [text(20, 26, "进程状态转换（五态模型）", "dg-text")]
    boxes = [
        ("创建", 60, 60, 96, 34), ("就绪", 250, 120, 96, 34), ("运行", 460, 120, 96, 34),
        ("阻塞", 250, 250, 96, 34), ("终止", 630, 60, 96, 34),
    ]
    for name, x, y, w, h in boxes:
        inner.append('<rect class="dg-fill" x="%d" y="%d" width="%d" height="%d" rx="8"/>'
                     % (x, y, w, h))
        inner.append(text(x + w / 2, y + 22, name, "dg-text", "middle"))
    inner.append(arrow(156, 77, 250, 130, "创建", ly=-10))
    inner.append(arrow(346, 125, 460, 125, "调度", ly=-8))
    inner.append(arrow(460, 145, 346, 145, "时间片到/被抢占", ly=14))
    inner.append(arrow(490, 154, 310, 250, "等待事件", lx=55))
    inner.append(arrow(290, 250, 278, 154, "事件发生", lx=-62))
    inner.append(arrow(556, 120, 630, 82, "正常结束", ly=-14))
    inner.append(text(20, 330, "三态模型只保留就绪、运行、阻塞；创建与终止是五态模型额外增加的边界状态。", "dg-muted"))
    inner.append(text(20, 354, "运行态只能由就绪态转入；阻塞态不能直接转入运行态，必须先回到就绪队列。", "dg-muted"))
    return svg(W, H, inner, "进程状态转换图")


def pv_figure():
    W, H = 760, 330
    inner = [text(20, 26, "生产者-消费者：信号量 PV 的配对关系", "dg-text")]
    inner.append('<rect class="dg-fill" x="40" y="70" width="150" height="70" rx="6"/>')
    inner.append(text(115, 98, "生产者", "dg-text", "middle"))
    inner.append(text(115, 120, "生产数据 → 放缓冲区", "dg-muted", "middle"))
    inner.append('<rect class="dg-fill" x="570" y="70" width="150" height="70" rx="6"/>')
    inner.append(text(645, 98, "消费者", "dg-text", "middle"))
    inner.append(text(645, 120, "取缓冲区 → 消费", "dg-muted", "middle"))
    for i in range(6):
        cls = "dg-fill-green" if i < 3 else "dg-fill"
        inner.append('<rect class="%s" x="%d" y="166" width="54" height="44" rx="4"/>'
                     % (cls, 250 + i * 58, ))
        inner.append(text(277 + i * 58, 193, "槽", "dg-muted", "middle"))
    inner.append(text(380, 240, "缓冲区（容量 N = 6，示例已有 3 个）", "dg-muted", "middle"))
    inner.append(text(20, 268, "empty = N 表示空槽数；full = 0 表示已有数据数；mutex = 1 互斥访问缓冲区。", "dg-muted"))
    inner.append(text(20, 292, "生产者 P(empty) → P(mutex) → 放入 → V(mutex) → V(full)；消费者顺序相反。", "dg-muted"))
    inner.append(text(20, 314, "P 操作先减后判，V 操作先加后唤醒；两个 P 的顺序不能颠倒，否则可能死锁。", "dg-muted"))
    return svg(W, H, inner, "生产者消费者信号量示意图")


def banker_figure():
    alloc = [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]]
    maxm = [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]]
    avail = [3, 3, 2]
    need = [[maxm[i][j] - alloc[i][j] for j in range(3)] for i in range(5)]
    safe, work = [], list(avail)
    left = {i for i in range(5)}
    while left:
        done = False
        for i in sorted(left):
            if all(need[i][j] <= work[j] for j in range(3)):
                for j in range(3):
                    work[j] += alloc[i][j]
                safe.append("P%d" % i)
                left.remove(i)
                done = True
                break
        if not done:
            break
    W, H = 760, 430
    inner = [text(20, 26, "银行家算法：Need = Max − Allocation，Available = (3,3,2)", "dg-text")]
    heads = ["进程", "Allocation", "Max", "Need"]
    xs = [40, 220, 350, 490]
    for x, h in zip(xs, heads):
        inner.append(text(x, 62, h, "dg-text"))
    for i in range(5):
        y = 92 + i * 30
        inner.append(text(xs[0], y, "P%d" % i, "dg-text"))
        inner.append(text(xs[1], y, " ".join(map(str, alloc[i])), "dg-mono-muted"))
        inner.append(text(xs[2], y, " ".join(map(str, maxm[i])), "dg-mono-muted"))
        inner.append(text(xs[3], y, " ".join(map(str, need[i])), "dg-mono-muted"))
    inner.append(text(40, 270, "安全序列（脚本按 Work+Allocation 贪心求出）：%s" % " → ".join(safe), "dg-text"))
    inner.append(text(40, 304, "每一步都要求 Need ≤ Work；找到安全序列说明当前状态安全。", "dg-muted"))
    inner.append(text(40, 328, "若某进程请求资源，先做「试探分配」，再用同样方法检查是否仍存在安全序列；", "dg-muted"))
    inner.append(text(40, 352, "存在才真正分配，否则让进程等待，避免进入不安全状态。", "dg-muted"))
    return svg(W, H, inner, "银行家算法安全序列示例")


def page_walk_figure():
    W, H = 760, 420
    inner = [text(20, 26, "分页地址转换：TLB → 页表 → 物理地址", "dg-text")]
    # 逻辑地址
    inner.append('<rect class="dg-fill-green" x="20" y="60" width="220" height="40" rx="4"/>')
    inner.append(text(130, 78, "逻辑地址 32 位", "dg-text", "middle"))
    inner.append(text(130, 92, "页号 20 位 | 页内偏移 12 位", "dg-muted", "middle"))
    inner.append(arrow(240, 80, 300, 80, "页号"))
    inner.append('<rect class="dg-fill" x="300" y="52" width="160" height="56" rx="4"/>')
    inner.append(text(380, 74, "TLB（快表）", "dg-text", "middle"))
    inner.append(text(380, 92, "命中 → 直接得帧号", "dg-muted", "middle"))
    inner.append(arrow(460, 80, 520, 80, ""))
    inner.append(arrow(380, 108, 380, 148, "未命中", lx=34))
    inner.append('<rect class="dg-fill" x="280" y="148" width="200" height="56" rx="4"/>')
    inner.append(text(380, 170, "页表（在内存）", "dg-text", "middle"))
    inner.append(text(380, 188, "页号 → 物理帧号", "dg-muted", "middle"))
    inner.append(arrow(480, 176, 560, 176, ""))
    inner.append('<rect class="dg-fill-green" x="560" y="148" width="180" height="56" rx="4"/>')
    inner.append(text(650, 170, "物理地址", "dg-text", "middle"))
    inner.append(text(650, 188, "帧号 20 位 | 偏移 12 位", "dg-muted", "middle"))
    inner.append(text(20, 258, "页内偏移在转换前后保持不变；页号被替换为物理帧号。", "dg-muted"))
    inner.append(text(20, 282, "TLB 命中只需一次访存取数据；未命中要先访问内存中的页表，再访问数据。", "dg-muted"))
    inner.append(text(20, 306, "多级页表把页号继续分段，逐级查表，用时间换空间，避免为整个地址空间建一张大表。", "dg-muted"))
    inner.append(text(20, 330, "页面大小 4 KB = 2^12，所以偏移 12 位；帧号位数由物理地址宽度决定。", "dg-muted"))
    return svg(W, H, inner, "分页与 TLB 地址转换路径")


def page_replace_rows(ref, frames, algo):
    mem, rows, faults = [], [], 0
    for page in ref:
        hit = page in mem
        if not hit:
            faults += 1
            if len(mem) < frames:
                mem.append(page)
            elif algo == "fifo":
                mem.pop(0)
                mem.append(page)
            elif algo == "lru":
                mem.remove(page) if page in mem else None
                mem.pop(0)
                mem.append(page)
            elif algo == "opt":
                far, victim = -1, 0
                for idx, p in enumerate(mem):
                    try:
                        nxt = ref[rows.__len__() + 1:].index(p)
                    except ValueError:
                        nxt = 10 ** 9
                    if nxt > far:
                        far, victim = nxt, idx
                mem.pop(victim)
                mem.append(page)
        else:
            if algo == "lru":
                mem.remove(page)
                mem.append(page)
        rows.append((list(mem), hit))
    return rows, faults


def page_replace_figure():
    ref = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5]
    frames = 3
    algos = [("FIFO", "fifo"), ("LRU", "lru"), ("OPT", "opt")]
    W, H = 760, 380
    inner = [text(20, 26, "页面置换对比：引用串 1 2 3 4 1 2 5 1 2 3 4 5，3 个物理块", "dg-text")]
    cw = 55
    left = 110
    for i, p in enumerate(ref):
        inner.append(text(left + i * cw + cw / 2, 52, str(p), "dg-mono-muted", "middle"))
    y = 78
    for name, algo in algos:
        rows, faults = page_replace_rows(ref, frames, algo)
        inner.append(text(20, y + 26, name, "dg-text"))
        for i, (mem, hit) in enumerate(rows):
            cls = "dg-fill-green" if hit else "dg-fill-accent"
            inner.append('<rect class="%s" x="%d" y="%d" width="%d" height="24" rx="2"/>'
                         % (cls, left + i * cw, y, cw - 6))
            inner.append(text(left + i * cw + (cw - 6) / 2, y + 16, str(ref[i]),
                              "dg-mono", "middle"))
            inner.append(text(left + i * cw + (cw - 6) / 2, y + 38, "命中" if hit else "缺页",
                              "dg-muted", "middle"))
        inner.append(text(700, y + 16, "缺页 %d 次" % faults, "dg-text"))
        y += 86
    inner.append(text(20, 340, "绿色 = 命中，橙色 = 缺页；每列显示本次访问的页，缺页率对比见右侧统计。", "dg-muted"))
    inner.append(text(20, 364, "FIFO 会出现 Belady 异常（块数增加缺页反而增多）；LRU 与 OPT 不会。", "dg-muted"))
    return svg(W, H, inner, "FIFO/LRU/OPT 页面置换对比")


def disk_time_figure():
    W, H = 760, 400
    inner = [text(20, 26, "磁盘访问时间 = 寻道时间 + 旋转延迟 + 传输时间", "dg-text")]
    # 盘面
    cx, cy, r = 130, 210, 100
    for rr in (100, 78, 56, 34):
        inner.append('<circle cx="%d" cy="%d" r="%d" class="dg-axis"/>' % (cx, cy, rr))
    inner.append('<line class="dg-grid" x1="%d" y1="%d" x2="%d" y2="%d"/>'
                 % (cx - 100, cy, cx + 100, cy))
    inner.append(text(cx, cy - 108, "磁道", "dg-muted", "middle"))
    for ang, name in ((0, "0°"), (90, "90°"), (180, "180°"), (270, "270°")):
        x = cx + 106 * math.cos(math.radians(ang))
        y = cy + 106 * math.sin(math.radians(ang))
        inner.append(text(x, y + 4, name, "dg-muted", "middle"))
    # 时间条
    left, top, width = 280, 100, 440
    segs = [("寻道", 150, "磁头移到目标磁道"), ("旋转延迟", 120, "平均半圈"), ("传输", 150, "读写数据")]
    x = left
    for name, w, note in segs:
        inner.append('<rect class="dg-fill-green" x="%d" y="%d" width="%d" height="36" rx="3"/>'
                     % (x, top, w))
        inner.append(text(x + w / 2, top + 22, name, "dg-text", "middle"))
        inner.append(text(x + w / 2, top + 56, note, "dg-muted", "middle"))
        x += w + 8
    inner.append(text(left, top + 96, "平均旋转延迟 = 半圈时间 = 1/(2r)，r 为转速（转/秒）。", "dg-muted"))
    inner.append(text(left, top + 120, "传输时间 = 读写数据量 / 传输速率；与磁道位置无关。", "dg-muted"))
    inner.append(text(left, top + 144, "寻道时间通常占主导，因此磁盘调度主要优化寻道。", "dg-muted"))
    inner.append(text(20, 360, "转速 7200 rpm 时一圈约 8.33 ms，平均旋转延迟约 4.17 ms。", "dg-muted"))
    return svg(W, H, inner, "磁盘访问时间三段与盘面")


def disk_sched_figure():
    req = [98, 183, 37, 122, 14, 124, 65, 67]
    start = 53

    def run(algo):
        if algo == "fcfs":
            return [start] + req
        if algo == "sstf":
            seq, left, cur = [start], list(req), start
            while left:
                nxt = min(left, key=lambda x: abs(x - cur))
                left.remove(nxt)
                seq.append(nxt)
                cur = nxt
            return seq
        up = sorted([x for x in req if x >= start])
        down = sorted([x for x in req if x < start], reverse=True)
        if algo == "scan":          # 到 199 折返
            return [start] + up + [199] + down
        if algo == "look":          # 到最远请求折返
            return [start] + up + down
        if algo == "cscan":         # 到 199，回到 0，再向上
            return [start] + up + [199, 0] + sorted([x for x in req if x < start])
        if algo == "clook":         # 到最远请求，跳到最小请求，再向上
            low = sorted([x for x in req if x < start])
            return [start] + up + [low[0]] + low[1:]
        raise ValueError(algo)

    W, H = 760, 520
    inner = [text(20, 26, "磁盘调度：起点 53，请求 98/183/37/122/14/124/65/67", "dg-text")]
    panels = [("FCFS", "fcfs", 40, 90), ("SSTF", "sstf", 280, 90), ("SCAN（向大磁道）", "scan", 520, 90),
              ("LOOK", "look", 40, 300), ("C-SCAN", "cscan", 280, 300), ("C-LOOK", "clook", 520, 300)]
    for name, algo, ox, oy in panels:
        seq = run(algo)
        inner.append(text(ox, oy - 12, name, "dg-text"))
        inner.append(line(ox + 34, oy, ox + 214, oy, "dg-axis"))
        inner.append(line(ox + 34, oy - 140, ox + 34, oy, "dg-axis"))
        for v in (0, 50, 100, 150, 200):
            yy = oy - 140 * v / 200
            inner.append(line(ox + 30, yy, ox + 34, yy, "dg-axis"))
            inner.append(text(ox + 26, yy + 4, str(v), "dg-muted", "end"))
        n = max(1, len(seq) - 1)
        pts = [(ox + 40 + 172 * i / n, oy - 140 * v / 200) for i, v in enumerate(seq)]
        inner.append(polyline(pts, "dg-green"))
        for x, y in pts:
            inner.append('<circle cx="%.1f" cy="%.1f" r="2" class="dg-accent"/>' % (x, y))
        total = sum(abs(seq[i + 1] - seq[i]) for i in range(len(seq) - 1))
        inner.append(text(ox + 214, oy + 16, "移动 %d 道" % total, "dg-muted", "end"))
    inner.append(text(20, 492, "SCAN/C-SCAN 到达端点（199 或 0）才折返；LOOK/C-LOOK 只到最远请求处折返，移动量更小。", "dg-muted"))
    return svg(W, H, inner, "六种磁盘调度算法的磁头轨迹对比")


# --------------------------------------------------------------------------
# 注册表
# --------------------------------------------------------------------------

DIAGRAMS = {
    "net-nrz": encoding_figure("nrz"),
    "net-nrzi": encoding_figure("nrzi"),
    "net-manchester": encoding_figure("manchester"),
    "net-diff-manchester": encoding_figure("diff-manchester"),
    "net-4b5b": four_b_five_b_figure(),
    "net-modulation": modulation_figure(),
    "net-crc": crc_figure(),
    "net-hamming": hamming_figure(),
    "net-sliding-window": sliding_window_figure(),
    "net-csma-cd": csma_cd_figure(),
    "net-ipv4-header": ipv4_header_figure(),
    "net-tcp-header": tcp_header_figure(),
    "net-ethernet-frame": ethernet_frame_figure(),
    "net-handshake": handshake_figure(),
    "net-teardown": teardown_figure(),
    "net-subnet": subnet_figure(),
    "net-osi-model": osi_model_figure(),
    "os-state": process_state_figure(),
    "os-pv": pv_figure(),
    "os-banker": banker_figure(),
    "os-page-walk": page_walk_figure(),
    "os-replace": page_replace_figure(),
    "os-disk-time": disk_time_figure(),
    "os-disk-sched": disk_sched_figure(),
}
