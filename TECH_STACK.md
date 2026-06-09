# CASSANDRA AI — 기술 스택

> 최종 업데이트: 2026-06-09

## 코어 스택

| 계층 | 기술 | 버전 | 비고 |
|---|---|---|---|
| **런타임** | Node.js | 22 LTS | |
| **언어** | TypeScript | 5.x | strict mode |
| **프레임워크** | Next.js | 15.5 (App Router) | SSR + API Routes 통합 |
| **DB** | PostgreSQL 16 | via Neon (Serverless) | Prisma ORM |
| **ORM** | Prisma | 6.x | 마이그레이션 + 타입 생성 |
| **캐시** | Upstash Redis | — | 검색·그래프·실검 캐시 |
| **인증** | JWT + bcryptjs | — | httpOnly 쿠키, 3시간 세션 |

## 프론트엔드

| 계층 | 기술 | 용도 |
|---|---|---|
| **UI** | React 19 | 컴포넌트 |
| **스타일링** | Tailwind CSS 4 | 유틸리티 기반 |
| **관계망** | Cytoscape.js | 인물·법인·회사 그래프 |
| **상태 관리** | Zustand | 핀보드 |
| **차트** | — | (예정) |

## 외부 API

| API | 용도 | 인증 |
|---|---|---|
| **OpenDART** | 전자공시 조회 (list.json, company.json) | API Key (40자) |
| **Naver Finance** | 실시간 시세·거래량 (m.stock.naver.com) | Mobile UA |
| **Toss Securities** | (예정) 실시간 호가·체결 | — |
| **Claude API** | (예정) 공시 이상 패턴 분석 | Anthropic Key |
| **DeepSeek API** | (예정) 한글 NER 개체명 인식 | DeepSeek Key |

## 인프라

| 서비스 | 플랜 | 비용 | 용도 |
|---|---|---|---|
| **Vercel** | Hobby | $0 | 웹앱 호스팅 + CDN + CI/CD |
| **Neon** | Free | $0 | PostgreSQL (0.5GB) |
| **Upstash Redis** | Free | $0 | 검색 캐시 (256MB) |
| **OCI** | Always Free | $0 | (예정) 크롤러·워커 서버 |

## 데이터 모델 (11개)

```
AppUser ──< LoginHistory
Corp ──< CorpPersonRelation >── Person ──< SameNameGroup
Corp ──< CorpFundRelation   >── Fund
Corp ──< Filing
Corp ──< Signal
Corp ──< CorpEvent
Entity ──< EntityVote
Entity ──< EntityComment
MarketSnapshot (시계열)
SearchLog (실검)
BoardPost (게시판)
```

## 보안

| 항목 | 방식 |
|---|---|
| 비밀번호 | bcrypt (salt 10) |
| 세션 | JWT (HMAC-SHA256) + timingSafeEqual |
| 쿠키 | httpOnly (인증), SameSite=Lax |
| XSS | React 자동 이스케이프 |
| SQL Injection | Prisma 파라미터화 쿼리 |
| 경로 탐색 | 허용 파일명 화이트리스트 |
| 환경변수 | `.env` → Git 제외, Vercel Dashboard 관리 |
| 블랙리스트 데이터 | `prisma/seed.ts` → Git 제외 |
