# CASSANDRA AI

> **Toss × DART × LLM 리스크 모니터링**
>
> 코스닥 1,822개 종목 DART 공시 실시간 분석 + 주식셀럽 관계망

---

## 현재 기능 (v0.5.0)

### 🔍 검색 + 관계망 분석
- 회사명·인물명·법인명 통합 검색 (3,920개 DART 기업)
- Cytoscape.js 관계망 그래프 (회사↔인물↔법인)
- 공시 분석 패널: 위험 신호 + 카테고리 + 타임라인
- 실시간 검색어 (24시간)

### 📊 경제 지표 대시보드
- Naver Finance 실시간 시총·거래량·등락률
- DART 12개월 실공시 데이터 (사명변경·대주주·소송·CB)
- 일일 고위험 시그널 자동 탐지 (`npm run daily`)
- 8종 룰셋: 감사위험·사명변경·소송·대주주·대금지연·CB리픽싱·CB발행·증자/감자
- 보고서 생성 (MD 다운로드)
- 시간순 타임라인 / 카테고리별 보기

### 🤖 DART 분석 챗봇
- 4단계 검색: DB → DART API → 인물 → 실시간 폴백
- 카테고리별 공시 집계 (CB·소송·대주주·증자·합병)
- 기간 선택 (1/3/6/12/24/36개월)
- 72시간 캐싱 (Redis + 인메모리)

### 👤 WIKI — 주식셀럽
- 10명 주요 투자자 정보 (연관 기업·특이 패턴·뉴스)
- 코멘트 기능 (집단 지성)

### 📌 핀보드 + 리포트
- 관심 인물/회사 핀 고정 → 이상 징후 분석 리포트
- MD 다운로드

### 🔐 인증
- 이메일 로그인 (JWT + bcrypt, 3시간 세션)
- 로그인 이력 추적

### 💬 제보·분석 게시판
- 기업·인물 제보 + 분석 요청

### 🗳️ 집단 평가
- BAD ASS / Good 투표 + 댓글

## 데이터

| 항목 | 규모 |
|---|---|
| DB 기업 | 541개사 |
| DB 공시 | 2,630건 |
| DART 매핑 | 3,920개 코스닥 |
| DART 실시간 | 최근 3개월 |
| 주식셀럽 | 10명 |
| 룰셋 | 8종 |

## 실행

```bash
npm run dev          # 개발 서버
npm run daily        # 일일 공시 동기화 (09:00 / 18:00 cron)
npm run extract      # 코스닥 100종목 추출 + 이상 플래그
npm run setup        # DART API 키 입력
```

## 기술 스택

| 계층 | 기술 |
|---|---|
| 프레임워크 | Next.js 15 + TypeScript |
| DB | PostgreSQL (Neon Serverless) |
| ORM | Prisma 6 |
| 캐시 | Upstash Redis |
| UI | React 19 + Tailwind CSS 4 + Cytoscape.js |
| 외부 API | DART OpenAPI, Naver Finance |
| 배포 | Vercel ($0) + Neon ($0) |

## 문서

- [SERVICE_FLOW.md](docs/SERVICE_FLOW.md) — 서비스 흐름도
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) — 배포 전략
- [TECH_STACK.md](docs/TECH_STACK.md) — 기술 스택
- [ROADMAP.md](docs/ROADMAP.md) — 작업 로드맵

## 라이선스

공익 목적. 상업적 이용 제한.
