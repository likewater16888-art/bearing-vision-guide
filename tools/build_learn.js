/* 生成教学层数据 web/data/learn.js —— 覆盖手册全部 519 节
   用法：node tools/build_learn.js
   输入：web/data/manual.js（全文结构） + web/data/knowledge.js（教学层/参数/检测项…）
   输出：web/data/learn.js（window.LEARN）
*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const WEB = path.join(ROOT, "web");

function load(file, key) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  return sandbox.window[key];
}

const DOC = load(path.join(WEB, "data", "manual.js"), "MANUAL_DOC");
const KB = load(path.join(WEB, "data", "knowledge.js"), "KB");
const SECTIONS = DOC.sections || [];

/* ---------------- 维度判定（A成像 B参数 C配置 D定位 E排障 F红线 G基础） ---------------- */
const DIM_RULES = [
  ["F", /禁止|不得|严禁|不允许|必须|务必|红线|安全|急停|断电|关机/g],
  ["A", /亮度|曝光|成像|光源|反光|发黑|过曝|欠曝|模糊|清晰|像素|图像|画质|采图/g],
  ["B", /参数|阈值|置信|面积|个数|灵敏度|灰度差|等级|区间|推荐值|上下限/g],
  ["C", /检测项|勾选|开启|关闭|型号|阶段|密封圈|防尘盖|保持架|产品类型/g],
  ["D", /定位|校准|区域|偏移|中心|半径|字符识别|匹配|模板|坐标/g],
  ["E", /漏检|误判|误检|异常|排查|报警|故障|不稳|跳动|复判|卡料/g]
];

function dimOf(text) {
  let best = "G", bestN = 0;
  for (const [d, re] of DIM_RULES) {
    const m = String(text || "").match(re);
    const n = m ? m.length : 0;
    if (n > bestN) { best = d; bestN = n; }
  }
  return best;
}

function stationOf(p) {
  if (/五、\s*外径/.test(p)) return "od";
  if (/六、\s*内径/.test(p)) return "id";
  if (/七、\s*端面/.test(p)) return "face";
  return "";
}

/* ---------------- 文本工具 ---------------- */
function clean(s) {
  return String(s || "").replace(/\u00a0/g, " ")
    .replace(/^\s*[（(]?\d+[）).、]\s*/, "")
    .replace(/\s+/g, " ").trim();
}

function sentences(text) {
  return clean(text).split(/(?<=[。；！？;])/).map(s => s.trim()).filter(Boolean);
}

const KEY_RE = /禁止|不得|严禁|必须|务必|不要|优先|原则|判定|标准|范围|区间|等于|大于|小于|超过|低于|≤|≥|\d|注意|重点|核心|默认/;
/* 句首是承接词时脱离上下文看不懂，做题会歧义，直接舍弃 */
const BAD_START = /^(展开|同时|另外|因此|所以|然后|此时|这时|这样|并且|而且|否则|其次|最后|其中|如果|若|但|而|即|也|例如|比如|由此|具体|综上|总之|相反|反之)/;

function factsOf(section, limit) {
  const out = [];
  const push = t => {
    const s = clean(t).replace(/[；;，,、]+$/, "").replace(/\s+/g, " ").trim();
    if (s.length < 10 || s.length > 130) return;
    if (BAD_START.test(s)) return;
    if (out.indexOf(s) >= 0) return;
    if (out.length >= (limit || 3)) return;
    out.push(s);
  };
  const body = section.body || [];
  body.forEach(b => { if (b.t === "p" && KEY_RE.test(b.text)) sentences(b.text).forEach(push); });
  if (!out.length) {
    body.forEach(b => {
      if (b.t === "p") sentences(b.text).forEach(push);
      if (b.t === "table") b.rows.forEach(r => r.forEach(c => { if (c.text) push(c.text); }));
    });
  }
  if (!out.length) {
    // 仍无可用结论：放宽承接词与长度限制，取正文首段（截断到 120 字）
    body.forEach(b => {
      if (out.length) return;
      if (b.t === "p") {
        const s = clean(b.text);
        if (s.length >= 6) out.push(s.length > 120 ? s.slice(0, 118) + "…" : s);
      }
      if (b.t === "img" && b.cap) out.push(clean(b.cap));
    });
  }
  if (!out.length && section.title) out.push(clean(section.title));
  return out;
}

