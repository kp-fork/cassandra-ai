# CASSANDRA AI — 관계망 분석 리팩토링 계획

> 버전: v2.0.0 | 최종 업데이트: 2026-06-26
> 관련 문서: [NETWORK_ANALYSIS.md](./NETWORK_ANALYSIS.md) (v1.5.0), [ROADMAP.md](./ROADMAP.md)

---

## 0. 배경 및 목표

관계망 분석은 CASSANDRA AI의 핵심 기능이다. 사용자가 기업명을 검색하면 DART OpenAPI에서 데이터를
조회하여 **주요 주주·이사·투자사·투자자·조합**의 연관 관계를 그래프로 정리해야 하며, 그 안에서
**상장폐지·문제 인물·문제 기업·문제 투자사·문제 조합**을 식별하는 것이 목표다.

그러나 코드 검토 결과, **그래프 엔진(`buildDeepGraph`의 BFS)과 시각화(Cytoscape.js)는 정상**이나,
**그래프를 채우는 데이터 수집 계층이 설계(스키마·문서)를 뒷받침하지 못해 관계망이 비어 있다.**
설계와 구현 사이에 **5곳의 단절**이 존재한다. 본 문서는 이를 3단계로 해결하는 리팩토링 계획이다.

### 핵심 원칙

1. **데이터가 엣지다** — 공시 제목이 아니라 공시 본문에서 인물·법인·지분율을 추출해야 관계망이 생긴다
2. **정합성 우선** — 스키마 ↔ 수집 스크립트 ↔ API의 타입·제약이 일치해야 데이터가 쌓인다
3. **동일 인물 통합** — `personUid` 정규화 + `SameNameGroup` 자동 병합으로 노드 파편화 제거
4. **리스크 자동 태깅** — 수집과 동시에 `flags`를 달아 상장폐지/블랙리스트를 자동 식별

---

## 1. 현황 진단 — 5개의 단절

> 자세한 원인 분석은 본 섹션 참조. 각 항목은 코드 라인으로 검증됨.

### 🚨 단절 1: 임원·주주 수집 스크립트가 스키마에 없는 필드/제약을 사용

**파일:** `scripts/fetch-officers.ts:113-117`

```typescript
// 스크립트가 사용하지만 스키마에 없는 것:
update: { isCurrent: true },                              // ← CorpPersonRelation.isCurrent 없음
where: { corpId_personId_role: { corpId, personId, role } } // ← 복합 unique 제약 없음
```

**검증:** `grep isCurrent prisma/schema.prisma` → NOT FOUND
**검증:** 유일한 `@@unique`는 `CorpAuditRelation.[corpId, auditorId, fiscalYear]` 뿐

**영향:** 스크립트 실행 시 Prisma 런타임 에러, 또는 제약 부재 시 동일 관계 중복 생성.
**가장 중요한 "임원·주요주주 → 회사" 엣지가 DB에 들어가지 않는다.**

### 🚨 단절 2: PersonHistory 스키마와 크롤링 스크립트의 필드 불일치

**파일:** `scripts/crawl-persons.ts:180-188` vs `prisma/schema.prisma:394-406`

| 스크립트가 쓰는 필드 | 스키마의 실제 필드 |
|---|---|
| `name` | `personName` |
| `companyName` | `corpName` |
| `eventDate` (DateTime) | `startDate` (String) |
| `personUid`, `birthDate`, `stockCode`, `eventType`, `sourceRceptNo`, `sourceTitle` | **전부 없음** |

**영향:** DB 저장 단계에서 예외 발생 → `.catch(() => {})`로 무시됨.
1년 치 인물 이력이 **조용히 버려지고** JSON(`person-crawl-1y.json`)에만 남음 → 그래프 미반영.

### 🚨 단절 3: Fund(조합·SPC·투자사) 관계를 생성하는 코드가 없음

**검증:** `grep "prisma.fund.create" scripts/ src/` → 결과 없음

- `CorpFundRelation`(법인↔회사: CB 인수자, 최대주주) 생성 코드: **0곳**
- `FundPersonRelation`(법인↔인물: 실질지배자) 생성 코드: **0곳**
- `fund` API·`detail` API는 Fund를 *읽기만* 함

