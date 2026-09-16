(function () {
  "use strict";

  if (!window.SUPABASE_URL || window.SUPABASE_URL.indexOf("YOUR-PROJECT") !== -1) {
    var banner = document.getElementById("configBanner");
    banner.hidden = false;
    banner.textContent = "config.js에 Supabase URL/키를 아직 안 넣으셨어요. README를 참고해 설정해주세요.";
    document.getElementById("submitQuestion").disabled = true;
    return;
  }

  var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  var categoriesState = [];  // [{id, name}]
  var questionsState = [];   // [{id, text, nickname, category_id, created_at}]
  var repliesCache = {};     // question_id -> [{id, text, nickname, created_at}]
  var expandedId = null;
  var repliesChannel = null;

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

    var groups = {}; // key -> {name, pending, items:[]}
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

  // ---------- interaction ----------

  function toggleCard(id) {
    if (expandedId === id) {
      expandedId = null;
      if (repliesChannel) { sb.removeChannel(repliesChannel); repliesChannel = null; }
      rebuildCatalog();
      return;
    }
    if (repliesChannel) { sb.removeChannel(repliesChannel); repliesChannel = null; }
    expandedId = id;
    rebuildCatalog();
    loadAndSubscribeReplies(id);
  }

  function loadAndSubscribeReplies(id) {
    sb.from("replies").select("*").eq("question_id", id).order("created_at", { ascending: true })
      .then(function (res) {
        repliesCache[id] = res.data || [];
        if (expandedId === id) renderRepliesFor(id);
      });

    repliesChannel = sb.channel("replies-" + id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "replies", filter: "question_id=eq." + id }, function (payload) {
        if (!repliesCache[id]) repliesCache[id] = [];
        repliesCache[id].push(payload.new);
        if (expandedId === id) renderRepliesFor(id);
      })
      .subscribe();
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
    sb.from("replies").insert({ question_id: id, text: text.slice(0, 300), nickname: nickname.slice(0, 20) })
      .then(function (res) {
        btn.disabled = false;
        if (!res.error) textInput.value = "";
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

    sb.from("questions").insert({ text: text.slice(0, 500), nickname: nickname.slice(0, 20) })
      .then(function (res) {
        btn.disabled = false;
        if (res.error) { statusEl.textContent = "등록에 실패했어요. 다시 시도해 주세요."; return; }
        textEl.value = "";
        statusEl.textContent = "질문을 올렸어요. 곧 관리자가 정리해줄 거예요.";
        setTimeout(function () { statusEl.textContent = ""; }, 3000);
      });
  }

  document.getElementById("submitQuestion").addEventListener("click", submitQuestion);
  document.getElementById("questionText").addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submitQuestion();
  });

  var savedNick = localStorage.getItem("qc_nickname");
  if (savedNick) document.getElementById("nickname").value = savedNick;

  // ---------- boot ----------

  function loadAll() {
    Promise.all([
      sb.from("categories").select("*").order("created_at", { ascending: true }),
      sb.from("questions").select("*").order("created_at", { ascending: false }).limit(300)
    ]).then(function (results) {
      categoriesState = results[0].data || [];
      questionsState = results[1].data || [];
      rebuildCatalog();
    });
  }

  loadAll();

  sb.channel("public-catalog")
    .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, loadAll)
    .on("postgres_changes", { event: "*", schema: "public", table: "questions" }, loadAll)
    .subscribe();
})();
