/* 渲染冒烟测试（无需浏览器 / 无需依赖）
 * 用法：node tools/smoke_render.js
 * 做法：用最小假 DOM 载入 web/data/*.js 与 web/assets/*.js，逐个路由跑一遍渲染，
 *      检查现场流程 / 情景练习 / 速查折叠 / 机型切换是否真的产出内容。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

/* ---------- 最小假 DOM ---------- */
function El(tag) {
  this.tagName = String(tag || "div").toUpperCase();
  this.innerHTML = "";
  this.textContent = "";
  this.value = "";
  this.title = "";
  this.hidden = false;
  this.style = {};
  this.dataset = {};
  this._attrs = {};
  this._listeners = {};
  this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
}
El.prototype.addEventListener = function (t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); };
El.prototype.removeEventListener = function () {};
El.prototype.querySelector = function (sel) { return doc._el(sel); };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.setAttribute = function (k, v) { this._attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; };
El.prototype.focus = function () {};
El.prototype.blur = function () {};
El.prototype.select = function () {};
El.prototype.setSelectionRange = function () {};
El.prototype.scrollIntoView = function () {};
El.prototype.closest = function () { return null; };

const doc = {
  readyState: "complete",
  body: new El("body"),
  activeElement: null,
  _els: {},
  _listeners: {},
  _el(sel) { if (!this._els[sel]) this._els[sel] = new El(); return this._els[sel]; },
  querySelector(sel) { return this._el(sel); },
  querySelectorAll() { return []; },
  createElement(tag) { return new El(tag); },
  addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
};

const store = {};
const sandbox = {
  console: console,
  document: doc,
  location: { hash: "" },
  localStorage: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; }
  },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  scrollTo() {},
  _listeners: {},
  addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); },
  removeEventListener() {}
};
sandbox.window = sandbox;
doc.defaultView = sandbox;

vm.createContext(sandbox);

const FILES = [
  "web/data/knowledge.js",
  "web/data/scenarios.js",
  "web/data/images.js",
  "web/data/manual.js",
  "web/data/learn.js",
  "web/assets/learn.js",
  "web/assets/lite.js",
  "web/assets/app.js"
];
FILES.forEach((rel) => {
  vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), sandbox, { filename: rel });
});

/* ---------- 断言 ---------- */
let fail = 0;
function ok(name, cond, extra) {
  if (cond) console.log("PASS  " + name);
  else { fail++; console.log("FAIL  " + name + (extra ? "  << " + extra : "")); }
}

function route(hash) {
  sandbox.location.hash = hash;
  (sandbox._listeners.hashchange || []).forEach((f) => f());
  return doc._el("#view").innerHTML;
}
function sideHtml() { return doc._el("#side").innerHTML; }
function switchMachine(id) {
  const el = doc._el("#machine");
  el.value = id;
  (el._listeners.change || []).forEach((f) => f.call(el));
}


/* ---------- 1. 速查（8 工位） ---------- */
let h = route("#/quick/face");
const KB = sandbox.KB;
const face = (KB.stations || []).filter((s) => s.id === "face")[0];
function stageCount(m) {
  return (face.stages || []).filter((s) => !s.m || s.m === m).length;
}
const dots = (html) => (html.match(/class="stage"/g) || []).length;

ok("quick/face renders", h.length > 2000, "len=" + h.length);
ok("quick/face shows 30s conclusion", h.indexOf("看什么") >= 0 && h.indexOf("别这么做") >= 0);
ok("quick/face has collapsible blocks", h.indexOf('<details class="acc"') >= 0);
ok("quick/face m8 stage count", dots(h) === stageCount("m8"), "got " + dots(h) + " / want " + stageCount("m8"));
ok("quick/face note explains product stages", h.indexOf("闭式主相机只跑 3 阶段") >= 0);
ok("quick/od lite block", route("#/quick/od").indexOf("别这么做") >= 0);
ok("quick/id lite block", route("#/quick/id").indexOf("别这么做") >= 0);

