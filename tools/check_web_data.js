/* 数据一致性自检：node tools/check_web_data.js
 * 校验 knowledge.js / images.js / manual.js 三者是否自洽，并以退出码反馈结果。
 */
const fs = require("fs");
const path = require("path");

const web = path.join(__dirname, "..", "web");
const problems = [];
const lines = [];
const log = (s) => lines.push(s);
const bad = (s) => { problems.push(s); lines.push("  ✗ " + s); };

global.window = {};
function load(file) {
  const full = path.join(web, file);
  if (!fs.existsSync(full)) { bad("缺少文件 web/" + file + "（先运行 python tools/build_web_data.py）"); return; }
  new Function("window", fs.readFileSync(full, "utf8"))(global.window);
}
load("data/knowledge.js");
load("data/images.js");
load("data/manual.js");

const KB = global.window.KB || {};
const IMG = global.window.IMG_INDEX || {};
const DOC = global.window.MANUAL_DOC || { sections: [] };
const SECTIONS = DOC.sections || [];

if (!KB.stations || !KB.stations.length) bad("knowledge.js 未提供 stations");

log("== 规模 ==");
log("工位 " + (KB.stations || []).length + " ｜ 产品 " + (KB.products || []).length +
  " ｜ 专题 " + (KB.guides || []).length + " ｜ 参数 " + (KB.glossary || []).length +
  " ｜ 案例 " + (KB.cases || []).length + " ｜ 点检 " + (KB.checklist || []).length +
  " ｜ 红线 " + (KB.redlines || []).length);
log("图片索引 " + Object.keys(IMG).length + " 张 ｜ 手册章节 " + SECTIONS.length + " 节");

/* 1. 图片索引指向的文件必须存在 */
let brokenIdx = 0;
Object.keys(IMG).forEach((k) => { if (!fs.existsSync(path.join(web, IMG[k]))) brokenIdx++; });
if (brokenIdx) bad("IMG_INDEX 中有 " + brokenIdx + " 条指向不存在的图片文件");
log("图片索引可访问 " + (Object.keys(IMG).length - brokenIdx) + " / " + Object.keys(IMG).length);

/* 2. 案例引用的图片序号必须存在于索引 */
let caseHits = 0, caseNoImg = 0, caseMissing = [];
(KB.cases || []).forEach((c) => {
  if (!c.imgs || !c.imgs.length) { caseNoImg++; return; }
  c.imgs.forEach((q) => { if (IMG[String(q)]) caseHits++; else caseMissing.push(c.id + ":" + q); });
});
if (caseMissing.length) bad("案例图片序号缺失：" + caseMissing.slice(0, 10).join(" "));
log("案例引用图片 " + caseHits + " 处（无图案例 " + caseNoImg + " 条）");

/* 3. 必填字段 */
const required = {
  stations: { id: 1, name: 1, camera: 1, algo: 1, light: 1, defects: 1, stages: 1, params: 1, flow: 1, pitfalls: 1 },
  products: { id: 1, name: 1, faceStages: 1, rows: 1, detectFocus: 1 },
  guides: { id: 1, name: 1 },
  cases: { id: 1, type: 1, station: 1, title: 1, symptom: 1, cause: 1, action: 1 },
  glossary: { name: 1, g: 1, range: 1, mean: 1 }
};
Object.keys(required).forEach((key) => {
  (KB[key] || []).forEach((it, i) => {
    Object.keys(required[key]).forEach((f) => {
      const v = it[f];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
      if (empty) bad(key + "[" + i + "]（" + (it.id || it.name) + "）缺少字段 " + f);
    });
  });
});

/* 4. 专题必须有可展示的步骤或条目 */
(KB.guides || []).forEach((g) => {
  const n = (g.steps || []).length + (g.rules || []).length + (g.items || []).length + (g.bullets || []).length;
  if (!n) bad("专题 " + g.id + " 没有 steps / rules / items 内容");
});

/* 5. 案例所属工位必须是已定义工位 */
const stationNames = (KB.stations || []).map((s) => s.name);
(KB.cases || []).forEach((c) => {
  if (stationNames.indexOf(c.station) < 0) bad("案例 " + c.id + " 的工位「" + c.station + "」不在 stations 中");
  if (["漏检", "误判", "定位失败"].indexOf(c.type) < 0) bad("案例 " + c.id + " 的类型「" + c.type + "」未定义");
});

/* 6. 工位引用的手册章节 id 必须存在 */
const ids = new Set(SECTIONS.map((s) => s.id));
(KB.stations || []).forEach((st) => (st.sections || []).forEach((id) => {
  if (!ids.has(id)) bad("工位 " + st.id + " 引用了不存在的章节 " + id);
}));

/* 7. 「手册原文 →」依赖一级标题包含工位名 */
stationNames.forEach((n) => {
  const hit = SECTIONS.some((s) => s.level === 1 && s.title.indexOf(n) >= 0);
  if (!hit) bad("全文一级标题中没有「" + n + "」章节，速查页的原文链接会缺失");
});

