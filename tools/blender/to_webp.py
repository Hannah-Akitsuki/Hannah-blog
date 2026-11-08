# -*- coding: utf-8 -*-
"""把 Blender 渲染出的 RGBA PNG 转成带透明通道的 WebP（静态兜底图）。"""
import io
import os
import sys

from PIL import Image

SCENES = ("hero", "music", "wall")


def main():
    repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    src_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(repo, ".tmp-render")
    dst_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(repo, "assets", "3d")
    os.makedirs(dst_dir, exist_ok=True)
    for name in SCENES:
        png = os.path.join(src_dir, name + ".png")
        if not os.path.exists(png):
            print("跳过（没有渲染图）：" + png)
            continue
        im = Image.open(png).convert("RGBA")
        out = os.path.join(dst_dir, name + ".webp")
        im.save(out, "WEBP", quality=88, method=6, exact=True)
        print("%s.webp  %dx%d  %.1f KB" % (name, im.width, im.height, os.path.getsize(out) / 1024.0))


if __name__ == "__main__":
    main()
