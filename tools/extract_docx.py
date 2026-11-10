#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
docx -> 结构化文本 + 图片（网页知识库数据前置工具）

用法：
    python tools/extract_docx.py --docx "成品轴承操作手册细化版本.docx" --out tools/extracted
    python tools/extract_docx.py --docx xxx.docx --out out --no-images
    python tools/extract_docx.py --docx xxx.docx --out out --max-width 1200 --quality 82

输出：
    <out>/manual.txt      带 [H1]/[TABLE]/[IMG] 标记的纯文本（便于人工通读、版本 diff）
    <out>/blocks.json     按文档顺序的结构化块：段落(含标题级别)/表格(二维单元格)/图片占位
    <out>/images/*.png|webp  抽取并压缩后的图片，文件名带顺序号，便于和文本对齐
    <out>/image_map.json  图片 -> 所在段落序号 + 前文上下文

只依赖标准库 + Pillow（压缩图片时需要；--no-images 或 --keep-original 可不用）
"""
import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

BLOCK_RE = re.compile(r"<w:tbl>.*?</w:tbl>|<w:p[\s>].*?</w:p>", re.S)
TEXT_RE = re.compile(r"<w:t(?:\s[^>]*)?>(.*?)</w:t>|<w:tab/>|<w:br/>|<w:drawing>", re.S)
ROW_RE = re.compile(r"<w:tr[\s>].*?</w:tr>", re.S)
CELL_RE = re.compile(r"<w:tc[\s>].*?</w:tc>", re.S)
STYLE_RE = re.compile(r'<w:pStyle\s+w:val="([^"]+)"')
NUM_RE = re.compile(r'<w:numPr>.*?</w:numPr>', re.S)
EMBED_RE = re.compile(r'r:embed="([^"]+)"')

ENTITIES = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'"}


def unescape(s: str) -> str:
    for k, v in ENTITIES.items():
        s = s.replace(k, v)
    return s


def inline_text(xml: str) -> str:
    """按顺序拼接段落内的文字/制表符/换行，图片转成 [[IMG:rId]] 占位。"""
    out = []
    for m in TEXT_RE.finditer(xml):
        token = m.group(0)
        if token.startswith("<w:t>") or token.startswith("<w:t "):
            out.append(unescape(m.group(1)))
        elif token == "<w:tab/>":
            out.append("\t")
        elif token == "<w:br/>":
            out.append("\n")
        else:  # <w:drawing> 内可能有多张图
            end = xml.find("</w:drawing>", m.end())
            chunk = xml[m.start(): end if end > 0 else m.end()]
            for rid in EMBED_RE.findall(chunk):
                out.append("[[IMG:%s]]" % rid)
    return "".join(out).strip()


def load_styles(z) -> tuple:
    """styleId -> 标题级别（heading N），以及目录（toc*）样式集合。"""
    sx = z.read("word/styles.xml").decode("utf-8", "ignore")
    heading, toc = {}, set()
    for m in re.finditer(r'<w:style [^>]*w:styleId="([^"]+)"[^>]*>(.*?)</w:style>', sx, re.S):
        sid, body = m.group(1), m.group(2)
        nm = re.search(r'<w:name w:val="([^"]+)"', body)
        name = (nm.group(1) if nm else "").strip().lower()
        if name.startswith("toc"):
            toc.add(sid)
            continue
        hm = re.match(r"heading (\d+)$", name)
        if hm:
            heading[sid] = int(hm.group(1))
            continue
        ol = re.search(r'<w:outlineLvl w:val="(\d+)"', body)
        if ol and int(ol.group(1)) < 9:
            heading[sid] = int(ol.group(1)) + 1
    return heading, toc


def style_of(xml: str) -> str:
    m = STYLE_RE.search(xml)
    return m.group(1) if m else ""


# ---------- 自动编号（Word 列表编号，如「一、」「1.」） ----------
CN_DIGITS = "一二三四五六七八九"


def fmt_number(n: int, fmt: str) -> str:
    if fmt in ("decimalZero",):
        return "%02d" % n
    if fmt in ("japaneseCounting", "chineseCounting", "chineseCountingThousand",
               "ideographTraditional", "ideographLegalTraditional", "taiwaneseCounting"):
        if n <= 0:
            return str(n)
        if n <= 9:
            return CN_DIGITS[n - 1]
        if n == 10:
            return "十"
        if n < 20:
            return "十" + CN_DIGITS[n - 11]
        if n < 100:
            return CN_DIGITS[n // 10 - 1] + "十" + (CN_DIGITS[n % 10 - 1] if n % 10 else "")
        return str(n)
    if fmt == "lowerLetter":
        return chr(ord("a") + (n - 1) % 26)
    if fmt == "upperLetter":
        return chr(ord("A") + (n - 1) % 26)
    if fmt in ("lowerRoman", "upperRoman"):
        table = [(1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"),
                 (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")]
        s, v = "", n
        for base, sym in table:
            while v >= base:
                s += sym
                v -= base
        return s.upper() if fmt == "upperRoman" else s
    if fmt == "bullet":
        return ""
    return str(n)


def load_numbering(z) -> dict:
    """numId -> {ilvl: (numFmt, lvlText, start)}"""
    try:
        nx = z.read("word/numbering.xml").decode("utf-8", "ignore")
    except KeyError:
        return {}
    abs_map = {}
    for m in re.finditer(r'<w:abstractNum w:abstractNumId="(\d+)"[^>]*>(.*?)</w:abstractNum>', nx, re.S):
        levels = {}
        for lm in re.finditer(r'<w:lvl w:ilvl="(\d)"[^>]*>(.*?)</w:lvl>', m.group(2), re.S):
            body = lm.group(2)
            fmt = re.search(r'<w:numFmt w:val="([^"]+)"', body)
            txt = re.search(r'<w:lvlText w:val="([^"]*)"', body)
            stt = re.search(r'<w:start w:val="(\d+)"', body)
            levels[int(lm.group(1))] = (fmt.group(1) if fmt else "decimal",
                                        txt.group(1) if txt else "",
                                        int(stt.group(1)) if stt else 1)
        abs_map[m.group(1)] = levels
    nums = {}
    for m in re.finditer(r'<w:num w:numId="(\d+)"[^>]*>(.*?)</w:num>', nx, re.S):
        a = re.search(r'<w:abstractNumId w:val="(\d+)"', m.group(2))
        if a:
            nums[m.group(1)] = abs_map.get(a.group(1), {})
    return nums


def num_of(ppr: str, nums: dict, counters: dict) -> str:
    """按顺序推进计数器，返回该段落的编号文本（如「一、」/「1.」）；无编号返回 ''。"""
    m = NUM_RE.search(ppr)
    if not m:
        return ""
    lv = re.search(r'<w:ilvl w:val="(\d+)"', m.group(0))
    nid = re.search(r'<w:numId w:val="(\d+)"', m.group(0))
    if not nid:
        return ""
    num_id = nid.group(1)
    ilvl = int(lv.group(1)) if lv else 0
    levels = nums.get(num_id)
    if not levels:
        return ""
    state = counters.setdefault(num_id, {})
    start = levels.get(ilvl, ("decimal", "", 1))[2]
    state[ilvl] = state.get(ilvl, start - 1) + 1
    for deeper in [k for k in state if k > ilvl]:
        del state[deeper]
    fmt, text, _ = levels.get(ilvl, ("decimal", "", 1))
    if fmt == "bullet" or not text:
        return ""

    def repl(mm):
        i = int(mm.group(1)) - 1
        lv_fmt, _, lv_start = levels.get(i, ("decimal", "", 1))
        val = state.get(i, lv_start)
        return fmt_number(val, lv_fmt)

    return re.sub(r"%(\d)", repl, text)


def parse_docx(docx_path: Path, keep_toc: bool = False):
    with zipfile.ZipFile(docx_path) as z:
        xml = z.read("word/document.xml").decode("utf-8", "ignore")
        rels_xml = z.read("word/_rels/document.xml.rels").decode("utf-8", "ignore")
        rels = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels_xml))
        heading_map, toc_styles = load_styles(z)
        numbering = load_numbering(z)
        media = {n: z.read(n) for n in z.namelist()
                 if n.startswith("word/media/") and not n.endswith("/")}

    blocks, images = [], []
    counters = {}
    seq = 0
    for m in BLOCK_RE.finditer(xml):
        block = m.group(0)
        if block.startswith("<w:tbl>"):
            rows = []
            for row in ROW_RE.findall(block):
                cells = [inline_text(c) for c in CELL_RE.findall(row)]
                rows.append(cells)
                for c in CELL_RE.findall(row):
                    for rid in EMBED_RE.findall(c):
                        seq += 1
                        images.append({"seq": seq, "rId": rid, "target": rels.get(rid, ""),
                                       "context": " | ".join(x for x in cells if x)[:120],
                                       "block": len(blocks)})
            if any(any(c for c in r) for r in rows):
                blocks.append({"type": "table", "level": 0, "text": "", "rows": rows})
        else:
            text = inline_text(block)
            rids = EMBED_RE.findall(block)
            style = style_of(block)
            ppr_m = re.search(r"<w:pPr>.*?</w:pPr>", block, re.S)
            ppr = ppr_m.group(0) if ppr_m else ""
            label = num_of(ppr, numbering, counters)
            if not keep_toc and style in toc_styles:
                continue
            if label:
                text = label + " " + text if text else label.strip()
            if text or rids:
                blocks.append({"type": "para", "level": heading_map.get(style, 0),
                               "text": text, "images": rids, "style": style,
                               "num": label.strip()})
            if rids:
                ctx = [b["text"] for b in blocks if b["type"] == "para" and b["text"]][-2:]
                for rid in rids:
                    seq += 1
                    images.append({"seq": seq, "rId": rid, "target": rels.get(rid, ""),
                                   "context": " / ".join(ctx)[-120:],
                                   "block": len(blocks) - 1})
    return blocks, images, media



def write_outputs(blocks, images, media, out: Path, dump_images: bool,
                  max_width: int, quality: int, keep_original: bool):
    out.mkdir(parents=True, exist_ok=True)
    lines = []
    for b in blocks:
        if b["type"] == "para":
            if b["text"]:
                lines.append(("[H%d] " % b["level"] if b["level"] else "") + b["text"])
            for rid in b["images"]:
                lines.append("[[IMG:%s]]" % rid)
        else:
            lines.append("[TABLE]")
            for row in b["rows"]:
                lines.append(" | ".join(row))
            lines.append("[/TABLE]")
    (out / "manual.txt").write_text("\n".join(lines), encoding="utf-8")
    (out / "blocks.json").write_text(json.dumps(blocks, ensure_ascii=False, indent=1),
                                     encoding="utf-8")
    if not dump_images:
        return 0, 0

    img_dir = out / "images"
    img_dir.mkdir(exist_ok=True)
    try:
        from PIL import Image
        import io
    except ImportError:
        Image = None

    total_in = total_out = 0
    for item in images:
        target = item["target"].replace("\\", "/")
        name = target if target.startswith("word/") else "word/" + target
        data = media.get(name)
        if not data:
            item["file"] = ""
            continue
        ext = Path(name).suffix.lower().lstrip(".") or "png"
        stem = "img%03d_%s" % (item["seq"], item["rId"])
        total_in += len(data)
        payload, out_name = data, stem + "." + ext
        if Image and not keep_original:
            try:
                im = Image.open(io.BytesIO(data))
                if im.width > max_width:
                    ratio = max_width / float(im.width)
                    im = im.resize((max_width, max(1, int(im.height * ratio))), Image.LANCZOS)
                buf = io.BytesIO()
                if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
                    bg = Image.new("RGB", im.size, (255, 255, 255))
                    bg.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[-1])
                    im = bg
                else:
                    im = im.convert("RGB")
                im.save(buf, format="WEBP", quality=quality, method=4)
                payload, out_name = buf.getvalue(), stem + ".webp"
            except Exception:
                pass
        (img_dir / out_name).write_bytes(payload)
        item["file"] = "images/" + out_name
        total_out += len(payload)

    (out / "image_map.json").write_text(json.dumps(images, ensure_ascii=False, indent=1),
                                        encoding="utf-8")
    return total_in, total_out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--docx", required=True)
    ap.add_argument("--out", default="tools/extracted")
    ap.add_argument("--no-images", action="store_true")
    ap.add_argument("--keep-original", action="store_true", help="不压缩，原样导出")
    ap.add_argument("--max-width", type=int, default=1400)
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--keep-toc", action="store_true", help="保留目录段落（默认剔除）")
    a = ap.parse_args()

    blocks, images, media = parse_docx(Path(a.docx), a.keep_toc)
    tin, tout = write_outputs(blocks, images, media, Path(a.out), not a.no_images,
                              a.max_width, a.quality, a.keep_original)

    heads = [b for b in blocks if b["type"] == "para" and b["level"]]
    print("blocks     :", len(blocks))
    print("headings   :", len(heads), {i: sum(1 for x in heads if x["level"] == i) for i in range(1, 7)})
    print("tables     :", sum(1 for b in blocks if b["type"] == "table"))
    print("images     :", len(images), "| media in docx:", len(media))
    if not a.no_images:
        print("image size : %.1f MB -> %.1f MB" % (tin / 1e6, tout / 1e6))
    print("written to :", Path(a.out).resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main())
