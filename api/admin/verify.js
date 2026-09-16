var db = require("../_db");

module.exports = async function (req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  var ok = db.checkAdmin(req);
  res.status(ok ? 200 : 401).json({ ok: ok });
};