/* ---------- 2. 速查侧栏参考入口 ---------- */
route("#/quick/face");
ok("quick side links 26 lessons", sideHtml().indexOf("#/learn") >= 0);
ok("quick side links machine diff", sideHtml().indexOf("#/quick/diff") >= 0);
ok("quick side links matrix", sideHtml().indexOf("#/quick/matrix") >= 0);

/* ---------- 3. 机型切换 ---------- */
route("#/quick/face");
switchMachine("m6");
h = doc._el("#view").innerHTML;
ok("m6 stage count grows", dots(h) === stageCount("m6") && stageCount("m6") > stageCount("m8"),
  "got " + dots(h) + " / want " + stageCount("m6"));
ok("m6 face note switches", h.indexOf("闭式 4 阶段 9 张") >= 0);
ok("m6 side shows stage counts", sideHtml().indexOf("阶段") >= 0);
route("#/quick/face");
switchMachine("m8");
h = doc._el("#view").innerHTML;
ok("back to m8 stage count", dots(h) === stageCount("m8"), "got " + dots(h));

/* ---------- 4. 机型差异表 ---------- */
h = route("#/quick/diff");
ok("quick/diff renders rows", (h.match(/<tr>/g) || []).length >= 4);
ok("quick/diff mentions strobing", h.indexOf("跑马灯") >= 0);
ok("quick/diff highlights current machine", h.indexOf('class="hl"') >= 0);

/* ---------- 5. 现场流程 ---------- */
const FLOWS = (sandbox.SCEN && sandbox.SCEN.flows) || [];
h = route("#/live");
ok("live list renders", h.indexOf("现场快诊") >= 0 && h.indexOf(FLOWS.length + " 条症状流程") >= 0);
ok("live list shows every flow card", (h.match(/data-lite="live"/g) || []).length === FLOWS.length);
ok("live side groups by symptom", sideHtml().indexOf("按现象找") >= 0 && sideHtml().indexOf("grp sub") >= 0);

let badFlow = "";
FLOWS.forEach((f) => {
  const v = route("#/live/" + f.id);
  if (v.indexOf("按这个顺序做") < 0 || v.indexOf("为什么") < 0) badFlow = f.id;
});
ok("every flow renders steps + why", !badFlow, badFlow);

h = route("#/live/m6-config");
ok("live/m6-config renders", h.indexOf("6 工位") >= 0);

/* ---------- 6. 情景练习 ---------- */
const DRILLS = (sandbox.SCEN && sandbox.SCEN.drills) || [];
h = route("#/drill");
ok("drill renders first question", h.indexOf("第 1 / " + DRILLS.length + " 题") >= 0);
ok("drill renders 3 options", (h.match(/class="opt/g) || []).length >= 3);
ok("drill side has question dots", (sideHtml().match(/class="qdot/g) || []).length === DRILLS.length);
ok("drill side has progress bar", sideHtml().indexOf('class="bar"') >= 0);

const LITE = sandbox.LITEUI;
ok("LITEUI exported", !!(LITE && LITE.view && LITE.drillView));
h = LITE.drillView({ drill: String(DRILLS.length) });
ok("drill honors #/drill/<n>", h.indexOf("第 " + DRILLS.length + " / " + DRILLS.length + " 题") >= 0);

/* ---------- 7. 旧链接仍可访问 ---------- */
[["#/guide", "专题"], ["#/case", "案例"], ["#/gloss", "参数"], ["#/doc", "手册"], ["#/learn", "课"]].forEach((pair) => {
  const v = route(pair[0]);
  ok("legacy route " + pair[0], v.length > 300, "len=" + v.length);
});

console.log("");
console.log(fail ? "SMOKE FAIL: " + fail + " check(s) failed" : "SMOKE OK: all render checks passed");
process.exit(fail ? 1 : 0);