**영향:** "투자사·투자자·조합" 연결망(`fund` 노드)이 그래프에 **거의 나타날 수 없음**.
사용자가 지적한 "투자사·투자자 연관관계 정리 안 됨"의 직접적 원인.

### 🚨 단절 4: 공시 본문(XBRL)에서 인물·법인을 파싱하지 않음

**파일:** `scripts/daily-sync.ts`, `extract-kosdaq.ts:184`, `crawl-dart-disclosures.ts:86`

```typescript
// 모두 제목(report_nm) 정규식 매칭만 수행
if (/최대주주변경|경영권\s*양수/.test(title)) { ... }
```

DART 공시에서 **실제 인물명·법인명·지분율은 공시 본문(XBRL/XML)** 에 있다.
제목에는 "최대주주변경"이라는 단어만 있고 "누가 → 누구로"는 본문에 있다.
본문 파싱 코드가 없으므로 `involvedPeople`·`involvedFunds`가 **항상 빈 배열**.

**영향:** 공시는 2,630건 쌓이지만 **공시 ↔ 인물·법인 엣지가 생성되지 않음** → 관계망의 핵심 엣지 누락.

### 🚨 단절 5: personUid 불일치로 동일 인물이 복수 노드로 분할

| 수집 출처 | personUid 형식 |
|---|---|
| `fetch-officers.ts:100` | `{name}-{birthDate or Date.now()}` |
| `crawl-persons.ts:155` | `DART-CRAWL-{name}` |

**영향:** 같은 "신승수"가 `신승수-19720329`와 `DART-CRAWL-신승수`로 분할 → **1-hop도 끊어짐**.
`SameNameGroup` 모델이 이를 묶기 위해 존재하지만, 이를 채우는 코드가 없음.

---

