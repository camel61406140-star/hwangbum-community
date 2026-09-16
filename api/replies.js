var db = require("./_db");

module.exports = async function (req, res) {
  if (!db.requireVisitor(req, res)) return;

  if (req.method === "GET") {
    var questionId = req.query && req.query.question_id;
    if (!questionId) {
      res.status(400).json({ error: "question_id required" });
      return;
    }
    try {
      var result = await db.sql`
        SELECT id, question_id, text, nickname, created_at
        FROM replies
        WHERE question_id = ${questionId}
        ORDER BY created_at ASC
        LIMIT 500
      `;
      res.status(200).json(result.rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === "POST") {
    var questionIdBody = req.body && req.body.question_id;
    var text = req.body && req.body.text;
    if (!questionIdBody || !text || !String(text).trim()) {
      res.status(400).json({ error: "question_id and text required" });
      return;
    }
    var nickname = (req.body && req.body.nickname && String(req.body.nickname).trim()) || "익명";
    try {
      var inserted = await db.sql`
        INSERT INTO replies (question_id, text, nickname)
        VALUES (${questionIdBody}, ${String(text).trim().slice(0, 300)}, ${nickname.slice(0, 20)})
        RETURNING id, question_id, text, nickname, created_at
      `;
      res.status(200).json(inserted.rows[0]);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: "method not allowed" });
};
