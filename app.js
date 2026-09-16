(function () {
  "use strict";

  var VISITOR_TOKEN_KEY = "hb_visitor_token";

  var categoriesState = [];  // [{id, name}]
  var questionsState = [];   // [{id, text, nickname, category_id, created_at}]
  var repliesCache = {};     // question_id -> [{id, text, nickname, created_at}]
  var expandedId = null;
  var mainTimer = null;
  var repliesTimer = null;
  var appStarted = false;

  function visitorToken() { return localStorage.getItem(VISITOR_TOKEN_KEY) || ""; }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function timeAgo(iso) {
    var ts = new Date(iso).getTime();
    var diff = Date.now() - ts;
    var m = Math.floor(diff / 60000);
    if (m < 1) return "방금";
    if (m < 60) return m + "분 전";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "시간 전";
    var d = Math.floor(h / 24);
    if (d < 7) return d + "일 전";
    var dt = new Date(ts);
    return (dt.getMonth() + 1) + "/" + dt.getDate();
  }

  function fetchJSON(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, { "x-visitor-token": visitorToken() });
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
        return data;
      });
    });
  }

  // ---------- gate ----------

  function showMain() {
    document.getElementById("gateArea").hidden = true;
    document.getElementById("mainArea").hidden = false;
  }
  function showGate() {
    document.getElementById("gateArea").hidden = false;
    document.getElementById("mainArea").hidden = true;
  }

  function verifyAndEnter(token, silent) {
    var statusEl = document.getElementById("gateStatus");
    if (!silent) statusEl.textContent = "확인하는 중…";
    return fetch("/api/visitor/verify", { method: "POST", headers: { "x-visitor-token": token } })
      .then(function (r) { return r.ok; })
      .then(function (ok) {
        if (ok) {
          localStorage.setItem(VISITOR_TOKEN_KEY, token);
          statusEl.textContent = "";
          showMain();
          startApp();
        } else {
          localStorage.removeItem(VISITOR_TOKEN_KEY);
          showGate();
          if (!silent) statusEl.textContent = "비밀번호가 올바르지 않아요.";
        }
      })
      .catch(function () {
        if (!silent) statusEl.textContent = "확인 중 오류가 발생했어요. 다시 시도해 주세요.";
      });
  }

  document.getElementById("gateBtn").addEventListener("click", function () {
    var pw = document.getElementById("visitorPw").value.trim();
    if (!pw) return;
    verifyAndEnter(pw, false);
  });
  document.getElementById("visitorPw").addEventListener("keydown", function (e) {
    if (e.key === "Enter") document.getElementById("gateBtn").click();
  });

  // ---------- rendering ----------

  function rebuildCatalog() {
    var catalog = document.getElementById("catalog");
    var stats = document.getElementById("stats");

    if (questionsState.length === 0) {
      catalog.innerHTML = '<p class="empty-note">아직 등록된 질문이 없어요. 첫 질문을 남겨보세요.</p>';
      stats.textContent = "";
      return;
    }

    var catNameById = {};
    categoriesState.forEach(function (c) { catNameById[c.id] = c.name; });

    var groups = {};
    questionsState.forEach(function (q) {
      var key = q.category_id || "__pending__";
      if (!groups[key]) {
        groups[key] = {
          name: q.category_id ? (catNameById[q.category_id] || "(삭제된 카테고리)") : "정리 전",
          pending: !q.category_id,
          items: []
        };
      }
      groups[key].items.push(q);
    });

    var keys = Object.keys(groups).sort(function (a, b) {
      if (groups[a].pending) return -1;
      if (groups[b].pending) return 1;
      var diff = groups[b].items.length - groups[a].items.length;
      if (diff !== 0) return diff;
      return groups[a].name.localeCompare(groups[b].name, "ko");
    });

    var catCount = keys.filter(function (k) { return !groups[k].pending; }).length;
    stats.textContent = catCount + "개 서랍 · " + questionsState.length + "개 질문";

    catalog.innerHTML = keys.map(function (key) {
      var g = groups[key];
      var items = g.items.slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      var cardsHtml = items.map(renderCard).join("");
      return (
        '<article class="drawer' + (g.pending ? " pending" : "") + '">' +
          '<header class="drawer-head"><h2>' + escapeHtml(g.name) + '</h2><span class="count">' + g.items.length + '</span></header>' +
          '<ul class="cards">' + cardsHtml + '</ul>' +
        '</article>'
      );
    }).join("");

    if (expandedId) renderRepliesFor(expandedId);
  }

  function renderCard(q) {
    var isOpen = expandedId === q.id;
    return (
      '<li class="card" data-id="' + q.id + '">' +
        '<button class="card-toggle" type="button" data-action="toggle" data-id="' + q.id + '">' +
          '<p class="card-text">' + escapeHtml(q.text) + '</p>' +
          '<p class="card-meta"><span class="nick">' + escapeHtml(q.nickname || "익명") + '</span><span>·</span><time>' + timeAgo(q.created_at) + '</time></p>' +
        '</button>' +
        '<div class="thread" data-id="' + q.id + '"' + (isOpen ? "" : " hidden") + '>' +
          '<ul class="replies" data-id="' + q.id + '"><li class="no-reply">불러오는 중…</li></ul>' +
          '<div class="reply-form">' +
            '<div class="row">' +
              '<input class="reply-nick" type="text" maxlength="20" placeholder="익명" />' +
              '<textarea class="reply-text" maxlength="300" rows="2" placeholder="의견을 남겨보세요… (Ctrl/Cmd+Enter)"></textarea>' +
            '</div>' +
            '<button class="reply-submit btn-secondary" type="button" data-action="reply" data-id="' + q.id + '">답변 남기기</button>' +
          '</div>' +
        '</div>' +
      '</li>'
    );
  }

  function renderRepliesFor(id) {
    var ul = document.querySelector('.replies[data-id="' + id + '"]');
    if (!ul) return;
    var list = repliesCache[id];
    if (!list) { ul.innerHTML = '<li class="no-reply">불러오는 중…</li>'; return; }
    if (list.length === 0) { ul.innerHTML = '<li class="no-reply">아직 답변이 없어요. 첫 답변을 남겨보세요.</li>'; return; }
    ul.innerHTML = list.map(function (r) {
      return (
        '<li class="reply">' +
          '<p>' + escapeHtml(r.text) + '</p>' +
          '<p class="card-meta"><span class="nick">' + escapeHtml(r.nickname || "익명") + '</span><span>·</span><time>' + timeAgo(r.created_at) + '</time></p>' +
        '</li>'
      );
    }).join("");
  }

  // ---------- polling ----------

  function loadAll() {
    return Promise.all([
      fetchJSON("/api/categories"),
      fetchJSON("/api/questions")
    ]).then(function (results) {
      categoriesState = results[0];
      questionsState = results[1];
      rebuildCatalog();
    }).catch(function () { /* 일시적 오류는 다음 폴링에서 회복돼요 */ });
  }

  function loadReplies(id) {
    return fetchJSON("/api/replies?question_id=" + encodeURIComponent(id)).then(function (data) {
      repliesCache[id] = data;
      if (expandedId === id) renderRepliesFor(id);
    }).catch(function () { /* 다음 폴링에서 회복 */ });
  }

  function startRepliesPolling(id) {
    loadReplies(id);
    repliesTimer = setInterval(function () { loadReplies(id); }, 3000);
  }
  function stopRepliesPolling() {
    if (repliesTimer) { clearInterval(repliesTimer); repliesTimer = null; }
  }

  // ---------- interaction ----------

  function toggleCard(id) {
    if (expandedId === id) {
      expandedId = null;
      stopRepliesPolling();
      rebuildCatalog();
      return;
    }
    stopRepliesPolling();
    expandedId = id;
    rebuildCatalog();
    startRepliesPolling(id);
  }

  function submitReply(id, cardEl) {
    var nickInput = cardEl.querySelector(".reply-nick");
    var textInput = cardEl.querySelector(".reply-text");
    var btn = cardEl.querySelector(".reply-submit");
    var text = textInput.value.trim();
    if (!text) { textInput.focus(); return; }
    var nickname = nickInput.value.trim() || "익명";
    localStorage.setItem("qc_nickname", nickname);
    btn.disabled = true;
    fetchJSON("/api/replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_id: id, text: text, nickname: nickname })
    }).then(function () {
      textInput.value = "";
      return loadReplies(id);
    }).catch(function () { /* 실패해도 버튼만 풀어주고 재시도 유도 */ }).finally(function () {
      btn.disabled = false;
    });
  }

  document.getElementById("catalog").addEventListener("click", function (e) {
    var toggleBtn = e.target.closest('[data-action="toggle"]');
    if (toggleBtn) { toggleCard(toggleBtn.getAttribute("data-id")); return; }
    var replyBtn = e.target.closest('[data-action="reply"]');
    if (replyBtn) submitReply(replyBtn.getAttribute("data-id"), replyBtn.closest(".card"));
  });

  document.getElementById("catalog").addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && e.target.classList.contains("reply-text")) {
      var card = e.target.closest(".card");
      submitReply(card.getAttribute("data-id"), card);
    }
  });

  // ---------- submit question ----------

  function submitQuestion() {
    var textEl = document.getElementById("questionText");
    var nickEl = document.getElementById("nickname");
    var statusEl = document.getElementById("composerStatus");
    var btn = document.getElementById("submitQuestion");

    var text = textEl.value.trim();
    if (!text) { textEl.focus(); return; }
    var nickname = nickEl.value.trim() || "익명";
    localStorage.setItem("qc_nickname", nickname);

    btn.disabled = true;
    statusEl.textContent = "등록하는 중…";

    fetchJSON("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, nickname: nickname })
    }).then(function () {
      textEl.value = "";
      statusEl.textContent = "질문을 올렸어요. 곧 관리자가 정리해줄 거예요.";
      setTimeout(function () { statusEl.textContent = ""; }, 3000);
      return loadAll();
    }).catch(function () {
      statusEl.textContent = "등록에 실패했어요. 다시 시도해 주세요.";
    }).finally(function () {
      btn.disabled = false;
    });
  }

  document.getElementById("submitQuestion").addEventListener("click", submitQuestion);
  document.getElementById("questionText").addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submitQuestion();
  });

  var savedNick = localStorage.getItem("qc_nickname");
  if (savedNick) document.getElementById("nickname").value = savedNick;

  // ---------- boot ----------

  function startApp() {
    if (appStarted) return;
    appStarted = true;

    loadAll();
    mainTimer = setInterval(loadAll, 5000);

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        if (mainTimer) { clearInterval(mainTimer); mainTimer = null; }
        stopRepliesPolling();
      } else {
        loadAll();
        if (!mainTimer) mainTimer = setInterval(loadAll, 5000);
        if (expandedId) startRepliesPolling(expandedId);
      }
    });
  }

  var savedToken = visitorToken();
  if (savedToken) {
    verifyAndEnter(savedToken, true);
  } else {
    showGate();
  }
})();