## 2. 3단계 리팩토링 구조

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: 정합성 복원 (Schema ↔ Script 정렬)               │
│  → 기존 수집 로직이 동작하게 만든다 (1~2일)                 │
├─────────────────────────────────────────────────────────────┤
│  PHASE 2: 본문 파싱 (XBRL → 엣지 자동 생성)                 │
│  → 공시 본문에서 인물·법인·지분율을 추출해 관계망을 채운다  │
│  → Fund/조합/SPC 노드와 실질지배 관계를 생성한다 (3~5일)    │
├─────────────────────────────────────────────────────────────┤
│  PHASE 3: 리스크 자동 식별 (상장폐지·블랙리스트 태깅)       │
│  → 수집과 동시에 문제 인물/기업/조합을 flags로 자동 마킹    │
│  → 빨간 테두리 노드 + 집계 리포트로 시각화 (2~3일)          │
└─────────────────────────────────────────────────────────────┘
```


### PHASE 1 — 정합성 복원: Schema ↔ Script 정렬

> **목표:** 기존 수집 스크립트가 실제로 동작하게 만든다. 코드 로직 변경 없이 스키마/제약을 맞춘다.

#### 1.1 스키마 수정 (`prisma/schema.prisma`)

**`CorpPersonRelation`** — `isCurrent` 필드 + 복합 unique 제약 추가:

```prisma
model CorpPersonRelation {
  id            String   @id @default(uuid())
  personId      String
  corpId        String
  role          String
  description   String?
  since         DateTime?
  until         DateTime?
  source        String?
  isCurrent     Boolean  @default(true)        // ✅ 추가: fetch-officers.ts 호환
  person        Person   @relation(...)
  corp          Corp     @relation(...)

  @@unique([corpId, personId, role])            // ✅ 추가: 중복 방지 + upsert 키
  @@index([personId])
  @@index([corpId])
}
```

**`PersonHistory`** — `crawl-persons.ts`가 쓰는 필드로 확장 (또는 스크립트를 스키마에 맞춤):

```prisma
model PersonHistory {
  id              String   @id @default(uuid())
  personUid       String                            // ✅ 추가
  personName      String
  birthDate       String?                           // ✅ 추가
  companyName     String?                           // ✅ 추가 (corpName→companyName 통일)
  stockCode       String?                           // ✅ 추가
  role            String?
  eventType       String?                           // ✅ 추가
  eventDate       DateTime?                         // ✅ 추가 (startDate String→eventDate DateTime)
  sourceRceptNo   String?                           // ✅ 추가
  sourceTitle     String?                           // ✅ 추가
  createdAt       DateTime @default(now())

  @@index([personName])
  @@index([personUid, eventDate])
  @@index([companyName])
}
```

#### 1.2 마이그레이션

```bash
npx prisma migrate dev --name fix_relation_constraints
npx prisma generate
```

#### 1.3 단절 5 해결: personUid 정규화 유틸

신규 파일 `src/lib/person-uid.ts` — 모든 수집 경로가 동일한 규칙을 사용:

```typescript
// personUid = P-{birthDate 없으면 해시} — 단일 규칙
export function makePersonUid(name: string, birthDate?: string): string {
  const clean = name.replace(/\s/g, "").trim();
  if (birthDate) {
    const d = birthDate.replace(/[^0-9]/g, "").padStart(8, "0").slice(0, 8);
    return `P-${d}-${hash(clean)}`;
  }
  return `P-NOBD-${hash(clean)}`; // 생년월일 미상은 동명이인 그룹으로 후처리
}
```

`fetch-officers.ts:100`, `crawl-persons.ts:155` 양쪽을 이 유틸로 교체.

#### 1.4 SameNameGroup 자동 병합 스크립트

신규 `scripts/merge-samename.ts` — 주기적으로 실행하여 동명이인 그룹 인덱스 갱신:

```
- Person.name 기준 그룹핑
- personIds 배열 채우기
- note 자동 생성 ("생년월일 미상 N명" 등)
```

#### 1.5 검증 체크리스트 (PHASE 1)

- [ ] `npx tsx scripts/fetch-officers.ts "테스트회사"` 가 에러 없이 완료
- [ ] DB에 `CorpPersonRelation` 레코드가 중복 없이 쌓임
- [ ] `crawl-persons.ts` 실행 후 `PersonHistory`에 레코드 존재 (JSON이 아닌 DB)
- [ ] 동일 인물이 단일 `personUid`로 통합됨
- [ ] `buildDeepGraph("테스트회사", 1)` 가 1-hop 인물 노드를 반환


### PHASE 2 — 본문 파싱: XBRL → 엣지 자동 생성

> **목표:** 공시 본문에서 인물·법인·지분율을 추출하여 Fund 노드와 관계망 엣지를 자동 생성.
> 단절 3(Fund 미생성)·단절 4(본문 미파싱) 해결.

#### 2.1 DART 개별공시 상세 API 연동

DART `list.json`은 제목만 준다. 본문은 두 경로로 확보:

| API | 용도 | 엔드포인트 |
|---|---|---|
| `majorstock.json` | **주요주주 현황** (5% 이상) | `GET /majorstock.json` |
| `exctvSttus.json` | **임원 현황** | `GET /exctvSttus.json` |
| `trprrPrcusySttus.json` | **준조합/특수관계인 주식처리** | `GET /trprrPrcusySttus.json` |
| `hltaCodeInfo` (사업보고서) | **최대주주 현황** | `GET /hltaCodeInfo.json` |
| 개별공시 `document.xml` (XBRL) | **본문 텍스트** (CB 양수자 등) | `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=...` |

> 단절 4 해결의 핵심: 제목 매칭에서 **구조화된 상세 API 호출**로 전환.

#### 2.2 신규 파서 모듈

신규 `src/lib/dart-parsers.ts`:

```typescript
// (1) 주요주주 → CorpPersonRelation 또는 CorpFundRelation 자동 분기
export async function parseMajorShareholders(corpCode, year) {
  // majorstock.json 응답의 nm(이름)이 자연인이면 Person, 법인이면 Fund로 분기
  // 법인 판별: "주식회사", "(주)", "조합", "SPC", "펀드", "투자" 키워드
}

