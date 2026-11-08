# -*- coding: utf-8 -*-
"""
从文章 front matter 生成 manifest.json，并把公开日记汇总到 data/diary.json。

- 文章元数据来源：articles/*.md 的 YAML front matter（由 Pages CMS / 手动编辑写入）
- 旧数据保留：excerpt / images 若 front matter 没写，就沿用上一次 manifest.json 里的值
- 稳定深链：front matter 里的 legacyIndex 保留旧 #note-N 链接，新文章用 id（文件名去扩展名）
- 私密过滤：public: false 的文章不会写进 manifest，也不会出现在站点上
"""
import io
import json
import os
import re

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTICLES = os.path.join(REPO, "articles")
MANIFEST = os.path.join(REPO, "manifest.json")
DIARY_DIR = os.path.join(REPO, "diary")
DIARY_OUT = os.path.join(REPO, "data", "diary.json")


def read_text(path):
    with io.open(path, "r", encoding="utf-8-sig") as f:
        return f.read()


def split_front_matter(text):
    if text.startswith("\ufeff"):
        text = text.lstrip("\ufeff")
    if not text.startswith("---"):
        return {}, text
    lines = text.splitlines(True)
    if lines[0].strip() != "---":
        return {}, text
    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() in ("---", "..."):
            end = i
            break
    if end is None:
        return {}, text
    raw = lines[1:end]
    body = "".join(lines[end + 1:])
    if body.startswith("\r\n"):
        body = body[2:]
    elif body.startswith("\n"):
        body = body[1:]
    return parse_simple_yaml(raw), body


def parse_scalar(value, key=""):
    value = value.strip()
    if value[:1] in ('"', "'") and value[-1:] == value[:1] and len(value) >= 2:
        value = value[1:-1].replace(value[0] + value[0], value[0]).replace("\\n", "\n")
    elif value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        return [] if not inner else [parse_scalar(x) for x in inner.split(",") if x.strip()]
    elif value.lower() in ("true", "yes"):
        return True
    elif value.lower() in ("false", "no"):
        return False
    elif key in ("tags", "related") and "," in value:
        # 兼容 Pages CMS 里用逗号分隔的写法
        return [x.strip() for x in value.split(",") if x.strip()]
    return value


def parse_simple_yaml(lines):
    """只解析单层 YAML：标量 + 块状列表（tags / related 用）。"""
    data = {}
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
            i += 1
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value == "":
            items = []
            j = i + 1
            while j < len(lines) and lines[j].strip().startswith("- "):
                items.append(parse_scalar(lines[j].strip()[2:]))
                j += 1
            data[key] = items if items else ""
            i = j
            continue
        data[key] = parse_scalar(value, key)
        i += 1
    return data


