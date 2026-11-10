#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
blocks.json + image_map.json -> web/data/manual.js（供纯静态网页直接打开，无需服务器）

用法：
    python tools/build_web_data.py --src tools/extracted --web web
    python tools/build_web_data.py --src tools/extracted --web web --no-copy-images

产物：
    web/data/manual.js     window.MANUAL_DOC = {meta, sections:[...]}（标题树 + 段落 + 表格 + 图片）
    web/images/*.webp      图片（从 <src>/images 复制，文件名保持不变）
"""
import argparse
import json
import re
import shutil
import time
from pathlib import Path

IMG_TOKEN = re.compile(r"\[\[IMG:(rId\d+)\]\]")


def heading_key(text, level):
    return "%d-%s" % (level, text)


def build_sections(blocks, rid2file):
    """把线性块序列转成章节树：{id, level, title, path, body:[...]}"""
    sections = []
    stack = []          # 当前标签页栈：[{id, level, title}]
    cur = None
    counters = {}

    def new_section(level, title):
        idx = len(sections) + 1
        sid = "s%03d" % idx
        counters[level] = counters.get(level, 0) + 1
        for k in [k for k in counters if k > level]:
            counters.pop(k, None)
        path = " / ".join([s["title"] for s in stack] + [title])
        sec = {"id": sid, "level": level, "title": title, "path": path, "body": []}
        sections.append(sec)
        while stack and stack[-1]["level"] >= level:
            stack.pop()
        stack.append({"id": sid, "level": level, "title": title})
        return sec

    def images_of(rids):
        out = []
        for rid in rids:
            f = rid2file.get(rid)
            if f:
                out.append(f)
        return out

    for b in blocks:
        if b["type"] == "para":
            level = b.get("level") or 0
            raw = b.get("text") or ""
            imgs = images_of(b.get("images") or [])
            text = IMG_TOKEN.sub("", raw).strip()
            if level and text:
                cur = new_section(level, text)
                if imgs:
                    cur["body"].append({"t": "img", "src": imgs, "cap": ""})
                continue
            if not text and not imgs:
                continue
            if cur is None:
                cur = new_section(0, "封面与目录")
            if imgs and not text:
                cur["body"].append({"t": "img", "src": imgs, "cap": ""})
            if text:
                cur["body"].append({"t": "p", "text": text,
                                    "img": imgs[0] if imgs else ""})
        else:
            if cur is None:
                cur = new_section(0, "封面与目录")
            rows = []
            for row in b["rows"]:
                cells = []
                for c in row:
                    files = [rid2file[r] for r in IMG_TOKEN.findall(c) if r in rid2file]
                    cells.append({"text": IMG_TOKEN.sub("", c).strip(), "img": files})
                rows.append(cells)
            cur["body"].append({"t": "table", "rows": rows})
    return sections


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="tools/extracted")
    ap.add_argument("--web", default="web")
    ap.add_argument("--no-copy-images", action="store_true")
    a = ap.parse_args()

    src = Path(a.src)
    web = Path(a.web)
    data_dir = web / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    blocks = json.loads((src / "blocks.json").read_text(encoding="utf-8"))
    imap = json.loads((src / "image_map.json").read_text(encoding="utf-8")) if (src / "image_map.json").exists() else []

    rid2file = {}
    seq2file = {}
    for item in imap:
        if item.get("file"):
            rid2file.setdefault(item["rId"], item["file"])
            seq2file[str(item.get("seq"))] = item["file"]

    sections = build_sections(blocks, rid2file)
    doc = {
        "meta": {
            "source": "成品轴承操作手册细化版本.docx",
            "generated": time.strftime("%Y-%m-%d %H:%M"),
            "blocks": len(blocks),
            "sections": len(sections),
            "images": len(imap),
        },
        "sections": sections,
    }
    js = "window.MANUAL_DOC = " + json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (data_dir / "manual.js").write_text(js, encoding="utf-8")
    (data_dir / "manual.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")

    img_js = "window.IMG_INDEX = " + json.dumps(seq2file, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (data_dir / "images.js").write_text(img_js, encoding="utf-8")

    copied = 0
    if not a.no_copy_images:
        src_img = src / "images"
        dst_img = web / "images"
        if src_img.is_dir():
            dst_img.mkdir(parents=True, exist_ok=True)
            for f in src_img.iterdir():
                if f.is_file():
                    shutil.copy2(f, dst_img / f.name)
                    copied += 1

    print("sections :", len(sections))
    print("manual.js: %.1f MB" % ((data_dir / "manual.js").stat().st_size / 1e6))
    print("images   :", copied)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
