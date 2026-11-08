# -*- coding: utf-8 -*-
"""把 tools/glossary_src/*.json 的词条合并进 data/glossary.json。

- 只按 id 增补/更新本工具负责的词条，不动已有 48 条里的其他字段与条目；
- 词条里的 "diagram" 写配图 id，由 glossary_diagrams.DIAGRAMS 展开成内嵌 SVG；
- 校验必填字段、id 唯一、related 引用存在，并打印 CRC / 海明码 / 编码电平的验算结果；
- 同时输出 glossary.json 的原始体积与 gzip 体积。
"""

import gzip
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SRC_DIR = os.path.join(HERE, "glossary_src")
DATA = os.path.join(REPO, "data", "glossary.json")

sys.path.insert(0, HERE)
from glossary_diagrams import DIAGRAMS, CRC_DATA, CRC_POLY, crc_remainder, hamming_build, levels_for  # noqa: E402


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    existing = load(DATA)
    terms = existing.get("terms", [])
    by_id = {t["id"]: t for t in terms}
    added, updated = [], []
    sources = sorted(
        f for f in os.listdir(SRC_DIR)
        if f.endswith(".json") and not f.startswith("_")
    ) if os.path.isdir(SRC_DIR) else []

    for fn in sources:
        pack = load(os.path.join(SRC_DIR, fn))
        for raw in pack.get("terms", []):
            t = dict(raw)
            if "diagram" in t:
                dg = t.pop("diagram")
                if dg not in DIAGRAMS:
                    raise SystemExit("缺少配图 %s（词条 %s）" % (dg, t.get("id")))
                t["diagram"] = DIAGRAMS[dg]
            t.setdefault("abbr", "")
            t.setdefault("related", [])
            for k in ("id", "term", "course", "brief", "source"):
                if not t.get(k):
                    raise SystemExit("词条 %s 缺字段 %s" % (t.get("id"), k))
            if not re.match(r"^[a-z0-9][a-z0-9-]*$", t["id"]):
                raise SystemExit("id 不合规：%s" % t["id"])
            if t["id"] in by_id:
                old = by_id[t["id"]]
                if old.get("course") != t["course"]:
                    raise SystemExit("拒绝跨课程改 id：%s" % t["id"])
                keep_diagram = old.get("diagram")
                old.clear()
                old.update(t)
                if keep_diagram and "diagram" not in t:
                    old["diagram"] = keep_diagram
                updated.append(t["id"])
            else:
                terms.append(t)
                by_id[t["id"]] = t
                added.append(t["id"])

    # 引用检查
    missing = []
    for t in terms:
        for r in t.get("related") or []:
            if str(r) not in by_id:
                missing.append((t["id"], r))
    if missing:
        raise SystemExit("related 指向不存在的 id：%s" % missing)

    ids = [t["id"] for t in terms]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        raise SystemExit("重复 id：%s" % dup)

    # 配图检查：只允许内嵌，不允许外链
    for t in terms:
        if "diagram" in t:
            s = t["diagram"]
            probe = s.replace('xmlns="http://www.w3.org/2000/svg"', "")
            if "<svg" not in s or "http://" in probe or "https://" in probe:
                raise SystemExit("配图疑似外链或非法：%s" % t["id"])
            if not t.get("caption"):
                raise SystemExit("有图无图注：%s" % t["id"])

    existing["updated"] = "2026-11-08"
    existing["terms"] = terms
    payload = json.dumps(existing, ensure_ascii=False, indent=2) + "\n"
    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        f.write(payload)

    raw = len(payload.encode("utf-8"))
    gz = len(gzip.compress(payload.encode("utf-8"), 9))
    with_diagram = sum(1 for t in terms if "diagram" in t)
    print("新增 %d 条，更新 %d 条，总计 %d 条，其中配图 %d 条" %
          (len(added), len(updated), len(terms), with_diagram))
    print("glossary.json：%.1f KB，gzip 后 %.1f KB" % (raw / 1024, gz / 1024))
    for name in ("数据结构", "计算机组成原理", "操作系统", "计算机网络", "系统架构", "编译原理"):
        print("  %s：%d 条" % (name, sum(1 for t in terms if t["course"] == name)))

    rem, _ = crc_remainder(CRC_DATA, CRC_POLY)
    print("验算 CRC：M=%s G=%s → 余数 %s，发送 %s%s" % (CRC_DATA, CRC_POLY, rem, CRC_DATA, rem))
    code = hamming_build()
    print("验算海明码：数据 1011 → 码字 %s（偶校验）" % "".join(map(str, code)))
    bits = [1, 0, 1, 1, 0, 1]
    print("验算曼彻斯特 Thomas：%s" % "".join("高→低" if b else "低→高" for b in bits))
    print("验算差分曼彻斯特电平：%s" % " ".join(map(str, levels_for("diff-manchester", bits))))
    print("验算 NRZI：%s" % " ".join(map(str, levels_for("nrz-i", bits))))

    # 数据结构：KMP next / 哈夫曼 WPL / 快排划分
    pat = "ababaca"
    pp = " " + pat
    nxt = [0] * (len(pat) + 1)
    for j in range(2, len(pat) + 1):
        nxt[j] = max([k for k in range(2, j) if pp[1:k] == pp[j - k + 1:j]] or [1])
    print("验算 KMP：P=%s → 王道 next=%s（next[1]=0）" % (pat, nxt[1:]))

    import heapq
    heap = [2, 4, 5, 7, 9]
    heapq.heapify(heap)
    wpl = 0
    while len(heap) > 1:
        a = heapq.heappop(heap)
        b = heapq.heappop(heap)
        wpl += a + b
        heapq.heappush(heap, a + b)
    print("验算哈夫曼：权值 2,4,5,7,9 → WPL=%d" % wpl)

    arr = [49, 38, 65, 97, 76, 13, 27]
    pivot = arr[-1]
    i = -1
    for j in range(len(arr) - 1):
        if arr[j] <= pivot:
            i += 1
            arr[i], arr[j] = arr[j], arr[i]
    arr[i + 1], arr[-1] = arr[-1], arr[i + 1]
    print("验算快排划分：枢轴 27 → %s" % arr)

    # 计组：IEEE 754 位域 / Cache 地址拆分
    import struct
    raw = struct.unpack(">I", struct.pack(">f", -12.5))[0]
    sign = raw >> 31
    exp = (raw >> 23) & 0xFF
    frac = raw & 0x7FFFFF
    val = ((-1) ** sign) * (1 + frac / (1 << 23)) * (2 ** (exp - 127))
    print("验算 IEEE 754：-12.5 → sign=%d exp=%d(%s) frac=0x%06X，还原=%.1f"
          % (sign, exp, format(exp, "08b"), frac, val))

    addr = 0x12345678
    off_bits, idx_bits = 6, 10
    offset = addr & ((1 << off_bits) - 1)
    index = (addr >> off_bits) & ((1 << idx_bits) - 1)
    tag = addr >> (off_bits + idx_bits)
    print("验算 Cache 拆分：0x%08X → tag=0x%X index=0x%X offset=0x%X"
          % (addr, tag, index, offset))


if __name__ == "__main__":
    main()
