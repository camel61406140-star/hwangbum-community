var db = require("./_db");

module.exports = async function (req, res) {
  if (req.method === "GET") {
    try {
      var result = await db.sql`SELECT id, name, created_at FROM categories ORDER BY created_at ASC LIMIT 200`;
      res.status(200).json(result.rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === "POST") {
    if (!db.requireAdmin(req, res)) return;
    var name = req.body && req.body.name;
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: "name required" });
      return;
    }
    try {
      var inserted = await db.sql`INSERT INTO categories (name) VALUES (${String(name).trim().slice(0, 30)}) RETURNING id, name, created_at`;
      res.status(200).json(inserted.rows[0]);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: "method not allowed" });
};
