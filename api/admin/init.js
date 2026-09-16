var db = require("../_db");

// 관리자 토큰으로 한 번 호출하면 테이블을 만들어요. 이미 있으면 아무 일도 안 해요(안전하게 여러 번 눌러도 됨).
module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (!db.requireAdmin(req, res)) return;

  try {
    await db.sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

    await db.sql`
      CREATE TABLE IF NOT EXISTS categories (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        created_at timestamptz not null default now()
      )
    `;

    await db.sql`
      CREATE TABLE IF NOT EXISTS questions (
        id uuid primary key default gen_random_uuid(),
        text text not null,
        nickname text not null default '익명',
        category_id uuid references categories(id) on delete set null,
        created_at timestamptz not null default now()
      )
    `;

    await db.sql`
      CREATE TABLE IF NOT EXISTS replies (
        id uuid primary key default gen_random_uuid(),
        question_id uuid not null references questions(id) on delete cascade,
        text text not null,
        nickname text not null default '익명',
        created_at timestamptz not null default now()
      )
    `;

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
