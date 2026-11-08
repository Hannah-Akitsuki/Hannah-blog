# -*- coding: utf-8 -*-
"""
构建期过滤日记：私密条目在写入站点数据前就被剔除，
不会出现在 data/diary.json，也不会出现在任何 JS 数据里。

用法：
  1. 把所有日记写到 data/diary-all.json（该文件已被 .gitignore 忽略）
     格式：[{"date":"2026-11-01","title":"标题","public":true,"body":"Markdown"}, ...]
  2. 运行：python tools/filter_diary.py
  3. 生成的 data/diary.json 只含 public=true 的条目，可安全提交
"""
import io, json, os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "data", "diary-all.json")
OUT = os.path.join(REPO, "data", "diary.json")

if not os.path.exists(SRC):
    print("未找到 data/diary-all.json，跳过（站点将继续使用现有 data/diary.json）")
    raise SystemExit(0)

with io.open(SRC, "r", encoding="utf-8-sig") as f:
    entries = json.load(f)

public = [e for e in entries if e.get("public") is True]
public.sort(key=lambda e: e.get("date", ""), reverse=True)

with io.open(OUT, "w", encoding="utf-8") as f:
    f.write(json.dumps(public, ensure_ascii=False, indent=2))

print("总条目 %d，公开 %d，已写入 data/diary.json" % (len(entries), len(public)))
