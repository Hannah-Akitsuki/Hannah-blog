# -*- coding: utf-8 -*-
"""
从 articles/*.md 的 front matter 生成 RSS 2.0 订阅源 feed.xml。

- 只收录 public: true 且已到 publishAfter（没有该字段视为已公开）的文章
- 摘要取正文开头若干字，剔除 Markdown 符号、图片与链接地址
- 文章没有独立 URL（hash 路由），因此 item 链接指向 #note-<id>，guid 用固定字符串

用法：python tools/build_feed.py
"""
import datetime
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_manifest import read_text, split_front_matter  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTICLES = os.path.join(REPO, "articles")
OUT = os.path.join(REPO, "feed.xml")

SITE_URL = "https://hannah-akitsuki.github.io/Hannah-blog/"
FEED_URL = SITE_URL + "feed.xml"
TITLE = "寒鹤 · 个人博客"
DESC = "课程笔记、阅读归档、照片墙与自制小工具。"
SUMMARY_CHARS = 120

WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
         "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def xml_escape(text):
    return (str(text).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#39;"))


def rfc822(date_str):
    try:
        d = datetime.datetime.strptime(str(date_str)[:10], "%Y-%m-%d")
    except (TypeError, ValueError):
        d = datetime.datetime.now()
    return "%s, %02d %s %d 00:00:00 +0800" % (
        WEEK[d.weekday()], d.day, MONTH[d.month - 1], d.year)


def plain_summary(body):
    text = re.sub(r"```[\s\S]*?```", " ", body)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"^[#>\s]+", " ", text, flags=re.M)
    text = re.sub(r"[*_`~|\\]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > SUMMARY_CHARS:
        text = text[:SUMMARY_CHARS].rstrip() + "…"
    return text


def is_published(fm, today):
    if fm.get("public") is False:
        return False
    after = str(fm.get("publishAfter") or "").strip()
    return not after or after <= today


def build():
    today = datetime.date.today().isoformat()
    items = []
    if os.path.isdir(ARTICLES):
        for name in sorted(os.listdir(ARTICLES)):
            if not name.lower().endswith(".md"):
                continue
            fm, body = split_front_matter(read_text(os.path.join(ARTICLES, name)))
            if not fm or not is_published(fm, today):
                continue
            doc_id = str(fm.get("id") or os.path.splitext(name)[0]).strip()
            title = str(fm.get("title") or os.path.splitext(name)[0]).strip()
            date = str(fm.get("date") or "").strip()
            items.append({
                "id": doc_id,
                "title": title,
                "date": date,
                "link": SITE_URL + "#note-" + doc_id,
                "summary": plain_summary(body),
            })

    items.sort(key=lambda x: x["date"], reverse=True)
    last = items[0]["date"] if items else today

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "  <channel>",
        "    <title>%s</title>" % xml_escape(TITLE),
        "    <link>%s</link>" % xml_escape(SITE_URL),
        "    <description>%s</description>" % xml_escape(DESC),
        "    <language>zh-CN</language>",
        "    <lastBuildDate>%s</lastBuildDate>" % rfc822(last),
        '    <atom:link href="%s" rel="self" type="application/rss+xml"/>' % xml_escape(FEED_URL),
    ]
    for it in items:
        lines += [
            "    <item>",
            "      <title>%s</title>" % xml_escape(it["title"]),
            "      <link>%s</link>" % xml_escape(it["link"]),
            '      <guid isPermaLink="false">hanhe:note:%s</guid>' % xml_escape(it["id"]),
            "      <pubDate>%s</pubDate>" % rfc822(it["date"]),
            "      <description>%s</description>" % xml_escape(it["summary"]),
            "    </item>",
        ]
    lines += ["  </channel>", "</rss>", ""]

    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    print("feed.xml：%d 篇文章（已排除未公开/未到期的文章）" % len(items))


if __name__ == "__main__":
    build()
