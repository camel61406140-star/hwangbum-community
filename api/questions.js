var db = require("./_db");

module.exports = async function (req, res) {
  if (req.method === "GET") {
    try {
      var result = await db.sql`SELECT id, text, nickname, category_id, created_at FROM questions ORDER BY created_at DESC LIMIT 300`;
      res.status(200).json(result.rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === "POST") {
    var text = req.body && req.body.text;
    if (!text || !String(text).trim()) {
      res.status(400).json({ error: "text required" });
      return;
    }
    var nickname = (req.body && req.body.nickname && String(req.body.nickname).trim()) || "익명";
    try {
      var inserted = await db.sql`
        INSERT INTO questions (text, nickname)
        VALUES (${String(text).trim().slice(0, 500)}, ${nickname.slice(0, 20)})
        RETURNING id, text, nickname, category_id, created_at
      `;
      res.status(200).json(inserted.rows[0]);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: "method not allowed" });
};
