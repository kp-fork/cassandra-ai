# 초대(Expert) 로그인 불가 — 구조 분석 및 수정안

> 작성일: 2026-06-27
> 대상: `/invite?email=xxx` 초대 링크로 가입한 Expert 유저 로그인 불가 문제

---

## 1. 현재 인증 시스템 구조 (2개 병행)

```
┌──────────────────────────────┬──────────────────────────────────────┐
│ System A — Supabase Auth     │ System B — Legacy JWT                │
│                              │                                      │
│ 경로: Google OAuth           │ 경로: /api/auth/login (이메일+pw)    │
│       초대 링크 가입          │                                      │
│                              │                                      │
│ 세션: sb-*-auth-token 쿠키   │ 세션: auth-token 쿠키 (3h)          │
│ 검증: middleware getSession() │ 검증: middleware auth-token 존재 체크 │
│ 저장: Supabase Auth DB        │ 저장: AppUser.passwordHash (bcrypt)  │
└──────────────────────────────┴──────────────────────────────────────┘
```

**미들웨어는 두 시스템을 모두 지원하지만 Expert 권한 체크는 System A에만 있음.**

---

## 2. 초대 흐름 단계별 분석

```
[관리자]
  POST /api/admin/invite           → DB: ExpertInvite 레코드 생성 (7일 만료)
  
[초대된 유저]
  GET /invite?email=xxx            → 초대 유효성 검사
  form 입력 (이름 + 비밀번호)
  PATCH /api/admin/invite          → Supabase Admin REST API로 유저 생성
                                       email_confirm: true
                                       user_metadata: { role: "expert" }
                                   → AppUser upsert (tier: "expert")
                                   → ExpertInvite.acceptedAt = now
  client: signInWithPassword()     → Supabase 세션 생성 (브라우저 쿠키)
  router.push("/dashboard")
  
[미들웨어]
  getSession()                     → Supabase 세션 확인
  user_metadata.role === "expert"  → Expert 경로 접근 허용
```

---

## 3. 로그인 불가 원인 (우선순위 순)

### 원인 A — `SUPABASE_SERVICE_ROLE_KEY` 미설정 (가장 가능성 높음)

`PATCH /api/admin/invite` 내부에서 Supabase Admin REST API를 직접 호출:

```typescript
// src/app/api/admin/invite/route.ts
const SUPA_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

await fetch(`${SUPA_URL()}/auth/v1/admin/users`, {
  headers: { Authorization: `Bearer ${SUPA_KEY()}` },
  body: JSON.stringify({ email, password, email_confirm: true, ... })
});
```

Vercel 환경 변수에 `SUPABASE_SERVICE_ROLE_KEY`가 없으면:
- Admin API 호출이 **401 Unauthorized** 반환
- 유저 미생성 (조용히 실패 — 에러 핸들링 불충분)
- 이후 `signInWithPassword()` → **"Invalid login credentials"** 에러
- 초대 페이지에 에러 메시지 표시되나 리다이렉트 없음 → 유저 혼란

**확인 방법:**
```bash
# Vercel Dashboard → Project → Settings → Environment Variables
SUPABASE_SERVICE_ROLE_KEY  # 이게 있는지 확인
```

---

### 원인 B — Admin API 에러 핸들링 누락

```typescript
// 현재 코드 (invite route PATCH)
const created = await supabaseAdminFetch("users", "POST", { ... });

if (created?.msg?.toLowerCase().includes("already") || created?.code === "email_exists") {
  // 기존 유저 처리
} else if (created?.error || created?.msg) {
  return NextResponse.json({ error: ... }, { status: 500 });
}

// ← 여기서 created가 { statusCode: 401, message: "..." } 형태면
//   위 조건 모두 통과해버려 성공인 것처럼 진행됨
```

Supabase API 에러 응답 형태는 `{ statusCode, message }` 또는 `{ error, error_description }` 등 다양해서 현재 체크가 일부 에러를 걸러내지 못합니다.

---

### 원인 C — Expert 권한 체크가 `user_metadata`에만 의존

미들웨어:
```typescript
const metaRole = session.user?.user_metadata?.role;
const isExpert = metaRole === "expert";
```

초대 PATCH에서 `user_metadata: { role: "expert" }` 로 설정하므로 정상이면 통과해야 하지만:
- Supabase Admin API로 생성 시 `user_metadata` 가 제대로 저장되지 않을 경우
- 또는 이미 존재하는 유저를 PUT으로 업데이트할 때 `user_metadata` 덮어쓰기 실패 시

Expert 체크가 실패해 `/access-denied`로 리다이렉트될 수 있습니다.

---

### 원인 D — AppUser와 Supabase Auth 분리 (구조적 문제)

```
Supabase Auth DB          AppUser (Prisma DB)
─────────────────         ─────────────────────
id (uuid)                 id
email          ←→         email  ← 이것만 연결
user_metadata.role        tier   ← 미들웨어에서 읽지 않음
```

- 미들웨어는 DB에 접근 불가 (Edge Runtime) → `AppUser.tier`를 체크할 수 없음
- 결국 `user_metadata.role`이 신뢰 단일 원천이 되어야 하는데 설정이 일관되지 않음
- Google OAuth 유저는 `user_metadata.role`이 없음 → `EXPERT_EMAILS` 하드코딩으로 보완

---

### 원인 E — 이중 인증 시스템 충돌 가능성

로그인 페이지(`/login`)에서 이메일/비밀번호 입력 시:
- `supabase.auth.signInWithPassword()` 호출 → Supabase 세션 생성 ✅
- 동시에 레거시 `/api/auth/login` 경로도 존재 → 중복·혼선 가능