function imgsOf(section) {
  const out = [];
  (section.body || []).forEach(b => {
    if (b.t === "img") (b.src || []).forEach(f => out.push(f));
    if (b.t === "p" && b.img) out.push(b.img);
    if (b.t === "table") b.rows.forEach(r => r.forEach(c => (c.img || []).forEach(f => out.push(f))));
  });
  return out.filter((f, i, a) => a.indexOf(f) === i);
}

/* ---------------- 课程定义（覆盖全部小节） ---------------- */
const COURSES = [
  { id: "c00", title: "红线与安全（必过）", sub: "F 维 · 手册 8 条红线", mins: 8, prio: 0,
    intro: "调参之前先记住不能做什么：这 8 条是现场事故与批量漏检的主要来源，必须 100% 答对才算过。", match: [] },
  { id: "c01", title: "导学：这本手册怎么用", sub: "使用方式 · 培训目标", mins: 8, prio: 0,
    intro: "先弄清手册的组织方式与培训目标，知道遇到问题该翻哪一章。", match: ["1.1 设备用途与检测品类"] },
  { id: "c02", title: "设备总体概述", sub: "机型 · 相机布局 · 检测原理", mins: 14, prio: 0,
    intro: "两台机型差在哪、8 路相机怎么分工、复合检测靠什么原理成立 —— 后面所有调参都建立在这层认知上。", match: ["一、 设备总体概述"] },
  { id: "c03", title: "标准检测流程", sub: "上料 → 成像 → 判定 → 分流", mins: 6, prio: 0,
    intro: "一个工件从进到出经过哪几步，哪一步出错会表现成什么现象。", match: ["二、 设备标准检测流程"] },
  { id: "c04", title: "软件界面：主监控与统计", sub: "实时成像区 · 数据汇总", mins: 12, prio: 0,
    intro: "开机默认页面的每一块是干什么的，亮度条变色、状态字代表什么。", match: ["第一部分：主监控总界面", "第二部分：弹窗 1"] },
  { id: "c05", title: "软件界面：设置与图片仿真", sub: "全局设置 · 离线仿真", mins: 16, prio: 0,
    intro: "设置弹窗决定阶段数与张数，图片仿真决定你能不能不下线试参数。", match: ["第三部分：弹窗 2", "第四部分：弹窗 3", "第五部分：弹窗 4"] },
  { id: "c06", title: "型号管理", sub: "创建 · 复制 · 切换 · 删除", mins: 12, prio: 0,
    intro: "换产第一件事是型号；命名、复制、切换错了，会把好参数覆盖成废参数。", match: ["四、 型号管理"] },
  { id: "c07", title: "外径：检测逻辑与界面架构", sub: "手册 5.1–5.4", mins: 16, prio: 0,
    intro: "外径看什么、界面每个按钮在哪、识图时该盯哪一块。", match: ["5.1", "5.2", "5.3", "5.4"] },
  { id: "c08", title: "外径：三大参数与七步流程", sub: "手册 5.5–5.6", mins: 18, prio: 0,
    intro: "三个可调参数各自的物理意义，以及 0→1 调参不可颠倒的七步。", match: ["5.5", "5.6"] },
  { id: "c09", title: "外径：权责与口诀", sub: "手册 5.7–5.8", mins: 6, prio: 0,
    intro: "谁能动什么参数，以及现场背下来就能用的口诀。", match: ["5.7", "5.8"] },
  { id: "c10", title: "内径：检测逻辑与界面架构", sub: "手册 6.1–6.4", mins: 18, prio: 0,
    intro: "内径的四次定位与低曝光成像特点，是后面所有参数的依据。", match: ["6.1", "6.2", "6.3", "6.4"] },
  { id: "c11", title: "内径：AI 参数与亮暗斑参数", sub: "手册 6.5–6.6", mins: 10, prio: 0,
    intro: "AI 三件套与传统亮暗斑两套体系，各自的取值区间与调整方向。", match: ["6.5", "6.6"] },
  { id: "c12", title: "内径：八步流程", sub: "手册 6.7", mins: 20, prio: 0,
    intro: "内径 0→1 的八步标准流程，每一步的合格判据与常见跳步错误。", match: ["6.7"] },
  { id: "c13", title: "内径：权责划分", sub: "手册 6.8", mins: 6, prio: 0,
    intro: "内径调参的分工与交接要求。", match: ["6.8"] },
  { id: "c14", title: "端面：检测逻辑与模块", sub: "手册 7.1–7.5", mins: 20, prio: 0,
    intro: "端面是四个业务模块 + 底层开发模块，先分清模块再谈参数。", match: ["7.1", "7.2", "7.3", "7.4", "7.5"] },
  { id: "c15", title: "端面：基础识图", sub: "手册 7.6", mins: 6, prio: 0,
    intro: "端面成像里什么叫合格，颜色、形状、边界各代表什么。", match: ["7.6"] },
  { id: "c16", title: "端面：八步流程", sub: "手册 7.7", mins: 26, prio: 0,
    intro: "端面 0→1 的八步流程：先核成像、再开检测项、后调参数，顺序不可颠倒。", match: ["7.7"] },
  { id: "c17", title: "端面检测项：字符与宽度", sub: "手册 7.8.1–7.8.2", mins: 24, prio: 1,
    intro: "内外圈字符、中间盖字符与圈宽的识别、校验与常见漏判。", match: ["7.8.1", "7.8.2"] },
  { id: "c18", title: "端面检测项：倒角 · 平面印 · 圈不良", sub: "手册 7.8.3–7.8.5", mins: 22, prio: 1,
    intro: "倒角偏、平面印、暗圈/亮圈不良的判定标准与参数落点。", match: ["7.8.3", "7.8.4", "7.8.5"] },
  { id: "c19", title: "端面检测项：模型检测与边缘料伤", sub: "手册 7.8.6–7.8.7", mins: 24, prio: 1,
    intro: "阶段二内外圈模型检测与边缘料伤，是端面误判的两大高发区。", match: ["7.8.6", "7.8.7"] },
  { id: "c20", title: "端面检测项：暗斑", sub: "手册 7.8.8", mins: 20, prio: 1,
    intro: "一级/二级/三级暗斑的分级判据，混级会让误判成倍增长。", match: ["7.8.8"] },
  { id: "c21", title: "端面特有项：密封圈 · 防尘盖", sub: "手册 4.4.1–4.4.2", mins: 18, prio: 2,
    intro: "两类产品的特有检测项与阶段配置差异。", match: ["4.4.1", "4.4.2"] },
  { id: "c22", title: "端面特有项：金属 · 尼龙保持架", sub: "手册 4.4.3–4.4.4", mins: 14, prio: 2,
    intro: "保持架类型的检测项与打光差异，是最容易配错的一组。", match: ["4.4.3", "4.4.4"] },
  { id: "c23", title: "端面：学习总结", sub: "手册 7.9", mins: 5, prio: 0,
    intro: "端面一章的收口，用来自检是否真的掌握。", match: ["7.9"] },
  { id: "c24", title: "通用调试标准", sub: "八、 漏检/误检标准流程", mins: 12, prio: 0,
    intro: "全品类通用：双算法原理、漏检与误检的标准化处理流程。", match: ["八、 轴承全品类"] },
  { id: "c25", title: "误判漏检案例分析", sub: "九、 16 条实战案例", mins: 20, prio: 0,
    intro: "真实故障的现象 → 根因 → 动作，练的是排障路径而不是背结论。", match: ["九、 误判漏检案例"] }
];

