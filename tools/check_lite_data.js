/* v1.4 现场流程 / 情景练习 数据自检
 * 用法：node tools/check_lite_data.js
 * 校验：口径完整（每条有症状、步骤、理由、红线）· 引用存在（专题 / 案例）· 机型阶段差异真的存在
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const problems = [];
const bad = (m) => problems.push(m);

function load(rel) {
  const ctx = { window: {}, console, localStorage: { getItem: () => null, setItem: () => {} } };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), ctx, { filename: rel });
  return ctx.window;
}

const KB = load("web/data/knowledge.js").KB;
const SC = load("web/data/scenarios.js").SCEN;

if (!KB) bad("knowledge.js 未导出 window.KB");
if (!SC) bad("scenarios.js 未导出 window.SCEN");

const flows = (SC && SC.flows) || [];
const drills = (SC && SC.drills) || [];

/* ---- 流程 ---- */
const CATS = ["漏检", "误判", "定位", "换型", "开线"];
const guideIds = new Set(((KB && KB.guides) || []).map((g) => g.id));
const caseIds = new Set(((KB && KB.cases) || []).map((c) => c.id));
const seenFlow = new Set();

flows.forEach((f) => {
  if (!f.id) bad("流程缺少 id");
  if (seenFlow.has(f.id)) bad("流程 id 重复：" + f.id);
  seenFlow.add(f.id);
  if (CATS.indexOf(f.cat) < 0) bad("流程 " + f.id + " 的类别不在 " + CATS.join("/") + "：" + f.cat);
  if (!f.title) bad("流程 " + f.id + " 缺少标题");
  if (!f.when || f.when.length < 8) bad("流程 " + f.id + " 症状描述太短");
  if (!Array.isArray(f.steps) || f.steps.length < 3) bad("流程 " + f.id + " 步骤少于 3 步");
  (f.steps || []).forEach((s, i) => {
    if (!s.do) bad("流程 " + f.id + " 第 " + (i + 1) + " 步缺少动作");
    if (!s.why) bad("流程 " + f.id + " 第 " + (i + 1) + " 步缺少理由");
  });
  if (!f.stop) bad("流程 " + f.id + " 缺少红线");
  if (f.guideId && !guideIds.has(f.guideId)) bad("流程 " + f.id + " 引用了不存在的专题 " + f.guideId);
  if (f.caseId && !caseIds.has(f.caseId)) bad("流程 " + f.id + " 引用了不存在的案例 " + f.caseId);
  if (!Array.isArray(f.params) || !f.params.length) bad("流程 " + f.id + " 未列参数（至少 1 条）");
});

/* ---- 练习 ---- */
const seenQ = new Set();
const flowIds = new Set(flows.map((f) => f.id));
drills.forEach((q) => {
  if (!q.id) bad("题目缺少 id");
  if (seenQ.has(q.id)) bad("题目 id 重复：" + q.id);
  seenQ.add(q.id);
  if (!q.q) bad("题目 " + q.id + " 缺少题干");
  if (!Array.isArray(q.opts) || q.opts.length !== 3) bad("题目 " + q.id + " 选项必须 3 个");
  if (new Set((q.opts || []).map((o) => String(o).trim())).size !== (q.opts || []).length) bad("题目 " + q.id + " 有重复选项");
  if (!(q.a >= 0 && q.a < (q.opts || []).length)) bad("题目 " + q.id + " 正确下标越界");
  if (!q.why) bad("题目 " + q.id + " 缺少理由");
  if (!q.flow) bad("题目 " + q.id + " 未关联流程");
  else if (!flowIds.has(q.flow)) bad("题目 " + q.id + " 关联了不存在的流程 " + q.flow);
});

/* ---- 每个流程至少被一道题覆盖 ---- */
flows.forEach((f) => {
  if (!drills.some((q) => q.flow === f.id)) bad("流程 " + f.id + " 没有对应练习题");
});

/* ---- 机型差异：端面阶段必须真的不同 ---- */
const face = ((KB && KB.stations) || []).find((s) => s.id === "face");
let s8 = 0;
let s6 = 0;
if (!face) bad("knowledge.js 缺少端面工位（id=face）");
else {
  s8 = (face.stages || []).filter((s) => !s.m || s.m === "m8").length;
  s6 = (face.stages || []).filter((s) => !s.m || s.m === "m6").length;
  if (s8 === s6) bad("端面阶段在 8 / 6 工位下数量相同（" + s8 + "），机型切换仍看不出差异");
  const m6only = (face.stages || []).filter((s) => s.m === "m6").length;
  if (!m6only) bad("端面没有任何 6 工位专属阶段，切换机型不会变化");
}

/* ---- 速查页 30 秒结论 ---- */
["od", "id", "face"].forEach((id) => {
  const st = ((KB && KB.stations) || []).find((s) => s.id === id);
  if (!st) { bad("缺少工位 " + id); return; }
  if (!st.lite) bad("工位 " + id + " 缺少 lite 结论（看什么 / 调什么 / 别做什么）");
  else ["see", "tune", "stop"].forEach((k) => { if (!st.lite[k]) bad("工位 " + id + " lite." + k + " 为空"); });
});

/* ---- 报告 ---- */
console.log("流程 " + flows.length + " 条（" + CATS.map((c) => c + " " + flows.filter((f) => f.cat === c).length).join(" / ") + "）");
console.log("情景题 " + drills.length + " 道，覆盖流程 " + new Set(drills.map((q) => q.flow)).size + " / " + flows.length);
console.log("端面阶段：8 工位 " + s8 + " 个 / 6 工位 " + s6 + " 个（差异 " + Math.abs(s6 - s8) + " 个）");
if (problems.length) {
  console.log("\n发现 " + problems.length + " 个问题：");
  problems.forEach((p) => console.log(" - " + p));
  process.exit(1);
}
console.log("\n通过：流程口径完整、引用有效、每道题都能回到流程、机型差异真实存在。");
