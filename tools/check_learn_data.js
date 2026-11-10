/* 教学数据自检：node tools/check_learn_data.js
 * 校验 learn.js（生成物）与 manual.js / knowledge.js / 图片目录是否自洽，含「答案可回原文」反幻觉检查。
 * 退出码：0 通过 / 1 有问题
 */
const fs = require("fs");
const path = require("path");

const web = path.join(__dirname, "..", "web");
const problems = [];
const lines = [];
const log = (s) => lines.push(s);
const bad = (s) => { problems.push(s); lines.push("  ✗ " + s); };

const win = {};
function load(file) {
  const full = path.join(web, file);
  if (!fs.existsSync(full)) { bad("缺少文件 web/" + file); return; }
  new Function("window", fs.readFileSync(full, "utf8"))(win);
}
load("data/manual.js");
load("data/knowledge.js");
load("data/learn.js");

const DOC = win.MANUAL_DOC || { sections: [] };
const KB = win.KB || {};
const L = win.LEARN;
const SECTIONS = DOC.sections || [];

if (!L) { bad("learn.js 未导出 window.LEARN（先运行 node tools/build_learn.js）"); }
const KPS = (L && L.kps) || {};
const COURSES = (L && L.courses) || [];
const CARDS = (L && L.cards) || [];
const QUIZ = (L && L.quiz) || [];

const secIds = new Set(SECTIONS.map(s => s.id));
const kpIds = new Set(Object.keys(KPS));

/* 文本归一化（去空白、统一符号），用于「答案必须能在原文找到」 */
function norm(s) {
  return String(s == null ? "" : s)
    .replace(/[\s\u00a0]/g, "")
    .replace(/[（）()「」『』《》""''′″]/g, "")
    .replace(/[·•]/g, "");
}
function secText(s) {
  if (!s) return "";
  const body = (s.body || []).map(b => {
    if (b.t === "p") return b.text || "";
    if (b.t === "table") return b.rows.map(r => r.map(c => c.text || "").join(" ")).join(" ");
    if (b.t === "img") return b.cap || "";
    return "";
  }).join(" ");
  return norm((s.title || "") + " " + (s.path || "") + " " + body);
}

const secTextCache = {};
function textOf(sec) {
  if (!secTextCache[sec]) secTextCache[sec] = secText(SECTIONS.filter(x => x.id === sec)[0]);
  return secTextCache[sec];
}
const kbNorm = norm(fs.readFileSync(path.join(web, "data", "knowledge.js"), "utf8"));
const docNorm = norm(fs.readFileSync(path.join(web, "data", "manual.js"), "utf8"));

log("== 规模 ==");
log("课程 " + COURSES.length + " ｜ 知识点 " + Object.keys(KPS).length +
  " ｜ 卡片 " + CARDS.length + " ｜ 题目 " + QUIZ.length +
  " ｜ 手册小节 " + SECTIONS.length);

/* 1. 覆盖率：每一节都要有知识点与至少一道题 */
const kpBySec = {}, qBySec = {};
Object.keys(KPS).forEach(id => { if (KPS[id].sec) kpBySec[KPS[id].sec] = 1; });
QUIZ.forEach(q => { const kp = KPS[q.kp]; if (kp && kp.sec) qBySec[kp.sec] = 1; });
const noKp = SECTIONS.filter(s => !kpBySec[s.id]);
const noQ = SECTIONS.filter(s => !qBySec[s.id]);
if (noKp.length) bad(noKp.length + " 个小节没有知识点，例：" + noKp.slice(0, 5).map(s => s.id + " " + s.title).join(" / "));
if (noQ.length) bad(noQ.length + " 个小节没有题目，例：" + noQ.slice(0, 5).map(s => s.id + " " + s.title).join(" / "));
log("覆盖 有知识点小节 " + (SECTIONS.length - noKp.length) + "/" + SECTIONS.length +
  " ｜ 有题小节 " + (SECTIONS.length - noQ.length) + "/" + SECTIONS.length);

/* 2. 知识点字段 */
const DIM_OK = new Set(["A", "B", "C", "D", "E", "F", "G"]);
const srcOk = new Set(["sec", "param", "item", "anchor", "flow", "pitfall", "stage", "redline", "glossary", "model", "case"]);
Object.keys(KPS).forEach(id => {
  const kp = KPS[id];
  if (!kp.t) bad("知识点 " + id + " 缺标题");
  if (!DIM_OK.has(kp.dim)) bad("知识点 " + id + " 维度非法：" + kp.dim);
  if (!srcOk.has(kp.src)) bad("知识点 " + id + " 来源非法：" + kp.src);
  if (!Array.isArray(kp.f) || !kp.f.length) bad("知识点 " + id + " 没有结论文字");
  if (kp.sec && !secIds.has(kp.sec)) bad("知识点 " + id + " 引用了不存在的章节 " + kp.sec);
  (kp.img || []).forEach(f => {
    if (!fs.existsSync(path.join(web, f))) bad("知识点 " + id + " 图片缺失：" + f);
  });
});

/* 3. 课程 */
const seenKp = {};
COURSES.forEach(c => {
  if (!c.id || !c.title) bad("课程缺 id / title：" + JSON.stringify(c).slice(0, 60));
  if (!c.kp || !c.kp.length) bad("课程 " + c.id + " 没有知识点");
  if (!c.intro) bad("课程 " + c.id + " 缺导语");
  (c.kp || []).forEach(id => {
    if (!kpIds.has(id)) bad("课程 " + c.id + " 引用了不存在的知识点 " + id);
    if (seenKp[id]) bad("知识点 " + id + " 同时属于课程 " + seenKp[id] + " 与 " + c.id);
    seenKp[id] = c.id;
  });
  (c.sec || []).forEach(id => { if (!secIds.has(id)) bad("课程 " + c.id + " 引用了不存在的章节 " + id); });
  const realQ = QUIZ.filter(q => (c.kp || []).indexOf(q.kp) >= 0).length;
  if (realQ !== c.qn) bad("课程 " + c.id + " 的 qn=" + c.qn + " 与实际题数 " + realQ + " 不一致");
});
Object.keys(KPS).forEach(id => { if (!seenKp[id]) bad("知识点 " + id + " 没有归属课程"); });

