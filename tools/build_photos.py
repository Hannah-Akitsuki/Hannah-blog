# -*- coding: utf-8 -*-
"""
扫描 images/ 目录，重新生成 data/photos.json（照片墙数据源）。
新增照片后运行一次：python tools/build_photos.py
"""
import io, json, os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(REPO, "images")
OUT = os.path.join(REPO, "data", "photos.json")
EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif")

photos = []
for album in sorted(os.listdir(IMG)):
    d = os.path.join(IMG, album)
    if not os.path.isdir(d):
        continue
    for f in sorted(os.listdir(d)):
        if f.lower().endswith(EXTS):
            photos.append({"src": "images/%s/%s" % (album, f), "album": album})

with io.open(OUT, "w", encoding="utf-8") as fp:
    fp.write(json.dumps({"total": len(photos), "photos": photos}, ensure_ascii=False, separators=(",", ":")))

print("已写入 %d 张照片 -> data/photos.json" % len(photos))
