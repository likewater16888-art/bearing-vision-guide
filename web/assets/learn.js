/* 智能教学引擎（P0）：学习路径 / 抽认卡 / 练习 / 抽考 / 错题本 · 纯静态无依赖 */
(function () {
  "use strict";

  var L = window.LEARN || { courses: [], kps: {}, cards: [], quiz: [], coverage: {} };
  var KPS = L.kps || {};
  var QUIZ = L.quiz || [];
  var COURSES = L.courses || [];
  var CARDS = L.cards || [];
  var QBYID = {};
  QUIZ.forEach(function (q) { QBYID[q.id] = q; });

  var DIMS = [["A", "成像"], ["B", "参数"], ["C", "配置"], ["D", "定位"], ["E", "排障"], ["F", "红线"], ["G", "基础"]];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function now() { return Date.now(); }
  function day(ts) { return Math.floor(ts / 86400000); }

  /* ---------------- 本地存储 ---------------- */
  var KEY = "bearing.learn.v1";
  var db = null;

  function blank() {
    return { v: 1, name: "", kp: {}, wrong: {}, course: {}, exams: [], days: {} };
  }

  function load() {
    if (db) return db;
    try {
      var raw = localStorage.getItem(KEY);
      db = raw ? JSON.parse(raw) : blank();
    } catch (e) { db = blank(); }
    if (!db.kp) db.kp = {};
    if (!db.wrong) db.wrong = {};
    if (!db.course) db.course = {};
    if (!db.exams) db.exams = [];
    if (!db.days) db.days = {};
    return db;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 隐私模式忽略 */ }
  }

  function kpRec(id) {
    var d = load();
    if (!d.kp[id]) d.kp[id] = { b: 0, due: 0, n: 0, r: 0, w: 0 };
    return d.kp[id];
  }

  /* SM-2 简化：box 0~5，间隔 0/1/3/7/16/35 天 */
  var GAPS = [0, 1, 3, 7, 16, 35];
  function grade(id, ok) {
    var r = kpRec(id);
    r.n++;
    if (ok) {
      r.r++;
      r.b = Math.min(5, r.b + 1);
    } else {
      r.w++;
      r.b = Math.max(0, r.b - 2);
    }
    r.due = day(now()) + (ok ? (GAPS[r.b] || 1) : 0);
    return r;
  }

  function mastered(id) { var r = load().kp[id]; return !!(r && r.b >= 3); }
  function dueCards() {
    var d = load(), t = day(now()), out = [];
    CARDS.forEach(function (c) {
      var r = d.kp[c.k];
      if (!r || (r.b < 5 && (r.due || 0) <= t)) out.push(c);
    });
    return out;
  }

  function kpIdsOfCourse(c) { return c.kp || []; }
  function courseStats(c) {
    var ids = kpIdsOfCourse(c), m = 0, seen = 0, d = load();
    ids.forEach(function (id) {
      var r = d.kp[id];
      if (r && r.b >= 3) m++;
      if (r && r.n) seen++;
    });
    return { n: ids.length, m: m, seen: seen, pct: ids.length ? Math.round((m / ids.length) * 100) : 0 };
  }
  function dimStats() {
    var d = load(), tot = {}, mas = {};
    Object.keys(KPS).forEach(function (id) {
      var dm = KPS[id].dim || "G";
      tot[dm] = (tot[dm] || 0) + 1;
      if (d.kp[id] && d.kp[id].b >= 3) mas[dm] = (mas[dm] || 0) + 1;
    });
    return DIMS.map(function (x) {
      var t = tot[x[0]] || 0, m = mas[x[0]] || 0;
      return { k: x[0], name: x[1], n: t, m: m, pct: t ? Math.round((m / t) * 100) : 0 };
    });
  }

  /* ---------------- 题目抽取 ---------------- */
  function qsOfCourse(c, limit) {
    var ids = kpIdsOfCourse(c), out = [];
    QUIZ.forEach(function (q) { if (ids.indexOf(q.kp) >= 0) out.push(q); });
    return limit && out.length > limit ? sample(out, limit, 12) : out;
  }
  function qsOfDim(dim, n) {
    var pool = QUIZ.filter(function (q) { return q.dim === dim; });
    return sample(pool, n, 7);
  }
  function sample(arr, n, seedBase) {
    var a = arr.slice(), s = (seedBase || 1) + (now() % 97);
    for (var i = a.length - 1; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280;
      var j = Math.floor((s / 233280) * (i + 1)), t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a.slice(0, n);
  }

  /* ---------------- 会话 ---------------- */
  var S = null;

  function startSession(mode, opts) {
    opts = opts || {};
    var qs = opts.qs || [];
    S = {
      mode: mode, title: opts.title || "", cid: opts.cid || "", dim: opts.dim || "",
      drill: opts.drill || "", spec: opts.spec || null,
      qs: qs, i: 0, picks: [], right: 0, total: qs.length, t0: now(),
      wrongIds: [], dimRes: {}, flipped: false, cards: [], top: 0
    };
  }

  function curQ() { return S && S.qs[S.i]; }

  /* ---------------- 路由 ---------------- */
  function route() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    var p = h.split("/");
    if (p[0] !== "learn") return { view: "learn" };
    if (p[1] === "c") return { view: "course", cid: p[2] || "" };
    if (p[1] === "review") return { view: "review" };
    if (p[1] === "drill") return { view: "drill", dim: p[2] || "" };
    if (p[1] === "exam") return { view: "exam" };
    if (p[1] === "wrong") return { view: "wrong" };
    if (p[1] === "kp") return { view: "kp", sec: p[2] || "" };
    if (p[1] === "stat") return { view: "stat" };
    return { view: "learn" };
  }
  function go(hash) {
    if (location.hash === hash) { window.KB_RENDER && window.KB_RENDER(); return; }
    location.hash = hash;
  }
  function courseById(id) {
    for (var i = 0; i < COURSES.length; i++) if (COURSES[i].id === id) return COURSES[i];
    return null;
  }
  function rerender() { window.KB_RENDER && window.KB_RENDER(); }

  /* ---------------- 小组件 ---------------- */
  function bar(pct, cls) {
    return '<div class="lbar ' + (cls || "") + '"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
  }
  function dimRows() {
    return '<div class="ldims">' + dimStats().map(function (d) {
      return '<div class="ldim"><b>' + d.k + " " + esc(d.name) + "</b>" + bar(d.pct) +
        '<span>' + d.m + "/" + d.n + "</span></div>";
    }).join("") + "</div>";
  }

  /* ---------------- 视图：单节练习（从全文进入） ---------------- */
  function viewKp(sec) {
    var kp = KPS[sec];
    if (!kp) return '<div class="card">未找到该小节。<button class="chip" data-l="go" data-x="#/learn">回学习总览</button></div>';
    var qs = QUIZ.filter(function (q) { return q.kp === sec; });
    if (!qs.length) {
      return '<div class="card"><h2>' + esc(kp.t) + '</h2><p class="note">这一节没有独立题目，可在所属课程里综合练。</p>' +
        '<div class="lbtns"><button class="chip" data-doc="' + sec + '">读原文</button>' +
        (kp.c ? '<button class="chip" data-l="go" data-x="#/learn/c/' + kp.c + '">去所属课程</button>' : "") + "</div></div>";
    }
    if (!S || S.mode !== "quiz" || S.secKp !== sec) {
      startSession("quiz", { qs: qs, title: kp.t, spec: { mode: "kp", sec: sec } });
      S.secKp = sec;
    }
    return quizHTML();
  }

  /* ---------------- 视图：总览 ---------------- */
  function courseRow(c) {
    var st = courseStats(c);
    var state = st.pct >= 80 ? "已掌握" : (st.seen ? "进行中" : "未开始");
    var cls = st.pct >= 80 ? "ok" : (st.seen ? "warn" : "gray");
    return '<div class="lcourse" data-x="' + c.id + '">' +
      '<div class="lc-no">' + String(c.no).padStart(2, "0") + "</div>" +
      '<div class="lc-main"><div class="lc-t">' + esc(c.title) + ' <span class="tag ' + cls + '">' + state + "</span></div>" +
      '<div class="lc-s">' + esc(c.sub) + " · 小节 " + c.sec.length + " · 题 " + c.qn + " · 约 " + c.mins + " 分钟</div>" +
      bar(st.pct) + "</div>" +
      '<div class="lc-n">' + st.m + "/" + st.n + "</div>" +
      "</div>";
  }

  function viewHome() {
    var d = load();
    var due = dueCards().length;
    var dueToday = Math.min(20, due);
    var wrongN = Object.keys(d.wrong).length;
    var totKp = Object.keys(KPS).length, masKp = 0;
    Object.keys(KPS).forEach(function (id) { if (mastered(id)) masKp++; });
    var next = null;
    for (var i = 0; i < COURSES.length; i++) {
      if (courseStats(COURSES[i]).pct < 80) { next = COURSES[i]; break; }
    }
    var last = d.exams.length ? d.exams[d.exams.length - 1] : null;
    return '<div class="card"><div class="rowhead"><h2>智能教学</h2>' +
      '<span class="tag gray">覆盖手册 ' + (L.coverage.sections || 0) + " 节 · " + COURSES.length + " 课 · " + QUIZ.length + " 题</span></div>" +
      '<p class="note">教材全部来自《成品轴承操作手册细化版本》，每道题的答案都能回到手册原文，不额外编造结论。' +
      "学习顺序 = 手册顺序：先红线，再概述 / 界面 / 型号，然后外径 → 内径 → 端面 → 通用标准 → 案例。</p>" +
      '<div class="lstats">' +
      '<div><b>' + masKp + "/" + totKp + "</b><span>已掌握知识点</span></div>" +
      '<div><b>' + dueToday + "</b><span>今日待复习</span></div>" +
      '<div><b>' + wrongN + "</b><span>错题本</span></div>" +
      '<div><b>' + (last ? last.score + "%" : "—") + "</b><span>最近抽考</span></div>" +
      "</div>" +
      '<div class="lbtns">' +
      (next ? '<button class="chip on" data-l="go" data-x="#/learn/c/' + next.id + '">继续学习 · ' + esc(next.title) + "</button>" : "") +
      '<button class="chip" data-l="go" data-x="#/learn/review">今日复习 ' + dueToday + "（队列 " + due + "）</button>" +
      '<button class="chip" data-l="go" data-x="#/learn/exam">抽考 30 题</button>' +
      '<button class="chip" data-l="go" data-x="#/learn/wrong">错题本 ' + wrongN + "</button>" +
      "</div></div>" +
      '<div class="card"><h3>六维能力雷达（按知识点掌握度）</h3>' + dimRows() +
      '<p class="note">A 成像判据 · B 参数区间 · C 检测项配置 · D 定位校准 · E 排障流程 · F 红线合规 · G 基础认知。' +
      "某一维低于 60% 时，抽考报告会把对应课程列进补学清单。</p></div>" +
      '<div class="card"><h3>学习路径（' + COURSES.length + " 课 · 按手册顺序）</h3>" +
      '<p class="note">每课 = 手册对应小节 + 其中的参数 / 检测项 / 流程 / 陷阱 + 配套题。小节数即手册原文覆盖量，全手册 519 节无一遗漏。</p>' +
      COURSES.map(courseRow).join("") + "</div>";
  }

  /* ---------------- 视图：侧栏 ---------------- */
  function side() {
    var d = load(), due = dueCards().length, wrongN = Object.keys(d.wrong).length;
    var cur = route();
    var h = '<div class="snav"><div class="grp">教学</div>' +
      '<button class="' + (cur.view === "learn" ? "on" : "") + '" data-l="go" data-x="#/learn">学习总览<small>' +
      (L.coverage.sections || 0) + " 节</small></button>" +
      '<button class="' + (cur.view === "review" ? "on" : "") + '" data-l="go" data-x="#/learn/review">今日复习<small>' + Math.min(20, due) + " / " + due + " 张</small></button>" +
      '<button class="' + (cur.view === "exam" ? "on" : "") + '" data-l="go" data-x="#/learn/exam">抽考<small>30 题</small></button>' +
      '<button class="' + (cur.view === "wrong" ? "on" : "") + '" data-l="go" data-x="#/learn/wrong">错题本<small>' + wrongN + " 题</small></button>" +
      '<button class="' + (cur.view === "stat" ? "on" : "") + '" data-l="go" data-x="#/learn/stat">学习记录<small>进度存档</small></button>' +
      '<div class="grp">课程</div>';
    COURSES.forEach(function (c) {
      var st = courseStats(c);
      h += '<button class="' + (cur.cid === c.id ? "on" : "") + '" data-l="go" data-x="#/learn/c/' + c.id + '">' +
        esc(c.title) + "<small>" + st.m + "/" + st.n + "</small></button>";
    });
    return h + "</div>";
  }

  /* ---------------- 视图：课程 ---------------- */
  function kpLine(id) {
    var kp = KPS[id];
    if (!kp) return "";
    return '<div class="lkp"><div class="lk-t"><span class="tag gray">' + kp.dim + "</span> " + esc(kp.t) +
      (kp.sec ? ' <button class="lmini" data-l="go" data-x="#/learn/kp/' + kp.sec + '">练这一节 →</button>' : "") +
      (kp.sec ? ' <button class="lmini" data-doc="' + kp.sec + '">手册原文 →</button>' : "") + "</div>" +
      (kp.f && kp.f.length ? '<div class="lk-f">' + esc(kp.f.slice(0, 2).join(" ")) + "</div>" : "") +
      (kp.img && kp.img.length ? '<div class="lk-i"><img loading="lazy" src="' + kp.img[0] + '" alt="" data-full="' + kp.img[0] + '" data-cap="' + esc(kp.t) + '"></div>' : "") +
      "</div>";
  }

  function viewCourse(cid) {
    var c = courseById(cid);
    if (!c) return '<div class="card">未找到该课程。<button class="chip" data-l="go" data-x="#/learn">回学习总览</button></div>';
    if (S && S.mode === "quiz") return quizHTML();

    var st = courseStats(c);
    var byDim = {};
    c.kp.forEach(function (id) {
      var kp = KPS[id];
      if (!kp) return;
      (byDim[kp.dim] = byDim[kp.dim] || []).push(id);
    });
    var html = '<div class="card"><div class="rowhead"><h2>' + esc(c.title) + "</h2>" +
      '<span class="tag ' + (st.pct >= 80 ? "ok" : "gray") + '">' + st.m + "/" + st.n + " 知识点已掌握</span></div>" +
      '<p class="note">' + esc(c.intro) + "</p>" +
      '<div class="lmeta"><span>手册小节 ' + c.sec.length + "</span><span>知识点 " + c.kp.length +
      "</span><span>配套题 " + c.qn + "</span><span>建议 " + c.mins + " 分钟</span></div>" +
      bar(st.pct) + '<div class="lbtns">' +
      '<button class="chip on" data-l="start-course" data-x="' + c.id + '">开始练习（' + Math.min(12, c.qn) + " 题）</button>" +
      (c.qn > 12 ? '<button class="chip" data-l="start-course-all" data-x="' + c.id + '">全部 ' + c.qn + " 题</button>" : "") +
      (c.first ? '<button class="chip" data-doc="' + c.first + '">读原文首节 →</button>' : "") +
      "</div></div>";

    DIMS.forEach(function (d) {
      var ids = byDim[d[0]];
      if (!ids || !ids.length) return;
      html += '<div class="card"><h3>' + d[0] + " " + d[1] + " · " + ids.length + " 个知识点</h3>" +
        '<p class="note">先看每条结论，再点「开始练习」用题目确认记住没有；答错会自动进错题本。</p>' +
        ids.map(kpLine).join("") + "</div>";
    });
    return html;
  }

  /* ---------------- 题目渲染 ---------------- */
  function quizHTML() {
    var q = curQ();
    if (!q) return finishHTML();
    var picked = S.picks[S.i];
    var has = picked != null;
    var kp = KPS[q.kp] || {};
    var html = '<div class="card lquiz"><div class="lqhead">' +
      '<span class="tag gray">' + esc(S.title) + "</span>" +
      "<span>第 " + (S.i + 1) + " / " + S.total + " 题</span>" +
      '<span class="tag gray">' + q.dim + " 维</span>" +
      '<span class="tag ok">对 ' + S.right + "</span></div>" +
      '<div class="lq">' + esc(q.q) + "</div>" +
      (q.img ? '<div class="lk-i lq-img"><img loading="lazy" src="' + q.img + '" alt="" data-full="' + q.img + '" data-cap="判读配图"></div>' : "") +
      '<div class="lopts">' + q.opts.map(function (o, i) {
        var cls = "";
        if (has) {
          if (i === q.a) cls = " ok";
          else if (i === picked) cls = " no";
        }
        return '<button class="lopt' + cls + '" data-l="pick" data-x="' + i + '"' + (has ? " disabled" : "") + ">" +
          String.fromCharCode(65 + i) + "． " + esc(o) + "</button>";
      }).join("") + "</div>";
    if (has) {
      var ok = picked === q.a;
      html += '<div class="lfb ' + (ok ? "ok" : "no") + '"><b>' + (ok ? "正确" : "答错") + "</b>" +
        (q.why ? "<div>" + esc(q.why) + "</div>" : "") +
        (q.sec ? '<button class="lmini" data-doc="' + q.sec + '">看手册原文 →</button>' : "") +
        (kp.t ? '<div class="note">对应知识点：' + esc(kp.t) + "</div>" : "") + "</div>" +
        '<div class="lbtns"><button class="chip on" data-l="next">' +
        (S.i + 1 >= S.total ? "交卷 / 看结果" : "下一题 →") + "</button></div>";
    }
    return html + "</div>";
  }

  function finishHTML() {
    var total = S ? S.total : 0, right = S ? S.right : 0;
    var pct = total ? Math.round((right / total) * 100) : 0;
    var pass = pct >= 60;
    var html = '<div class="card"><div class="rowhead"><h2>' + (pass ? "本次通过" : "本次未通过") + "</h2>" +
      '<span class="tag ' + (pass ? "ok" : "danger") + '">' + pct + "%</span></div>" +
      '<p class="note">' + (S ? esc(S.title) : "") + " · 答对 " + right + " / " + total + " 题。" +
      (pass ? " 继续下一课，或去做今日复习巩固。" : " 建议回课程把错题对应的小节重读一遍，再练一次。") + "</p>";
    if (S && S.mode === "exam" && S.dimRes) {
      html += '<div class="ldims">' + Object.keys(S.dimRes).sort().map(function (k) {
        var r = S.dimRes[k], p = r.n ? Math.round((r.r / r.n) * 100) : 0;
        return '<div class="ldim"><b>' + k + " " + dimName(k) + "</b>" + bar(p) +
          "<span>" + r.r + "/" + r.n + "</span></div>";
      }).join("") + "</div>";
      var weak = Object.keys(S.dimRes).filter(function (k) {
        var r = S.dimRes[k]; return r.n && r.r / r.n < 0.6;
      });
      if (weak.length) {
        var list = [];
        COURSES.forEach(function (c) {
          if (list.length < 6 && weak.some(function (k) { return (c.dims || {})[k]; })) list.push(c);
        });
        html += "<h4>补学清单</h4><div class=\"lbtns\">" + list.map(function (c) {
          return '<button class="chip" data-l="go" data-x="#/learn/c/' + c.id + '">' + esc(c.title) + "</button>";
        }).join("") + "</div>";
      }
    }
    if (S && S.wrongIds && S.wrongIds.length) {
      html += '<h4>本次错题 ' + S.wrongIds.length + " 题（已进错题本）</h4>" +
        '<div class="lbtns"><button class="chip" data-l="start-wrong">重练错题</button></div>';
    }
    html += '<div class="lbtns">' +
      '<button class="chip on" data-l="retry">再练一遍</button>' +
      (S && S.cid ? '<button class="chip" data-l="go" data-x="#/learn/c/' + S.cid + '">回课程</button>' : '<button class="chip" data-l="go" data-x="#/learn">回总览</button>') +
      '<button class="chip" data-l="go" data-x="#/learn/exam">去抽考</button>' +
      '<button class="chip" data-l="print">打印成绩单</button>' +
      "</div></div>";
    return html;
  }

  function dimName(k) {
    for (var i = 0; i < DIMS.length; i++) if (DIMS[i][0] === k) return DIMS[i][1];
    return "";
  }

  /* ---------------- 视图：今日复习（抽认卡） ---------------- */
  function viewReview() {
    if (!S || S.mode !== "review") {
      var due = dueCards();
      if (!due.length) {
        return '<div class="card"><h2>今日复习</h2><p class="note">今天没有到期的卡片。做完练习后，答错的知识点会立刻回到复习队列。</p>' +
          '<div class="lbtns"><button class="chip" data-l="go" data-x="#/learn">回总览</button>' +
          '<button class="chip" data-l="go" data-x="#/learn/exam">抽考 30 题</button></div></div>';
      }
      return '<div class="card"><h2>今日复习</h2><p class="note">共 ' + due.length + " 张到期卡片。先自己想，再点「看答案」，最后按真实掌握程度打分 —— 打分决定它什么时候再出现。</p>" +
        '<div class="lbtns"><button class="chip on" data-l="start-review">开始复习（' + Math.min(20, due.length) + " 张）</button></div></div>";
    }
    var c = S.cards[S.i];
    if (!c) {
      return '<div class="card"><h2>本轮复习完成</h2><p class="note">复习了 ' + S.total + " 张卡片，还剩 " + dueCards().length + " 张到期。</p>" +
        '<div class="lbtns"><button class="chip on" data-l="go" data-x="#/learn">回总览</button>' +
        '<button class="chip" data-l="go" data-x="#/learn/exam">去抽考</button></div></div>';
    }
    var html = '<div class="card lcardview"><div class="lqhead"><span class="tag gray">今日复习</span>' +
      "<span>第 " + (S.i + 1) + " / " + S.total + " 张</span><span>到期 " + dueCards().length + " 张</span></div>" +
      '<div class="lq">' + esc(c.f) + "</div>";
    if (S.flipped) {
      html += '<div class="lfb ok"><b>答案</b><div>' + esc(c.b || "（本知识点无摘要）") + "</div></div>" +
        (c.img ? '<div class="lk-i lq-img"><img loading="lazy" src="' + c.img + '" alt="" data-full="' + c.img + '" data-cap="判读配图"></div>' : "") +
        '<div class="lbtns">' +
        '<button class="chip" data-l="grade" data-x="0">忘了</button>' +
        '<button class="chip" data-l="grade" data-x="1">勉强</button>' +
        '<button class="chip on" data-l="grade" data-x="2">记住</button>' +
        '<button class="chip" data-l="grade" data-x="3">很熟</button></div>' +
        '<p class="note">忘了 → 今天再来；勉强 → 明天；记住 → 3 天后；很熟 → 7 天后。</p>';
    } else {
      html += '<div class="lbtns"><button class="chip on" data-l="flip">看答案</button></div>';
    }
    return html + "</div>";
  }

  /* ---------------- 视图：分维练习 ---------------- */
  function viewDrill(dim) {
    if (S && S.mode === "quiz" && S.drill === dim) return quizHTML();
    var n = QUIZ.filter(function (q) { return q.dim === dim; }).length;
    if (!dim) {
      return '<div class="card"><h2>分维练习</h2><p class="note">按能力维度单独练：哪一维最弱就先练哪一维。</p>' +
        '<div class="lbtns">' + dimStats().map(function (d) {
          return '<button class="chip" data-l="start-drill" data-x="' + d.k + '">' + d.k + " " + esc(d.name) + "（" + d.n + " 知识点）</button>";
        }).join("") + "</div></div>";
    }
    return '<div class="card"><h2>' + esc(dim) + " 维练习 · " + dimName(dim) + "</h2>" +
      '<p class="note">该维度共 ' + n + " 道题，本次抽 12 道；做完立刻给判据与原文出处。</p>" +
      '<div class="lbtns"><button class="chip on" data-l="start-drill" data-x="' + dim + '">开始（12 题）</button>' +
      '<button class="chip" data-l="go" data-x="#/learn">回总览</button></div></div>';
  }

  /* ---------------- 视图：抽考 ---------------- */
  var EXAM_PLAN = [["A", 5], ["B", 6], ["C", 5], ["D", 4], ["E", 6], ["F", 4]];

  function viewExam() {
    if (S && S.mode === "exam") return S.i >= S.total ? finishHTML() : quizHTML();
    var n = EXAM_PLAN.reduce(function (a, x) { return a + x[1]; }, 0);
    var d = load();
    var best = d.exams.reduce(function (a, e) { return Math.max(a, e.score); }, 0);
    return '<div class="card"><h2>抽考 · ' + n + " 题</h2>" +
      '<p class="note">按六维配额抽题：A 成像 ' + EXAM_PLAN[0][1] + " · B 参数 " + EXAM_PLAN[1][1] + " · C 配置 " + EXAM_PLAN[2][1] +
      " · D 定位 " + EXAM_PLAN[3][1] + " · E 排障 " + EXAM_PLAN[4][1] + " · F 红线 " + EXAM_PLAN[5][1] +
      "。60% 通过；未通过会给补学清单，成绩可打印交班。</p>" +
      '<div class="lmeta"><span>历史最好 ' + (d.exams.length ? best + "%" : "—") + "</span><span>已考 " + d.exams.length + " 次</span>" +
      "<span>题库 " + QUIZ.length + " 题</span></div>" +
      '<div class="lbtns"><button class="chip on" data-l="start-exam">开始抽考</button>' +
      '<button class="chip" data-l="go" data-x="#/learn/review">先做今日复习</button></div></div>';
  }

  /* ---------------- 视图：错题本 ---------------- */
  function viewWrong() {
    var d = load(), ids = Object.keys(d.wrong);
    if (!ids.length) {
      return '<div class="card"><h2>错题本</h2><p class="note">还没有错题。练习或抽考答错会自动进来，答对不会自动移除 —— 由你确认后再点「已掌握」。</p></div>';
    }
    var html = '<div class="card"><div class="rowhead"><h2>错题本（' + ids.length + " 题）</h2>" +
      '<button class="chip on" data-l="start-wrong">重练错题</button></div>' +
      '<p class="note">先看题干与正确判据，再决定是重练还是标记已掌握。</p></div>';
    ids.sort().forEach(function (id) {
      var q = QBYID[id];
      if (!q) return;
      html += '<div class="card lkp"><div class="lk-t"><span class="tag gray">' + q.dim + "</span> " + esc(q.q) + "</div>" +
        '<div class="lk-f"><b>正确答案：</b>' + esc(q.opts[q.a]) + "</div>" +
        (q.why ? '<div class="lk-f note">' + esc(q.why) + "</div>" : "") +
        (q.sec ? '<button class="lmini" data-doc="' + q.sec + '">看原文 →</button>' : "") +
        '<button class="lmini" data-l="unwrong" data-x="' + q.id + '">已掌握，移出错题本</button>' +
        "</div>";
    });
    return html;
  }

  /* ---------------- 视图：学习记录 ---------------- */
  function viewStat() {
    var d = load();
    var days = Object.keys(d.days).sort().slice(-14);
    var body = days.length ? '<div class="ldays">' + days.map(function (k) {
      return "<div><b>" + d.days[k] + "</b><span>" + k.slice(4) + "</span></div>";
    }).join("") + "</div>" : '<p class="note">还没有练习记录。</p>';
    var exams = d.exams.slice(-10).reverse();
    return '<div class="card"><h2>学习记录</h2>' +
      '<p class="note">进度只存在本机浏览器（localStorage），不联网；换电脑用下面的「导出 / 导入」搬。</p>' +
      '<div class="lmeta"><span>知识点记录 ' + Object.keys(d.kp).length + "</span><span>错题 " + Object.keys(d.wrong).length +
      "</span><span>抽考 " + d.exams.length + " 次</span><span>练习天数 " + Object.keys(d.days).length + "</span></div>" +
      "<h4>近 14 天练习量（题）</h4>" + body +
      "<h4>抽考记录</h4>" +
      (exams.length ? '<div class="tblwrap"><table><thead><tr><th>时间</th><th>得分</th><th>正确</th><th>分维</th></tr></thead><tbody>' +
        exams.map(function (e) {
          var dt = new Date(e.ts).toLocaleString("zh-CN", { hour12: false });
          var dims = Object.keys(e.dims || {}).sort().map(function (k) {
            return k + " " + e.dims[k].r + "/" + e.dims[k].n;
          }).join(" · ");
          return "<tr><td>" + dt + '</td><td class="num">' + e.score + "%</td><td>" + e.r + "/" + e.n + "</td><td>" + esc(dims) + "</td></tr>";
        }).join("") + "</tbody></table></div>" : '<p class="note">还没考过。</p>') +
      '<h4>进度迁移</h4><div class="lbtns"><button class="chip" data-l="export">导出进度到文件</button>' +
      '<button class="chip" data-l="clear">清空本机进度</button></div>' +
      '<p class="note">导入：把之前导出的 .json 内容粘贴到下面，点「导入覆盖」。</p>' +
      '<textarea id="limport" class="limport" placeholder=\'{"v":1,...}\'></textarea>' +
      '<div class="lbtns"><button class="chip" data-l="import">导入覆盖</button></div></div>';
  }

  /* ---------------- 会话动作 ---------------- */
  function shuffleArr(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function startCourse(cid, all) {
    var c = courseById(cid);
    if (!c) return;
    var qs = qsOfCourse(c, all ? 0 : 12);
    startSession("quiz", {
      qs: qs, title: c.title, cid: cid,
      spec: { mode: "quiz", cid: cid, all: all ? 1 : 0 }
    });
    rerender();
  }

  function startDrill(dim) {
    if (!dim) { go("#/learn/drill"); return; }
    startSession("quiz", {
      qs: qsOfDim(dim, 12), title: dim + " 维练习 · " + dimName(dim), dim: dim, drill: dim,
      spec: { mode: "drill", dim: dim }
    });
    if (route().view !== "drill") go("#/learn/drill/" + dim);
    else rerender();
  }

  function startExam() {
    var qs = [];
    EXAM_PLAN.forEach(function (p) { qs = qs.concat(qsOfDim(p[0], p[1])); });
    startSession("exam", { qs: shuffleArr(qs), title: "抽考", spec: { mode: "exam" } });
    if (route().view !== "exam") go("#/learn/exam");
    else rerender();
  }

  function startWrong() {
    var d = load(), ids = Object.keys(d.wrong), qs = [];
    ids.forEach(function (id) { if (QBYID[id]) qs.push(QBYID[id]); });
    if (!qs.length) return;
    startSession("quiz", {
      qs: shuffleArr(qs).slice(0, 20), title: "错题重练", spec: { mode: "wrong" }
    });
    rerender();
  }

  function startReview() {
    var due = dueCards().slice(0, 20);
    S = { mode: "review", cards: due, i: 0, total: due.length, flipped: false, title: "今日复习" };
    rerender();
  }

  function pick(i) {
    if (!S || !S.qs) return;
    var q = curQ();
    if (!q || S.picks[S.i] != null) return;
    i = parseInt(i, 10);
    S.picks[S.i] = i;
    var ok = i === q.a;
    if (ok) S.right++;
    else {
      S.wrongIds.push(q.id);
      load().wrong[q.id] = 1;
    }
    grade(q.kp, ok);
    if (S.mode === "exam") {
      var r = S.dimRes[q.dim] || (S.dimRes[q.dim] = { r: 0, n: 0 });
      r.n++;
      if (ok) r.r++;
    }
    save();
    rerender();
  }

  function next() {
    if (!S) return;
    if (S.i + 1 < S.total) { S.i++; rerender(); return; }
    finish();
  }

  function finish() {
    if (!S) return;
    var d = load(), pct = S.total ? Math.round((S.right / S.total) * 100) : 0;
    if (S.cid) {
      var cs = d.course[S.cid] || { a: 0, r: 0, best: 0 };
      cs.a++;
      cs.r += S.right;
      cs.best = Math.max(cs.best || 0, pct);
      d.course[S.cid] = cs;
    }
    if (S.mode === "exam") {
      d.exams.push({ ts: now(), score: pct, dims: S.dimRes, n: S.total, r: S.right });
    }
    var k = String(day(now()));
    d.days[k] = (d.days[k] || 0) + S.total;
    save();
    S.i = S.total;
    rerender();
  }

  function retry() {
    if (!S || !S.spec) { rerender(); return; }
    var sp = S.spec;
    if (sp.mode === "quiz") startCourse(sp.cid, sp.all);
    else if (sp.mode === "drill") startDrill(sp.dim);
    else if (sp.mode === "exam") startExam();
    else if (sp.mode === "wrong") startWrong();
    else if (sp.mode === "kp") { S = null; lastKey = ""; go("#/learn/kp/" + sp.sec); }
  }

  function gradeCard(g) {
    if (!S || S.mode !== "review") return;
    var c = S.cards[S.i];
    if (!c) return;
    g = parseInt(g, 10);
    var r = kpRec(c.k);
    r.n++;
    if (g === 0) { r.b = 0; r.w++; r.due = day(now()); }
    else if (g === 1) { r.b = Math.max(0, r.b - 1); r.w++; r.due = day(now()) + 1; }
    else {
      r.r++;
      r.b = Math.min(5, r.b + (g === 3 ? 2 : 1));
      r.due = day(now()) + (GAPS[r.b] || 1);
    }
    save();
    S.i++;
    S.flipped = false;
    rerender();
  }

  function exportFile() {
    try {
      var blob = new Blob([JSON.stringify(load())], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "bearing-learn-progress.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    } catch (e) { /* 忽略 */ }
  }

  function importText() {
    var ta = document.getElementById("limport");
    if (!ta || !ta.value.trim()) return;
    try {
      var obj = JSON.parse(ta.value);
      if (!obj || typeof obj !== "object" || !obj.kp) throw new Error("bad");
      db = obj;
      if (!db.wrong) db.wrong = {};
      if (!db.course) db.course = {};
      if (!db.exams) db.exams = [];
      if (!db.days) db.days = {};
      save();
      rerender();
    } catch (e) {
      ta.value = "";
      ta.placeholder = "导入失败：内容不是有效的进度 JSON";
    }
  }

  /* ---------------- 视图分发 ---------------- */
  var lastKey = "";

  function view() {
    var cur = route();
    var key = cur.view + "|" + (cur.cid || "") + "|" + (cur.dim || "") + "|" + (cur.sec || "");
    if (key !== lastKey) { S = null; lastKey = key; }
    if (cur.view === "course") return viewCourse(cur.cid);
    if (cur.view === "kp") return viewKp(cur.sec);
    if (cur.view === "review") return viewReview();
    if (cur.view === "drill") return viewDrill(cur.dim);
    if (cur.view === "exam") return viewExam();
    if (cur.view === "wrong") return viewWrong();
    if (cur.view === "stat") return viewStat();
    return viewHome();
  }

  function click(el) {
    var a = el.getAttribute("data-l");
    if (!a) return false;
    var x = el.getAttribute("data-x");
    if (a === "go") { S = null; lastKey = ""; go(x); return true; }
    if (a === "start-course") { startCourse(x, 0); return true; }
    if (a === "start-course-all") { startCourse(x, 1); return true; }
    if (a === "start-drill") { startDrill(x); return true; }
    if (a === "start-exam") { startExam(); return true; }
    if (a === "start-wrong") { startWrong(); return true; }
    if (a === "start-review") { startReview(); return true; }
    if (a === "pick") { pick(x); return true; }
    if (a === "next") { next(); return true; }
    if (a === "retry") { retry(); return true; }
    if (a === "flip") { if (S) { S.flipped = true; rerender(); } return true; }
    if (a === "grade") { gradeCard(x); return true; }
    if (a === "unwrong") { delete load().wrong[x]; save(); rerender(); return true; }
    if (a === "export") { exportFile(); return true; }
    if (a === "import") { importText(); return true; }
    if (a === "clear") {
      if (window.confirm("清空本机学习进度？错题、成绩、掌握度都会清零，不可撤销。")) {
        db = blank(); save(); rerender();
      }
      return true;
    }
    if (a === "print") { window.print(); return true; }
    return true;
  }

  window.LEARNUI = { view: view, side: side, click: click, data: L };
})();