/* 8. 手册正文引用的图片文件必须存在 */
let cellImgs = 0, brokenImgs = 0;
SECTIONS.forEach((s) => (s.body || []).forEach((b) => {
  if (b.t === "table") b.rows.forEach((r) => r.forEach((c) => (c.img || []).forEach((f) => {
    cellImgs++;
    if (!fs.existsSync(path.join(web, f))) brokenImgs++;
  })));
  if (b.img && !fs.existsSync(path.join(web, b.img))) brokenImgs++;
  (b.src || []).forEach((f) => { if (!fs.existsSync(path.join(web, f))) brokenImgs++; });
}));
if (brokenImgs) bad("手册正文有 " + brokenImgs + " 张图片文件缺失");
log("手册表格内图片 " + cellImgs + " 张，缺失 " + brokenImgs + " 张");

/* 8. 教学层（阶段亮度锚点 / 检测项逐项 / 型号矩阵）完整性 */
let tItems = 0, tAnchors = 0, tModels = 0, tFlowSteps = 0, tFlowImgs = 0;
(KB.stations || []).forEach((st) => {
  const t = st.teach;
  if (!t) { bad("工位 " + st.id + " 缺少 teach 教学层"); return; }
  if (!t.intro) bad("工位 " + st.id + " teach.intro 为空");
  const b = t.brightness || {};
  if (!(b.order || []).length) bad("工位 " + st.id + " 缺少亮度调校顺序 brightness.order");
  if (!(b.anchors || []).length) bad("工位 " + st.id + " 缺少亮度锚点 brightness.anchors");
  tAnchors += (b.anchors || []).length;
  (st.stages || []).forEach((sg) => {
    ["anchor", "forbidden", "tune", "items"].forEach((f) => {
      const v = sg[f];
      if (!v || (Array.isArray(v) && !v.length)) bad("工位 " + st.id + " 阶段「" + sg.no + "」缺少 " + f);
    });
  });
  const seen = {};
  (t.items || []).forEach((it) => {
    tItems++;
    if (!it.name || !it.at || !it.sys) bad("工位 " + st.id + " 检测项缺 name / at / sys：" + (it.name || "?"));
    if (!(it.params || []).length) bad("工位 " + st.id + " 检测项「" + (it.name || "?") + "」没有参数");
    if (seen[it.name]) bad("工位 " + st.id + " 检测项重名：" + it.name);
    seen[it.name] = 1;
  });
  if (st.id === "face") {
    if ((t.models || []).length < 4) bad("端面缺少型号 × 阶段检测项矩阵 models");
    (t.models || []).forEach((m) => {
      tModels++;
      if (!m.key || !(m.stages || []).length) bad("型号矩阵条目缺 key / stages：" + (m.key || "?"));
      (m.stages || []).forEach((s) => { if (!s.no || !s.on) bad("型号「" + m.key + "」阶段行缺 no / on"); });
    });
  }
  /* 标准化调参完整流程（手册原版步序 + 步骤配图） */
  const fl = t.flow;
  if (!fl || !(fl.steps || []).length) bad("工位 " + st.id + " 缺少 teach.flow 标准化调参完整流程");
  else {
    if (!fl.title) bad("工位 " + st.id + " teach.flow 缺少 title");
    if ((fl.steps || []).length < 5) bad("工位 " + st.id + " teach.flow 步数过少：" + fl.steps.length);
    fl.steps.forEach((s, i) => {
      tFlowSteps++;
      if (String(s.n) !== String(i + 1)) bad("工位 " + st.id + " 流程第 " + (i + 1) + " 条编号不连续：" + s.n);
      if (!s.t) bad("工位 " + st.id + " 流程第 " + (i + 1) + " 步缺标题");
      if (!(s.d || []).length) bad("工位 " + st.id + " 流程「" + (s.t || "?") + "」没有说明文字");
      if (s.sec && !ids.has(s.sec)) bad("工位 " + st.id + " 流程「" + (s.t || "?") + "」引用了不存在的章节 " + s.sec);
      (s.imgs || []).forEach((im) => {
        tFlowImgs++;
        if (!im.f) bad("工位 " + st.id + " 流程「" + (s.t || "?") + "」配图缺 f 字段");
        else if (!fs.existsSync(path.join(web, im.f))) bad("工位 " + st.id + " 流程图片缺失：" + im.f);
        if (!im.c) bad("工位 " + st.id + " 流程图片缺说明：" + (im.f || "?"));
      });
    });
  }
});

log("教学层 检测项 " + tItems + " 项 ｜ 亮度锚点 " + tAnchors + " 条 ｜ 型号矩阵 " + tModels + " 类");
log("标准流程 " + tFlowSteps + " 步 ｜ 流程配图 " + tFlowImgs + " 张");

/* 9. 分布概览（便于人工核对） */
const types = {};
(KB.cases || []).forEach((c) => { types[c.type] = (types[c.type] || 0) + 1; });
log("案例类型分布 " + JSON.stringify(types));
log("参数分组 " + JSON.stringify((KB.glossary || []).reduce((a, g) => (a[g.g] = (a[g.g] || 0) + 1, a), {})));
log("章节层级 " + JSON.stringify(SECTIONS.reduce((a, s) => (a["h" + s.level] = (a["h" + s.level] || 0) + 1, a), {})));

const report = lines.join("\n");
fs.writeFileSync(path.join(__dirname, "check_web_data_report.txt"), report + "\n", "utf8");
console.log(report);
console.log(problems.length ? "\n发现 " + problems.length + " 个问题" : "\n全部检查通过");
process.exit(problems.length ? 1 : 0);