def auto_excerpt(body):
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", body)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"[#>*_`\-]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:120]


def count_images(body):
    return len(re.findall(r"images/[^)\"'\\s]+", body))


WIKI_LINK = re.compile(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")


def extract_wikilinks(body):
    """只读解析正文里的 [[笔记名]] 双链，不改正文。"""
    out = []
    for m in WIKI_LINK.finditer(body):
        target = m.group(1).strip()
        if target and target not in out:
            out.append(target)
    return out


HEADING = re.compile(r"^(#{1,4})\s+(.+?)\s*#*\s*$")
SLUG_STRIP = re.compile(r"[，。！？、：；（）【】《》「」『』“”‘’\"'!?,.:;()\[\]<>/\\|@#$%^&*+=~`]")


def slugify(text):
    """与 app.js 的标题 slug 规则保持一致。"""
    s = re.sub(r"\*\*|__", "", text)
    s = re.sub(r"[\s\u3000]+", "-", s)
    s = SLUG_STRIP.sub("", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "section"


def extract_sections(body, title=""):
    """只读解析正文标题，供命令面板搜索与跳转（不改正文）。"""
    out = []
    used = {}
    first = True
    for line in body.splitlines():
        m = HEADING.match(line.strip())
        if not m:
            continue
        level = len(m.group(1))
        text = m.group(2)
        text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
        text = re.sub(r"\*\*|__|`", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            continue
        if first:
            first = False
            if level == 1 and title and (title in text or text in title):
                continue
        slug = slugify(text)
        if slug in used:
            used[slug] += 1
            slug = "%s-%d" % (slug, used[slug])
        else:
            used[slug] = 1
        out.append({"t": text, "slug": slug})
    return out


def as_list(value):
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    if isinstance(value, str):
        return [x.strip() for x in re.split(r"[,，]", value) if x.strip()]
    return []


def load_previous():
    if not os.path.exists(MANIFEST):
        return {}
    try:
        with io.open(MANIFEST, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
        return {d.get("file"): d for d in data if d.get("file")}
    except Exception:
        return {}


def build_manifest():
    prev = load_previous()
    entries = []
    if not os.path.isdir(ARTICLES):
        return
    for name in sorted(os.listdir(ARTICLES)):
        if not name.lower().endswith(".md"):
            continue
        path = os.path.join(ARTICLES, name)
        file_key = "articles/" + name
        fm, body = split_front_matter(read_text(path))
        old = prev.get(file_key, {})

        if not fm:
            print("跳过（没有 front matter）：" + name)
            continue
        if fm.get("public") is False:
            continue

        title = str(fm.get("title") or old.get("title") or os.path.splitext(name)[0]).strip()
        entry = {
            "id": str(fm.get("id") or old.get("id") or os.path.splitext(name)[0]).strip(),
            "title": title,
            "file": file_key,
            "date": str(fm.get("date") or old.get("date") or "").strip(),
            "excerpt": str(fm.get("excerpt") or old.get("excerpt") or auto_excerpt(body)).strip(),
        }
        if fm.get("category"):
            entry["category"] = str(fm["category"]).strip()
        elif old.get("category"):
            entry["category"] = old["category"]
        if fm.get("source") or old.get("source"):
            entry["source"] = str(fm.get("source") or old.get("source")).strip()
        if fm.get("cover") or old.get("cover"):
            entry["cover"] = str(fm.get("cover") or old.get("cover")).strip()
        if fm.get("publishAfter") or old.get("publishAfter"):
            entry["publishAfter"] = str(fm.get("publishAfter") or old.get("publishAfter")).strip()
        if "legacyIndex" in fm or "legacyIndex" in old:
            try:
                entry["legacyIndex"] = int(fm.get("legacyIndex", old.get("legacyIndex")))
            except (TypeError, ValueError):
                pass
        if "images" in old:
            entry["images"] = old["images"]
        else:
            n = count_images(body)
            if n:
                entry["images"] = n
        tags = as_list(fm.get("tags")) or as_list(old.get("tags"))
        if tags:
            entry["tags"] = tags
        related = as_list(fm.get("related")) or as_list(old.get("related"))
        if related:
            entry["related"] = related
        links = extract_wikilinks(body)
        if links:
            entry["links"] = links
        sections = extract_sections(body, title)
        if sections:
            entry["sections"] = sections
        entries.append(entry)

    # 新文章（无 legacyIndex）按日期倒序在前，旧文章按 legacyIndex 稳定排序在后
    fresh = [e for e in entries if "legacyIndex" not in e]
    legacy = sorted([e for e in entries if "legacyIndex" in e], key=lambda e: e["legacyIndex"])
    fresh.sort(key=lambda e: e.get("date", ""), reverse=True)
    ordered = fresh + legacy

    with io.open(MANIFEST, "w", encoding="utf-8") as f:
        f.write(json.dumps(ordered, ensure_ascii=False, indent=2))
        f.write("\n")
    print("manifest.json：共 %d 篇文章（新文章 %d，旧文章 %d）" % (len(ordered), len(fresh), len(legacy)))


def build_diary():
    if not os.path.isdir(DIARY_DIR):
        print("没有 diary/ 目录，跳过日记汇总")
        return
    existing = []
    if os.path.exists(DIARY_OUT):
        try:
            with io.open(DIARY_OUT, "r", encoding="utf-8-sig") as f:
                existing = json.load(f) or []
        except Exception:
            existing = []

    entries = list(existing)
    known = {(e.get("date"), e.get("title")) for e in entries}
    added = 0
    for name in sorted(os.listdir(DIARY_DIR)):
        if not name.lower().endswith(".md"):
            continue
        fm, body = split_front_matter(read_text(os.path.join(DIARY_DIR, name)))
        if fm.get("public") is not True:
            continue
        item = {
            "date": str(fm.get("date") or "").strip(),
            "title": str(fm.get("title") or os.path.splitext(name)[0]).strip(),
            "body": body,
        }
        if (item["date"], item["title"]) in known:
            continue
        entries.append(item)
        known.add((item["date"], item["title"]))
        added += 1

    entries.sort(key=lambda e: e.get("date", ""), reverse=True)
    with io.open(DIARY_OUT, "w", encoding="utf-8") as f:
        f.write(json.dumps(entries, ensure_ascii=False, indent=2))
        f.write("\n")
    print("data/diary.json：公开日记 %d 篇（本次新增 %d）" % (len(entries), added))


if __name__ == "__main__":
    build_manifest()
    build_diary()
