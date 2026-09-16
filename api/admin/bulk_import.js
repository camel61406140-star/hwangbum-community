var db = require("../_db");

// 관리자 전용 대량 등록 — 카카오톡 내용 등을 한 번에 밀어넣을 때 씀.
// body: { items: [ { text, nickname, replies: [{text, nickname}, ...] }, ... ] }
// 질문은 전부 미분류(category_id null)로 들어가고, 관리자 페이지에서 나중에 분류하면 돼요.
module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (!db.requireAdmin(req, res)) return;

  var items = req.body && req.body.items;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "items (non-empty array) required" });
    return;
  }
  if (items.length > 50) {
    res.status(400).json({ error: "max 50 items per call — batch it client-side" });
    return;
  }

  var questionsCreated = 0;
  var repliesCreated = 0;

  try {
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var text = item && item.text;
      if (!text || !String(text).trim()) continue;
      var nickname = (item.nickname && String(item.nickname).trim()) || "익명";

      var inserted = await db.sql`
        INSERT INTO questions (text, nickname)
        VALUES (${String(text).trim().slice(0, 500)}, ${nickname.slice(0, 20)})
        RETURNING id
      `;
      var questionId = inserted.rows[0].id;
      questionsCreated++;

      var replies = Array.isArray(item.replies) ? item.replies : [];
      for (var j = 0; j < replies.length; j++) {
        var r = replies[j];
        var rText = r && r.text;
        if (!rText || !String(rText).trim()) continue;
        var rNickname = (r.nickname && String(r.nickname).trim()) || "익명";
        await db.sql`
          INSERT INTO replies (question_id, text, nickname)
          VALUES (${questionId}, ${String(rText).trim().slice(0, 300)}, ${rNickname.slice(0, 20)})
        `;
        repliesCreated++;
      }
    }
    res.status(200).json({ ok: true, questionsCreated: questionsCreated, repliesCreated: repliesCreated });
  } catch (e) {
    res.status(500).json({ error: e.message, questionsCreated: questionsCreated, repliesCreated: repliesCreated });
  }
};
