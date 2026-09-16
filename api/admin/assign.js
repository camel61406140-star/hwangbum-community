var db = require("../_db");

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (!db.requireAdmin(req, res)) return;

  var body = req.body || {};
  var questionId = body.question_id;
  var categoryId = body.category_id;
  var newCategoryName = body.new_category_name;

  if (!questionId) {
    res.status(400).json({ error: "question_id required" });
    return;
  }

  try {
    if (!categoryId && newCategoryName && String(newCategoryName).trim()) {
      var created = await db.sql`
        INSERT INTO categories (name) VALUES (${String(newCategoryName).trim().slice(0, 30)})
        RETURNING id
      `;
      categoryId = created.rows[0].id;
    }

    if (!categoryId) {
      res.status(400).json({ error: "category_id or new_category_name required" });
      return;
    }

    await db.sql`UPDATE questions SET category_id = ${categoryId} WHERE id = ${questionId}`;
    res.status(200).json({ ok: true, category_id: categoryId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
