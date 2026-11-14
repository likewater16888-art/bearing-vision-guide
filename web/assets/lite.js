/* 现场快诊 / 情景练习 渲染层（v1.4）
 * 只做两件事：① 症状 → 按顺序的动作；② 情景题（考下一步做什么）。
 * 不重复手册原文，需要原文时给跳转链接。
 */
(function () {
  var SC = window.SCEN || { flows: [], drills: [] };
  var FLOWS = SC.flows || [];
  var DRILLS = SC.drills || [];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function flowById(id) {
    return FLOWS.filter(function (f) { return f.id === id; })[0];
  }

  /* 手册章节：优先用站点章节（外径 / 内径 / 端面） */
  function docLinkFor(f) {
    var secs = (window.SECTIONS || (window.MANUAL_DOC && window.MANUAL_DOC.sections) || []);
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].level === 1 && f.station && secs[i].title.indexOf(f.station) >= 0) {
        return '<a class="tag gray" href="#/doc/' + esc(secs[i].id) + '">手册原文 →</a>';
      }
    }
    return "";
  }

  /* 已答记录：只存本机 */
  var KEY = "lite.drill.v1";
  var D = { i: 0, ans: {} };
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) { var p = JSON.parse(raw); if (p && p.ans) D = { i: p.i || 0, ans: p.ans }; }
  } catch (err) { /* 隐私模式忽略 */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (err) { /* ignore */ }
  }

  /* 选项顺序：按题号稳定打乱，避免答案永远在第一项 */
  function optionsOf(q) {
    var list = q.opts.map(function (t, i) { return { t: t, ok: i === q.a }; });
    var seed = 0;
    for (var k = 0; k < q.id.length; k++) seed = (seed * 31 + q.id.charCodeAt(k)) % 9973;
    for (var i = list.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      var j = seed % (i + 1);
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    }
    return list;
  }

  function answered() {
    return DRILLS.filter(function (q) { return D.ans[q.id] !== undefined; });
  }
  function rightCount() {
    return answered().filter(function (q) { return optionsOf(q)[D.ans[q.id]].ok; }).length;
  }
  /* ---------------- 侧栏 ---------------- */
  function side() {
    var html = '<div class="snav"><div class="grp">按现象找</div>';
    var cats = [];
    FLOWS.forEach(function (f) { if (cats.indexOf(f.cat) < 0) cats.push(f.cat); });
    cats.forEach(function (c) {
      html += '<div class="grp sub">' + esc(c) + "</div>";
      FLOWS.filter(function (f) { return f.cat === c; }).forEach(function (f) {
        html += '<button data-lite="live" data-v="' + f.id + '">' + esc(f.title) +
          "<small>" + esc(f.station) + " · " + f.steps.length + " 步</small></button>";
      });
    });
    html += "</div>";
    return html;
  }

  function drillSide() {
    var n = answered().length;
    var html = '<div class="dnav">' +
      '<div class="prog"><div class="bar"><i style="width:' +
        Math.round(n / DRILLS.length * 100) + '%"></i></div>' +
        "<span>已答 " + n + " / " + DRILLS.length + " · 答对 " + rightCount() + "</span></div>" +
      '<div class="qgrid">';
    DRILLS.forEach(function (q, i) {
      var a = D.ans[q.id];
      var cls = a === undefined ? "" : (optionsOf(q)[a].ok ? "ok" : "bad");
      html += '<button class="qdot ' + cls + (i === D.i ? " on" : "") + '" data-lite="goto" data-v="' + i + '">' +
        (i + 1) + "</button>";
    });
    html += '</div><div class="sidebtns">' +
      '<button data-lite="reset">清空重练</button>' +
      '<button data-tab="live">回去看流程</button>' +
      "</div></div>";
    return html;
  }

  /* ---------------- 现场：列表 ---------------- */
  function listView() {
    return '<div class="card"><div class="rowhead"><h2>现场快诊</h2>' +
      '<span class="tag gray">' + FLOWS.length + " 条症状流程</span></div>" +
      '<p class="note">机台上出现什么现象，就点哪一条。每条都是「先做这一步 → 再做这一步」，每步都写了为什么。</p>' +
      '<div class="casegrid">' +
      FLOWS.map(function (f) {
        return '<div class="casecard" data-lite="live" data-v="' + f.id + '"><b>' + esc(f.title) + "</b>" +
          '<div class="st">' + esc(f.cat) + " · " + esc(f.station) + " · " + f.steps.length + " 步</div>" +
          '<div class="st" style="margin-top:6px">' + esc(f.when) + "</div></div>";
      }).join("") + "</div></div>";
  }
  /* ---------------- 现场：单条流程 ---------------- */
  function flowView(f) {
    var html = '<div class="card"><div class="rowhead"><h2>' + esc(f.title) + "</h2>" +
      '<span class="tag">' + esc(f.cat) + "</span>" +
      '<span class="tag gray">' + esc(f.station) + "</span>" +
      (f.guideId ? '<a class="tag gray" href="#/guide/' + esc(f.guideId) + '">对应专题 →</a>' : "") +
      docLinkFor(f) +
      "</div>" +
      '<p class="quote">' + esc(f.when) + "</p>";

    html += '<h3>按这个顺序做</h3><div class="flow">' +
      f.steps.map(function (s, i) {
        return '<div class="step"><div class="n">' + (i + 1) + '</div><div><div class="st">' + esc(s.do) + "</div>" +
          '<div class="why">为什么：' + esc(s.why) + "</div></div></div>";
      }).join("") + "</div>";

    if (f.params && f.params.length) {
      html += '<h3>涉及参数（只调这些）</h3><div class="tblwrap"><table><thead><tr><th>参数</th><th>怎么定</th></tr></thead><tbody>' +
        f.params.map(function (p) {
          return "<tr><td><b>" + esc(p.k) + "</b></td><td>" + esc(p.v) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }

    if (f.stop) html += '<div class="risk">红线：' + esc(f.stop) + "</div>";

    html += '<div class="chips" style="margin-top:14px">' +
      '<button class="chip" data-lite="list">← 全部症状</button>' +
      (f.caseId ? '<button class="chip" data-case="' + esc(f.caseId) + '">看对应案例</button>' : "") +
      '<button class="chip" data-tab="drill">用情景题练一下</button>' +
      "</div></div>";
    return html;
  }
  /* ---------------- 练习 ---------------- */
  function drillView(state) {
    if (state && state.drill && /^\d+$/.test(state.drill)) {
      var n = parseInt(state.drill, 10) - 1;
      if (n >= 0 && n < DRILLS.length) D.i = n;
    }
    if (D.i > DRILLS.length - 1) D.i = DRILLS.length - 1;
    if (D.i < 0) D.i = 0;

    var q = DRILLS[D.i];
    var opts = optionsOf(q);
    var picked = D.ans[q.id];
    var html = '<div class="card"><div class="rowhead"><h2>第 ' + (D.i + 1) + " / " + DRILLS.length + " 题</h2>" +
      '<span class="tag gray">已答 ' + answered().length + " · 正确 " + rightCount() + "</span>" +
      '<a class="tag gray" href="#/live/' + esc(q.flow) + '">先看流程 →</a></div>' +
      '<p class="qtext">' + esc(q.q) + "</p>" +
      '<div class="opts">' +
      opts.map(function (o, i) {
        var cls = "";
        if (picked !== undefined) {
          if (o.ok) cls = " ok";
          else if (i === picked) cls = " bad";
        }
        return '<button class="opt' + cls + '" data-lite="opt" data-v="' + i + '"' +
          (picked !== undefined ? " disabled" : "") + ">" + esc(o.t) + "</button>";
      }).join("") + "</div>";

    if (picked !== undefined) {
      var good = opts[picked].ok;
      html += '<div class="fb ' + (good ? "ok" : "bad") + '"><b>' + (good ? "对" : "不对") + "</b><span>" +
        esc(q.why) + "</span></div>" +
        '<div class="chips" style="margin-top:10px">' +
        '<button class="chip" data-lite="next">' + (D.i === DRILLS.length - 1 ? "看结果 →" : "下一题 →") + "</button>" +
        '<button class="chip" data-lite="golive" data-v="' + esc(q.flow) + '">看这条流程</button>' +
        "</div>";
    }
    html += "</div>";

    if (answered().length === DRILLS.length) html += resultView();
    return html;
  }

  function resultView() {
    var wrong = DRILLS.filter(function (q) { return !optionsOf(q)[D.ans[q.id]].ok; });
    return '<div class="card"><div class="rowhead"><h2>练完了</h2>' +
      '<span class="tag">' + rightCount() + " / " + DRILLS.length + "</span></div>" +
      '<p class="note">' + (wrong.length ? "下面这些题再看一遍流程，比重复刷题有用。" : "全对，可以直接上机按流程走一遍。") + "</p>" +
      (wrong.length ? '<div class="flow">' + wrong.map(function (q) {
        return '<div class="step"><div class="n">!</div><div><div class="st">' + esc(q.q) + "</div>" +
          '<div class="why">' + esc(q.why) + ' <a href="#/live/' + esc(q.flow) + '">看流程 →</a></div></div></div>';
      }).join("") + "</div>" : "") +
      '<div class="chips" style="margin-top:12px">' +
      '<button class="chip" data-lite="reset">重新练</button>' +
      '<button class="chip" data-tab="live">去现场流程</button></div></div>';
  }
  /* ---------------- 路由入口 ---------------- */
  function view(state) {
    var f = state && state.live ? flowById(state.live) : null;
    return f ? flowView(f) : listView();
  }

  /* ---------------- 事件：只处理自己的 data-lite ---------------- */
  function render() {
    if (window.KB_RENDER) window.KB_RENDER();
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-lite]");
    if (!el) return;
    var act = el.getAttribute("data-lite");
    var v = el.getAttribute("data-v");

    if (act === "live" || act === "golive") { location.hash = "#/live/" + v; return; }
    if (act === "list") { location.hash = "#/live"; return; }
    if (act === "goto") { D.i = parseInt(v, 10) || 0; save(); render(); window.scrollTo(0, 0); return; }
    if (act === "opt") {
      var q = DRILLS[D.i];
      if (D.ans[q.id] !== undefined) return;
      D.ans[q.id] = parseInt(v, 10) || 0;
      save(); render();
      return;
    }
    if (act === "next") {
      if (D.i < DRILLS.length - 1) D.i += 1;
      save(); render(); window.scrollTo(0, 0);
      return;
    }
    if (act === "reset") { D.ans = {}; D.i = 0; save(); render(); window.scrollTo(0, 0); }
  });

  window.LITEUI = {
    view: view, side: side, drillView: drillView, drillSide: drillSide,
    flows: FLOWS, drills: DRILLS
  };
})();
