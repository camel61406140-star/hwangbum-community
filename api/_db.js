// Vercel의 Postgres 스토리지를 연결하면 접속 정보가 환경변수로 자동 주입돼요.
// 버전에 따라 변수 이름이 다를 수 있어서(POSTGRES_URL / DATABASE_URL 등) 여기서 맞춰줍니다.
if (!process.env.POSTGRES_URL) {
  var alt = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (alt) process.env.POSTGRES_URL = alt;
}

var sql = require("@vercel/postgres").sql;

function checkAdmin(req) {
  var token = req.headers["x-admin-token"];
  return !!process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;
}

function requireAdmin(req, res) {
  if (!checkAdmin(req)) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

// 방문자 비밀번호 — 관리자 토큰을 알고 있어도 통과되게 해서(관리자는 항상 접근 가능) 이중 로그인 안 해도 되게 함
function checkVisitor(req) {
  if (checkAdmin(req)) return true;
  var token = req.headers["x-visitor-token"];
  return !!process.env.VISITOR_TOKEN && token === process.env.VISITOR_TOKEN;
}

function requireVisitor(req, res) {
  if (!checkVisitor(req)) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

module.exports = {
  sql: sql,
  checkAdmin: checkAdmin,
  requireAdmin: requireAdmin,
  checkVisitor: checkVisitor,
  requireVisitor: requireVisitor
};