// (2) 법인명 → Fund 노드 자동 생성 (단절 3 해결)
export async function findOrCreateFund(name: string): Promise<Fund> {
  // fundType 자동 분류: spc / tech_assoc / invest_assoc / shell
  //   - "신기술" 포함 → tech_assoc
  //   - "조합" 포함 → invest_assoc
  //   - "SPC" / "인수목적" → spc
}

// (3) FundPersonRelation 생성 (실질지배자)
export async function linkFundOwner(fundId, personId, role) { ... }
```

#### 2.3 Fund 노드 생성 파이프라인 (단절 3 해결 핵심)

```
DART 공시 본문 "주식매수청구권 행사대상 주식의 양수인: ㈜투자사 / 신기술사업1호조합"
    │
    ├─ 법인명 추출 → findOrCreateFund("신기술사업1호조합")
    │     fundType = "tech_assoc"
    │
    ├─ Fund → Corp 엣지 (CorpFundRelation, relationType = "CB_ACQUIRER")
    │     amount, pct 추출
    │
    └─ Fund → Person 엣지 (FundPersonRelation, role = "BENEFICIAL_OWNER")
          조합의 GP/대표자명이 본문에 있으면 연결
```

#### 2.4 NER 폴백 (LLM)

구조화 API가 없는 공시(예: 소송·경영권 분쟁 본문)는 **DeepSeek V3 NER**으로 인물·법인 추출:

```
공시 본문 텍스트
    │
    ▼
DeepSeek V3 (NER 프롬프트)
    │  출력: { persons: [{name, role}], orgs: [{name, type}] }
    ▼
Person / Fund 노드 생성 + 엣지 연결
    │
    ▼
involvedPeople / involvedFunds 배열 채우기 (단절 4 해결)
```

> ROADMAP "진행 중 — DeepSeek V3 NER 코스닥 연동" 항목과 연계.

#### 2.5 백필 스크립트

신규 `scripts/backfill-relations.ts`:

```
기존 Filing 2,630건을 역순 회돌이
    ├─ 각 공시의 상세 API / XBRL 본문 조회
    ├─ 파서 + NER 실행 → Person / Fund / Relation 생성
    └─ Filing.involvedPeople / involvedFunds 갱신
```

#### 2.6 검증 체크리스트 (PHASE 2)

- [ ] `Fund` 테이블에 레코드가 쌓임 (기존 0건 → N건)
- [ ] `CorpFundRelation`, `FundPersonRelation` 엣지가 생성됨
- [ ] `Filing.involvedPeople` / `involvedFunds`가 비어있지 않은 레코드 존재
- [ ] `buildDeepGraph("조합명", 2)` 가 fund→corp→person 2-hop을 반환
- [ ] CB 발행 공시가 "발행사 ↔ 인수 조합 ↔ 실질지배자" 엣지를 생성


### PHASE 3 — 리스크 자동 식별: 상장폐지·블랙리스트 태깅

> **목표:** 수집과 동시에 문제 인물/기업/조합을 `flags`로 자동 마킹하고 시각화.
> 사용자가 "이 기업 주변에 문제가 있는 사람·투자사·조합이 있는가"를 한눈에 보게 함.

#### 3.1 블랙리스트 데이터 소스

| 소스 | 식별 대상 | 방법 |
|---|---|---|
| DART `corpCode.xml` | **상장폐지 기업** | `stock_code` 누락 + `delisting_date` 있음 → `Corp.delistedAt` |
| 금융감독원 과징금·제재 | 제재 인물/법인 | DART 공시 본문 "제재/과징금/검찰고발" 키워드 + 명단 추출 |
| 공정거래위원회 | **불공정 거래 조합** | 공시 "조합" + 과징금 이력 교차 |
| 코스닥 불성실공시 | 불성실 기업 | "불성실공시법인" 공시 매칭 |
| 뉴스/판례 | 작전 혐의 인물 | 검색 API + 본문 NER 교차 (선택, 신뢰도 낮음 → `flags: ["suspected"]`) |

#### 3.2 flags 자동 부여 규칙

신규 `src/lib/risk-flags.ts`:

```typescript
// Person.flags
["blacklist"]      // 제재·검찰고발 명단 매칭
["delisted_owner"] // 상장폐지 2개 이상 기업에 관여
["suspicious"]     // 작전 혐의 뉴스/공시 (신뢰도 중간)

