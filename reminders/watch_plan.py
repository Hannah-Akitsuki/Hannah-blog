# -*- coding: utf-8 -*-
"""寒鹤博客 · 本地计划提醒（只用 Python 标准库）

用法：把站内「计划」导出的 JSON 放到本目录的 plan.json，双击 run_reminder.bat。
每 60 秒重新读取一次 plan.json；到点弹窗 + 响铃，可「稍后提醒 5 分钟」。
提醒依赖电脑不睡眠、这个窗口一直开着。详细说明见 README.md。
"""
import json
import os
import threading
import time
import tkinter as tk
from datetime import datetime, timedelta

try:
    import winsound
except ImportError:  # 非 Windows 下仍可运行，只是没有声音
    winsound = None

BASE = os.path.dirname(os.path.abspath(__file__))
PLAN_PATH = os.path.join(BASE, "plan.json")
POLL_MS = 60_000          # 每 60 秒检查一次
LATE_WINDOW = timedelta(minutes=15)   # 电脑休眠醒来后，15 分钟内仍补提醒


def load_items():
    if not os.path.exists(PLAN_PATH):
        return None, "找不到 plan.json：请先导出 JSON 并放到 reminders/plan.json"
    try:
        with open(PLAN_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        items = data.get("items", []) if isinstance(data, dict) else data
        good = [it for it in items
                if isinstance(it, dict) and it.get("date") and it.get("start") and it.get("title")]
        return good, "已读取 %d 项计划" % len(good)
    except Exception as e:
        return None, "读取 plan.json 失败：%s" % e


def item_dt(it):
    try:
        return datetime.strptime(str(it["date"]) + " " + str(it["start"]), "%Y-%m-%d %H:%M")
    except Exception:
        return None


def item_key(it):
    return "%s|%s|%s|%s" % (it.get("id", ""), it.get("date", ""), it.get("start", ""), it.get("title", ""))


class ReminderApp:
    def __init__(self, root):
        self.root = root
        self.items = []
        self.plan_due = {}
        self.snooze = {}
        self.alerted = set()

        root.title("寒鹤 · 计划提醒")
        root.geometry("580x420")
        root.minsize(460, 320)
        root.attributes("-topmost", True)

        top = tk.Frame(root)
        top.pack(fill="x", padx=14, pady=(12, 4))
        self.status = tk.Label(top, text="正在读取…", anchor="w", justify="left")
        self.status.pack(side="left", fill="x", expand=True)
        tk.Button(top, text="打开目录", command=lambda: os.startfile(BASE)).pack(side="right")
        tk.Button(top, text="重新加载", command=self.reload).pack(side="right", padx=6)

        self.next_lbl = tk.Label(root, text="下次提醒：—", anchor="w",
                                 font=("Microsoft YaHei", 11, "bold"))
        self.next_lbl.pack(fill="x", padx=14)

        box = tk.LabelFrame(root, text="即将到来", padx=8, pady=6)
        box.pack(fill="both", expand=True, padx=14, pady=(8, 6))
        self.listbox = tk.Listbox(box, height=9, activestyle="none")
        self.listbox.pack(fill="both", expand=True)

        tip = tk.Label(root,
                       text="到点会弹窗并响铃，可稍后 5 分钟。提醒依赖电脑不睡眠、这个窗口一直开着。",
                       anchor="w", fg="#777")
        tip.pack(fill="x", padx=14, pady=(0, 10))

        self.reload()
        self.root.after(1200, self.tick)

    def log(self, msg):
        self.status.config(text="%s  ·  %s" % (datetime.now().strftime("%H:%M"), msg))

    def reload(self):
        items, msg = load_items()
        if items is None:
            self.items = []
            self.plan_due = {}
            self.listbox.delete(0, "end")
            self.next_lbl.config(text="下次提醒：—")
            self.log(msg)
            return
        self.items = items
        self.plan_due = {}
        today = datetime.now().date()
        for it in items:
            if str(it.get("status", "")) == "done":
                continue
            dt = item_dt(it)
            if not dt or dt.date() < today:
                continue
            self.plan_due[item_key(it)] = dt
        for key in list(self.snooze.keys()):
            if key not in self.plan_due:
                del self.snooze[key]
                self.alerted.discard(key)
        self.refresh_list()
        self.refresh_next()
        self.log(msg)

    def effective_due(self, key):
        return self.snooze.get(key) or self.plan_due[key]

    def refresh_list(self):
        self.listbox.delete(0, "end")
        now = datetime.now()
        rows = []
        for it in self.items:
            if str(it.get("status", "")) == "done":
                continue
            key = item_key(it)
            if key not in self.plan_due:
                continue
            due = self.effective_due(key)
            if due < now - LATE_WINDOW:
                continue
            label = "稍后 · " if key in self.snooze else ""
            rows.append((due, label + it["date"] + " " + it["start"] + "  " + it["title"]))
        rows.sort(key=lambda x: x[0])
        for _, text in rows[:8]:
            self.listbox.insert("end", text)
        if not rows:
            self.listbox.insert("end", "（今天没有待提醒的计划）")

    def refresh_next(self):
        now = datetime.now()
        pend = [(self.effective_due(k), k) for k in self.plan_due
                if k not in self.alerted and self.effective_due(k) >= now - LATE_WINDOW]
        if not pend:
            self.next_lbl.config(text="下次提醒：—")
            return
        due, key = min(pend)
        it = next((x for x in self.items if item_key(x) == key), None)
        if not it:
            self.next_lbl.config(text="下次提醒：—")
            return
        self.next_lbl.config(text="下次提醒：%s  %s  %s" % (due.strftime("%m-%d %H:%M"), it.get("start", ""), it.get("title", "")))

    def beep(self):
        if not winsound:
            return
        try:
            for _ in range(3):
                winsound.Beep(880, 350)
                time.sleep(0.22)
        except Exception:
            try:
                winsound.MessageBeep()
            except Exception:
                pass

    def alert(self, key, due):
        it = next((x for x in self.items if item_key(x) == key), None)
        if not it:
            return
        self.alerted.add(key)
        threading.Thread(target=self.beep, daemon=True).start()

        top = tk.Toplevel(self.root)
        top.title("计划提醒")
        top.attributes("-topmost", True)
        top.geometry("420x190+%d+%d" % (self.root.winfo_x() + 60, self.root.winfo_y() + 80))
        tk.Label(top, text="⏰ 计划提醒", font=("Microsoft YaHei", 14, "bold")).pack(pady=(18, 8))
        tk.Label(top, text="%s  %s" % (it.get("start", ""), it.get("title", "")),
                 font=("Microsoft YaHei", 12), wraplength=360, justify="center").pack(padx=16)
        tk.Label(top, text="%s（计划时间 %s）" % (it.get("date", ""), due.strftime("%H:%M")),
                 fg="#777").pack(pady=(6, 0))

        row = tk.Frame(top)
        row.pack(pady=14)

        def snooze():
            self.snooze[key] = datetime.now() + timedelta(minutes=5)
            self.alerted.discard(key)
            top.destroy()
            self.refresh_next()
            self.refresh_list()
            self.log("已稍后提醒 5 分钟：" + it.get("title", ""))

        def dismiss():
            top.destroy()
            self.refresh_next()

        tk.Button(row, text="稍后 5 分钟", width=12, command=snooze).pack(side="left", padx=8)
        tk.Button(row, text="知道了", width=10, command=dismiss).pack(side="left", padx=8)

    def check_due(self):
        now = datetime.now()
        for key in list(self.plan_due.keys()):
            if key in self.alerted:
                continue
            due = self.effective_due(key)
            if now >= due and now - due <= LATE_WINDOW:
                self.alert(key, due)
        self.refresh_next()
        self.refresh_list()

    def tick(self):
        self.reload()
        self.check_due()
        self.root.after(POLL_MS, self.tick)


def main():
    root = tk.Tk()
    ReminderApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
