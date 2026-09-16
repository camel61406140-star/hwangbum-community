-- 질문 카드함 — Supabase 스키마
-- Supabase 프로젝트 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

create extension if not exists pgcrypto;

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  nickname text not null default '익명',
  category_id uuid references categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists replies (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  text text not null,
  nickname text not null default '익명',
  created_at timestamptz not null default now()
);

-- 실시간 반영 활성화
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table questions;
alter publication supabase_realtime add table replies;

-- Row Level Security
alter table categories enable row level security;
alter table questions enable row level security;
alter table replies enable row level security;

-- ===== categories =====
-- 누구나 읽기 가능
create policy "categories_select_public" on categories
  for select using (true);

-- 카테고리 생성은 관리자(로그인한 본인)만 가능
-- 아래 '00000000-0000-0000-0000-000000000000' 를 본인의 Supabase Auth 사용자 UUID로 바꾸세요.
-- (Authentication > Users 에서 본인 계정을 만든 뒤 UUID를 복사)
create policy "categories_insert_owner_only" on categories
  for insert with check (auth.uid() = '00000000-0000-0000-0000-000000000000');

-- ===== questions =====
-- 누구나 읽기 가능
create policy "questions_select_public" on questions
  for select using (true);

-- 누구나 새 질문을 올릴 수 있음 (단, category_id는 비워둔 채로만 등록 가능 — 분류는 관리자가 함)
create policy "questions_insert_public" on questions
  for insert with check (category_id is null);

-- 카테고리 지정(수정)은 관리자만 가능
create policy "questions_update_owner_only" on questions
  for update using (auth.uid() = '00000000-0000-0000-0000-000000000000');

-- ===== replies =====
-- 누구나 읽고 쓸 수 있음 (댓글은 로그인 없이 자유롭게)
create policy "replies_select_public" on replies
  for select using (true);

create policy "replies_insert_public" on replies
  for insert with check (true);
