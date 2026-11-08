# -*- coding: utf-8 -*-
"""
扫描独立相册目录 photos/，生成照片墙数据 data/photos.json。
只收录 photos/ 里的图片，不会引用笔记插图 images/。

年份（卷）判断优先级：
  1) photos/<四位年份>/... 子文件夹 —— 最直观，想改年份直接挪文件夹
  2) EXIF DateTimeOriginal
  3) 文件名里的日期（2026-05-01 / 20260501 / 2026_05_01）
  4) 文件修改时间

排序：data/photos.json 里已有的 order 字段优先（人工选片），
      其余按拍摄时间、文件名排序。重新运行时会保留手工写的
      order / place / at / year 字段，不会被覆盖。

地点：手工 place 优先；否则有 EXIF GPS 就显示经纬度；都没有就留空（前端不显示）。

用法：
    python tools/build_photos.py
"""
import io
import json
import os
import re
import struct
import datetime
from collections import Counter

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALBUM_ROOT = os.path.join(REPO, "photos")
OUT = os.path.join(REPO, "data", "photos.json")
EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif")

YEAR_DIR = re.compile(r"^(20\d{2})$")
FILE_DATE = re.compile(r"(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])")
EXIF_DATE = re.compile(r"(20\d{2}):(0[1-9]|1[0-2]):(0[1-9]|[12]\d|3[01])")


# ---------------- 最小 EXIF 解析（只取拍摄时间与 GPS） --------------
def _ifd(tiff, offset, big):
    """返回 (标签 -> 值, 下一个 IFD 偏移)。"""
    fmt = ">" if big else "<"
    try:
        count = struct.unpack(fmt + "H", tiff[offset:offset + 2])[0]
    except struct.error:
        return {}, 0
    out = {}
    for i in range(count):
        pos = offset + 2 + i * 12
        try:
            tag, typ, cnt = struct.unpack(fmt + "HHI", tiff[pos:pos + 8])
        except struct.error:
            break
        vpos = pos + 8
        if typ == 3:  # SHORT
            val = struct.unpack(fmt + "H", tiff[vpos:vpos + 2])[0]
        elif typ == 4:  # LONG
            val = struct.unpack(fmt + "I", tiff[vpos:vpos + 4])[0]
        elif typ == 5:  # RATIONAL
            try:
                p = struct.unpack(fmt + "I", tiff[vpos:vpos + 4])[0]
                vals = []
                for j in range(cnt):
                    num = struct.unpack(fmt + "I", tiff[p + j * 8:p + j * 8 + 4])[0]
                    den = struct.unpack(fmt + "I", tiff[p + j * 8 + 4:p + j * 8 + 8])[0]
                    vals.append(num / den if den else 0.0)
                val = vals
            except (struct.error, IndexError):
                val = None
        elif typ in (1, 2, 7):  # BYTE / ASCII
            size = cnt
            try:
                if size <= 4:
                    raw = tiff[vpos:vpos + size]
                else:
                    p = struct.unpack(fmt + "I", tiff[vpos:vpos + 4])[0]
                    raw = tiff[p:p + size]
                val = raw.decode("ascii", "ignore").strip("\x00 ") if typ == 2 else raw
            except struct.error:
                val = None
        else:
            val = None
        out[tag] = val
    try:
        nxt = struct.unpack(fmt + "I", tiff[offset + 2 + count * 12:offset + 6 + count * 12])[0]
    except struct.error:
        nxt = 0
    return out, nxt


