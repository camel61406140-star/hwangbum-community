(function () {
  "use strict";

  if (!window.SUPABASE_URL || window.SUPABASE_URL.indexOf("YOUR-PROJECT") !== -1) {
    var banner = document.getElementById("configBanner");
    banner.hidden = false;
    banner.textContent = "config.js에 Supabase URL/키를 아직 안 넣으셨어요. README를 참고해 설정해주세요.";
    return;
  }

  var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  var categoriesState = []; // [{id, name}]
  var pendingState = [];    // [{id, text, nickname, created_at}]

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

  // ---------- auth ----------

  function setLoggedIn(user) {
    document.getElementById("loginBox").hidden = !!user;
    document.getElementById("adminArea").hidden = !user;
    if (user) {
      document.getElementById("whoami").textContent = user.email + "로 로그인됨";
      loadAll();
      subscribeRealtime();
    }
  }

  document.getElementById("loginBtn").addEventListener("click", function () {
    var email = document.getElementById("email").value.trim();
    var password = document.getElementById("password").value;
    var statusEl = document.getElementById("loginStatus");
    statusEl.textContent = "로그인하는 중…";
    sb.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
      if (res.error) { statusEl.textContent = "로그인 실패: " + res.error.message; return; }
      statusEl.textContent = "";
      setLoggedIn(res.data.user);
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    sb.auth.signOut().then(function () { setLoggedIn(null); });
  });

  sb.auth.getSession().then(function (res) {
    setLoggedIn(res.data.session ? res.data.session.user : null);
  });

  // ---------- data ----------

  function loadAll() {
    Promise.all([
      sb.from("categories").select("*").order("created_at", { ascending: true }),
      sb.from("questions").select("*").is("category_id", null).order("created_at", { ascending: false }).limit(200)
    ]).then(function (results) {
      categoriesState = results[0].data || [];
      pendingState = results[1].data || [];
      render();
    });
  }

  function subscribeRealtime() {
    sb.channel("admin-catalog")
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "questions" }, loadAll)
      .subscribe();
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

    btn.disabled = true;

    function assign(categoryId) {
      sb.from("questions").update({ category_id: categoryId }).eq("id", id).then(function (res) {
        btn.disabled = false;
        if (res.error) alert("지정 실패: " + res.error.message);
      });
    }

    if (choice === "__new__") {
      var name = newInput.value.trim();
      if (!name) { newInput.focus(); btn.disabled = false; return; }
      sb.from("categories").insert({ name: name.slice(0, 30) }).select().single().then(function (res) {
        if (res.error) { alert("카테고리 생성 실패: " + res.error.message); btn.disabled = false; return; }
        assign(res.data.id);
      });
    } else if (choice) {
      assign(choice);
    } else {
      select.focus();
      btn.disabled = false;
    }
  });
})();
