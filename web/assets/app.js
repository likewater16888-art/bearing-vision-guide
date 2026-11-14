/* 成品轴承视觉检测 · 调试速查（纯静态，无依赖） */
(function () {
  "use strict";

  var KB = window.KB || {};
  var DOC = window.MANUAL_DOC || { sections: [] };
  var IMGS = window.IMG_INDEX || {};
  var SECTIONS = DOC.sections || [];

  var $ = function (s) { return document.querySelector(s); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function imgFile(seq) { return IMGS[String(seq)] || ""; }

  function imgTag(seq, cap) {
    var f = imgFile(seq);
    if (!f) return "";
    return '<figure><img loading="lazy" src="' + f + '" alt="' + esc(cap || "") +
      '" data-full="' + f + '" data-cap="' + esc(cap || "") + '"><figcaption>' +
      esc(cap || ("图 " + seq)) + "</figcaption></figure>";
  }

  function imgBlock(seqs, cap) {
    var list = (seqs || []).filter(function (s) { return imgFile(s); });
    if (!list.length) return "";
    return '<div class="imgs">' + list.map(function (s, i) {
      return imgTag(s, cap ? cap + (list.length > 1 ? "（" + (i + 1) + "）" : "") : "");
    }).join("") + "</div>";
  }

  function sectionById(id) {
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === id) return SECTIONS[i];
    return null;
  }
  function sectionByTitle(kw) {
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].title.indexOf(kw) >= 0) return SECTIONS[i];
    return null;
  }

  /* ---------------- state & routing ---------------- */
  var state = {
    tab: "quick",
    station: (KB.stations && KB.stations[0]) ? KB.stations[0].id : "",
    product: (KB.products && KB.products[0]) ? KB.products[0].id : "",
    machine: localStorage.getItem("kb.machine") || "m8",
    guide: "",
    caseId: "",
    docId: SECTIONS.length ? SECTIONS[0].id : "",
    caseFilter: "全部",
    glossGroup: "",
    docFilter: "",
    live: "",
    drill: ""
  };

  function parseHash() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    if (!h) { state.tab = "quick"; return; }
    var parts = h.split("/");
    var tab = parts[0] || "quick";
    if (["live", "quick", "drill", "doc", "guide", "case", "gloss", "learn"].indexOf(tab) < 0) tab = "quick";
    state.tab = tab;
    var arg = decodeURIComponent(parts[1] || "");
    if (tab === "quick" && arg && (arg === "matrix" || arg === "diff" || stationById(arg))) state.station = arg;
    if (tab === "live") state.live = arg;
    if (tab === "drill") state.drill = arg;
    if (tab === "guide" && arg) state.guide = arg;
    if (tab === "case") state.caseId = arg;
    if (tab === "doc" && arg) state.docId = arg;
  }

  function go(hash) {
    if (location.hash === hash) { parseHash(); renderAll(); window.scrollTo(0, 0); return; }
    location.hash = hash;
  }

  function stationById(id) {
    return (KB.stations || []).filter(function (s) { return s.id === id; })[0];
  }
  function machineName(id) {
    var m = (KB.machines || []).filter(function (x) { return x.id === id; })[0];
    return m ? m.name : id;
  }
  function productById(id) {
    return (KB.products || []).filter(function (p) { return p.id === id; })[0];
  }
  function guideById(id) {
    return (KB.guides || []).filter(function (g) { return g.id === id; })[0];
  }
  function caseById(id) {
    return (KB.cases || []).filter(function (c) { return c.id === id; })[0];
  }

  /* ---------------- search index ---------------- */
  var INDEX = [];

  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, ""); }

  function flat(v) {
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number") return v + " ";
    if (Array.isArray(v)) return v.map(flat).join(" ");
    if (typeof v === "object") {
      return Object.keys(v).map(function (k) { return flat(v[k]); }).join(" ");
    }
    return "";
  }

  function addIndex(kind, title, sub, text, href) {
    INDEX.push({
      kind: kind, title: title, sub: sub, href: href,
      raw: String(text || "").replace(/\s+/g, " ").trim(),
      hay: norm(title + " " + sub + " " + (text || ""))
    });
  }

  function buildIndex() {
    (KB.stations || []).forEach(function (st) {
      addIndex("工位", st.name, "速查 · " + st.difficulty, flat({
        algo: st.algo, light: st.light, defects: st.defects, gating: st.gating,
        stages: st.stages, params: st.params, flow: st.flow, pitfalls: st.pitfalls, teach: st.teach
      }), "#/quick/" + st.id);
      (st.stages || []).forEach(function (sg) {
        addIndex("阶段", st.name + " · " + sg.no, "速查 · 阶段", flat(sg), "#/quick/" + st.id);
      });
      ((st.teach && st.teach.items) || []).forEach(function (it) {
        addIndex("检测项", st.name + " · " + it.name,
          "速查 · " + (it.sys || "") + " " + (it.at || ""), flat(it), "#/quick/" + st.id);
      });
      ((st.teach && st.teach.flow && st.teach.flow.steps) || []).forEach(function (s) {
        addIndex("流程", st.name + " · 第 " + s.n + " 步 " + s.t,
          "速查 · 标准调参完整流程", flat(s.d), "#/quick/" + st.id);
      });
      (st.params || []).forEach(function (p) {
        addIndex("参数", st.name + " · " + p.name, "速查 · 参数 " + p.range, flat(p), "#/quick/" + st.id);
      });
      (st.pitfalls || []).forEach(function (p) {
        addIndex("避坑", p.title, "速查 · " + st.name, p.desc, "#/quick/" + st.id);
      });
    });
    (KB.products || []).forEach(function (p) {
      addIndex("产品", p.name, "速查 · 阶段矩阵", flat(p), "#/quick/face");
    });
    (KB.guides || []).forEach(function (g) {
      addIndex("专题", g.name, "专题 · " + (g.tag || ""), flat(g), "#/guide/" + g.id);
    });
    (KB.cases || []).forEach(function (c) {
      addIndex("案例", "[" + c.type + "] " + c.station + " · " + c.title, "案例库", flat(c), "#/case/" + c.id);
    });
    (KB.glossary || []).forEach(function (g) {
      addIndex("释义", g.name, "参数释义 · " + g.g, flat(g), "#/gloss");
    });
    (KB.checklist || []).forEach(function (t) {
      addIndex("点检", t, "开线点检", t, "#/guide/startup");
    });
    (KB.redlines || []).forEach(function (t) {
      addIndex("红线", t, "调参红线", t, "#/guide/calibrate");
    });
    SECTIONS.forEach(function (s) {
      var text = (s.body || []).map(function (b) {
        if (b.t === "p") return b.text;
        if (b.t === "table") return b.rows.map(function (r) {
          return r.map(function (c) { return c.text; }).join(" ");
        }).join(" ");
        return "";
      }).join(" ");
      addIndex("原文", s.title, "手册 " + s.path, text, "#/doc/" + s.id);
    });
  }

  var results = { list: [], active: 0 };

  function search(q) {
    var terms = norm(q).split(/[,，。、+/]+/).filter(Boolean);
    if (!terms.length) return [];
    var out = [];
    for (var i = 0; i < INDEX.length; i++) {
      var it = INDEX[i], ok = true, score = 0;
      for (var t = 0; t < terms.length; t++) {
        var term = terms[t];
        if (it.hay.indexOf(term) < 0) { ok = false; break; }
        if (norm(it.title).indexOf(term) >= 0) score += 12;
        if (norm(it.sub).indexOf(term) >= 0) score += 4;
      }
      if (!ok) continue;
      score += Math.min(6, it.hay.split(terms[0]).length - 1);
      out.push({ it: it, score: score, terms: terms });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, 40);
  }

  function highlight(text, terms) {
    var s = esc(text);
    (terms || []).forEach(function (term) {
      if (!term) return;
      var safe = esc(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      try {
        s = s.replace(new RegExp("(" + safe + ")", "gi"), "<mark>$1</mark>");
      } catch (e) { /* 忽略非法正则 */ }
    });
    return s;
  }

  function snippet(it, terms) {
    var raw = it.raw || it.sub || "";
    var low = raw.toLowerCase(), pos = -1;
    for (var i = 0; i < terms.length; i++) {
      var p = low.indexOf(terms[i]);
      if (p >= 0 && (pos < 0 || p < pos)) pos = p;
    }
    if (pos < 0) pos = 0;
    var start = Math.max(0, pos - 24);
    var piece = raw.slice(start, start + 92);
    return (start > 0 ? "…" : "") + highlight(piece, terms) + (start + 92 < raw.length ? "…" : "");
  }

  /* ---------------- sidebar ---------------- */
  var TABS = [["live", "现场"], ["quick", "速查"], ["drill", "练"], ["doc", "全文"]];

  function renderSide() {
    var html = '<div class="tabs">' + TABS.map(function (t) {
      return '<button class="tab' + (state.tab === t[0] ? " on" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>";
    }).join("") + "</div>";

    if (state.tab === "live") {
      if (window.LITEUI) html += LITEUI.side();
    } else if (state.tab === "drill") {
      if (window.LITEUI) html += LITEUI.drillSide();
    } else if (state.tab === "quick") {
      html += '<div class="snav"><div class="grp">工位（' + esc(machineName(state.machine)) + "）</div>";
      (KB.stations || []).forEach(function (st) {
        var cam = String((st.camera || {})[state.machine] || "").split("（")[0];
        var n = (st.stages || []).filter(function (s) { return !s.m || s.m === state.machine; }).length;
        html += '<button class="' + (state.station === st.id ? "on" : "") + '" data-station="' + st.id + '">' +
          esc(st.name) + "<small>" + esc(cam) + (n ? " · " + n + " 阶段" : "") + "</small></button>";
      });
      html += '<div class="grp">机型</div>';
      html += '<button class="' + (state.station === "diff" ? "on" : "") + '" data-route="#/quick/diff">两款机型差在哪<small>3 处</small></button>';
      html += '<div class="grp">参考（干活时可跳过）</div>';
      html += '<button class="' + (state.station === "matrix" ? "on" : "") + '" data-route="#/quick/matrix">产品阶段矩阵<small>' +
        (KB.products || []).length + " 类</small></button>";
      html += '<button data-tab="guide">专题<small>' + (KB.guides || []).length + " 篇</small></button>";
      html += '<button data-tab="case">案例<small>' + (KB.cases || []).length + " 条</small></button>";
      html += '<button data-tab="gloss">参数表<small>' + (KB.glossary || []).length + " 条</small></button>";
      html += '<button data-route="#/learn">26 课系统学<small>' +
        ((window.LEARN && window.LEARN.courses) ? window.LEARN.courses.length : 26) + " 课</small></button>";
      html += "</div>";
    } else if (state.tab === "guide") {
      html += '<div class="snav"><div class="grp">专题</div>';
      (KB.guides || []).forEach(function (g) {
        html += '<button class="' + (state.guide === g.id ? "on" : "") + '" data-guide="' + g.id + '">' +
          esc(g.name) + "</button>";
      });
      html += "</div>";
    } else if (state.tab === "case") {
      var types = ["全部", "漏检", "误判", "定位失败"];
      html += '<div class="chips" style="margin-bottom:10px">' + types.map(function (t) {
        return '<button class="chip' + (state.caseFilter === t ? " on" : "") + '" data-casefilter="' + t + '">' + t + "</button>";
      }).join("") + "</div>";
      html += '<div class="snav">';
      (KB.cases || []).forEach(function (c) {
        if (state.caseFilter !== "全部" && c.type !== state.caseFilter) return;
        html += '<button class="' + (state.caseId === c.id ? "on" : "") + '" data-case="' + c.id + '">' +
          '<span>' + esc(c.station + " · " + c.title) + "</span></button>";
      });
      html += "</div>";
    } else if (state.tab === "gloss") {
      var groups = [];
      (KB.glossary || []).forEach(function (g) { if (groups.indexOf(g.g) < 0) groups.push(g.g); });
      html += '<div class="snav"><div class="grp">分组</div>';
      html += '<button class="' + (!state.glossGroup ? "on" : "") + '" data-gloss="">全部</button>';
      groups.forEach(function (g) {
        var n = (KB.glossary || []).filter(function (x) { return x.g === g; }).length;
        html += '<button class="' + (state.glossGroup === g ? "on" : "") + '" data-gloss="' + esc(g) + '">' +
          esc(g) + "<small>" + n + "</small></button>";
      });
      html += "</div>";
    } else if (state.tab === "doc") {
      html += '<input class="dfilter" id="docfilter" placeholder="筛选章节标题…" value="' + esc(state.docFilter) + '">';
      html += '<div class="snav">';
      SECTIONS.forEach(function (s) {
        if (s.level < 1 || s.level > 3) return;
        if (state.docFilter && s.title.indexOf(state.docFilter) < 0 && s.path.indexOf(state.docFilter) < 0) return;
        html += '<button class="lvl' + Math.min(3, s.level) + (state.docId === s.id ? " on" : "") +
          '" data-doc="' + s.id + '">' + esc(s.title) + "</button>";
      });
      html += "</div>";
    }
    if (state.tab === "learn" && window.LEARNUI) html += LEARNUI.side();
    $("#side").innerHTML = html;
  }

  /* ---------------- views: quick ---------------- */
  function chapterOf(name) {
    for (var i = 0; i < SECTIONS.length; i++) {
      if (SECTIONS[i].level === 1 && SECTIONS[i].title.indexOf(name) >= 0) return SECTIONS[i];
    }
    return null;
  }

  function bullets(arr) {
    if (!arr || !arr.length) return "";
    return '<ul class="bul">' + arr.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
  }

  function chips(list) {
    if (!list || !list.length) return "";
    return '<div class="chips" style="margin-top:6px">' + list.map(function (d) {
      return '<span class="tag">' + esc(d) + "</span>";
    }).join("") + "</div>";
  }

  function stageHtml(sg) {
    var h = '<div class="stage"><h4>' + esc(sg.no);
    if (sg.condition) h += '<span class="tag gray">' + esc(sg.condition) + "</span>";
    h += "</h4>";
    h += '<div class="meta">光源：' + esc(sg.light) + " ｜ 采图：" + esc(sg.shots) + "</div>";
    if (sg.purpose) h += "<div>" + esc(sg.purpose) + "</div>";
    if (sg.anchor) h += '<div class="anchor"><b>亮度锚点 / 合格判据</b>' + esc(sg.anchor) + "</div>";
    if (sg.detects && sg.detects.length) {
      h += '<div class="meta" style="margin-top:8px">可检出缺陷</div>' + chips(sg.detects);
    }
    if (sg.items && sg.items.length) {
      h += '<div class="meta" style="margin-top:8px">本阶段对应检测项</div>' + chips(sg.items);
    }
    if (sg.checks && sg.checks.length) {
      h += "<h4>成像核查</h4>" + bullets(sg.checks);
    }
    if (sg.forbidden && sg.forbidden.length) {
      h += "<h4>禁止出现的画面</h4>" + bullets(sg.forbidden.map(function (x) { return "✕ " + x; }));
    }
    if (sg.tune && sg.tune.length) {
      h += "<h4>亮度 / 曝光怎么调</h4>" + bullets(sg.tune);
    }
    if (sg.risk) h += '<div class="risk">风险：' + esc(sg.risk) + "</div>";
    return h + "</div>";
  }

  /* ---------------- 教学层（亮度锚点 / 检测项 / 型号矩阵） ---------------- */
  function teachFlow(st) {
    var fl = st.teach && st.teach.flow;
    if (!fl || !(fl.steps || []).length) return "";
    var pics = 0;
    var body = fl.steps.map(function (s) {
      var h = '<div class="step"><div class="n">' + esc(s.n) + '</div><div><div class="st">' + esc(s.t);
      if (s.sec) h += ' <a class="tag gray" href="#/doc/' + esc(s.sec) + '">手册原文 →</a>';
      h += "</div>" + bullets(s.d);
      if (s.imgs && s.imgs.length) {
        pics += s.imgs.length;
        h += '<div class="imgs">' + s.imgs.map(function (im) {
          return imgPath(im.f, im.c);
        }).join("") + "</div>";
      }
      return h + "</div></div>";
    }).join("");
    return '<div class="card"><h3>' + esc(fl.title || "标准调参完整流程") +
      '<span class="tag gray" style="margin-left:8px">' + fl.steps.length + " 步 · 配图 " + pics + " 张</span></h3>" +
      '<p class="note">' + esc(fl.intro || "") + "</p>" +
      '<div class="flow">' + body + "</div></div>";
  }

  function teachBright(st) {
    var b = st.teach && st.teach.brightness;
    if (!b) return "";
    var html = '<div class="card"><h3>成像与亮度调校总则</h3>' +
      '<p class="note">手册给的是「判据 + 界面读数」，不是绝对曝光 / 光源百分比：出厂已完成标定，现场只按判据微调，并用样件复测。</p>';
    if (b.order && b.order.length) {
      html += '<div class="tblwrap"><table><thead><tr><th style="width:140px">调校顺序</th><th>做法与理由</th></tr></thead><tbody>' +
        b.order.map(function (o) {
          return "<tr><td><b>" + esc(o.k) + '</b></td><td>' + esc(o.d) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    if (b.anchors && b.anchors.length) {
      html += '<div class="teachgrid">' + b.anchors.map(function (a) {
        return '<div class="anchor"><b>' + esc(a.t) + "</b>" + esc(a.d) + "</div>";
      }).join("") + "</div>";
    }
    if (b.conflicts && b.conflicts.length) {
      html += "<h4>口径与冲突提示（照这里执行）</h4>" + b.conflicts.map(function (c) {
        return '<div class="pit"><b>' + esc(c.t) + "</b><span>" + esc(c.d) + "</span></div>";
      }).join("");
    }
    return html + "</div>";
  }

  function teachPipeline(pl) {
    if (!pl) return "";
    return '<div class="card"><h3>' + esc(pl.title) + '</h3><p class="note">' + esc(pl.note || "") + "</p>" +
      '<div class="flow">' + (pl.steps || []).map(function (s) {
        return '<div class="step"><div class="n">' + esc(s.n) + '</div><div><div class="st">' + esc(s.t) +
          "</div><div>" + esc(s.d) + "</div></div></div>";
      }).join("") + "</div></div>";
  }

  function teachItems(st) {
    var list = st.teach && st.teach.items;
    if (!list || !list.length) return "";
    var html = '<div class="card"><h3>检测项逐项速查（' + list.length + " 项）</h3>" +
      '<p class="note">每个检测项只做三件事：确认它在哪个阶段成像 → 对上关键参数推荐值 → 按「漏检反向、误判正向」微调。</p>' +
      '<div class="tblwrap"><table><thead><tr><th style="width:20%">检测项 / 位置</th><th style="width:38%">关键参数与推荐值</th><th>调参方向 / 陷阱</th></tr></thead><tbody>' +
      list.map(function (it) {
        var p = (it.params || []).map(function (x) {
          return "<div><b>" + esc(x.k) + "</b>：" + esc(x.v) + (x.d ? ' <span class="note">（' + esc(x.d) + "）</span>" : "") + "</div>";
        }).join("");
        return "<tr><td><b>" + esc(it.name) + "</b>" +
          (it.at ? '<div class="note">' + esc(it.at) + "</div>" : "") +
          (it.sys ? '<div class="note">体系：' + esc(it.sys) + "</div>" : "") +
          "</td><td>" + p + "</td><td>" +
          (it.tips || []).map(function (t) { return "<div>" + esc(t) + "</div>"; }).join("") +
          "</td></tr>";
      }).join("") + "</tbody></table></div></div>";
    return html;
  }

  function teachModels(st) {
    var ms = st.teach && st.teach.models;
    if (!ms || !ms.length) return "";
    var html = '<div class="card"><h3>各型号 · 各阶段开什么检测项</h3>' +
      '<p class="note">先选产品类型，再按阶段逐行勾选。同一个编号在不同模块里可能重名，看「模块」不看数字。</p>';
    ms.forEach(function (m) {
      html += '<h4>' + esc(m.key) + "</h4>" +
        '<div class="tblwrap"><table class="mx"><thead><tr><th style="width:96px">阶段</th><th>开启的检测项</th></tr></thead><tbody>' +
        (m.stages || []).map(function (s) {
          return '<tr><td class="num">' + esc(s.no) + "</td><td>" + esc(s.on || "—") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    });
    if (st.teach.modelNote) html += '<p class="note">' + esc(st.teach.modelNote) + "</p>";
    return html + "</div>";
  }

  function teachQA(st) {
    var qa = st.teach && st.teach.qa;
    if (!qa || !qa.length) return "";
    return '<div class="card"><h3>现场问答（新人最常问）</h3>' + qa.map(function (q) {
      return '<div class="pit" style="border-color:var(--accent)"><b>' + esc(q.q) + "</b><span>" + esc(q.a) + "</span></div>";
    }).join("") + "</div>";
  }

  /* 30 秒结论：速查页第一屏只给这三行 */
  function simBlock(l) {
    if (!l) return "";
    return '<div class="sim">' +
      '<div><b>看什么</b><span>' + esc(l.see) + "</span></div>" +
      '<div><b>按这个顺序调</b><span>' + esc(l.tune) + "</span></div>" +
      '<div class="no"><b>别这么做</b><span>' + esc(l.stop) + "</span></div>" +
      "</div>";
  }

  /* 折叠区块：长内容默认收起，首屏只留结论 */
  function acc(title, body, open) {
    if (!body) return "";
    return '<details class="acc"' + (open ? " open" : "") + '><summary>' + esc(title) +
      '</summary><div class="acc-body">' + body + "</div></details>";
  }

  /* 两款机型差异（切换机型时高亮当前列） */
  function machineDiffView() {
    var rows = KB.machineDiff || [];
    var html = '<div class="card"><div class="rowhead"><h2>8 工位 vs 6 工位：只差这 3 处</h2>' +
      '<span class="tag gray">当前：' + esc(machineName(state.machine)) + "</span></div>" +
      '<p class="note">软件、算法、参数区间、调参流程完全相同；会用一款，另一款直接上手。切换右上角机型，速查页的阶段数、相机分工与提示会跟着变。</p>' +
      '<div class="tblwrap"><table><thead><tr><th style="width:130px">项目</th><th>8 工位</th><th>6 工位</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return "<tr><td><b>" + esc(r.item) + "</b></td><td" + (state.machine === "m8" ? ' class="hl"' : "") + ">" +
          esc(r.m8) + "</td><td" + (state.machine === "m6" ? ' class="hl"' : "") + ">" + esc(r.m6) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<div class="chips" style="margin-top:12px">' +
      '<button class="chip" data-route="#/quick/face">端面工位（' + esc(machineName(state.machine)) + "）</button>" +
      '<button class="chip" data-route="#/live/m6-config">6 工位凹陷整类漏检怎么查</button>' +
      "</div></div>";
    return html;
  }

  function quickView() {
    if (state.station === "matrix") return productMatrix();
    if (state.station === "diff") return machineDiffView();
    var st = stationById(state.station) || (KB.stations || [])[0];
    if (!st) return '<div class="card">知识库为空：请先运行 tools/build_web_data.py 生成 web/data/manual.js，并确认 web/data/knowledge.js 存在。</div>';

    var ch = chapterOf(st.name);
    var html = '<div class="card"><div class="rowhead"><h2>' + esc(st.name) + "工位</h2>" +
      '<span class="tag">' + esc(st.difficulty) + "</span>" +
      '<span class="tag gray">' + esc(machineName(state.machine)) + " 相机 " + esc((st.camera || {})[state.machine] || "—") + "</span>" +
      (ch ? '<a class="tag gray" href="#/doc/' + ch.id + '">手册原文 →</a>' : "") +
      "</div>";
    if (st.lite) html += simBlock(st.lite);
    if (st.gating) html += '<div class="gate">' + esc(st.gating) + "</div>";
    html += acc("算法 / 光源 / 相机分工 / 典型缺陷",
      '<dl class="kv">' +
      "<dt>检测算法</dt><dd>" + esc(st.algo) + "</dd>" +
      "<dt>光源方案</dt><dd>" + esc(st.light) + "</dd>" +
      "<dt>相机分工</dt><dd>8 工位 " + esc((st.camera || {}).m8 || "—") + " ｜ 6 工位 " + esc((st.camera || {}).m6 || "—") + "</dd>" +
      "<dt>典型缺陷</dt><dd>" + esc((st.defects || []).join("、")) + "</dd>" +
      "</dl>" +
      (st.teach && st.teach.intro ? '<div class="quote">' + esc(st.teach.intro) + "</div>" : ""));
    html += "</div>";

    var stages = (st.stages || []).filter(function (s) { return !s.m || s.m === state.machine; });
    if (stages.length) {
      html += '<div class="card"><h3>阶段成像与检测内容' +
        '<span class="tag gray">' + esc(machineName(state.machine)) + " · " + stages.length + " 阶段</span></h3>" +
        ((st.stages || []).length > stages.length
          ? '<p class="note">已隐藏 ' + ((st.stages || []).length - stages.length) + " 个另一机型专属阶段（切换右上角机型可查看）。</p>"
          : "") +
        (st.id === "face"
          ? '<p class="note">阶段数按产品类型走：' + (state.machine === "m6"
            ? "闭式 4 阶段 9 张（阶段一~三 + 阶段四·A 六帧频闪）；开式保持架 6 阶段 11 张（再加阶段四·B 背光缺钉、阶段五 铆钉复合光、阶段六窗口频闪）。"
            : "闭式主相机只跑 3 阶段（阶段一~三），凹陷 / 气泡由 3 / 4 号独立跑马灯相机完成；开式保持架主相机 5 阶段（再加阶段四·B 背光缺钉、阶段五 铆钉复合光）。") + "</p>"
          : "") +
        stages.map(stageHtml).join("") + "</div>";
    }

    html += acc("亮度锚点 / 合格画面判据", teachBright(st));
    if (st.teach && st.teach.pipeline) html += acc("处理的先后顺序（pipeline）", teachPipeline(st.teach.pipeline));
    html += acc("型号 × 阶段矩阵", teachModels(st));
    html += acc("检测项逐项速查（" + (((st.teach || {}).items || []).length) + " 项）", teachItems(st));

    if (st.params && st.params.length) {
      html += acc("关键参数区间（真要调了再点开）",
        '<div class="tblwrap"><table><thead><tr><th>参数</th><th>合理区间</th><th>步长</th><th>说明</th></tr></thead><tbody>' +
        st.params.map(function (p) {
          return "<tr><td><b>" + esc(p.name) + "</b></td><td class=\"num\">" + esc(p.range) +
            "</td><td class=\"num\">" + esc(p.step) + "</td><td>" + esc(p.note) + "</td></tr>";
        }).join("") + "</tbody></table></div>");
    }

    if (st.rules && st.rules.length) {
      html += '<div class="card"><h3>必须先记住的规则</h3><div class="flow">' +
        st.rules.map(function (r) {
          return '<div class="pit" style="border-color:var(--accent)"><b>' + esc(r.title) + "</b><span>" + esc(r.desc) + "</span></div>";
        }).join("") + "</div></div>";
    }

    var tfl = teachFlow(st);
    if (tfl) html += acc("标准化调参流程（按原版步序，含手册配图）", tfl);
    else if (st.flow && st.flow.length) {
      html += acc("标准调参流程", '<div class="flow">' +
        st.flow.map(function (f) {
          return '<div class="step"><div class="n">' + esc(f.step) + '</div><div><div class="st">' + esc(f.title) + "</div>" +
            bullets(f.points) + "</div></div>";
        }).join("") + "</div>");
    }

    if (st.pitfalls && st.pitfalls.length) {
      html += '<div class="card"><h3>现场常见坑</h3>' +
        st.pitfalls.map(function (p) {
          return '<div class="pit"><b>' + esc(p.title) + "</b><span>" + esc(p.desc) + "</span></div>";
        }).join("") + "</div>";
    }

    html += acc("学员常问（按手册口径回答）", teachQA(st));

    var rel = (KB.cases || []).filter(function (c) {
      return (c.station || "").indexOf(st.name) >= 0;
    });
    if (rel.length) {
      html += acc("本工位相关案例（" + rel.length + " 条）", '<div class="casegrid">' +
        rel.map(function (x) {
          return '<div class="casecard" data-case="' + x.id + '"><b>' + esc(x.title) + "</b>" +
            '<div class="st">' + caseTag(x.type) + " " + esc(x.station) + "</div>" +
            '<div class="st" style="margin-top:6px">' + esc(x.symptom) + "</div></div>";
        }).join("") + "</div>");
    }

    if (st.id === "face") html += acc("产品阶段矩阵（" + esc(machineName(state.machine)) + "）", productMatrix());
    return html;
  }

  function productMatrix() {
    var p = productById(state.product) || (KB.products || [])[0];
    if (!p) return "";
    var html = '<div class="card"><h3>产品阶段矩阵（' + esc(machineName(state.machine)) + "）</h3>";
    html += '<div class="chips" style="margin-bottom:10px">' + (KB.products || []).map(function (x) {
      return '<button class="chip' + (x.id === p.id ? " on" : "") + '" data-product="' + x.id + '">' + esc(x.name) + "</button>";
    }).join("") + "</div>";
    html += '<dl class="kv">' +
      "<dt>端面阶段</dt><dd>" + esc(p.faceStages[state.machine] || "—") + "</dd>" +
      "<dt>别名</dt><dd>" + esc(p.alias || "—") + "</dd>" +
      "<dt>关注缺陷</dt><dd>" + esc((p.detectFocus || []).join("、")) + "</dd>" +
      "</dl>";
    html += '<div class="tblwrap"><table><thead><tr><th style="width:88px">阶段</th><th style="width:150px">光源</th><th>检测内容</th><th style="width:30%">要点</th></tr></thead><tbody>' +
      p.rows.map(function (r) {
        return "<tr><td class=\"num\">" + esc(r.stage) + "</td><td>" + esc(r.light) + "</td><td>" +
          esc(r.item) + "</td><td class=\"note\">" + esc(r.note) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    html += '<p class="note">产品类型选错会批量漏检 + 误判；阶段数与检测张数必须随机型 / 产品同步（<a href="#/guide/marquee">跑马灯设置 →</a>）。</p>';
    return html + "</div>";
  }

  /* ---------------- views: guide ---------------- */
  function guideView() {
    var g = guideById(state.guide) || (KB.guides || [])[0];
    if (!g) return '<div class="card">暂无专题内容。</div>';
    var html = '<div class="card"><div class="rowhead"><h2>' + esc(g.name) + "</h2>" +
      (g.tag ? '<span class="tag gray">' + esc(g.tag) + "</span>" : "") + "</div>";
    if (g.summary) html += '<div class="quote">' + esc(g.summary) + "</div>";
    if (g.steps && g.steps.length) {
      html += '<h3>操作步骤</h3><div class="flow">' + g.steps.map(function (s, i) {
        return '<div class="step"><div class="n">' + (i + 1) + '</div><div><div class="st">' + esc(s.t) +
          "</div><div>" + esc(s.d) + "</div></div></div>";
      }).join("") + "</div>";
    }
    if (g.checks && g.checks.length) html += "<h3>成像 / 结果核查</h3>" + bullets(g.checks);
    if (g.rules && g.rules.length && g.id !== "startup") {
      html += "<h3>要点</h3>" + '<ul class="bul">' + g.rules.map(function (r) {
        return "<li>" + esc(r) + "</li>";
      }).join("") + "</ul>";
    }
    if (g.id === "startup" && (KB.checklist || []).length) {
      html += "<h3>班前点检表（逐项核对）</h3>" + '<ol class="bul">' + KB.checklist.map(function (t) {
        return "<li>" + esc(t) + "</li>";
      }).join("") + "</ol>";
    }
    if (g.id === "calibrate" && (KB.redlines || []).length) {
      html += "<h3>调参红线（违反即停线）</h3>" + '<ul class="bul">' + KB.redlines.map(function (t) {
        return "<li>" + esc(t) + "</li>";
      }).join("") + "</ul>";
    }
    if (g.notes && g.notes.length) html += "<h3>备注</h3>" + bullets(g.notes);
    return html + "</div>";
  }

  /* ---------------- views: case ---------------- */
  function caseTag(type) {
    var cls = type === "漏检" ? "danger" : (type === "误判" ? "warn" : "gray");
    return '<span class="tag ' + cls + '">' + esc(type) + "</span>";
  }

  function caseView() {
    var c = state.caseId ? caseById(state.caseId) : null;
    if (!c) {
      var list = (KB.cases || []).filter(function (x) {
        return state.caseFilter === "全部" || x.type === state.caseFilter;
      });
      if (!list.length) return '<div class="card">没有符合条件的案例。</div>';
      return '<div class="card"><h3>案例库（' + list.length + " 条）</h3>" +
        '<p class="note">按「症状 → 根因 → 处理动作」组织，所有动作都来自手册实测记录，不靠抬阈值硬凑。</p>' +
        '<div class="casegrid">' + list.map(function (x) {
          return '<div class="casecard" data-case="' + x.id + '"><b>' + esc(x.title) + "</b>" +
            '<div class="st">' + caseTag(x.type) + " " + esc(x.station) + " · " + (x.imgs && x.imgs.length ? x.imgs.length + " 张图" : "无图") + "</div>" +
            '<div class="st" style="margin-top:6px">' + esc(x.symptom) + "</div></div>";
        }).join("") + "</div></div>";
    }

    var all = (KB.cases || []).filter(function (x) {
      return state.caseFilter === "全部" || x.type === state.caseFilter;
    });
    var idx = all.indexOf(c);
    var html = '<div class="card"><div class="rowhead"><h2>' + esc(c.title) + "</h2>" +
      caseTag(c.type) + '<span class="tag gray">' + esc(c.station) + "</span></div>";
    html += imgBlock(c.imgs, c.title);
    html += '<h3>现象</h3><p>' + esc(c.symptom) + "</p>";
    html += "<h3>根因</h3><p>" + esc(c.cause) + "</p>";
    html += "<h3>处理动作</h3><ol class=\"bul\">" + (c.action || []).map(function (a) {
      return "<li>" + esc(a) + "</li>";
    }).join("") + "</ol>";
    html += '<div class="rowhead" style="margin-top:16px">' +
      (idx > 0 ? '<button class="chip" data-case="' + all[idx - 1].id + '">← 上一条</button>' : "") +
      '<button class="chip" data-case="">全部案例</button>' +
      (idx >= 0 && idx < all.length - 1 ? '<button class="chip" data-case="' + all[idx + 1].id + '">下一条 →</button>' : "") +
      "</div>";
    return html + "</div>";
  }

  /* ---------------- views: glossary ---------------- */
  function glossView() {
    var list = (KB.glossary || []).filter(function (g) {
      return !state.glossGroup || g.g === state.glossGroup;
    });
    var groups = [];
    list.forEach(function (g) { if (groups.indexOf(g.g) < 0) groups.push(g.g); });
    var html = '<div class="card"><h2>参数释义</h2><p class="note">共 ' + (KB.glossary || []).length +
      " 个关键参数，按算法体系分组；区间为设备合理范围，超出区间即为违规调试。</p></div>";
    groups.forEach(function (grp) {
      html += '<div class="card"><h3>' + esc(grp) + "</h3><div class=\"tblwrap\"><table><thead><tr><th style=\"width:200px\">参数</th><th style=\"width:190px\">合理区间</th><th>含义 / 调整方向</th></tr></thead><tbody>" +
        list.filter(function (g) { return g.g === grp; }).map(function (g) {
          return "<tr><td><b>" + esc(g.name) + "</b></td><td class=\"num\">" + esc(g.range) + "</td><td>" + esc(g.mean) + "</td></tr>";
        }).join("") + "</tbody></table></div></div>";
    });
    return html;
  }

  /* ---------------- views: full text ---------------- */
  function imgPath(file, cap) {
    if (!file) return "";
    return '<figure><img loading="lazy" src="' + file + '" alt="' + esc(cap || "") +
      '" data-full="' + file + '" data-cap="' + esc(cap || "") + '"><figcaption>' +
      esc(cap || "配图") + "</figcaption></figure>";
  }

  function renderSection(s) {
    var tag = s.level === 1 ? "h2" : (s.level === 2 ? "h3" : "h4");
    var h = '<section class="sec lv' + s.level + '" id="' + s.id + '">' +
      "<" + tag + ">" + esc(s.title) + "</" + tag + ">";
    (s.body || []).forEach(function (b) {
      if (b.t === "p") {
        h += "<p>" + esc(b.text) + "</p>";
        if (b.img) h += '<div class="imgs">' + imgPath(b.img, "") + "</div>";
      } else if (b.t === "img") {
        h += '<div class="imgs">' + (b.src || []).map(function (f) { return imgPath(f, b.cap); }).join("") + "</div>";
      } else if (b.t === "table") {
        h += '<div class="tblwrap"><table><tbody>' + b.rows.map(function (r) {
          return "<tr>" + r.map(function (c) {
            return "<td>" + (c.text ? esc(c.text) : "") +
              (c.img && c.img.length ? '<div class="imgs">' + c.img.map(function (f) { return imgPath(f, ""); }).join("") + "</div>" : "") +
              "</td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
      }
    });
    if (s.level >= 1) {
      h += '<div class="lbtns secact"><button class="chip" data-l="go" data-x="#/learn/kp/' + s.id +
        '">练这一节 →</button><span class="note">到「学」里只练本节对应的判断题与判读题</span></div>';
    }
    return h + "</section>";
  }

  function docView() {
    var s = sectionById(state.docId) || SECTIONS.filter(function (x) { return x.level >= 1; })[0];
    if (!s) return '<div class="card">未找到手册全文数据，请先运行 tools/build_web_data.py。</div>';
    var start = SECTIONS.indexOf(s), out = [s], count = 0;
    for (var i = start + 1; i < SECTIONS.length && count < 40; i++) {
      if (SECTIONS[i].level <= s.level) break;
      out.push(SECTIONS[i]); count++;
    }
    var navs = SECTIONS.filter(function (x) { return x.level >= 1 && x.level <= 3; });
    var ni = navs.indexOf(s);
    var html = '<div class="card doc"><div class="dochead">' + esc(s.path) + "</div>" +
      out.map(renderSection).join("") +
      '<div class="rowhead" style="margin-top:18px">' +
      (ni > 0 ? '<button class="chip" data-doc="' + navs[ni - 1].id + '">← ' + esc(navs[ni - 1].title) + "</button>" : "") +
      (ni >= 0 && ni < navs.length - 1 ? '<button class="chip" data-doc="' + navs[ni + 1].id + '">' + esc(navs[ni + 1].title) + " →</button>" : "") +
      "</div></div>";
    return html;
  }

  /* ---------------- render & events ---------------- */
  function renderAll() {
    renderSide();
    var view = $("#view"), html;
    if (state.tab === "quick") html = quickView();
    else if (state.tab === "live") {
      html = window.LITEUI ? LITEUI.view(state) :
        '<div class="card"><h2>现场模块未加载</h2><p class="note">请确认 <code>web/data/scenarios.js</code> 与 <code>web/assets/lite.js</code> 存在。</p></div>';
    }
    else if (state.tab === "drill") {
      html = window.LITEUI ? LITEUI.drillView(state) :
        '<div class="card"><h2>练习模块未加载</h2><p class="note">请确认 <code>web/data/scenarios.js</code> 与 <code>web/assets/lite.js</code> 存在。</p></div>';
    }
    else if (state.tab === "guide") html = guideView();
    else if (state.tab === "case") html = caseView();
    else if (state.tab === "gloss") html = glossView();
    else if (state.tab === "learn") {
      html = window.LEARNUI ? LEARNUI.view(state) :
        '<div class="card"><h2>教学模块未加载</h2><p class="note">请确认 <code>web/data/learn.js</code> 与 <code>web/assets/learn.js</code> 存在，然后运行 <code>node tools/build_learn.js</code> 重新生成。</p></div>';
    }
    else html = docView();
    html += '<div class="foot" title="' + esc((KB.meta && KB.meta.rev) || "") + '">数据源：《成品轴承操作手册细化版本.docx》 · 速查 v' +
      esc((KB.meta && KB.meta.version) || "1.0") +
      (KB.meta && KB.meta.updated ? "（数据更新 " + esc(KB.meta.updated) + "）" : "") +
      " · 全文 " + SECTIONS.length + " 节 · 图片 " +
      Object.keys(IMGS).length + " 张 · 按 <span class=\"kbd\">/</span> 搜索</div>";
    view.innerHTML = html;

    var df = $("#docfilter");
    if (df) {
      df.addEventListener("input", function () {
        state.docFilter = df.value.trim();
        renderSide();
        var el = $("#docfilter");
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      });
    }
  }

  function switchTab(tab) {
    state.tab = tab;
    if (tab === "guide" && !state.guide) state.guide = (KB.guides && KB.guides[0]) ? KB.guides[0].id : "";
    if (tab === "case") state.caseId = "";
    if (tab === "doc" && !state.docId) state.docId = SECTIONS.length ? SECTIONS[0].id : "";
    go("#/" + tab);
  }

  window.KB_RENDER = function () { renderAll(); };

  function openLightbox(img) {
    var lb = $("#lightbox");
    lb.querySelector("img").src = img.getAttribute("data-full");
    lb.querySelector(".cap").textContent = img.getAttribute("data-cap") || "";
    lb.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeLightbox() {
    $("#lightbox").hidden = true;
    document.body.style.overflow = "";
  }

  /* ---------------- search UI ---------------- */
  function hideResults() {
    $("#results").hidden = true;
    $("#qclear").hidden = true;
  }

  function doSearch(q) {
    var box = $("#results");
    if (!q || !q.trim()) { hideResults(); return; }
    results.list = search(q);
    results.active = 0;
    $("#qclear").hidden = false;
    box.hidden = false;
    if (!results.list.length) {
      box.innerHTML = '<div class="rempty">没有匹配「' + esc(q.trim()) + '」的内容，试试：端面 阶段二 / 跑马灯 / 内径识别区域偏移 / 倒角磕碰</div>';
      return;
    }
    box.innerHTML = results.list.map(function (r, i) {
      return '<button class="ritem' + (i === 0 ? " active" : "") + '" data-href="' + esc(r.it.href) + '">' +
        '<div class="rt">' + esc(r.it.title) + ' <span class="tag gray" style="font-size:11px">' + esc(r.it.kind) + "</span></div>" +
        '<div class="rb">' + esc(r.it.sub) + "</div>" +
        '<div class="rs">' + snippet(r.it, r.terms) + "</div></button>";
    }).join("");
  }

  function moveActive(d) {
    if (!results.list.length) return;
    results.active = Math.max(0, Math.min(results.list.length - 1, results.active + d));
    var items = $("#results").querySelectorAll(".ritem");
    for (var i = 0; i < items.length; i++) items[i].classList.toggle("active", i === results.active);
    var cur = items[results.active];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
  }

  /* ---------------- bind & init ---------------- */
  function bind() {
    document.addEventListener("click", function (e) {
      var t = e.target;
      var img = t.closest && t.closest("img[data-full]");
      if (img) { openLightbox(img); return; }

      var lh = t.closest && t.closest("[data-l]");
      if (lh && window.LEARNUI && LEARNUI.click(lh)) return;

      var hit = t.closest && t.closest("[data-href]");
      if (hit) { hideResults(); $("#q").blur(); go(hit.getAttribute("data-href")); return; }

      var el = t.closest && t.closest("[data-route],[data-tab],[data-station],[data-guide],[data-case],[data-product],[data-doc],[data-gloss],[data-casefilter]");
      if (!el) {
        if (!t.closest || !t.closest("#results")) hideResults();
        return;
      }
      var d = el.dataset;

      if (d.route) { go(d.route); return; }
      if (d.tab !== undefined) {
        if (d.guide) { state.tab = "guide"; state.guide = d.guide; go("#/guide/" + d.guide); return; }
        switchTab(d.tab);
        return;
      }
      if (d.station) { state.station = d.station; go("#/quick/" + d.station); return; }
      if (d.guide) { state.tab = "guide"; state.guide = d.guide; go("#/guide/" + d.guide); return; }
      if (d.product) { state.product = d.product; renderAll(); return; }
      if (d.case !== undefined) { state.tab = "case"; go(d.case ? "#/case/" + d.case : "#/case"); return; }
      if (d.casefilter) { state.caseFilter = d.casefilter; state.caseId = ""; renderAll(); return; }
      if (d.doc) { state.tab = "doc"; state.docId = d.doc; go("#/doc/" + d.doc); return; }
      if (d.gloss !== undefined) { state.glossGroup = d.gloss; renderAll(); return; }
    });

    $("#lightbox").addEventListener("click", closeLightbox);

    document.addEventListener("keydown", function (e) {
      if (!$("#lightbox").hidden && e.key === "Escape") { closeLightbox(); return; }
      var q = $("#q");
      var ae = document.activeElement;
      var inField = ae && (ae.tagName === "INPUT" || ae.tagName === "SELECT" || ae.tagName === "TEXTAREA");
      if (e.key === "/" && !inField) { e.preventDefault(); q.focus(); q.select(); return; }
      if (document.activeElement === q) {
        if (e.key === "Escape") { hideResults(); q.blur(); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); moveActive(1); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1); return; }
        if (e.key === "Enter") {
          e.preventDefault();
          var item = results.list[results.active];
          if (item) { hideResults(); q.blur(); go(item.it.href); }
          return;
        }
      }
    });

    $("#q").addEventListener("input", function () { doSearch(this.value); });
    $("#qclear").addEventListener("click", function () { $("#q").value = ""; hideResults(); $("#q").focus(); });
    $("#machine").addEventListener("change", function () {
      state.machine = this.value;
      try { localStorage.setItem("kb.machine", this.value); } catch (err) { /* 隐私模式忽略 */ }
      renderAll();
    });
    window.addEventListener("hashchange", function () { parseHash(); renderAll(); window.scrollTo(0, 0); });
  }

  function init() {
    var brandSub = document.querySelector(".topbar .brand span");
    if (brandSub && KB.meta) {
      brandSub.textContent = "调试速查 v" + (KB.meta.version || "1.0");
      brandSub.title = (KB.meta.rev || "") + (KB.meta.updated ? "（数据更新 " + KB.meta.updated + "）" : "");
    }
    var sel = $("#machine");
    if (sel && KB.machines) {
      sel.innerHTML = KB.machines.map(function (m) {
        return '<option value="' + m.id + '">' + esc(m.name) + "</option>";
      }).join("");
      var valid = KB.machines.filter(function (m) { return m.id === state.machine; })[0];
      if (!valid) state.machine = KB.machines[0] ? KB.machines[0].id : "m8";
      sel.value = state.machine;
    }
    buildIndex();
    parseHash();
    renderAll();
    bind();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