def read_exif(path):
    """返回 (日期字符串 YYYY-MM-DD 或 None, 地点字符串 或 None)。"""
    if not path.lower().endswith((".jpg", ".jpeg")):
        return None, None
    try:
        with open(path, "rb") as f:
            data = f.read()
    except OSError:
        return None, None
    if not data.startswith(b"\xff\xd8"):
        return None, None
    i, tiff = 2, None
    while i + 4 < len(data):
        if data[i] != 0xFF:
            break
        marker = data[i + 1]
        if marker == 0xD9 or marker == 0xDA:
            break
        try:
            size = struct.unpack(">H", data[i + 2:i + 4])[0]
        except struct.error:
            break
        if marker == 0xE1 and data[i + 4:i + 10] == b"Exif\x00\x00":
            tiff = data[i + 10:i + 2 + size]
            break
        i += 2 + size
    if not tiff:
        return None, None

    big = tiff[:2] == b"MM"
    try:
        ifd0_off = struct.unpack((">" if big else "<") + "I", tiff[4:8])[0]
        ifd0, _ = _ifd(tiff, ifd0_off, big)
    except struct.error:
        return None, None

    date = None
    exif_off = ifd0.get(0x8769)
    if isinstance(exif_off, int) and exif_off:
        exif, _ = _ifd(tiff, exif_off, big)
        raw = exif.get(0x9003) or exif.get(0x9004)  # DateTimeOriginal / Digitized
        if isinstance(raw, str):
            m = EXIF_DATE.search(raw)
            if m:
                date = "%s-%s-%s" % m.groups()
    if not date:
        raw = ifd0.get(0x0132)
        if isinstance(raw, str):
            m = EXIF_DATE.search(raw)
            if m:
                date = "%s-%s-%s" % m.groups()

    gps_off = ifd0.get(0x8825)
    gps = None
    if isinstance(gps_off, int) and gps_off:
        g, _ = _ifd(tiff, gps_off, big)
        lat, lon = g.get(0x0002), g.get(0x0004)
        if isinstance(lat, list) and isinstance(lon, list) and len(lat) >= 3 and len(lon) >= 3:
            def deg(vals):
                return vals[0] + vals[1] / 60.0 + vals[2] / 3600.0
            la = deg(lat) * (-1 if str(g.get(0x0001)) == "S" else 1)
            lo = deg(lon) * (-1 if str(g.get(0x0003)) == "W" else 1)
            gps = "%.4f°%s, %.4f°%s" % (abs(la), "N" if la >= 0 else "S",
                                        abs(lo), "E" if lo >= 0 else "W")
    return date, gps


# ---------------- 扫描与合并 --------------
def iter_images():
    if not os.path.isdir(ALBUM_ROOT):
        return
    for root, dirs, files in os.walk(ALBUM_ROOT):
        dirs.sort()
        for f in sorted(files):
            if f.lower().endswith(EXTS):
                full = os.path.join(root, f)
                rel = os.path.relpath(full, REPO).replace("\\", "/")
                sub = os.path.relpath(full, ALBUM_ROOT).replace("\\", "/")
                yield full, rel, sub


def load_old():
    try:
        with io.open(OUT, encoding="utf-8") as f:
            data = json.load(f)
        return {p.get("src"): p for p in data.get("photos", []) if p.get("src")}
    except (OSError, ValueError):
        return {}


def build():
    old = load_old()
    photos = []
    from_exif = 0
    for full, rel, sub in iter_images():
        parts = sub.split("/")
        year = None
        if len(parts) > 1 and YEAR_DIR.match(parts[0]):
            year = int(parts[0])

        exif_date, gps_place = read_exif(full)
        if exif_date:
            from_exif += 1

        at = exif_date
        if not at:
            m = FILE_DATE.search(parts[-1])
            if m:
                at = "%s-%s-%s" % m.groups()
        if not at:
            at = datetime.date.fromtimestamp(os.path.getmtime(full)).isoformat()

        if not year:
            year = int(at[:4])

        keep = old.get(rel, {})
        # 手工字段优先，其次自动识别结果
        at = str(keep.get("at") or at)
        if keep.get("year"):
            try:
                year = int(keep["year"])
            except (TypeError, ValueError):
                pass
        place = keep.get("place") or gps_place or ""
        item = {"src": rel, "year": year, "at": at}
        if place:
            item["place"] = place
        if isinstance(keep.get("order"), (int, float)):
            item["order"] = keep["order"]
        photos.append(item)

    def sort_key(p):
        # 人工 order 最优先；其次文件名数字前缀（01-、02_）；其余按拍摄时间
        name = p["src"].rsplit("/", 1)[-1]
        m = re.match(r"^(\d{1,3})[-_]", name)
        if isinstance(p.get("order"), (int, float)):
            return (0, p["order"], p.get("at") or "", p["src"])
        if m:
            return (1, int(m.group(1)), p.get("at") or "", p["src"])
        return (2, 0, p.get("at") or "", p["src"])

    photos.sort(key=sort_key)
    volumes = [{"year": y, "count": c} for y, c in sorted(Counter(p["year"] for p in photos).items(), reverse=True)]

    payload = {"total": len(photos), "volumes": volumes, "photos": photos}
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as fp:
        fp.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")

    print("已写入 %d 张照片 -> data/photos.json" % len(photos))
    if photos:
        missing = len(photos) - from_exif
        print("EXIF 拍摄时间可用 %d/%d（%d%% 缺失，已回退文件名/修改时间）"
              % (from_exif, len(photos), round(missing * 100.0 / len(photos)))
        )
        print("年份分卷：" + "、".join("%d(%d)" % (v["year"], v["count"]) for v in volumes))
    else:
        print("photos/ 目前为空，已保留空态数据。")


if __name__ == "__main__":
    build()
