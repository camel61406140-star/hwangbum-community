(function () {
  "use strict";

  var TOKEN_KEY = "hb_admin_token";
  var categoriesState = [];
  var pendingState = [];
  var pollTimer = null;

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
    return d + "일 전";
  }

  function adminToken() { return localStorage.getItem(TOKEN_KEY) || ""; }

  function authFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, {
      "x-admin-token": adminToken(),
      "Content-Type": "application/json"
    });
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var err = new Error(data.error || ("HTTP " + r.status));
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function showLoggedIn(loggedIn) {
    document.getElementById("loginBox").hidden = loggedIn;
    document.getElementById("adminArea").hidden = !loggedIn;
  }

  // ---------- auth ----------

  function attemptLogin(token) {
    var statusEl = document.getElementById("loginStatus");
    localStorage.setItem(TOKEN_KEY, token);
    statusEl.textContent = "확인하는 중…";
    return authFetch("/api/admin/verify", { method: "POST" }).then(function () {
      statusEl.textContent = "";
      showLoggedIn(true);
      loadAll();
      if (!pollTimer) pollTimer = setInterval(loadAll, 5000);
    }).catch(function () {
      statusEl.textContent = "토큰이 올바르지 않아요.";
      localStorage.removeItem(TOKEN_KEY);
      showLoggedIn(false);
    });
  }

  document.getElementById("loginBtn").addEventListener("click", function () {
    var token = document.getElementById("adminTokenInput").value.trim();
    if (!token) return;
    attemptLogin(token);
  });

  document.getElementById("adminTokenInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") document.getElementById("loginBtn").click();
  });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    localStorage.removeItem(TOKEN_KEY);
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    showLoggedIn(false);
  });

  document.getElementById("initBtn").addEventListener("click", function () {
    var statusEl = document.getElementById("initStatus");
    statusEl.textContent = "초기화하는 중…";
    authFetch("/api/admin/init", { method: "POST" }).then(function () {
      statusEl.textContent = "완료! 테이블이 준비됐어요.";
      loadAll();
    }).catch(function (e) {
      statusEl.textContent = "실패: " + e.message;
    });
  });

  // ---------- data ----------

  function loadAll() {
    return Promise.all([
      authFetch("/api/categories"),
      authFetch("/api/questions")
    ]).then(function (results) {
      categoriesState = Array.isArray(results[0]) ? results[0] : [];
      var questions = Array.isArray(results[1]) ? results[1] : [];
      pendingState = questions.filter(function (q) { return !q.category_id; });
      render();
    }).catch(function () { /* 다음 폴링에서 회복 */ });
  }

  function render() {
    var el = document.getElementById("pending");
    if (pendingState.length === 0) {
      el.innerHTML = '<p class="empty-note">정리할 질문이 없어요. 모두 분류 완료!</p>';
      return;
    }
    var optionsHtml = categoriesState.map(function (c) {
      return '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
    }).join("");

    el.innerHTML = '<article class="drawer pending" style="grid-column:1/-1">' +
      '<header class="drawer-head"><h2>정리 전</h2><span class="count">' + pendingState.length + '</span></header>' +
      '<ul class="cards">' +
      pendingState.map(function (q) {
        return (
          '<li class="card" data-id="' + q.id + '">' +
            '<div class="card-toggle" style="cursor:default;">' +
              '<p class="card-text">' + escapeHtml(q.text) + '</p>' +
              '<p class="card-meta"><span class="nick">' + escapeHtml(q.nickname || "익명") + '</span><span>·</span><time>' + timeAgo(q.created_at) + '</time></p>' +
            '</div>' +
            '<div class="assign-row">' +
              '<select class="cat-select" data-id="' + q.id + '">' +
                '<option value="">카테고리 선택…</option>' +
                optionsHtml +
                '<option value="__new__">+ 새 카테고리 만들기</option>' +
              '</select>' +
              '<input class="new-cat-name" data-id="' + q.id + '" type="text" maxlength="30" placeholder="새 카테고리 이름" hidden />' +
              '<button class="btn-primary assign-btn" data-id="' + q.id + '" type="button">지정</button>' +
            '</div>' +
          '</li>'
        );
      }).join("") +
      '</ul></article>';
  }

  document.getElementById("pending").addEventListener("change", function (e) {
    if (!e.target.classList.contains("cat-select")) return;
    var id = e.target.getAttribute("data-id");
    var input = document.querySelector('.new-cat-name[data-id="' + id + '"]');
    input.hidden = e.target.value !== "__new__";
    if (!input.hidden) input.focus();
  });

  document.getElementById("pending").addEventListener("click", function (e) {
    var btn = e.target.closest(".assign-btn");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    var select = document.querySelector('.cat-select[data-id="' + id + '"]');
    var newInput = document.querySelector('.new-cat-name[data-id="' + id + '"]');
    var choice = select.value;

    if (!choice) { select.focus(); return; }
    if (choice === "__new__" && !newInput.value.trim()) { newInput.focus(); return; }

    btn.disabled = true;
    var payload = choice === "__new__"
      ? { question_id: id, new_category_name: newInput.value.trim() }
      : { question_id: id, category_id: choice };

    authFetch("/api/admin/assign", { method: "POST", body: JSON.stringify(payload) })
      .then(function () { return loadAll(); })
      .catch(function (e) { alert("지정 실패: " + e.message); })
      .finally(function () { btn.disabled = false; });
  });

  // ---------- boot ----------

  if (adminToken()) {
    attemptLogin(adminToken());
  } else {
    showLoggedIn(false);
  }
})();