초대 유저가 가입 후 로그아웃하고 다시 `/login`에서 로그인하면:
- `signInWithPassword()` 성공
- 미들웨어 `user_metadata.role === "expert"` 체크 통과
- 이론상 정상이지만 실제 동작 확인 필요

---

## 4. 수정 방안

### Step 1 — 즉시: Vercel 환경 변수 추가

```
SUPABASE_SERVICE_ROLE_KEY = <Supabase 프로젝트 → Settings → API → service_role key>
```

Supabase Dashboard에서 확인 경로:
`Project → Settings → API → Project API keys → service_role`

> ⚠️ service_role key는 절대 공개 노출 금지 (`NEXT_PUBLIC_` 접두사 사용 금지)

---

### Step 2 — 즉시: Admin API 에러 핸들링 강화

```typescript
// src/app/api/admin/invite/route.ts — PATCH 수정

const created = await supabaseAdminFetch("users", "POST", {
  email, password, email_confirm: true,
  user_metadata: { name: name || email.split("@")[0], role: "expert" },
});

// 에러 형태를 망라해서 체크
const isAlreadyExists =
  created?.code === "email_exists" ||
  created?.msg?.toLowerCase().includes("already") ||
  created?.message?.toLowerCase().includes("already registered");

const isError =
  !isAlreadyExists &&
  (created?.statusCode >= 400 || created?.error || (created?.msg && !created?.id));

if (isError) {
  console.error("[invite PATCH] Supabase Admin API 실패:", JSON.stringify(created));
  return NextResponse.json(
    { error: `유저 생성 실패: ${created?.message || created?.msg || created?.error || JSON.stringify(created)}` },
    { status: 500 }
  );
}
```

---

### Step 3 — 단기: 초대 완료 후 `/login`으로 안내 (fallback)

`signInWithPassword`가 실패해도 유저가 직접 로그인할 수 있도록:

```typescript
// src/app/invite/page.tsx — handleSubmit 수정

// 가입 완료 후 자동 로그인 시도
const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
if (signInError) {
  // 자동 로그인 실패해도 가입은 됐으므로 로그인 페이지로 안내
  router.push(`/login?hint=invite&email=${encodeURIComponent(email)}`);
  return;
}
router.push("/dashboard");
```

---

### Step 4 — 중기: Expert 권한 체크 이중화

미들웨어에서 `user_metadata.role`이 없는 경우 `EXPERT_EMAILS` fallback이 있지만,
초대 유저 전체를 커버하려면 **Supabase `app_metadata`** 를 활용합니다.

```typescript
// Admin API로 유저 생성 시 app_metadata도 설정
await supabaseAdminFetch("users", "POST", {
  email, password, email_confirm: true,
  user_metadata: { name, role: "expert" },
  app_metadata: { role: "expert" },  // ← 추가 (서버에서만 수정 가능, 더 신뢰성 높음)
});
```

미들웨어에서:
```typescript
const metaRole = session.user?.user_metadata?.role
                || session.user?.app_metadata?.role;  // ← fallback 추가
const isExpert = metaRole === "expert";
```

> `app_metadata`는 유저가 클라이언트에서 수정 불가 → `user_metadata`보다 보안 강함

---

### Step 5 — 장기: 이중 인증 시스템 통합

현재 Legacy JWT 시스템(`/api/auth/login`, `auth-token` 쿠키)은 Supabase Auth와 병행 운영 중.
- Expert 권한 체크가 Legacy JWT 경로에는 없음
- 불필요한 복잡도

**권장**: Legacy JWT 로그인 경로를 Supabase `signInWithPassword`로 대체,
`/api/auth/login`은 deprecated 처리.

---

## 5. 구현 우선순위

| 순서 | 작업 | 난이도 | 효과 |
|------|------|--------|------|
| 1 | Vercel에 `SUPABASE_SERVICE_ROLE_KEY` 추가 | 낮음 (환경변수) | 유저 생성 즉시 해결 |
| 2 | Admin API 에러 핸들링 강화 | 낮음 | 무음 실패 차단 |
| 3 | 초대 완료 후 `/login` fallback | 낮음 | UX 안전망 |
| 4 | `app_metadata.role` 이중화 | 중간 | Expert 권한 신뢰성 |
| 5 | Legacy JWT 통합 제거 | 높음 | 구조 단순화 |

---

## 6. 현재 흐름 vs 수정 후 흐름

### 현재 (문제 있음)
```
초대 링크 클릭
  → PATCH /api/admin/invite
      → Supabase Admin API (SUPA_KEY 없으면 401, 조용히 실패)
      → 유저 미생성
  → signInWithPassword() 실패
  → 에러 표시, 리다이렉트 없음
  → 유저 혼란 (가입됐는지 아닌지 모름)
```

### 수정 후
```
초대 링크 클릭
  → PATCH /api/admin/invite
      → Supabase Admin API (KEY 있음, 에러 명시적 반환)
      → 유저 생성 성공 + app_metadata.role: "expert"
  → signInWithPassword() 성공
      → 실패 시 /login?hint=invite 안내
  → /dashboard 이동
  → Expert 경로 (/, /wiki, /board 등) 정상 접근
```

---

## 7. 테스트 체크리스트

가이드라인 구현 후 확인:
- [ ] Vercel env에 `SUPABASE_SERVICE_ROLE_KEY` 추가됨
- [ ] 새 초대 링크 생성 → 가입 → 자동 로그인 → `/dashboard` 이동
- [ ] 로그아웃 → `/login`에서 이메일+비밀번호로 재로그인 → Expert 경로 접근
- [ ] Google OAuth 유저는 영향 없음 (EXPERT_EMAILS 체크 유지)
- [ ] 잘못된 초대 링크 → 적절한 에러 페이지 표시
- [ ] 만료된 초대 링크 → "초대 링크 만료" 페이지 표시
