# CASSANDRA AI

> **LLM-Powered Distressed Company Disclosure Intelligence**
>
> 한계기업 공시 이상 징후 탐지 시스템 — DART OpenAPI 기반 관계망 추적

---

## 공익 목적

본 프로젝트는 **공익적 목적**으로 개발되었습니다.  
코스닥 시가총액 500억 원 미만 한계기업의 공시 데이터를 분석하여
**무자본 M&A, CB/BW 발행 남용, 페이퍼컴퍼니를 통한 지배구조 악용** 등
자본시장의 이상 징후를 조기에 탐지하고, 언론 및 수사기관의
정보 접근성을 높이는 것을 목표로 합니다.

> ※ 본 시스템은 DART 공시 원문에 기반한 **사실의 색인**이며,
> 특정 개인이나 법인에 대한 평가가 아닙니다.
> 모든 데이터는 원본 공시(rcept_no)로 역추적 가능합니다.

## 기술 스택

| 계층 | 기술 |
|---|---|
| **프레임워크** | Next.js 15 (App Router) |
| **언어** | TypeScript |
| **데이터베이스** | PostgreSQL 16 (+ TimescaleDB 지원) |
| **ORM** | Prisma 6 |
| **관계망 시각화** | Cytoscape.js |
| **스타일링** | Tailwind CSS 4 |
| **LLM (계획)** | DeepSeek V3 + Claude Sonnet 4 (다중 앙상블) |
| **외부 API** | OpenDART (금융감독원 전자공시) |

## 시작하기

### 사전 요구사항

