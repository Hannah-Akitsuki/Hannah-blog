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


if __name__ == "__main__":
    main()
