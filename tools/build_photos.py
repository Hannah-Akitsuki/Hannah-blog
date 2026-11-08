# -*- coding: utf-8 -*-
"""
扫描独立相册目录 photos/，生成照片墙数据 data/photos.json。
只收录 photos/ 里的图片，不会引用笔记插图 images/。

用法：把照片放进 photos/（可建子文件夹当相册），然后运行
    python tools/build_photos.py
"""
import io, json, os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALBUM_ROOT = os.path.join(REPO, "photos")
OUT = os.path.join(REPO, "data", "photos.json")
EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif")

photos = []
if os.path.isdir(ALBUM_ROOT):
    for name in sorted(os.listdir(ALBUM_ROOT)):
        d = os.path.join(ALBUM_ROOT, name)
        if os.path.isdir(d):
            for f in sorted(os.listdir(d)):
                if f.lower().endswith(EXTS):
                    photos.append({"src": "photos/%s/%s" % (name, f), "album": name})
        elif name.lower().endswith(EXTS):
            photos.append({"src": "photos/%s" % name, "album": "photos"})

with io.open(OUT, "w", encoding="utf-8") as fp:
    fp.write(json.dumps({"total": len(photos), "photos": photos}, ensure_ascii=False, indent=2))

print("已写入 %d 张照片 -> data/photos.json" % len(photos))