function courseOf(section) {
  const p = section.path || "";
  const ordered = COURSES.slice().sort((a, b) => (b.prio - a.prio));
  for (const c of ordered) {
    if (!c.match.length) continue;
    for (const m of c.match) {
      // 按「路径分段起点」匹配，避免 6.5.1 被 5.1 抢走
      const re = new RegExp("(?:^|/)\\s*" + m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![0-9.])");
      if (re.test(p)) return c.id;
    }
  }
  if (/\/\s*7\.8/.test(p)) return "c17";
  return "c01";
}

/* ---------------- 知识点 / 卡片 / 题库 ---------------- */
const kps = {};
const cards = [];
const quiz = [];
const secCourse = {};
const structByCourse = {};

function addKp(kp) {
  if (!kps[kp.id]) kps[kp.id] = kp;
  if (kp.c) (structByCourse[kp.c] = structByCourse[kp.c] || []).push(kp.id);
  return kp;
}

function nkey(s) {
  return String(s == null ? "" : s)
    .replace(/[\s\u00a0]/g, "")
    .replace(/[（）()「」『』《》""''′″·•]/g, "");
}

function pickDistractors(pool, correct, n, keyFn) {
  const out = [];
  const seen = {};
  seen[nkey(correct)] = 1;
  for (let i = 0; i < pool.length && out.length < n; i++) {
    const v = keyFn ? keyFn(pool[i]) : pool[i];
    if (v == null || v === "" || v === correct) continue;
    const k = nkey(v);
    if (seen[k]) continue;
    seen[k] = 1;
    out.push(v);
  }
  return out;
}

