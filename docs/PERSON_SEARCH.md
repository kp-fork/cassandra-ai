# 인물 검색 시스템 — 기술 문서

## 개요

DART 공시 데이터에서 특정 인물명을 검색하여 연관 기업, 공시 내역, 동명이인 정보를 제공합니다.
DART OpenAPI가 인물명 검색을 지원하지 않기 때문에 자체 DB 캐싱 + 실시간 API를 조합한 하이브리드 방식입니다.

## 검색 흐름

```
사용자 입력: "신승수" + 기간 선택 (1년/3년/5년)
        │
        ▼
┌──────────────────────────────────────────────┐
│ POST /api/person-search                      │
│                                              │
│ 1. DB Person 테이블 검색 (name contains)     │
│    └─ personUid, birthDate, flags, bio       │
│    └─ CorpPersonRelation → 연관 회사 목록    │
│                                              │
│ 2. DB Filing 테이블 검색 (title contains)    │
│    └─ 공시 제목에 이름이 포함된 filing       │
│    └─ 회사별 그룹화 (Map<회사명, filings[]>) │
│                                              │
│ 3. 중복 제거 (name + birthDate)              │
│    └─ 동일 이름+생년월일 → 회사 목록 병합    │
│    └─ SameNameGroup 조회 → 동명이인 안내     │
│                                              │
│ 4. 랭킹 업데이트                             │
│    └─ Dart_Data/person-search-rank.json      │
│    └─ 검색 횟수 +1, 최근 검색 시간 갱신       │
└──────────────────────────────────────────────┘
        │
        ▼
  [응답] persons[] + filings[] + ranking[]
```

## 데이터 저장 구조

### Person 테이블 (Prisma)
```
Person {
  personUid: string     // 고유 식별자 (P-REAL-001)
  name: string          // 이름
  birthDate: string?    // 생년월일 (YYYY.MM.DD) → 중복 제거 키
  aliases: string[]     // 별칭
  flags: string[]       // [stock_celebrity, manipulation_suspect]
  bio: string?          // 약력
  corpRelations → CorpPersonRelation[]
}
```

### Filing 테이블 (Prisma)
```
Filing {
  rceptNo: string       // DART 접수번호 (고유)
  corpId: string        // 회사 FK
  title: string         // 공시 제목 (본문 검색 대상)
  filingType: string    // CB_ISSUANCE, LAWSUIT 등
  filedAt: DateTime     // 제출일
  sourceUrl: string?    // DART 원본 링크
}
```

### SameNameGroup 테이블
```
SameNameGroup {
  name: string          // 동명이인 그룹명
  personIds: string[]   // 해당 그룹의 personUid 배열
  note: string?         // 구분 설명
}
```

## 캐싱 전략

### 1. 인메모리 캐시 (Redis 준비)
```
src/lib/redis-cache.ts → getCache() / setCache()
- Upstash Redis URL/TOKEN 있으면 Redis 사용
- 없으면 Map<string, {data, timestamp}> 폴백
- TTL: 72시간
- 검색 키: person:{name}:{period}
```

### 2. 파일 기반 랭킹
```
Dart_Data/person-search-rank.json
[
  {"query": "신승수", "count": 5, "lastSearched": "2026-06-10T..."},
  {"query": "김준범", "count": 8, "lastSearched": "2026-06-09T..."}
]
- GET /api/person-search → 상위 10개 반환
- POST 시 자동 카운트 증가
```

### 3. DB 공시 캐시
```
- npm run daily → 200개 기업 7일치 공시 DB 저장
- 총 541개사, 2,630건 공시
- Filing.title LIKE '%{name}%' 검색
- GitHub Actions 매일 09:00/18:00 자동 갱신
```

## 중복 제거 로직

```
function deduplicate(results):
  map = new Map()
  for each person in results:
    key = name + "_" + (birthDate || "unknown")
    if map.has(key):
      // 회사 목록 병합
      existing.companies += person.companies
      // 플래그 통합 (중복 제거)
      existing.flags = unique(existing.flags + person.flags)
    else:
      map.set(key, person)
  return map.values()
```

## 한계 및 대안

| 항목 | 한계 | 대안 |
|---|---|---|
| 인물명 검색 | OpenAPI 미지원 | DB Filing.title LIKE 검색 |
| 3개월 이상 | corp_code 없으면 DART 제한 | DB 캐시 확장 (npm run daily) |
| 신규 인물 | DB에 없으면 검색 불가 | DART 웹사이트(dsab007) 수동 검색 안내 |
| 동명이인 | birthDate 없으면 구분 불가 | SameNameGroup 수동 등록 |