// Fund.flags
["blacklist"]      // 과징금·제재 조합
["suspicious"]     // 반복 CB 양수 + 폐지 기업 연관

// Corp.flags (via Corp.isAdmin / delistedAt)
delistedAt != null // 상장폐지
isAdmin = true     // 관리종목
```

#### 3.3 리스크 집계 스코어

`scripts/backtest-network.ts`의 기존 "인물 의심도"를 확장:

```
인물 리스크 점수 (0~100) =
    현직 수 × 10
  + 시그널 기업 수 × 15
  + 관여 기업 수 × 5
  + 상장폐지 관여 수 × 20      // ✅ 추가
  + 제재 이력 수 × 30          // ✅ 추가
  + 동일 조합 반복 출연 × 10   // ✅ 추가
```

조합 리스크 점수 (0~100):
```
    양수한 CB 건수 × 10
  + 양수 후 상장폐지 비율 × 25
  + 제재 이력 × 40
```

#### 3.4 시각화 연동

기존 `EntityGraph.tsx`의 빨간 테두리 규칙(NETWORK_ANALYSIS.md §2)과 연동:

- `flags`에 `suspicious`/`blacklist` → **빨간 테두리** (이미 구현됨)
- 신규: 리스크 점수 70+ 노드에 **경고 배지** 표시
- 신규: `/api/analyze-cluster` 응답에 "위험 인물 TOP 3", "위험 조합 TOP 3" 섹션 추가

#### 3.5 집계 리포트

신규 `src/app/api/risk-summary/route.ts`:

```json
{
  "delistedCorps": 12,          // 상장폐지 기업 수
  "blacklistPersons": ["신승수", ...],
  "blacklistFunds": ["CBI인베스트먼트", ...],
  "topRiskScores": [            // 점수순
    { "name": "오종원", "score": 85, "reasons": [...] }
  ]
}
```

#### 3.6 검증 체크리스트 (PHASE 3)

- [ ] 상장폐지 기업이 `delistedAt`와 함께 그래프에 회색 표시
- [ ] 제재 이력 인물이 `flags: ["blacklist"]` + 빨간 테두리로 표시
- [ ] 리스크 점수가 인물/조합 노드에 표시
- [ ] `/api/risk-summary` 가 블랙리스트 집계를 반환


---

## 3. 파일 변경 매트릭스

| 파일 | 단계 | 변경 유형 | 내용 |
|---|---|---|---|
| `prisma/schema.prisma` | 1 | 수정 | `isCurrent`, `@@unique([corpId,personId,role])`, `PersonHistory` 필드 확장 |
| `prisma/migrations/*` | 1 | 신규 | `fix_relation_constraints` 마이그레이션 |
| `scripts/fetch-officers.ts` | 1 | 수정 | `makePersonUid` 적용 (로직은 그대로) |
| `scripts/crawl-persons.ts` | 1 | 수정 | `PersonHistory` 필드명 정합, `makePersonUid` 적용 |
| `src/lib/person-uid.ts` | 1 | **신규** | personUid 정규화 유틸 |
| `scripts/merge-samename.ts` | 1 | **신규** | SameNameGroup 자동 병합 |
| `src/lib/dart-parsers.ts` | 2 | **신규** | 주요주주/임원/조합 구조화 파서 |
| `src/lib/fund-builder.ts` | 2 | **신규** | Fund 노드 자동 생성·분류 |
| `src/lib/ner-pipeline.ts` | 2 | **신규** | DeepSeek NER 폴백 파이프라인 |
| `scripts/backfill-relations.ts` | 2 | **신규** | 기존 공시 역백필 → 엣지 생성 |
| `src/lib/risk-flags.ts` | 3 | **신규** | flags 자동 부여 규칙 |
| `scripts/backtest-network.ts` | 3 | 수정 | 리스크 스코어 확장 (폐지·제재 가중) |
| `src/app/api/risk-summary/route.ts` | 3 | **신규** | 블랙리스트 집계 API |
| `src/app/api/analyze-cluster/route.ts` | 3 | 수정 | 위험 TOP3 섹션 추가 |
| `src/components/EntityGraph.tsx` | 3 | 수정 | 리스크 배지 표시 |

---

## 4. 실행 순서 및 의존성

```
PHASE 1 (정합성) ────────────────────────────────────┐
  스키마 수정 → 마이그레이션 → person-uid.ts          │
  → fetch-officers/crawl-persons 수정 → 검증          │
        │  (PHASE 2는 PHASE 1의 스키마·제약에 의존)    │
        ▼                                              │
PHASE 2 (본문 파싱) ──────────────────────────────────┤
  dart-parsers.ts → fund-builder.ts → NER 파이프라인   │
  → backfill-relations.ts 실행 → 검증                 │
        │  (PHASE 3는 PHASE 2의 Fund/Person 데이터에 의존)│
        ▼                                              │
PHASE 3 (리스크 태깅) ────────────────────────────────┘
  risk-flags.ts → backtest 확장 → risk-summary API
  → EntityGraph 배지 → 검증
```

> 각 Phase는 이전 Phase의 결과물(DB 데이터, 스키마 제약)에 의존하므로 **순차 실행 필수**.
> 단, Phase 1의 1.3~1.4(유틸·병합)는 Phase 2와 병행 가능.

---

## 5. 위험 및 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| DART API rate limit (15,000건/일) | 백필 지연 | 우선순위 큐: 시그널 기업 → 상장폐지 → 전체. 분산 실행 |
| XBRL 본문 포맷 불규칙 | 파싱 실패 | 구조화 API(`majorstock.json` 등)를 1순위, XBRL·NER는 폴백 |
| 동명이인 false positive | 잘못된 관계 연결 | 생년월일 없으면 `SameNameGroup` + 수동 검토 큐 (`flags: ["unverified"]`) |
| 뉴스 NER 신뢰도 낮음 | 오탐 | 뉴스 기반은 `blacklist`가 아닌 `suspected`로만 분류, 빨간 테두리 약하게 |
| 백필 중 기존 데이터 손상 | 관계 중복/누락 | `@@unique` 제약 + upsert 로 idempotent 보장. 백업 후 dry-run |
| Vercel 10초 제한 | 대량 백필 불가 | 백필은 GitHub Actions 또는 로컬 실행 (ROADMAP OCI 크롤러와 연계) |

---

## 6. 기대 효과

**Before (현재):**
- 회사 검색 → 1-hop 인물 노드만 (종종 비어있음)
- Fund 노드 거의 없음
- 공시 2,630건이지만 엣지는 거의 없음
- 상장폐지·블랙리스트 자동 식별 없음

**After (3 Phase 완료):**
- 회사 검색 → **2~3-hop** 관계망 (회사 ↔ 임원·주주 ↔ 다른 회사 ↔ 조합 ↔ 실질지배자)
- **조합·SPC·투자사 노드** 자동 생성 + 자본 관계 엣지
- 공시 본문에서 추출한 **실제 인물·법인**으로 엣지 자동 생성
- **문제 인물·조합이 빨간 테두리 + 리스크 점수**로 자동 표시
- 블랙리스트 집계 리포트로 "어떤 인물/조합이 반복적으로 문제 기업에 등장하는가" 식별

---

## 7. ROADMAP 연계

본 계획은 기존 [ROADMAP.md](./ROADMAP.md) "진행 중" 항목과 직접 연결:

- [ ] DART `dsab007` 인물명 검색 파이프라인 → **PHASE 2** `dart-parsers.ts`
- [ ] DeepSeek V3 NER 코스닥 연동 → **PHASE 2** `ner-pipeline.ts`
- [ ] 전체 코스닥 상시 공시 캐싱 → **PHASE 2** 백필 기반 확장
- [ ] 공시-뉴스 크로스레퍼런스 → **PHASE 3** 뉴스 NER 교차 (선택)
- [ ] OCI Always Free 크롤러 서버 → **PHASE 2/3** 백필·수집 실행 환경