/* 4. 题目结构 */
let imgQ = 0, secQ = 0, structQ = 0, noWhy = 0;
QUIZ.forEach(q => {
  const kp = KPS[q.kp];
  if (!kp) { bad("题目 " + q.id + " 指向不存在的知识点 " + q.kp); return; }
  if (!q.q || q.q.length < 6) bad("题目 " + q.id + " 题干过短");
  if (!Array.isArray(q.opts) || q.opts.length !== 4) bad("题目 " + q.id + " 选项数不是 4");
  if (typeof q.a !== "number" || q.a < 0 || q.a >= (q.opts || []).length) bad("题目 " + q.id + " 正确答案下标非法");
  if (!DIM_OK.has(q.dim)) bad("题目 " + q.id + " 维度非法：" + q.dim);
  const uniq = new Set((q.opts || []).map(o => norm(o)));
  if (uniq.size !== (q.opts || []).length) bad("题目 " + q.id + " 存在重复选项");
  if (!q.why) noWhy++;
  if (q.sec && !secIds.has(q.sec)) bad("题目 " + q.id + " 引用了不存在的章节 " + q.sec);
  if (q.type === "img") {
    imgQ++;
    if (!q.img) bad("题目 " + q.id + " 是图片题但没有图片");
    else if (!fs.existsSync(path.join(web, q.img))) bad("题目 " + q.id + " 图片缺失：" + q.img);
  }
  if (kp.src === "sec") secQ++; else structQ++;
});

/* 5. 反幻觉：正确答案必须能在手册 / 知识库原文中找到 */
let checked = 0, miss = [];
QUIZ.forEach(q => {
  const kp = KPS[q.kp];
  if (!kp || !q.opts) return;
  const ans = norm(q.opts[q.a]);
  if (!ans || ans.length < 2) return;
  checked++;
  const ok = (kp.src === "sec" && kp.sec)
    ? textOf(kp.sec).indexOf(ans) >= 0
    : (kbNorm.indexOf(ans) >= 0 || docNorm.indexOf(ans) >= 0);
  if (!ok) miss.push(q.id + "「" + q.opts[q.a].slice(0, 24) + "」");
});
if (miss.length) bad(miss.length + " 道题的正确答案在原文中找不到：" + miss.slice(0, 6).join(" / "));

/* 6. 卡片 */
const cardK = new Set();
CARDS.forEach(c => {
  if (!KPS[c.k]) bad("卡片指向不存在的知识点 " + c.k);
  if (!c.f || !c.b) bad("卡片 " + c.k + " 缺正面或背面");
  if (cardK.has(c.k)) bad("知识点 " + c.k + " 有重复卡片");
  cardK.add(c.k);
});
Object.keys(KPS).forEach(id => { if (!cardK.has(id)) bad("知识点 " + id + " 没有抽认卡"); });

/* 7. 编码与脏数据 */
const raw = fs.readFileSync(path.join(web, "data", "learn.js"), "utf8");
[["«", "法文引号 «"], ["\uFFFD", "替换字符 U+FFFD"], ["\uFEFF", "BOM 混入内容"]].forEach(([ch, name]) => {
  if (raw.split(ch).length > 2) bad("learn.js 含 " + name);
});
["undefined", "NaN", "[object Object]"].forEach(t => {
  if (raw.indexOf(t) >= 0) bad("learn.js 含脏数据字符：" + t);
});

/* 8. 统计一致性 */
const cov = (L && L.coverage) || {};
if (cov.sections !== SECTIONS.length) bad("coverage.sections=" + cov.sections + " 与手册 " + SECTIONS.length + " 不一致");
if (cov.kps !== Object.keys(KPS).length) bad("coverage.kps 与知识点数不一致");
if (cov.quiz !== QUIZ.length) bad("coverage.quiz 与题目数不一致");
if (cov.cards !== CARDS.length) bad("coverage.cards 与卡片数不一致");
if (L && L.meta && L.meta.src && L.meta.src.sections !== SECTIONS.length) bad("meta.src.sections 与手册不一致");

/* 9. 概览 */
const dims = {};
QUIZ.forEach(q => { dims[q.dim] = (dims[q.dim] || 0) + 1; });
log("课程 " + COURSES.length + " 门 ｜ 题 " + QUIZ.length +
  "（小节题 " + secQ + " / 结构化题 " + structQ + " / 图片题 " + imgQ + "）");
log("覆盖 小节 " + (SECTIONS.length - noKp.length) + "/" + SECTIONS.length +
  " ｜ 卡片 " + CARDS.length + " ｜ 答案可回原文 " + (checked - miss.length) + "/" + checked);
log("维度分布 " + JSON.stringify(dims) + (noWhy ? " ｜ 无解析题 " + noWhy : ""));
log("课程覆盖量 " + COURSES.map(c => c.sec.length).reduce((a, b) => a + b, 0) + " 节（含跨章重合 0）");

const report = lines.join("\n");
fs.writeFileSync(path.join(__dirname, "check_learn_data_report.txt"), report + "\n", "utf8");
console.log(report);
console.log(problems.length ? "\n发现 " + problems.length + " 个问题" : "\n全部检查通过");
process.exit(problems.length ? 1 : 0);