- Node.js 22+
- PostgreSQL 16+
- OpenDART API 키 (https://opendart.fss.or.kr)

### 설치

```bash
git clone https://github.com/gameworkerkim/cassandra-ai.git
cd cassandra-ai
npm install
cp .env.example .env
# .env 파일에 DATABASE_URL, DART_API_KEY 등 설정
```

### 데이터베이스 설정

```bash
# PostgreSQL 실행 후
createdb dart_monitor
npx prisma migrate dev --name init

# 백테스팅 시드 데이터 (※ 로컬 전용, GitHub 미포함)
cp prisma/seed.template.ts prisma/seed.ts
# → seed.ts 에 실제 백테스팅 데이터 입력
npm run db:seed
```

### 개발 서버 실행

```bash
npm run dev
# → http://localhost:3000
```

### Docker Compose (프로덕션)

```bash
docker compose up -d
# PostgreSQL + TimescaleDB + (추후 앱 컨테이너)
```

## 프로젝트 구조

```
cassandra-ai/
├── prisma/
│   ├── schema.prisma         # DB 스키마 (Corp, Person, Fund, Filing, Signal)
│   ├── seed.template.ts      # 시드 템플릿 (공개용)
│   └── seed.ts               # 실제 백테스팅 데이터 (로컬 전용, .gitignore)
├── src/
│   ├── app/
│   │   ├── layout.tsx        # 루트 레이아웃
│   │   ├── page.tsx          # 검색 + 관계망 대시보드
│   │   ├── api/
│   │   │   ├── search/       # 통합 검색 API
│   │   │   ├── graph/        # 관계망 그래프 API (Cytoscape JSON)
│   │   │   ├── corp/[code]/  # 회사 상세 API
│   │   │   ├── person/[uid]/ # 인물 상세 API
│   │   │   └── fund/[uid]/   # 법인/조합 상세 API
│   │   ├── corp/[code]/      # 회사 상세 페이지
│   │   ├── person/[id]/      # 인물 상세 페이지
│   │   └── fund/[id]/        # 법인 상세 페이지
│   ├── components/
│   │   └── EntityGraph.tsx   # Cytoscape.js 관계망 컴포넌트
│   └── lib/
│       ├── prisma.ts          # Prisma 클라이언트
│       ├── graph-queries.ts   # 그래프 조회 로직
│       └── serialize.ts       # BigInt → JSON 직렬화
├── docker-compose.yml
└── .env.example
```

## 데이터 모델

```
Corp ──< CorpPersonRelation >── Person
Corp ──< CorpFundRelation   >── Fund
Fund ──< FundPersonRelation >── Person
Corp ──< Filing
Corp ──< Signal
```

- **Corp**: 상장회사 (종목코드, 시가총액, 관리종목 여부, 상장폐지일)
- **Person**: 자연인 (등기임원, 최대주주, CB 인수자 등)
- **Fund**: 법인/조합 (SPC, 신기술조합, 투자조합, 페이퍼컴퍼니)
- **Filing**: 공시 이벤트 (CB 발행, 최대주주변경, 감사의견 등)
- **Signal**: 탐지된 이상 신호 (룰 기반 + LLM 분석)

## 탐지 신호 유형

| 신호명 | 설명 | 가중치 |
|---|---|---|
| `MA_CB_NEW_BIZ_180D` | 최대주주변경 + CB발행 + 사업목적추가 180일 내 결합 | 0.85 |
| `CB_REFIX_CHAIN` | 365일 내 CB 전환가액 2회 이상 하향 | 0.75 |
| `CB_ACQUIRER_RECURRENCE` | 동일 인수자가 다수 한계기업 CB 인수 | 0.90 |
| `FUND_SHELL_ACQUIRER` | 자본금 미미 SPC의 대규모 인수 | 0.78 |
| `NO_CAPITAL_MNA` | 인수대상 자산 담보 차입 → 무자본 M&A | 0.95 |
| `AUDIT_DISCLAIMER` | 감사의견 거절 | 0.95 |
| `CB_CALL_OPTION_LOOP` | CB 발행 → 콜옵션 회수 → 할인 매각 → 재발행 | 0.72 |

### 알림 임계치

| 점수 | 행동 |
|---|---|
| < 0.50 | 기록만, 알림 없음 |
| 0.50 ~ 0.69 | 일일 리포트 포함 |
| ≥ 0.70 | 즉시 알림 |
| ≥ 0.90 | 크리티컬 알림 + Admin 경고 |

## API

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/search?q=...` | 회사·인물·법인 통합 검색 |
| `GET` | `/api/graph?q=...` | 관계망 그래프 (Cytoscape.js JSON) |
| `GET` | `/api/corp/:code` | 회사 상세 (공시·신호 포함) |
| `GET` | `/api/person/:uid` | 인물 상세 (등기 이력·실소유 법인) |
| `GET` | `/api/fund/:uid` | 법인/조합 상세 (투자·실소유자) |

## 로드맵

- [x] **v0.1.0** — 검색 + 관계망 그래프 + 3개 사례 백테스팅 데이터
- [ ] **v0.2.0** — DART OpenAPI 실시간 폴링 연동
- [ ] **v0.3.0** — DeepSeek NER + Claude 이상 패턴 분석
- [ ] **v0.4.0** — 회원 가입 (Google/Naver 이메일 인증)
- [ ] **v0.5.0** — 수사기관 전용 대시보드 (무제한)
- [ ] **v1.0.0** — TimescaleDB 시계열 군집 분석

## 주의사항

### 법적 가드레일
1. 모든 출력에 "공시 사실의 색인이며 평가나 투자 권유가 아님" 표시
2. 인물 단위 위험 점수 표시 금지 (종목 단위만 허용)
3. 모든 데이터 포인트에 DART rcept_no 소스 백링크
4. 본 시스템 데이터를 그대로 retail 배포·SNS 게시 금지

### 데이터 보안
- **블랙리스트/백테스팅 데이터는 절대 GitHub에 커밋하지 마세요.**
- `prisma/seed.ts` 는 `.gitignore` 에 포함되어 있습니다.
- 로컬 백테스팅용 데이터는 `prisma/seed.ts` 에서만 관리합니다.
- 공개 저장소에는 익명화된 템플릿(`prisma/seed.template.ts`)만 제공합니다.

## 참고 자료

- DART 전자공시: https://dart.fss.or.kr
- OpenDART API: https://opendart.fss.or.kr
- KIND 한국거래소: https://kind.krx.co.kr
- [가설 문서 (Hypothesis.md)](https://github.com/gameworkerkim/vibe-investing/blob/main/LLM%EC%9D%84%20%EC%9D%B4%EC%9A%A9%ED%95%9C%20%ED%95%9C%EA%B3%84%EA%B8%B0%EC%97%85%20%EA%B3%B5%EC%8B%9C%20%EC%B6%94%EC%A0%81%20%EC%8B%9C%EC%8A%A4%ED%85%9C/Hypothesis.MD)

## License

본 프로젝트는 공익 목적으로 개발되었으며,  
구체적인 라이선스는 추후 결정됩니다.
