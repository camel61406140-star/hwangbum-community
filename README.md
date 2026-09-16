# 질문 카드함

로그인 없이 누구나 질문을 올리고, 관리자가 카테고리로 정리하고, 질문마다 실시간으로 답변을 달 수 있는 공개 웹사이트입니다.

- `index.html` — 공개 페이지 (질문 작성 + 카테고리별 목록 + 답변 스레드)
- `admin.html` — 관리자 페이지 (정리 전 질문을 카테고리에 배정 / 새 카테고리 생성)
- Supabase(무료 실시간 DB)를 백엔드로 사용합니다. 서버 코드나 API 키가 없어 정적 호스팅만으로 동작해요.

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 에서 무료 계정을 만들고 새 프로젝트를 생성하세요.
2. 왼쪽 메뉴 **SQL Editor** 에서 이 저장소의 `supabase-schema.sql` 내용을 붙여넣고 실행하세요.
3. **Table Editor**에서 `categories`, `questions`, `replies` 테이블이 생겼는지 확인하세요.
4. **Database > Replication**에서 세 테이블의 실시간(Realtime) 토글이 켜져 있는지 확인하세요. (SQL 스크립트에서 이미 켰지만, 안 켜져 있으면 수동으로 켜주세요.)

## 2. 관리자 계정 만들기 (본인 전용)

1. **Authentication > Users**에서 "Add user"로 본인 이메일/비밀번호 계정을 만드세요. 이 계정으로만 `admin.html`에 로그인해 카테고리를 정리할 수 있어요.
2. 방금 만든 사용자의 **UUID**를 복사하세요.
3. `supabase-schema.sql`에서 두 곳에 있는 `'00000000-0000-0000-0000-000000000000'`을 방금 복사한 UUID로 바꿔서 SQL Editor에서 다시 실행하세요. (정책만 다시 만들면 되므로 `create policy` 두 줄만 지우고 새 UUID로 다시 실행해도 됩니다.)
4. **Authentication > Providers > Email**에서 "Allow new users to sign up"을 꺼주세요. 꺼두지 않으면 누구나 회원가입해서 관리자 페이지 로그인 시도를 할 수 있습니다 (단, 카테고리 지정 권한은 UUID로 제한되어 있어 실제 데이터는 안전하지만, 그래도 꺼두는 걸 권장해요).

## 3. config.js 채우기

**Project Settings > API**에서 `Project URL`과 `anon public` 키를 복사해서 `config.js`에 붙여넣으세요.

```js
window.SUPABASE_URL = "https://xxxxxxxx.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

`anon` 키는 브라우저에 노출되어도 괜찮은 공개용 키입니다 (RLS 정책이 실제 접근을 제어해요).

## 4. 배포하기

정적 파일만 있어서 아무 정적 호스팅에나 올릴 수 있어요. Vercel 예시:

```bash
npm install -g vercel
vercel
```

프로젝트 폴더에서 위 명령을 실행하고 안내에 따라 로그인/배포하면 끝이에요. (Netlify를 쓴다면 이 폴더를 드래그 앤 드롭해도 됩니다.)

## 5. 로컬에서 확인하기

```bash
npx serve .
```

## 사용 흐름

1. 방문자가 `index.html`에서 질문을 올리면 "정리 전" 서랍에 들어가요.
2. 본인이 `admin.html`에 로그인해서 질문을 기존 카테고리에 배정하거나 새 카테고리를 만들어요.
3. 배정되는 즉시 모든 방문자 화면에 실시간으로 반영돼요.
4. 질문을 클릭하면 누구나 로그인 없이 답변을 남길 수 있어요.

## 나중에 자동 분류를 추가하고 싶다면

지금은 전부 수동으로 분류하지만, `questions.category_id`로 이미 라벨이 쌓이고 있어서 나중에 이 데이터를 Claude(Anthropic API)에게 "예시"로 보여주고 새 질문을 자동 분류하게 만들 수 있어요. 그땐 서버(Vercel Serverless Function 등)에서 API 키를 비밀로 보관하고 호출해야 클라이언트에 키가 노출되지 않아요 — 필요할 때 말씀해주시면 이어서 만들어드릴게요.

## 알아두면 좋은 것들

- 완전 공개 사이트라 스팸 방지 장치가 없어요. 문제가 되면 Supabase RLS에 글자수 제한/속도 제한을 추가하거나, 간단한 캡차를 붙이는 걸 고려하세요.
- 무료 플랜 기준 Supabase는 프로젝트가 일정 기간 사용이 없으면 일시 정지될 수 있어요 (다시 깨우면 됩니다).