function shuffle(arr, seed) {
  const a = arr.slice();
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

let qseq = 0;
function addQ(o) {
  qseq++;
  quiz.push({
    id: "q" + qseq, kp: o.kp, type: o.type || "single", dim: o.dim || "G",
    q: o.q, opts: o.opts, a: o.a, why: o.why || "", sec: o.sec || "", img: o.img || ""
  });
}

const ST_NAME = { od: "外径", id: "内径", face: "端面" };
const COURSE_OF_STATION = { od: "c08", id: "c11", face: "c14" };

/* 1) 全文小节 → 知识点（100% 覆盖） */
const secKp = {};
SECTIONS.forEach(sec => {
  const facts = factsOf(sec, 3);
  const imgs = imgsOf(sec);
  const cid = courseOf(sec);
  secCourse[sec.id] = cid;
  const kp = addKp({
    id: sec.id, t: clean(sec.title), sec: sec.id, path: sec.path, lv: sec.level,
    st: stationOf(sec.path), dim: dimOf(clean(sec.title) + " " + facts.join(" ")),
    c: cid, f: facts, img: imgs.slice(0, 2), src: "sec"
  });
  secKp[sec.id] = kp;
  cards.push({
    k: kp.id, f: "回忆《" + kp.t + "》：这一节的关键判据 / 结论是什么？",
    b: facts.slice(0, 2).join(" "), img: imgs[0] || ""
  });
});

/* 2) 结构化知识点（参数 / 检测项 / 流程 / 陷阱 / 红线 / 术语 / 型号 / 案例 / 阶段） */
KB.stations.forEach(st => {
  const sn = ST_NAME[st.id] || st.id;
  const cid = COURSE_OF_STATION[st.id] || "c07";
  (st.params || []).forEach((p, i) => {
    addKp({
      id: "p." + st.id + "." + i, t: sn + "参数 · " + p.name, dim: "B", c: cid,
      f: [p.name + "：" + (p.range || "") + (p.step ? "（" + p.step + "）" : ""), p.note || ""].filter(Boolean),
      sec: "", img: [], src: "param"
    });
  });
  ((st.teach && st.teach.items) || []).forEach((it, i) => {
    addKp({
      id: "i." + st.id + "." + i, t: it.name + "（" + (it.sys || "") + "）", dim: "C", c: cid,
      f: [it.at || "", (it.params || []).map(x => x.k + "：" + x.v).join("；")].filter(Boolean),
      sec: "", img: [], src: "item"
    });
  });
  ((st.teach && st.teach.brightness && st.teach.brightness.anchors) || []).forEach((a, i) => {
    addKp({
      id: "b." + st.id + "." + i, t: sn + "成像判据 · " + a.t, dim: "A", c: cid,
      f: [a.d], sec: "", img: [], src: "anchor"
    });
  });
  ((st.teach && st.teach.flow && st.teach.flow.steps) || []).forEach((s, i) => {
    addKp({
      id: "f." + st.id + "." + i, t: sn + "流程第 " + s.n + " 步 · " + s.t, dim: "E",
      c: st.id === "od" ? "c08" : (st.id === "id" ? "c12" : "c16"),
      f: (s.d || []).slice(0, 2), sec: s.sec || "", img: (s.imgs || []).map(x => x.f).slice(0, 1), src: "flow"
    });
  });
  (st.pitfalls || []).forEach((p, i) => {
    addKp({
      id: "t." + st.id + "." + i, t: "陷阱 · " + p.title, dim: "E", c: cid,
      f: [p.desc], sec: "", img: [], src: "pitfall"
    });
  });
  (st.stages || []).forEach((sg, i) => {
    addKp({
      id: "g." + st.id + "." + i, t: sn + " " + sg.no + "（" + (sg.light || "") + "）", dim: "A", c: cid,
      f: [sg.purpose || "", (sg.checks || []).join("；")], sec: "", img: [], src: "stage"
    });
  });
});

/* 全局：红线 / 术语 / 型号 / 案例 */
(KB.redlines || []).forEach((r, i) => {
  addKp({ id: "r." + i, t: "红线 · " + String(r).slice(0, 18), dim: "F", c: "c00", f: [r], sec: "", img: [], src: "redline" });
});
(KB.glossary || []).forEach((g, i) => {
  const cid = /端面/.test(g.name + g.mean) ? "c14" : (/内径/.test(g.name + g.mean) ? "c11" : (/外径/.test(g.name + g.mean) ? "c08" : "c02"));
  addKp({ id: "x." + i, t: "参数释义 · " + g.name + "（" + g.g + "）", dim: "B", c: cid, f: [g.range + " — " + g.mean], sec: "", img: [], src: "glossary" });
});
const MODELS = (KB.stations[2] && KB.stations[2].teach && KB.stations[2].teach.models) || [];
MODELS.forEach((m, i) => {
  addKp({
    id: "m." + i, t: "型号矩阵 · " + m.key, dim: "C", c: "c21",
    f: (m.stages || []).map(s => s.no + "：" + s.on), sec: "", img: [], src: "model"
  });
});
(KB.cases || []).forEach((c, i) => {
  addKp({
    id: "k." + i, t: "案例 · " + c.station + " " + c.title, dim: "E", c: "c25",
    f: [c.symptom, "根因：" + c.cause], sec: "", img: [], src: "case"
  });
});

/* 3) 结构化题库 */
const ALL_PARAMS = [];
KB.stations.forEach(st => (st.params || []).forEach((p, i) => ALL_PARAMS.push({
  st: st.id, sn: ST_NAME[st.id], i: i, name: p.name, range: p.range, note: p.note, step: p.step
})));
const ALL_ITEMS = [];
KB.stations.forEach(st => ((st.teach && st.teach.items) || []).forEach((it, i) => ALL_ITEMS.push({
  st: st.id, sn: ST_NAME[st.id], i: i, name: it.name, at: it.at, sys: it.sys, params: it.params, tips: it.tips
})));

/* 参数区间题 */
ALL_PARAMS.forEach((p, idx) => {
  const opts = shuffle([p.range].concat(pickDistractors(ALL_PARAMS, p.range, 3, x => x.range)), idx + 7);
  if (!p.range || opts.length < 4) return;
  addQ({
    kp: "p." + p.st + "." + p.i, type: "single", dim: "B",
    q: "《" + p.sn + "》参数「" + p.name + "」手册给出的合理区间是？",
    opts: opts, a: opts.indexOf(p.range),
    why: p.name + "：" + p.range + (p.step ? "（调节步长 " + p.step + "）" : "") + "。" + (p.note || ""),
    sec: ""
  });
});

/* 检测项归属题 */
ALL_ITEMS.forEach((it, idx) => {
  const pool = ALL_ITEMS.filter(x => x.at && x.at !== it.at).map(x => x.at);
  const opts = shuffle([it.at].concat(pickDistractors(pool, it.at, 3)), idx + 11);
  if (!it.at || opts.length < 4) return;
  addQ({
    kp: "i." + it.st + "." + it.i, type: "single", dim: "C",
    q: "《" + it.sn + "》检测项「" + it.name + "」在哪个阶段 / 位置检测？",
    opts: opts, a: opts.indexOf(it.at),
    why: it.name + " 属于「" + (it.sys || "") + "」体系；" + ((it.tips || [])[0] || ""),
    sec: ""
  });
});

/* 流程 / 成像判据 / 陷阱 / 红线 / 术语 / 型号 / 案例 / 阶段 */
KB.stations.forEach(st => {
  const steps = (st.teach && st.teach.flow && st.teach.flow.steps) || [];
  steps.forEach((s, i) => {
    const opts = shuffle([s.t].concat(pickDistractors(steps.map(x => x.t), s.t, 3)), i * 3 + 5);
    if (opts.length < 4) return;
    addQ({
      kp: "f." + st.id + "." + i, type: "single", dim: "E",
      q: "《" + ST_NAME[st.id] + "》标准化调参流程第 " + s.n + " 步做什么？",
      opts: opts, a: opts.indexOf(s.t),
      why: (s.d || []).join(" "), sec: s.sec || ""
    });
  });

  const as = (st.teach && st.teach.brightness && st.teach.brightness.anchors) || [];
  as.forEach((a, i) => {
    const opts = shuffle([a.d].concat(pickDistractors(as.map(x => x.d), a.d, 3)), i + 13);
    if (opts.length < 4) return;
    addQ({
      kp: "b." + st.id + "." + i, type: "single", dim: "A",
      q: "《" + ST_NAME[st.id] + "》「" + a.t + "」的成像判据是？",
      opts: opts, a: opts.indexOf(a.d), why: a.d, sec: ""
    });
  });

  (st.pitfalls || []).forEach((p, i) => {
    const opts = shuffle([p.desc].concat(pickDistractors((st.pitfalls || []).map(x => x.desc), p.desc, 3)), i + 17);
    if (opts.length < 4) return;
    addQ({
      kp: "t." + st.id + "." + i, type: "single", dim: "E",
      q: "《" + ST_NAME[st.id] + "》陷阱「" + p.title + "」的正确理解是？",
      opts: opts, a: opts.indexOf(p.desc), why: p.desc, sec: ""
    });
  });

  (st.stages || []).forEach((sg, i) => {
    const opts = shuffle([sg.light].concat(pickDistractors((st.stages || []).map(x => x.light), sg.light, 3)), i + 31);
    if (!sg.light || opts.length < 4) return;
    addQ({
      kp: "g." + st.id + "." + i, type: "single", dim: "A",
      q: "《" + ST_NAME[st.id] + "》" + sg.no + " 的打光方式是？",
      opts: opts, a: opts.indexOf(sg.light),
      why: sg.no + "：" + sg.light + "，" + (sg.shots || "") + "；用途：" + (sg.purpose || ""), sec: ""
    });
  });
});

(KB.redlines || []).forEach((r, i) => {
  const opts = shuffle([r].concat(pickDistractors(KB.checklist || [], r, 3)), i + 19);
  if (opts.length < 4) return;
  addQ({
    kp: "r." + i, type: "single", dim: "F",
    q: "下列哪一条属于手册明令禁止 / 必须执行的调参红线？",
    opts: opts, a: opts.indexOf(r),
    why: "红线原文：" + r + "。红线不满足时，合格率再高也不允许量产。", sec: ""
  });
});

(KB.glossary || []).forEach((g, i) => {
  const opts = shuffle([g.range].concat(pickDistractors((KB.glossary || []).map(x => x.range), g.range, 3)), i + 23);
  if (opts.length < 4) return;
  addQ({
    kp: "x." + i, type: "single", dim: "B",
    q: "参数「" + g.name + "」的合理区间是？",
    opts: opts, a: opts.indexOf(g.range), why: g.mean, sec: ""
  });
});

MODELS.forEach((m, i) => {
  (m.stages || []).forEach(s => {
    const pool = [];
    MODELS.forEach(mm => (mm.stages || []).forEach(ss => {
      if (ss.on && ss.on !== "—" && ss.on !== s.on) pool.push(ss.on);
    }));
    const opts = shuffle([s.on].concat(pickDistractors(pool, s.on, 3)), i * 7 + 3);
    if (!s.on || s.on === "—" || opts.length < 4) return;
    addQ({
      kp: "m." + i, type: "single", dim: "C",
      q: "「" + m.key + "」产品在「" + s.no + "」应开启哪些检测项？",
      opts: opts, a: opts.indexOf(s.on),
      why: m.key + " · " + s.no + "：" + s.on, sec: ""
    });
  });
});

(KB.cases || []).forEach((c, i) => {
  const opts = shuffle([c.cause].concat(pickDistractors((KB.cases || []).map(x => x.cause), c.cause, 3)), i + 29);
  if (opts.length < 4) return;
  addQ({
    kp: "k." + i, type: "single", dim: "E",
    q: "【" + c.type + "·" + c.station + "】「" + c.title + "」：现象「" + c.symptom + "」，根因是？",
    opts: opts, a: opts.indexOf(c.cause),
    why: "处理动作：" + (c.action || []).join(" → "), sec: ""
  });
});

/* 4) 全文覆盖题：每个小节至少 1 题（图题优先 → 数值题 → 归属题） */
const NUM_RE = /(\d+(?:\.\d+)?)\s*(mm|px|%|ms|级|帧|张|个|倍|条|步|档|秒|cm)/;
const numPool = [];
SECTIONS.forEach(s => {
  const t = factsOf(s, 3).join(" ");
  const m = t.match(new RegExp(NUM_RE.source, "g")) || [];
  m.forEach(x => { if (numPool.indexOf(x) < 0) numPool.push(x); });
});
const titleCount = {};
SECTIONS.forEach(s => { const t = clean(s.title); titleCount[t] = (titleCount[t] || 0) + 1; });

function siblingTitles(cid, selfTitle, n) {
  const out = [];
  SECTIONS.forEach(s => {
    const t = clean(s.title);
    if (secCourse[s.id] !== cid) return;
    if (t === selfTitle || titleCount[t] > 1) return;
    if (out.indexOf(t) >= 0) return;
    out.push(t);
  });
  if (out.length >= n) return out.slice(0, n);
  SECTIONS.forEach(s => {
    const t = clean(s.title);
    if (t === selfTitle || titleCount[t] > 1 || out.indexOf(t) >= 0) return;
    out.push(t);
  });
  return out.slice(0, n);
}

let imgQ = 0, numQ = 0, ownQ = 0;
SECTIONS.forEach((sec, idx) => {
  const kp = secKp[sec.id];
  const facts = kp.f || [];
  if (!facts.length) return;
  const siblings = siblingTitles(kp.c, kp.t, 6);
  if (siblings.length < 3) return;
  const imgs = kp.img || [];

  if (imgs.length && imgQ < 300) {
    const opts = shuffle([kp.t].concat(pickDistractors(siblings, kp.t, 3)), idx + 37);
    addQ({
      kp: kp.id, type: "img", dim: kp.dim,
      q: "这张图出自手册哪一节？先看它讲的主题再选。",
      opts: opts, a: opts.indexOf(kp.t),
      why: "《" + kp.t + "》：" + facts[0], sec: kp.sec, img: imgs[0]
    });
    imgQ++;
    return;
  }

  const nm = facts.join(" ").match(NUM_RE);
  if (nm && numQ < 200) {
    const token = nm[0], unit = nm[2];
    const sameUnit = numPool.filter(x => x.slice(-unit.length) === unit && x !== token);
    const opts = shuffle([token].concat(pickDistractors(sameUnit, token, 3)), idx + 41);
    if (opts.length === 4) {
      const blank = facts.map(f => f.replace(token, " ____ ")).filter(f => f.indexOf("____") >= 0)[0];
      if (blank) {
        addQ({
          kp: kp.id, type: "single", dim: kp.dim,
          q: "《" + kp.t + "》原文：「" + blank + "」空格处应为？",
          opts: opts, a: opts.indexOf(token),
          why: "原文：" + facts.join(" "), sec: kp.sec
        });
        numQ++;
        return;
      }
    }
  }

  const opts = shuffle([kp.t].concat(pickDistractors(siblings, kp.t, 3)), idx + 43);
  if (opts.length < 4) return;
  if (facts.length === 1 && facts[0] === kp.t) {
    // 该节只有标题（多为纯图片小节）：不问「这句话出自哪节」，改问「归属哪个部分」
    const seg = String(kp.path || "").split(" / ");
    const parent = seg.length > 1 ? seg[seg.length - 2] : seg[0];
    const parents = [];
    SECTIONS.forEach(s => {
      const sg = String(s.path || "").split(" / ");
      const pi = sg.length > 1 ? sg[sg.length - 2] : sg[0];
      if (pi && pi !== parent && nkey(pi) !== nkey(parent) && parents.indexOf(pi) < 0) parents.push(pi);
    });
    const popts = shuffle([parent].concat(pickDistractors(parents, parent, 3)), idx + 47);
    if (popts.length === 4) {
      addQ({
        kp: kp.id, type: "single", dim: kp.dim,
        q: "《" + kp.t + "》这一节，在手册里归属下面哪一部分？",
        opts: popts, a: popts.indexOf(parent),
        why: "手册位置：" + kp.path, sec: kp.sec
      });
      ownQ++;
      return;
    }
  }
  addQ({
    kp: kp.id, type: "single", dim: kp.dim,
    q: "「" + (facts[0].length > 110 ? facts[0].slice(0, 108) + "…" : facts[0]) + "」这句话出自手册哪一节？",
    opts: opts, a: opts.indexOf(kp.t),
    why: "《" + kp.t + "》：" + facts.join(" "), sec: kp.sec
  });
  ownQ++;
});

/* 5) 课程装配 */
const cardHas = {};
cards.forEach(c => { cardHas[c.k] = 1; });
Object.keys(kps).forEach(id => {
  if (cardHas[id]) return;
  const kp = kps[id];
  const back = (kp.f || []).filter(Boolean).join(" ");
  cards.push({ k: id, f: "《" + kp.t + "》的关键结论？", b: back || kp.t, img: (kp.img && kp.img[0]) || "" });
});

const courses = COURSES.map((c, i) => {
  const secIds = SECTIONS.filter(s => secCourse[s.id] === c.id).map(s => s.id);
  const kpIds = secIds.concat((structByCourse[c.id] || []).filter(id => secIds.indexOf(id) < 0));
  const qs = quiz.filter(q => kpIds.indexOf(q.kp) >= 0);
  const dims = {};
  kpIds.forEach(id => { const d = kps[id] && kps[id].dim; if (d) dims[d] = (dims[d] || 0) + 1; });
  return {
    id: c.id, no: i + 1, title: c.title, sub: c.sub, intro: c.intro, mins: c.mins,
    sec: secIds, kp: kpIds, qn: qs.length, dims: dims, first: secIds[0] || ""
  };
}).filter(c => c.kp.length > 0);

const courseIdSet = {};
courses.forEach(c => { courseIdSet[c.id] = 1; });
const kpInCourse = {};
courses.forEach(c => c.kp.forEach(id => { kpInCourse[id] = c.id; }));
Object.keys(kps).forEach(id => { if (!kpInCourse[id]) kps[id].c = ""; });

/* 6) 统计 + 输出 */
const secWithKp = SECTIONS.filter(s => kps[s.id]).length;
const qByKp = {};
quiz.forEach(q => { qByKp[q.kp] = 1; });
const secWithQ = SECTIONS.filter(s => qByKp[s.id]).length;
const dimHist = {};
quiz.forEach(q => { dimHist[q.dim] = (dimHist[q.dim] || 0) + 1; });
const cardNoKp = cards.filter(c => !kps[c.k] || !kps[c.k].c).length;

const payload = {
  meta: {
    v: 1, built: "2026-11-10",
    src: { sections: SECTIONS.length, manual: (DOC.meta && DOC.meta.version) || "", knowledge: (KB.meta && KB.meta.version) || "" }
  },
  courses: courses,
  kps: kps,
  cards: cards,
  quiz: quiz,
  coverage: {
    sections: SECTIONS.length, secKp: secWithKp, secQuiz: secWithQ,
    kps: Object.keys(kps).length, quiz: quiz.length, cards: cards.length,
    dims: dimHist
  }
};

fs.writeFileSync(path.join(WEB, "data", "learn.js"),
  "window.LEARN = " + JSON.stringify(payload) + ";\n", "utf8");

console.log("课程 " + courses.length + " 门");
courses.forEach(c => console.log("  " + c.id + " " + c.title + " | 小节 " + c.sec.length + " | 知识点 " + c.kp.length + " | 题 " + c.qn + " | " + c.mins + " 分钟"));
console.log("知识点 " + Object.keys(kps).length + "（覆盖小节 " + secWithKp + "/" + SECTIONS.length + "）");
console.log("卡片 " + cards.length + "（无课程归属 " + cardNoKp + "）");
console.log("题目 " + quiz.length + "（覆盖小节 " + secWithQ + "/" + SECTIONS.length + "；图题 " + imgQ + " / 数值题 " + numQ + " / 归属题 " + ownQ + "）");
console.log("维度分布 " + JSON.stringify(dimHist));
console.log("文件大小 " + (fs.statSync(path.join(WEB, "data", "learn.js")).size / 1024).toFixed(0) + " KB");

